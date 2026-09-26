/**
 * Browser smoke test for the built package.
 *
 * Loads dist/index.js (the CommonJS bundle) inside a bare vm context that
 * offers ECMAScript built-ins, timers and console but none of Node's globals
 * (no process, require, Buffer, global, __dirname). Then it runs a small model
 * touching every building block. Any reference to a Node-only global at load
 * or run time throws a ReferenceError and fails this script.
 *
 * Run with: node scripts/browser-smoke.mjs   (after npm run build)
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const bundlePath = resolve(here, '../dist/index.js');
const code = readFileSync(bundlePath, 'utf8');

// Minimal browser-like global object. Deliberately no process/require/Buffer/global.
const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  queueMicrotask,
  performance,
  Date,
  Math,
  Map,
  Set,
  WeakMap,
  WeakSet,
  Symbol,
  Promise,
  Array,
  Object,
  Number,
  String,
  Boolean,
  Error,
  TypeError,
  RangeError,
  JSON,
  Reflect,
  Proxy,
  Infinity,
  NaN,
  undefined,
  isFinite,
  isNaN,
  parseInt,
  parseFloat,
  AbortController,
  module: { exports: {} },
  exports: {},
};
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.globalThis = sandbox;

const context = vm.createContext(sandbox, { name: 'browser-smoke' });

function fail(message) {
  console.error(`[browser-smoke] FAIL: ${message}`);
  process.exit(1);
}

try {
  vm.runInContext(code, context, { filename: 'dist/index.js' });
} catch (error) {
  fail(
    `loading the bundle threw: ${error instanceof Error ? error.stack : String(error)}`
  );
}

const lib = sandbox.module.exports;
const expected = [
  'Simulation',
  'Resource',
  'Buffer',
  'Store',
  'Batch',
  'SimEvent',
  'State',
  'Schedule',
  'Statistics',
  'Random',
  'Experiment',
  'timeout',
  'anyOf',
  'allOf',
];
for (const name of expected) {
  if (typeof lib[name] !== 'function') fail(`export ${name} is missing`);
}

// Run a model entirely inside the sandbox so any Node global use surfaces there.
const script = new vm.Script(
  `
  (function run(lib) {
    const { Simulation, Resource, Store, Statistics, Random, State, Schedule, Batch, timeout, anyOf } = lib;
    const sim = new Simulation({ randomSeed: 42 });
    const rng = sim.random.stream('arrivals');
    const stats = new Statistics(sim);
    stats.enableSampleTracking('wait', { maxSamples: 500 });
    const server = new Resource(sim, 2, { queueDiscipline: 'priority', monitor: true });
    const shelf = new Store(sim, 10);
    const open = new State(sim, false);
    const oven = new Batch(sim, 3, { maxWait: 5 });
    const staffing = new Schedule(sim, { period: 50, segments: [{ from: 0, to: 25, value: 2 }, { from: 25, to: 50, value: 3 }] });
    staffing.onChange((n) => server.setCapacity(n), { immediate: true });

    sim.process(function* () {
      yield* timeout(3);
      open.set(true);
    });
    let served = 0, reneged = 0;
    for (let i = 0; i < 300; i++) {
      sim.process(function* () {
        yield* timeout(rng.exponential(0.5));
        yield* open.until((v) => v);
        const req = server.request(i % 3);
        const result = yield* anyOf([req, timeout(4)]);
        if (result.winner !== req) { reneged++; return; }
        const arrived = sim.now;
        yield* timeout(rng.lognormal(0, 0.4));
        stats.recordSample('wait', sim.now - arrived);
        server.release(req);
        yield* shelf.putItem({ id: i });
        yield* oven.putItem(i);
        served++;
      }, { name: 'customer-' + i });
    }
    sim.process(function* () {
      for (;;) { const load = yield* oven.takeBatch(); if (load.items.length === 0) break; }
    });
    sim.run(400);
    const ci = stats.getConfidenceInterval('wait');
    return { served, reneged, now: sim.now, mean: ci.mean, points: server.history.series('inUse').length, seed: sim.seed };
  })
  `,
  { filename: 'browser-smoke-model.js' }
);

let result;
try {
  result = script.runInContext(context)(lib);
} catch (error) {
  fail(
    `running the model threw: ${error instanceof Error ? error.stack : String(error)}`
  );
}

if (
  !(result.served > 0) ||
  !(result.now === 400) ||
  !Number.isFinite(result.mean) ||
  !(result.points > 1)
) {
  fail(`unexpected result ${JSON.stringify(result)}`);
}

// Async and real-time drivers must work with plain timers
const asyncCheck = new vm.Script(
  `
  (async function (lib) {
    const { Simulation, timeout } = lib;
    const sim = new Simulation({ randomSeed: 1 });
    let ticks = 0;
    sim.process(function* () { for (let i = 0; i < 50; i++) { yield* timeout(1); ticks++; } });
    const a = await sim.runAsync({ batchSize: 7 });
    const sim2 = new Simulation();
    sim2.schedule(1, () => {}); sim2.schedule(2, () => {});
    const handle = sim2.runRealtime({ factor: 0.001 });
    const b = await handle.done;
    return { ticks, aEvents: a.eventsProcessed, bEvents: b.eventsProcessed };
  })
  `,
  { filename: 'browser-smoke-async.js' }
);

const asyncResult = await asyncCheck.runInContext(context)(lib);
if (asyncResult.ticks !== 50 || asyncResult.bEvents !== 2) {
  fail(`async drivers gave ${JSON.stringify(asyncResult)}`);
}

console.log(
  `[browser-smoke] OK: served=${result.served} reneged=${result.reneged} meanWait=${result.mean.toFixed(3)} historyPoints=${result.points} async=${JSON.stringify(asyncResult)}`
);
