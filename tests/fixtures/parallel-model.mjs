// Plain JavaScript model used by the parallel Experiment tests. It depends on
// nothing, so it also exercises the default import() path of the worker.

/** Deterministic pseudo-random walk driven by the seed */
export function model(params, seed, replication) {
  let x = seed >>> 0;
  let sum = 0;
  for (let i = 0; i < params.steps; i++) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    sum += (x / 4294967296) * params.scale;
  }
  return { mean: sum / params.steps, replication, seedLow: seed % 1000 };
}

/** Model that fails on a chosen replication, to test error propagation */
export function failing(params, seed, replication) {
  if (replication === params.failAt) {
    throw new Error(`boom at ${replication}`);
  }
  return { ok: 1 };
}

export const notAFunction = 42;
