/**
 * Benchmark suite: npm run bench
 *
 * Measures wall-clock time of representative workloads and prints a table.
 * Numbers depend on the machine; compare runs on the same machine only.
 * Results are also written to benchmarks/latest.json (ignored by git).
 * Pass --json to print only the JSON.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { cpus } from 'node:os';
import {
  Simulation,
  EventQueue,
  Resource,
  Random,
  Statistics,
  timeout,
} from '../src/index.js';

interface Result {
  name: string;
  size: number;
  unit: string;
  ms: number;
  perSecond: number;
}

function bench(
  name: string,
  size: number,
  unit: string,
  fn: () => void
): Result {
  // Warm-up run for JIT, then the measured run
  fn();
  const start = performance.now();
  fn();
  const ms = performance.now() - start;
  return { name, size, unit, ms, perSecond: (size / ms) * 1000 };
}

const results: Result[] = [];

// 1. Event queue: push and pop 100k events with random times
results.push(
  bench('EventQueue push+pop', 100_000, 'events', () => {
    const q = new EventQueue();
    const rng = new Random(1);
    for (let i = 0; i < 100_000; i++) {
      q.push({ time: rng.uniform(0, 1000), priority: 0, callback: () => {} });
    }
    while (!q.isEmpty) q.pop();
  })
);

// 2. Plain scheduled events through Simulation.run()
results.push(
  bench('Simulation.run scheduled events', 200_000, 'events', () => {
    const sim = new Simulation();
    const rng = new Random(2);
    for (let i = 0; i < 200_000; i++) {
      sim.schedule(rng.uniform(0, 10_000), () => {});
    }
    sim.run();
  })
);

// 3. M/M/1 queue: arrivals, service, statistics
results.push(
  bench('M/M/1 queue', 100_000, 'customers', () => {
    const sim = new Simulation();
    const rng = new Random(3);
    const stats = new Statistics(sim);
    stats.enableSampleTracking('wait');
    const server = new Resource(sim, 1);
    function* customer() {
      const arrived = sim.now;
      yield server.request();
      stats.recordSample('wait', sim.now - arrived);
      yield* timeout(rng.exponential(1));
      server.release();
    }
    sim.process(function* () {
      for (let i = 0; i < 100_000; i++) {
        sim.process(customer);
        yield* timeout(rng.exponential(1 / 0.8));
      }
    });
    sim.run();
  })
);

// 4. Many concurrent processes each doing a few timeouts
results.push(
  bench('10k concurrent processes x 10 timeouts', 100_000, 'timeouts', () => {
    const sim = new Simulation();
    const rng = new Random(4);
    for (let p = 0; p < 10_000; p++) {
      sim.process(function* () {
        for (let k = 0; k < 10; k++) {
          yield* timeout(rng.uniform(0, 100));
        }
      });
    }
    sim.run();
  })
);

// 5. Priority queue with 10k waiters on one resource
results.push(
  bench('Resource priority queue, 10k waiters', 10_000, 'requests', () => {
    const sim = new Simulation();
    const rng = new Random(5);
    const server = new Resource(sim, 1, { queueDiscipline: 'priority' });
    for (let i = 0; i < 10_000; i++) {
      const priority = rng.randint(0, 100);
      sim.process(function* () {
        yield server.request(priority);
        yield* timeout(0.001);
        server.release();
      });
    }
    sim.run();
  })
);

// 6. Statistics: sample tracking with percentiles at the end
results.push(
  bench('Statistics 1M samples + percentiles', 1_000_000, 'samples', () => {
    const sim = new Simulation();
    const stats = new Statistics(sim);
    const rng = new Random(6);
    stats.enableSampleTracking('x');
    for (let i = 0; i < 1_000_000; i++)
      stats.recordSample('x', rng.normal(0, 1));
    stats.getPercentiles('x', [50, 95, 99]);
    stats.getConfidenceInterval('x');
  })
);

// 7. Random: mixed distributions
results.push(
  bench('Random mixed distributions', 1_000_000, 'draws', () => {
    const rng = new Random(7);
    let acc = 0;
    for (let i = 0; i < 250_000; i++) {
      acc +=
        rng.exponential(1) +
        rng.normal(0, 1) +
        rng.gamma(2, 1) +
        rng.lognormal(0, 0.5);
    }
    if (!Number.isFinite(acc)) throw new Error('unreachable');
  })
);

const meta = {
  date: new Date().toISOString(),
  node: process.version,
  cpu: cpus()[0]?.model.trim() ?? 'unknown',
  platform: process.platform,
};

const jsonOnly = process.argv.includes('--json');
const payload = { meta, results };

if (jsonOnly) {
  console.log(JSON.stringify(payload, null, 2));
} else {
  console.log(`discrete-sim benchmarks  (${meta.node}, ${meta.cpu})\n`);
  console.table(
    results.map((r) => ({
      benchmark: r.name,
      size: `${r.size.toLocaleString('en-US')} ${r.unit}`,
      'time (ms)': r.ms.toFixed(0),
      'per second': Math.round(r.perSecond).toLocaleString('en-US'),
    }))
  );
}

try {
  mkdirSync('benchmarks', { recursive: true });
  writeFileSync('benchmarks/latest.json', JSON.stringify(payload, null, 2));
} catch {
  // Non-fatal: results are printed either way
}
