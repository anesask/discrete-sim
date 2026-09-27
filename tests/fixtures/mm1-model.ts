// TypeScript model using the library itself, loaded by workers through tsx.
import { Simulation, Resource, Statistics, timeout } from '../../src/index.js';

export interface Mm1Params {
  servers: number;
  arrivalRate: number;
  serviceRate: number;
  customers: number;
}

export function model(p: Mm1Params, seed: number) {
  const sim = new Simulation({ randomSeed: seed });
  const arrivals = sim.random.stream('arrivals');
  const service = sim.random.stream('service');
  const stats = new Statistics(sim);
  stats.enableSampleTracking('wait');
  const server = new Resource(sim, p.servers);

  function* customer() {
    const arrived = sim.now;
    const grant = yield* server.acquire();
    stats.recordSample('wait', sim.now - arrived);
    yield* timeout(service.exponential(1 / p.serviceRate));
    server.release(grant);
  }

  sim.process(function* () {
    for (let i = 0; i < p.customers; i++) {
      sim.process(customer);
      yield* timeout(arrivals.exponential(1 / p.arrivalRate));
    }
  });

  sim.run();
  return {
    meanWait: stats.getSampleMean('wait'),
    utilization: server.stats.utilizationRate,
  };
}
