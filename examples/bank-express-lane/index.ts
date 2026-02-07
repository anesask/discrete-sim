/**
 * Bank Express Lane Simulation Example
 *
 * Simulates a bank with priority-based service where customers can choose:
 * - Express service (quick transactions, higher priority)
 * - Regular service (all transactions, standard priority)
 *
 * This example demonstrates:
 * - Priority-based queuing (non-preemptive)
 * - Multiple customer types with different priorities
 * - Performance comparison between service types
 * - Queue length and wait time analysis by priority
 *
 * Key insight: Express customers have priority=0, regular customers have priority=10.
 * Lower priority number = higher priority, so express customers are served first when queued.
 */

import {
  Simulation,
  Resource,
  Statistics,
  Random,
  timeout,
} from '../../src/index.js';

// Simulation parameters
const SIMULATION_HOURS = 8; // 8-hour banking day
const EXPRESS_ARRIVAL_RATE = 8; // express customers per hour
const REGULAR_ARRIVAL_RATE = 6; // regular customers per hour
const NUM_TELLERS = 2;
const RANDOM_SEED = 456;

// Service time parameters (in hours)
const EXPRESS_SERVICE_MEAN = 0.05; // 3 minutes (express is quick)
const EXPRESS_SERVICE_STDDEV = 0.017; // +/-1 minute
const REGULAR_SERVICE_MEAN = 0.15; // 9 minutes (regular can be longer)
const REGULAR_SERVICE_STDDEV = 0.05; // +/-3 minutes

// Priority levels
const PRIORITY_EXPRESS = 0; // Higher priority (lower number)
const PRIORITY_REGULAR = 10; // Lower priority (higher number)

/**
 * Customer type definition
 */
type CustomerType = 'express' | 'regular';

/**
 * Customer process: arrive, wait in queue, get served, leave
 */
function* customerProcess(
  id: number,
  customerType: CustomerType,
  tellers: Resource,
  stats: Statistics,
  rng: Random,
  sim: Simulation
) {
  const arrivalTime = sim.now;
  const priority = customerType === 'express' ? PRIORITY_EXPRESS : PRIORITY_REGULAR;

  // Request teller with appropriate priority
  yield tellers.request(priority);

  const serviceStartTime = sim.now;
  const waitTime = serviceStartTime - arrivalTime;

  // Track wait time
  stats.recordValue(`wait-${customerType}`, waitTime);
  stats.recordValue(`wait-${customerType}-minutes`, waitTime * 60);
  stats.increment(`${customerType}-served`);

  // Service time depends on customer type
  let serviceTime: number;
  if (customerType === 'express') {
    serviceTime = Math.max(
      0.017,
      rng.normal(EXPRESS_SERVICE_MEAN, EXPRESS_SERVICE_STDDEV)
    );
  } else {
    serviceTime = Math.max(
      0.05,
      rng.normal(REGULAR_SERVICE_MEAN, REGULAR_SERVICE_STDDEV)
    );
  }

  yield* timeout(serviceTime);

  // Release teller
  tellers.release();

  // Track total time in bank
  const totalTime = sim.now - arrivalTime;
  stats.recordValue(`total-${customerType}`, totalTime);
  stats.recordValue(`total-${customerType}-minutes`, totalTime * 60);
}

/**
 * Express customer arrival process
 */
function* expressArrivalProcess(
  tellers: Resource,
  stats: Statistics,
  rng: Random,
  sim: Simulation,
  until: number
) {
  let customerId = 0;

  while (sim.now < until) {
    // Create express customer
    sim.process(() =>
      customerProcess(customerId++, 'express', tellers, stats, rng, sim)
    );

    // Wait for next arrival
    const interarrivalTime = rng.exponential(1 / EXPRESS_ARRIVAL_RATE);
    yield* timeout(interarrivalTime);
  }
}

/**
 * Regular customer arrival process
 */
