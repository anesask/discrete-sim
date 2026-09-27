import { ValidationError } from '../utils/validation.js';

/**
 * Where a model lives so that a worker can load it: a module URL (or absolute
 * path) and the name of the exported model function.
 */
export interface ModelModule {
  /** file: URL, absolute path, or URL string the worker can import */
  url: string;
  /** Exported function name (default 'model') */
  exportName: string;
}

/**
 * Options for the parallel runners, in addition to the replication options.
 */
export interface ParallelOptions {
  /**
   * Number of workers (default: number of CPU cores in Node, 4 in browsers,
   * never more than the number of jobs).
   */
  workers?: number;
  /**
   * Node only: modules to `require()` in each worker before loading the model
   * (for example a loader hook). TypeScript model files are handled
   * automatically when `tsx` is installed.
   */
  preload?: string[];
  /** Node only: `execArgv` for the worker threads (default: none) */
  execArgv?: string[];
  /**
   * Node only: V8 heap limits for each worker, passed to `worker_threads`
   * `resourceLimits`. Simulations allocate many short-lived objects, so the
   * default here raises the young generation to 64 MB to keep GC pauses down.
   */
  resourceLimits?: {
    maxYoungGenerationSizeMb?: number;
    maxOldGenerationSizeMb?: number;
    codeRangeSizeMb?: number;
    stackSizeMb?: number;
  };
}

/** One replication to run in a worker */
export interface ParallelJob<P> {
  id: number;
  params: P;
  seed: number;
  replication: number;
}

interface WorkerResult<M> {
  id: number;
  ok: boolean;
  metrics?: M;
  message?: string;
  stack?: string;
}

/**
 * Source of the Node worker. Plain CommonJS so it works from an eval worker
 * regardless of the host package's module type. TypeScript model files are
 * loaded through tsx's CommonJS hook when tsx is installed (development);
 * everything else is loaded with dynamic import.
 */
