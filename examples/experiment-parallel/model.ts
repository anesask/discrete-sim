/**
 * The model lives in its own module with no top-level side effects, so that
 * worker threads can import it. Everything the run needs is created inside
 * the function from the seed it receives.
 */
import { Simulation, Resource, Statistics, timeout } from '../../src/index.js';

export interface Params {
  servers: number;
  arrivalRate: number;
  serviceRate: number;
  customers: number;
}

export function model(p: Params, seed: number) {
  const sim = new Simulation({ randomSeed: seed });
  const arrivals = sim.random.stream('arrivals');
  const service = sim.random.stream('service');
  const stats = new Statistics(sim);
  stats.enableSampleTracking('wait', { maxSamples: 5000 });
  const servers = new Resource(sim, p.servers);

  function* customer() {
    const arrived = sim.now;
    const grant = yield* servers.acquire();
    stats.recordSample('wait', sim.now - arrived);
    yield* timeout(service.exponential(1 / p.serviceRate));
    servers.release(grant);
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
    p95Wait: stats.getPercentile('wait', 95),
    utilization: servers.stats.utilizationRate,
  };
}
