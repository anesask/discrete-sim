/**
 * Replicated M/M/c experiment
 *
 * One simulation run is a single sample path. This example shows how to turn
 * runs into evidence:
 *
 * 1. Replicate an M/M/1 queue 30 times with different seeds and report a
 *    confidence interval for the mean wait, next to the theoretical value.
 * 2. Sweep the number of servers (1, 2, 3) and compare the scenarios with
 *    common random numbers.
 *
 * Run with: npx tsx examples/experiment-mm1/index.ts
 */

import {
  Experiment,
  Simulation,
  Resource,
  Random,
  Statistics,
  timeout,
} from '../../src/index.js';

interface Params {
  servers: number;
  arrivalRate: number; // customers per time unit
  serviceRate: number; // per server, per time unit
  customers: number;
}

/**
 * Build and run one M/M/c model. Everything (Simulation, Random, Statistics)
 * is created inside the function so replications are independent.
 */
function mmcModel(p: Params, seed: number) {
  const sim = new Simulation();
  const rng = new Random(seed);
  const stats = new Statistics(sim);
  stats.enableSampleTracking('wait');
  const servers = new Resource(sim, p.servers, { name: 'Servers' });

  function* customer() {
    const arrived = sim.now;
    yield servers.request();
    stats.recordSample('wait', sim.now - arrived);
    yield* timeout(rng.exponential(1 / p.serviceRate));
    servers.release();
  }

  sim.process(function* () {
    for (let i = 0; i < p.customers; i++) {
      sim.process(customer);
      yield* timeout(rng.exponential(1 / p.arrivalRate));
    }
  });

  sim.run();

  return {
    meanWait: stats.getSampleMean('wait'),
    p95Wait: stats.getPercentile('wait', 95),
    utilization: servers.stats.utilizationRate,
  };
}

const experiment = new Experiment(mmcModel);

// ---------------------------------------------------------------------------
// 1. Replications of a single scenario
// ---------------------------------------------------------------------------
const base: Params = {
  servers: 1,
  arrivalRate: 0.7,
  serviceRate: 1,
  customers: 5000,
};
const rho = base.arrivalRate / base.serviceRate;
const theoreticalWait = rho / (base.serviceRate - base.arrivalRate);

console.log('='.repeat(64));
console.log('M/M/1: 30 replications, 5000 customers each');
console.log('='.repeat(64));

const rep = experiment.replicate(base, { replications: 30, seed: 2026 });
const ci = rep.confidenceInterval('meanWait', 0.95);

console.log(`Theoretical mean wait in queue: ${theoreticalWait.toFixed(4)}`);
console.log(
  `Replicated mean wait:            ${ci.mean.toFixed(4)}  95% CI [${ci.lower.toFixed(4)}, ${ci.upper.toFixed(4)}]`
);
console.log(
  `Theory inside the interval:      ${ci.lower <= theoreticalWait && theoreticalWait <= ci.upper ? 'yes' : 'no'}`
);
console.log(
  `Run-to-run spread (sd):          ${rep.stdDev('meanWait').toFixed(4)}  min ${rep.min('meanWait').toFixed(3)}  max ${rep.max('meanWait').toFixed(3)}`
);
console.log();

// ---------------------------------------------------------------------------
// 2. Parameter sweep: how many servers do we need?
// ---------------------------------------------------------------------------
console.log('='.repeat(64));
console.log('Sweep: servers 1..3 at total arrival rate 1.8, 20 replications');
console.log('='.repeat(64));

const sweep = experiment.sweep(
  {
    servers: [1, 2, 3],
    arrivalRate: [1.8],
    serviceRate: [1],
    customers: [3000],
  },
  { replications: 20, seed: 2026 }
);

const rows = sweep.compare('meanWait').map((r) => ({
  servers: r.params.servers,
  meanWait: r.mean.toFixed(3),
  ci95: `[${r.lower.toFixed(3)}, ${r.upper.toFixed(3)}]`,
  utilization: sweep.scenarios
    .find((s) => s.params.servers === r.params.servers)!
    .mean('utilization')
    .toFixed(3),
}));
console.table(rows);

const best = sweep.best('meanWait');
console.log(
  `Fewest servers with mean wait under 0.5: ${
    sweep.compare('meanWait').find((r) => r.mean < 0.5)?.params.servers ??
    'none'
  }`
);
console.log(`Lowest mean wait overall: ${best.params.servers} servers`);
console.log();
console.log('CSV of the sweep (first 3 lines):');
console.log(sweep.toCSV().split('\n').slice(0, 3).join('\n'));
