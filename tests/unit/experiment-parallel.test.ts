import { describe, it, expect } from 'vitest';
import { Experiment, ValidationError } from '../../src/index.js';
import { model as plainModel } from '../fixtures/parallel-model.mjs';
import { model as mm1Model, type Mm1Params } from '../fixtures/mm1-model.js';

const plainUrl = new URL('../fixtures/parallel-model.mjs', import.meta.url);
const mm1Url = new URL('../fixtures/mm1-model.ts', import.meta.url);

type PlainParams = { steps: number; scale: number };
type PlainMetrics = { mean: number; replication: number; seedLow: number };

describe('Experiment parallel replications', () => {
  it('produces exactly the serial results, in replication order', async () => {
    const exp = await Experiment.fromModule<PlainParams, PlainMetrics>(
      plainUrl
    );
    expect(exp.canRunParallel).toBe(true);
    const params = { steps: 2000, scale: 10 };
    const serial = exp.replicate(params, { replications: 24, seed: 7 });
    const parallel = await exp.replicateParallel(params, {
      replications: 24,
      seed: 7,
      workers: 4,
    });
    expect(parallel.runs).toEqual(serial.runs);
    expect(parallel.seeds).toEqual(serial.seeds);
    expect(parallel.runs.map((r) => r.replication)).toEqual(
      Array.from({ length: 24 }, (_, i) => i)
    );
  });

  it('sweeps in parallel with common random numbers and the same scenario order', async () => {
    const exp = new Experiment<PlainParams, PlainMetrics>(plainModel, {
      moduleUrl: plainUrl,
      exportName: 'model',
    });
    const space = { steps: [100, 500], scale: [1, 2, 3] };
    const serial = exp.sweep(space, { replications: 5, seed: 3 });
    const progress: number[] = [];
    const parallel = await exp.sweepParallel(space, {
      replications: 5,
      seed: 3,
      workers: 3,
      onProgress: (d) => progress.push(d),
    });
    expect(parallel.scenarios.map((s) => s.params)).toEqual(
      serial.scenarios.map((s) => s.params)
    );
    parallel.scenarios.forEach((s, i) => {
      expect(s.runs).toEqual(serial.scenarios[i]!.runs);
      expect(s.seeds).toEqual(serial.scenarios[i]!.seeds);
    });
    expect(progress).toHaveLength(30);
    expect(progress[progress.length - 1]).toBe(30);
    expect(parallel.compare('mean')).toEqual(serial.compare('mean'));
  });

  it('runs a TypeScript model that uses the library itself', async () => {
    const exp = new Experiment(mm1Model, { moduleUrl: mm1Url });
    const params: Mm1Params = {
      servers: 1,
      arrivalRate: 0.7,
      serviceRate: 1,
      customers: 400,
    };
    const serial = exp.replicate(params, { replications: 6, seed: 11 });
    const parallel = await exp.replicateParallel(params, {
      replications: 6,
      seed: 11,
      workers: 3,
    });
    expect(parallel.runs).toEqual(serial.runs);
    expect(parallel.mean('utilization')).toBeGreaterThan(0.5);
  }, 60_000);

  it('caps workers at the number of jobs and reports progress', async () => {
    const exp = await Experiment.fromModule<PlainParams, PlainMetrics>(
      plainUrl
    );
    const progress: Array<[number, number]> = [];
    const rep = await exp.replicateParallel(
      { steps: 10, scale: 1 },
      {
        replications: 2,
        seed: 1,
        workers: 16,
        onProgress: (d, t) => progress.push([d, t]),
      }
    );
    expect(rep.n).toBe(2);
    expect(progress).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  it('surfaces a worker error with the replication index', async () => {
    const exp = await Experiment.fromModule<{ failAt: number }, { ok: number }>(
      plainUrl,
      'failing'
    );
    await expect(
      exp.replicateParallel(
        { failAt: 3 },
        { replications: 6, seed: 1, workers: 2 }
      )
    ).rejects.toThrow(/Replication 3 failed in a worker: boom at 3/);
  });

  it('validates module, export and worker count', async () => {
    await expect(
      Experiment.fromModule(plainUrl, 'notAFunction')
    ).rejects.toThrow(ValidationError);
    const noModule = new Experiment<PlainParams, PlainMetrics>(plainModel);
    expect(noModule.canRunParallel).toBe(false);
    await expect(
      noModule.replicateParallel({ steps: 1, scale: 1 }, { replications: 1 })
    ).rejects.toThrow(/fromModule/);
    const exp = await Experiment.fromModule<PlainParams, PlainMetrics>(
      plainUrl
    );
    await expect(
      exp.replicateParallel(
        { steps: 1, scale: 1 },
        { replications: 1, workers: 0 }
      )
    ).rejects.toThrow(ValidationError);
  });
});