const NODE_WORKER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads');
const { fileURLToPath } = require('node:url');
let loading;
async function load() {
  const { url, exportName, preload } = workerData;
  for (const p of preload || []) require(p);
  let mod;
  if (/\\.[cm]?tsx?$/i.test(url)) {
    try {
      require('tsx/cjs');
    } catch {
      throw new Error('Model module ' + url + ' is TypeScript. Install tsx as a dev dependency or point at compiled JavaScript.');
    }
    mod = require(url.startsWith('file:') ? fileURLToPath(url) : url);
  } else {
    mod = await import(url);
  }
  const fn = mod[exportName];
  if (typeof fn !== 'function') {
    throw new Error('Export "' + exportName + '" of ' + url + ' is not a function');
  }
  return fn;
}
parentPort.on('message', async (job) => {
  try {
    const fn = await (loading ??= load());
    const metrics = fn(job.params, job.seed, job.replication);
    parentPort.postMessage({ id: job.id, ok: true, metrics });
  } catch (e) {
    parentPort.postMessage({ id: job.id, ok: false, message: e && e.message ? e.message : String(e), stack: e && e.stack });
  }
});
`;

/**
 * Source of the browser worker (module worker so dynamic import is available).
 */
const BROWSER_WORKER_SOURCE = `
let loading;
async function load(url, exportName) {
  const mod = await import(url);
  const fn = mod[exportName];
  if (typeof fn !== 'function') throw new Error('Export "' + exportName + '" of ' + url + ' is not a function');
  return fn;
}
self.onmessage = async (event) => {
  const job = event.data;
  try {
    const fn = await (loading ??= load(job.url, job.exportName));
    const metrics = fn(job.params, job.seed, job.replication);
    self.postMessage({ id: job.id, ok: true, metrics });
  } catch (e) {
    self.postMessage({ id: job.id, ok: false, message: e && e.message ? e.message : String(e), stack: e && e.stack });
  }
};
`;

function isNode(): boolean {
  return (
    typeof process !== 'undefined' &&
    typeof (process as { versions?: { node?: string } }).versions?.node ===
      'string'
  );
}

/**
 * Run jobs on a pool of workers and return metrics in job order.
 * Rejects with the first worker error, annotated with the replication index.
 *
 * @internal
 */
export async function runJobsInWorkers<P, M>(
  module: ModelModule,
  jobs: readonly ParallelJob<P>[],
  options: ParallelOptions,
  onProgress?: (done: number, total: number) => void
): Promise<M[]> {
  if (jobs.length === 0) return [];
  const defaultWorkers = isNode() ? await nodeCpuCount() : 4;
  const requested = options.workers ?? defaultWorkers;
  if (!Number.isInteger(requested) || requested < 1) {
    throw new ValidationError(
      `workers must be a positive integer (got ${String(requested)})`,
      { workers: requested }
    );
  }
  const workerCount = Math.min(requested, jobs.length);

  const results = new Array<M>(jobs.length);
  let done = 0;
  let nextJob = 0;

  return new Promise<M[]>((resolve, reject) => {
    let failed = false;
    const workers: WorkerHandle[] = [];

    const finishAll = (): void => {
      for (const w of workers) w.terminate();
    };
    const fail = (error: Error): void => {
      if (failed) return;
      failed = true;
      finishAll();
      reject(error);
    };

    const dispatch = (worker: WorkerHandle): void => {
      if (failed) return;
      if (nextJob >= jobs.length) return;
      const job = jobs[nextJob++]!;
      worker.post({ ...job, url: module.url, exportName: module.exportName });
    };

    const onMessage = (
      worker: WorkerHandle,
      message: WorkerResult<M>
    ): void => {
      if (failed) return;
      const job = jobs[message.id];
      if (!message.ok) {
        const error = new Error(
          `Replication ${job?.replication ?? message.id} failed in a worker: ${message.message ?? 'unknown error'}`
        );
        if (message.stack) error.stack = `${error.message}\n${message.stack}`;
        fail(error);
        return;
      }
      results[message.id] = message.metrics as M;
      done++;
      onProgress?.(done, jobs.length);
      if (done === jobs.length) {
        finishAll();
        resolve(results);
        return;
      }
      dispatch(worker);
    };

    void (async () => {
      try {
        for (let i = 0; i < workerCount; i++) {
          const worker = await createWorker(
            module,
            options,
            (m) => onMessage(worker, m as WorkerResult<M>),
            fail
          );
          workers.push(worker);
          dispatch(worker);
        }
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
      }
    })();
  });
}

interface WorkerHandle {
  post(message: unknown): void;
  terminate(): void;
}

async function nodeCpuCount(): Promise<number> {
  const os = (await import('node:os')) as {
    availableParallelism?: () => number;
    cpus: () => unknown[];
  };
  return os.availableParallelism ? os.availableParallelism() : os.cpus().length;
}

async function createWorker(
  module: ModelModule,
  options: ParallelOptions,
  onMessage: (message: unknown) => void,
  onError: (error: Error) => void
): Promise<WorkerHandle> {
  if (isNode()) {
    const { Worker } = (await import('node:worker_threads')) as {
      Worker: new (
        source: string,
        opts: {
          eval: boolean;
          workerData: unknown;
          execArgv?: string[];
          resourceLimits?: ParallelOptions['resourceLimits'];
        }
      ) => {
        on(event: 'message', cb: (m: unknown) => void): void;
        on(event: 'error', cb: (e: Error) => void): void;
        on(event: 'exit', cb: (code: number) => void): void;
        postMessage(m: unknown): void;
        terminate(): Promise<number>;
      };
    };
    const worker = new Worker(NODE_WORKER_SOURCE, {
      eval: true,
      workerData: {
        url: module.url,
        exportName: module.exportName,
        preload: options.preload ?? [],
      },
      execArgv: options.execArgv,
      resourceLimits: {
        maxYoungGenerationSizeMb: 64,
        ...options.resourceLimits,
      },
    });
    let terminated = false;
    worker.on('message', onMessage);
    worker.on('error', (e) => {
      if (!terminated) onError(e instanceof Error ? e : new Error(String(e)));
    });
    worker.on('exit', (code) => {
      if (!terminated && code !== 0) {
        onError(new Error(`Worker exited with code ${code}`));
      }
    });
    return {
      post: (m) => worker.postMessage(m),
      terminate: () => {
        terminated = true;
        void worker.terminate();
      },
    };
  }

  const globalScope = globalThis as unknown as {
    Worker?: new (
      url: string,
      opts: { type: 'module' }
    ) => {
      onmessage: ((e: { data: unknown }) => void) | null;
      onerror: ((e: { message?: string }) => void) | null;
      postMessage(m: unknown): void;
      terminate(): void;
    };
    Blob?: new (parts: string[], opts: { type: string }) => unknown;
    URL?: { createObjectURL(blob: unknown): string };
  };
  if (!globalScope.Worker || !globalScope.Blob || !globalScope.URL) {
    throw new ValidationError(
      'Parallel replications need worker_threads (Node) or Web Workers (browser); neither is available here',
      {}
    );
  }
  const blob = new globalScope.Blob([BROWSER_WORKER_SOURCE], {
    type: 'text/javascript',
  });
  const worker = new globalScope.Worker(globalScope.URL.createObjectURL(blob), {
    type: 'module',
  });
  worker.onmessage = (e) => onMessage(e.data);
  worker.onerror = (e) => onError(new Error(e.message ?? 'Worker error'));
  return {
    post: (m) => worker.postMessage(m),
    terminate: () => worker.terminate(),
  };
}
