/**
 * Bank with impatient customers (reneging)
 *
 * Customers arrive at a bank with a small number of tellers. Each customer
 * has a patience limit: if a teller is not free within that time, the
 * customer leaves without being served. The wait-or-leave decision is a race
 * between a resource request and a timeout, expressed with anyOf().
 *
 * Run with: npx tsx examples/bank-renege/index.ts
 */

import {
  Simulation,
  Resource,
  Random,
  Statistics,
  timeout,
  anyOf,
} from '../../src/index.js';

const TELLERS = 2;
const CUSTOMERS = 2000;
const MEAN_INTERARRIVAL = 1.0; // minutes
const MEAN_SERVICE = 1.8; // minutes
const PATIENCE_MIN = 1; // minutes
const PATIENCE_MAX = 6; // minutes
const SEED = 4242;

const sim = new Simulation();
const rng = new Random(SEED);
const stats = new Statistics(sim);
const tellers = new Resource(sim, TELLERS, { name: 'Tellers' });

stats.enableSampleTracking('wait-served');
stats.enableSampleTracking('wait-reneged');

function* customer(id: number) {
  const arrived = sim.now;
  const patience = rng.uniform(PATIENCE_MIN, PATIENCE_MAX);

  const request = tellers.request();
  const result = yield* anyOf([request, timeout(patience)]);

  if (result.winner === request) {
    stats.recordSample('wait-served', sim.now - arrived);
    stats.increment('served');
    yield* timeout(rng.exponential(MEAN_SERVICE));
    tellers.release();
  } else {
    // Patience ran out. anyOf already removed our request from the queue.
    stats.recordSample('wait-reneged', sim.now - arrived);
    stats.increment('reneged');
    if (id < 5) {
      console.log(
        `  customer ${id} left at t=${sim.now.toFixed(2)} after waiting ${patience.toFixed(2)} min`
      );
    }
  }
}

function* arrivals() {
  for (let i = 0; i < CUSTOMERS; i++) {
    sim.process(() => customer(i));
    yield* timeout(rng.exponential(MEAN_INTERARRIVAL));
  }
}

console.log('Bank with impatient customers');
console.log(
  `${TELLERS} tellers, ${CUSTOMERS} customers, patience U(${PATIENCE_MIN}, ${PATIENCE_MAX}) min\n`
);

sim.process(arrivals);
sim.run();

const served = stats.getCount('served');
const reneged = stats.getCount('reneged');
const servedCI = stats.getConfidenceInterval('wait-served');

console.log(
  `\nServed:   ${served}  (${((100 * served) / CUSTOMERS).toFixed(1)}%)`
);
console.log(
  `Reneged:  ${reneged}  (${((100 * reneged) / CUSTOMERS).toFixed(1)}%)`
);
console.log(
  `Mean wait of served customers: ${servedCI.mean.toFixed(2)} min  (95% CI +/- ${servedCI.halfWidth.toFixed(2)})`
);
console.log(
  `Mean wait before giving up:    ${stats.getSampleMean('wait-reneged').toFixed(2)} min`
);
console.log(
  `Teller utilization:            ${(tellers.stats.utilizationRate * 100).toFixed(1)}%`
);
console.log(
  `Queue left behind:             ${tellers.queueLength} (should be 0)`
);
