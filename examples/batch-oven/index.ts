/**
 * Batch oven
 *
 * Parts arrive one at a time and are cured in an oven that takes loads of up
 * to 10. A full load starts right away; a partial load starts once the first
 * part in it has waited 15 minutes. While a finished load sits untaken (the
 * oven is busy), arriving parts wait: that is the back-pressure built into
 * Batch.put().
 *
 * Run with: npx tsx examples/batch-oven/index.ts
 */

import {
  Simulation,
  Batch,
  Random,
  Statistics,
  timeout,
} from '../../src/index.js';

const LOAD_SIZE = 10;
const MAX_WAIT_MIN = 15;
const CURE_TIME_MIN = 30;
const MEAN_INTERARRIVAL_MIN = 3.5;
const PARTS = 400;
const SEED = 7;

interface Part {
  id: number;
  arrivedAt: number;
}

const sim = new Simulation();
const rng = new Random(SEED);
const stats = new Statistics(sim);
stats.enableSampleTracking('part-cycle-time');
stats.enableSampleTracking('load-size');

const oven = new Batch<Part>(sim, LOAD_SIZE, {
  name: 'Oven load',
  maxWait: MAX_WAIT_MIN,
});

function* arrivals() {
  for (let i = 0; i < PARTS; i++) {
    yield* timeout(rng.exponential(MEAN_INTERARRIVAL_MIN));
    sim.process(function* () {
      const part: Part = { id: i, arrivedAt: sim.now };
      yield oven.put(part); // may wait while a finished load blocks the oven door
    });
  }
}

function* baker() {
  let loads = 0;
  while (true) {
    const load = oven.take();
    yield load;
    const parts = load.items!;
    loads++;
    if (loads <= 5) {
      console.log(
        `[${sim.now.toFixed(1)} min] load ${loads}: ${parts.length} parts${load.isPartial ? ' (partial, maxWait)' : ''}`
      );
    }
    stats.recordSample('load-size', parts.length);
    yield* timeout(CURE_TIME_MIN);
    for (const p of parts) {
      stats.recordSample('part-cycle-time', sim.now - p.arrivedAt);
    }
    stats.increment('parts-cured', parts.length);
  }
}

console.log(
  `Batch oven: loads of ${LOAD_SIZE}, partial load after ${MAX_WAIT_MIN} min, cure ${CURE_TIME_MIN} min\n`
);

sim.process(arrivals);
sim.process(baker);
sim.run(PARTS * MEAN_INTERARRIVAL_MIN + 500);

const s = oven.stats;
console.log(
  `\nParts cured:            ${stats.getCount('parts-cured')} of ${PARTS}`
);
console.log(
  `Loads formed:           ${s.totalBatches} (${s.partialBatches} partial)`
);
console.log(`Average load size:      ${s.averageBatchSize.toFixed(2)}`);
console.log(`Avg wait to form load:  ${s.averageItemWaitTime.toFixed(2)} min`);
console.log(`Avg back-pressure wait: ${s.averagePutWaitTime.toFixed(2)} min`);
console.log(
  `Part cycle time:        mean ${stats.getSampleMean('part-cycle-time').toFixed(1)} min, p95 ${stats.getPercentile('part-cycle-time', 95).toFixed(1)} min`
);
