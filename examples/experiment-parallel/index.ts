/**
 * Parallel replications
 *
 * Runs the same replication study serially and on a worker pool, checks that
 * the results are identical, and reports the speedup. The model is in
 * model.ts (a module with no side effects); this file is the study.
 *
 * Run with: npx tsx examples/experiment-parallel/index.ts
 */

import { availableParallelism } from 'node:os';
import { Experiment } from '../../src/index.js';
import { model, type Params } from './model.js';

const params: Params = {
  servers: 2,
  arrivalRate: 1.6,
  serviceRate: 1,
  customers: 100_000,
};
const replications = 32;

async function main() {
  const experiment = new Experiment(model, {
    moduleUrl: new URL('./model.ts', import.meta.url),
    exportName: 'model',
  });

  console.log(
    `M/M/2 with ${params.customers} customers, ${replications} replications, ${availableParallelism()} cores\n`
  );

  let t = performance.now();
  const serial = experiment.replicate(params, { replications, seed: 2026 });
  const serialMs = performance.now() - t;
  console.log(`serial:   ${serialMs.toFixed(0)} ms`);

  t = performance.now();
  const parallel = await experiment.replicateParallel(params, {
    replications,
    seed: 2026,
    onProgress: (done, total) => {
      if (done % 8 === 0) console.log(`  ${done}/${total} replications done`);
    },
  });
  const parallelMs = performance.now() - t;
  console.log(
    `parallel: ${parallelMs.toFixed(0)} ms  (${(serialMs / parallelMs).toFixed(1)}x, includes worker start-up)`
  );

  const same = JSON.stringify(parallel.runs) === JSON.stringify(serial.runs);
  console.log(`identical results: ${same ? 'yes' : 'NO'}`);

  const ci = parallel.confidenceInterval('meanWait');
  console.log(
    `\nmean wait ${ci.mean.toFixed(3)}  95% CI [${ci.lower.toFixed(3)}, ${ci.upper.toFixed(3)}]  utilization ${(parallel.mean('utilization') * 100).toFixed(1)}%`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