function* regularArrivalProcess(
  tellers: Resource,
  stats: Statistics,
  rng: Random,
  sim: Simulation,
  until: number
) {
  let customerId = 0;

  while (sim.now < until) {
    // Create regular customer
    sim.process(() =>
      customerProcess(customerId++, 'regular', tellers, stats, rng, sim)
    );

    // Wait for next arrival
    const interarrivalTime = rng.exponential(1 / REGULAR_ARRIVAL_RATE);
    yield* timeout(interarrivalTime);
  }
}

/**
 * Run the bank express lane simulation
 */
function runSimulation() {
  console.log('='.repeat(70));
  console.log('Bank Express Lane Simulation');
  console.log('='.repeat(70));
  console.log(`Simulation duration: ${SIMULATION_HOURS} hours`);
  console.log(`Express arrival rate: ${EXPRESS_ARRIVAL_RATE} customers/hour (priority=${PRIORITY_EXPRESS})`);
  console.log(`Regular arrival rate: ${REGULAR_ARRIVAL_RATE} customers/hour (priority=${PRIORITY_REGULAR})`);
  console.log(`Number of tellers: ${NUM_TELLERS}`);
  console.log(`Random seed: ${RANDOM_SEED}`);
  console.log();
  console.log('Priority Queue Behavior:');
  console.log('  - Express customers have priority 0 (higher priority)');
  console.log('  - Regular customers have priority 10 (lower priority)');
  console.log('  - When both types are queued, express customers are served first');
  console.log('  - NON-PREEMPTIVE: In-service customers finish before next is served');
  console.log();

  // Create simulation components
  const sim = new Simulation();
  const tellers = new Resource(sim, NUM_TELLERS, {
    name: 'Bank Tellers',
    preemptive: false // Non-preemptive: customers finish service once started
  });
  const stats = new Statistics(sim);
  const rng = new Random(RANDOM_SEED);

  // Start both arrival processes
  sim.process(() =>
    expressArrivalProcess(tellers, stats, rng, sim, SIMULATION_HOURS)
  );
  sim.process(() =>
    regularArrivalProcess(tellers, stats, rng, sim, SIMULATION_HOURS)
  );

  // Run simulation
  console.log('Running simulation...');
  const startTime = Date.now();
  const result = sim.run();
  const elapsed = Date.now() - startTime;

  console.log(`Simulation completed in ${elapsed}ms`);
  console.log(`Simulated time: ${result.endTime.toFixed(2)} hours`);
  console.log(`Events processed: ${result.eventsProcessed}`);
  console.log();

  // Collect results
  const expressServed = stats.getCount('express-served');
  const regularServed = stats.getCount('regular-served');
  const totalServed = expressServed + regularServed;
  const tellerStats = tellers.stats;

  // Display results
  console.log('='.repeat(70));
  console.log('Simulation Results');
  console.log('='.repeat(70));

  console.log('\nService Summary:');
  console.log(`  Total customers served: ${totalServed}`);
  console.log(`  Express customers: ${expressServed} (${((expressServed / totalServed) * 100).toFixed(1)}%)`);
  console.log(`  Regular customers: ${regularServed} (${((regularServed / totalServed) * 100).toFixed(1)}%)`);
  console.log(`  Throughput: ${(totalServed / SIMULATION_HOURS).toFixed(1)} customers/hour`);

  console.log('\nWait Time Comparison:');
  const expressWaitMin = stats.getAverage('wait-express-minutes');
  const regularWaitMin = stats.getAverage('wait-regular-minutes');
  console.log(`  Express average wait: ${expressWaitMin.toFixed(2)} minutes`);
  console.log(`  Regular average wait: ${regularWaitMin.toFixed(2)} minutes`);

  if (regularWaitMin > expressWaitMin) {
    const ratio = regularWaitMin / expressWaitMin;
    console.log(`  -> Regular customers wait ${ratio.toFixed(1)}x longer than express`);
  }

  console.log('\nTotal Time in Bank:');
  const expressTotalMin = stats.getAverage('total-express-minutes');
  const regularTotalMin = stats.getAverage('total-regular-minutes');
  console.log(`  Express average: ${expressTotalMin.toFixed(2)} minutes`);
  console.log(`  Regular average: ${regularTotalMin.toFixed(2)} minutes`);

  console.log('\nResource Utilization:');
  console.log(`  Teller utilization: ${(tellerStats.utilizationRate * 100).toFixed(1)}%`);
  console.log(`  Average queue length: ${tellerStats.averageQueueLength.toFixed(2)} customers`);
  console.log(`  Total requests: ${tellerStats.totalRequests}`);
  console.log(`  Total releases: ${tellerStats.totalReleases}`);

  // Performance assessment
  console.log('\n' + '='.repeat(70));
  console.log('Priority Queue Analysis');
  console.log('='.repeat(70));

  console.log('\nPriority System Effectiveness:');
  if (regularWaitMin > expressWaitMin * 1.2) {
    console.log('  [OK] Priority system is working effectively');
    console.log('    Express customers experience significantly shorter waits');
  } else if (regularWaitMin > expressWaitMin) {
    console.log('  [WARNING] Priority system has modest effect');
    console.log('    Express customers have slightly shorter waits');
  } else {
    console.log('  [INFO] Priority system not impacting wait times');
    console.log('    System may not be busy enough to see priority effects');
  }

  // Queue pressure analysis
  console.log('\nQueue Pressure:');
  const avgQueueLength = tellerStats.averageQueueLength;
  if (avgQueueLength > 3) {
    console.log(`  [WARNING] High queue pressure (avg ${avgQueueLength.toFixed(1)} customers)`);
    console.log('    -> Priority queuing provides significant benefit to express customers');
    console.log('    -> Consider adding another teller to reduce overall wait times');
  } else if (avgQueueLength > 1) {
    console.log(`  [INFO] Moderate queue pressure (avg ${avgQueueLength.toFixed(1)} customers)`);
    console.log('    -> Priority queuing provides benefit during busy periods');
  } else {
    console.log(`  [OK] Low queue pressure (avg ${avgQueueLength.toFixed(1)} customers)`);
    console.log('    -> Most customers served immediately or with minimal wait');
  }

  // Staffing recommendations
  console.log('\nStaffing Recommendations:');
  if (tellerStats.utilizationRate > 0.85) {
    console.log('  [WARNING] UNDERSTAFFED:');
    console.log(`     - Teller utilization high (${(tellerStats.utilizationRate * 100).toFixed(1)}%)`);
    console.log(`     -> Add ${Math.ceil(NUM_TELLERS * 0.5)} more teller(s)`);
  } else if (tellerStats.utilizationRate < 0.5) {
    console.log('  [INFO] OVERSTAFFED:');
    console.log(`     - Teller utilization low (${(tellerStats.utilizationRate * 100).toFixed(1)}%)`);
    console.log(`     -> Consider reducing to ${Math.max(1, NUM_TELLERS - 1)} teller(s)`);
  } else {
    console.log('  [OK] WELL-STAFFED: Current staffing appears optimal');
    console.log(`     - Teller utilization: ${(tellerStats.utilizationRate * 100).toFixed(1)}%`);
  }

  console.log('\n' + '='.repeat(70));

  return {
    simulation: result,
    service: {
      expressServed,
      regularServed,
      totalServed,
      throughput: totalServed / SIMULATION_HOURS,
    },
    waitTimes: {
      expressAvgMinutes: expressWaitMin,
      regularAvgMinutes: regularWaitMin,
      expressAdvantage: regularWaitMin / expressWaitMin,
    },
    performance: {
      tellerUtilization: tellerStats.utilizationRate,
      avgQueueLength: tellerStats.averageQueueLength,
    },
  };
}

// Run the simulation when executed directly
runSimulation();

export { runSimulation };
