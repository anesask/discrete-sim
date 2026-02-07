/**
 * M/M/1 Queue Example
 *
 * Classic single-server queue with:
 * - M: Markovian (exponential) arrival process
 * - M: Markovian (exponential) service times
 * - 1: Single server
 *
 * This example demonstrates:
 * 1. Using exponential distributions for realistic modeling
 * 2. Collecting statistics during simulation
 * 3. Validating simulation results against queuing theory
 * 4. Reproducible results with seeded random number generator
 */

import {
  Simulation,
  Resource,
  Statistics,
  Random,
  timeout,
} from '../../src/index.js';

// Simulation parameters
const ARRIVAL_RATE = 0.7; // customers per time unit (lambda)
const SERVICE_RATE = 1.0; // customers per time unit (mu)
const NUM_CUSTOMERS = 10000; // Large sample for accurate validation
const RANDOM_SEED = 42; // For reproducibility

// Theoretical results (M/M/1 formulas)
const RHO = ARRIVAL_RATE / SERVICE_RATE; // Utilization
const THEORETICAL_WAIT = RHO / (SERVICE_RATE - ARRIVAL_RATE); // E[W]
const THEORETICAL_QUEUE = RHO * RHO / (1 - RHO); // E[Q]
const THEORETICAL_SYSTEM_TIME = 1 / (SERVICE_RATE - ARRIVAL_RATE); // E[T]

/**
 * Customer process: arrive, wait for server, get served, depart
 */
function* customerProcess(
  id: number,
  server: Resource,
  stats: Statistics,
  rng: Random,
  sim: Simulation
) {
  // Request server (may have to wait in queue)
  yield server.request();

  // Track customer served
  stats.increment('customers-served');

  // Service time (exponential distribution)
  const serviceTime = rng.exponential(1 / SERVICE_RATE);
  yield* timeout(serviceTime);

  // Release server
  server.release();
}

/**
 * Arrival process: generates customers according to exponential inter-arrival times
 */
function* arrivalProcess(
  server: Resource,
  stats: Statistics,
  rng: Random,
  sim: Simulation
) {
  for (let i = 0; i < NUM_CUSTOMERS; i++) {
    // Create and start customer process
    sim.process(() => customerProcess(i, server, stats, rng, sim));

    // Wait for next arrival (exponential inter-arrival time)
    const interarrivalTime = rng.exponential(1 / ARRIVAL_RATE);
    yield* timeout(interarrivalTime);
  }
}

/**
 * Run the M/M/1 queue simulation
 */
function runSimulation() {
  console.log('='.repeat(60));
  console.log('M/M/1 Queue Simulation');
  console.log('='.repeat(60));
  console.log(`Arrival rate (lambda): ${ARRIVAL_RATE} customers/time unit`);
  console.log(`Service rate (mu): ${SERVICE_RATE} customers/time unit`);
  console.log(`Utilization (rho): ${RHO.toFixed(3)}`);
  console.log(`Number of customers: ${NUM_CUSTOMERS}`);
  console.log(`Random seed: ${RANDOM_SEED}`);
  console.log();

  // Create simulation components
  const sim = new Simulation();
  const server = new Resource(sim, 1, { name: 'Server' });
  const stats = new Statistics(sim);
  const rng = new Random(RANDOM_SEED);

  // Start arrival process
  sim.process(() => arrivalProcess(server, stats, rng, sim));

  // Run simulation
  console.log('Running simulation...');
  const startTime = Date.now();
  const result = sim.run();
  const elapsed = Date.now() - startTime;

  console.log(`Simulation completed in ${elapsed}ms`);
  console.log(`Simulated time: ${result.endTime.toFixed(2)} time units`);
  console.log(`Events processed: ${result.eventsProcessed}`);
  console.log();

  // Collect results
  const customersServed = stats.getCount('customers-served');
  const serverStats = server.stats;
  const avgWaitTime = serverStats.averageWaitTime;
  const avgQueueLength = serverStats.averageQueueLength;

  // Display results
  console.log('='.repeat(60));
  console.log('Simulation Results vs. Theory');
  console.log('='.repeat(60));

  console.log('\nCustomers:');
  console.log(`  Served: ${customersServed}`);

  console.log('\nServer Utilization:');
  console.log(`  Theoretical: ${RHO.toFixed(4)}`);
  console.log(`  Simulated:   ${serverStats.utilizationRate.toFixed(4)}`);
  console.log(
    `  Error:       ${Math.abs(serverStats.utilizationRate - RHO).toFixed(4)}`
  );

  console.log('\nAverage Wait Time in Queue:');
  console.log(`  Theoretical: ${THEORETICAL_WAIT.toFixed(4)}`);
  console.log(`  Simulated:   ${avgWaitTime.toFixed(4)}`);
  console.log(
    `  Error:       ${Math.abs(avgWaitTime - THEORETICAL_WAIT).toFixed(4)}`
  );

  console.log('\nAverage Queue Length:');
  console.log(`  Theoretical: ${THEORETICAL_QUEUE.toFixed(4)}`);
  console.log(`  Simulated:   ${avgQueueLength.toFixed(4)}`);
  console.log(
    `  Error:       ${Math.abs(avgQueueLength - THEORETICAL_QUEUE).toFixed(4)}`
  );

  console.log('\nAverage Time in System:');
  const avgSystemTime = avgWaitTime + 1 / SERVICE_RATE;
  console.log(`  Theoretical: ${THEORETICAL_SYSTEM_TIME.toFixed(4)}`);
  console.log(`  Simulated:   ${avgSystemTime.toFixed(4)}`);
  console.log(
    `  Error:       ${Math.abs(avgSystemTime - THEORETICAL_SYSTEM_TIME).toFixed(4)}`
  );

  // Validation
  console.log('\n' + '='.repeat(60));
  console.log('Validation');
  console.log('='.repeat(60));

  const utilizationError = Math.abs(serverStats.utilizationRate - RHO) / RHO;
  const waitTimeError = Math.abs(avgWaitTime - THEORETICAL_WAIT) / THEORETICAL_WAIT;
  const queueLengthError =
    Math.abs(avgQueueLength - THEORETICAL_QUEUE) / THEORETICAL_QUEUE;

  console.log(`Utilization error:   ${(utilizationError * 100).toFixed(2)}%`);
  console.log(`Wait time error:     ${(waitTimeError * 100).toFixed(2)}%`);
  console.log(`Queue length error:  ${(queueLengthError * 100).toFixed(2)}%`);

  const threshold = 0.10; // 10% error threshold
  if (
    utilizationError < threshold &&
    waitTimeError < threshold &&
    queueLengthError < threshold
  ) {
    console.log('\n[PASS] VALIDATION PASSED: All metrics within 10% of theory');
  } else {
    console.log('\n[FAIL] VALIDATION FAILED: Some metrics exceed 10% error');
  }

  console.log('\n' + '='.repeat(60));

  return {
    simulation: result,
    validation: {
      utilizationError,
      waitTimeError,
      queueLengthError,
      passed:
        utilizationError < threshold &&
        waitTimeError < threshold &&
        queueLengthError < threshold,
    },
  };
}

// Run the simulation when executed directly
runSimulation();

export { runSimulation };
