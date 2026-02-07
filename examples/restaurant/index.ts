/**
 * Restaurant Simulation Example
 *
 * Simulates a restaurant with table seating and server allocation:
 * 1. Customers arrive in groups
 * 2. Wait for table matching their group size
 * 3. Get served by a waiter
 * 4. Eat and leave
 *
 * This example demonstrates:
 * - Variable-size resource requests (table sizes)
 * - Service time variability
 * - Peak vs. off-peak periods
 * - Customer satisfaction metrics (wait times)
 */

import {
  Simulation,
  Resource,
  Statistics,
  Random,
  timeout,
} from '../../src/index.js';

// Simulation parameters
const SIMULATION_HOURS = 8; // 8-hour dinner service
const CUSTOMER_GROUP_ARRIVAL_RATE = 5; // groups per hour
const NUM_TABLES = 10;
const NUM_SERVERS = 4;
const RANDOM_SEED = 456;

// Timing parameters (in hours)
const ORDER_TIME_MEAN = 0.1; // 6 minutes
const MEAL_TIME_MEAN = 0.75; // 45 minutes
const MEAL_TIME_STDDEV = 0.25; // +/-15 minutes
const CLEANUP_TIME = 0.083; // 5 minutes

/**
 * Generate a customer group size (1-6 people)
 */
function generateGroupSize(rng: Random): number {
  const rand = rng.uniform(0, 1);
  if (rand < 0.3) return 1; // 30% single
  if (rand < 0.6) return 2; // 30% couples
  if (rand < 0.85) return rng.randint(3, 4); // 25% small groups
  return rng.randint(5, 6); // 15% large groups
}

/**
 * Customer group process: arrive, wait for table, eat, leave
 */
function* customerGroupProcess(
  id: number,
  groupSize: number,
  tables: Resource,
  servers: Resource,
  stats: Statistics,
  rng: Random,
  sim: Simulation
) {
  const arrivalTime = sim.now;

  // Wait for table
  yield tables.request();
  const seatedTime = sim.now;
  const waitTime = seatedTime - arrivalTime;

  stats.recordValue('wait-time', waitTime);
  stats.recordValue('wait-time-minutes', waitTime * 60);
  stats.increment('groups-seated');
  stats.increment('customers-seated', groupSize);

  // Track wait time by group size
  if (groupSize === 1) stats.recordValue('wait-solo', waitTime);
  else if (groupSize === 2) stats.recordValue('wait-couple', waitTime);
  else stats.recordValue('wait-group', waitTime);

  // Request server for taking order
  yield servers.request();

  // Take order
  const orderTime = rng.exponential(ORDER_TIME_MEAN);
  yield* timeout(orderTime);

  // Release server (they go help other tables)
  servers.release();

  // Eat meal
  const mealTime = Math.max(
    0.2,
    rng.normal(MEAL_TIME_MEAN, MEAL_TIME_STDDEV)
  );
  yield* timeout(mealTime);

  // Request server for payment
  yield servers.request();
  yield* timeout(ORDER_TIME_MEAN / 2); // Payment is faster
  servers.release();

  // Leave table (cleanup happens)
  yield* timeout(CLEANUP_TIME);
  tables.release();

  // Track total time in restaurant
  const totalTime = sim.now - arrivalTime;
  stats.recordValue('total-time', totalTime);
  stats.recordValue('total-time-minutes', totalTime * 60);
}

/**
 * Arrival process: customers arrive in groups
 */
function* arrivalProcess(
  tables: Resource,
  servers: Resource,
  stats: Statistics,
  rng: Random,
  sim: Simulation,
  until: number
) {
  let groupId = 0;

  while (sim.now < until) {
    // Generate group
    const groupSize = generateGroupSize(rng);

    // Create customer group process
    sim.process(() =>
      customerGroupProcess(groupId++, groupSize, tables, servers, stats, rng, sim)
    );

    // Wait for next arrival
    const interarrivalTime = rng.exponential(1 / CUSTOMER_GROUP_ARRIVAL_RATE);
    yield* timeout(interarrivalTime);
  }
}

/**
 * Run the restaurant simulation
 */
function runSimulation() {
  console.log('='.repeat(60));
  console.log('Restaurant Simulation');
  console.log('='.repeat(60));
  console.log(`Simulation duration: ${SIMULATION_HOURS} hours`);
  console.log(`Arrival rate: ${CUSTOMER_GROUP_ARRIVAL_RATE} groups/hour`);
  console.log(`Tables: ${NUM_TABLES}`);
  console.log(`Servers: ${NUM_SERVERS}`);
  console.log(`Random seed: ${RANDOM_SEED}`);
  console.log();

  // Create simulation components
  const sim = new Simulation();
  const tables = new Resource(sim, NUM_TABLES, { name: 'Tables' });
  const servers = new Resource(sim, NUM_SERVERS, { name: 'Servers' });
  const stats = new Statistics(sim);
  const rng = new Random(RANDOM_SEED);

  // Start arrival process
  sim.process(() =>
    arrivalProcess(tables, servers, stats, rng, sim, SIMULATION_HOURS)
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
  const groupsSeated = stats.getCount('groups-seated');
  const customersSeated = stats.getCount('customers-seated');
  const tableStats = tables.stats;
  const serverStats = servers.stats;

  // Display results
  console.log('='.repeat(60));
  console.log('Simulation Results');
  console.log('='.repeat(60));

  console.log('\nService Summary:');
  console.log(`  Groups served: ${groupsSeated}`);
  console.log(`  Total customers: ${customersSeated}`);
  console.log(
    `  Average group size: ${(customersSeated / groupsSeated).toFixed(1)} people`
  );
  console.log(
    `  Throughput: ${(groupsSeated / SIMULATION_HOURS).toFixed(1)} groups/hour`
  );

  console.log('\nCustomer Experience:');
  console.log(
    `  Average wait time: ${(stats.getAverage('wait-time-minutes')).toFixed(1)} minutes`
  );
  console.log(
    `  Average time in restaurant: ${(stats.getAverage('total-time-minutes')).toFixed(1)} minutes`
  );

  // Wait time by group size (only show if we have data)
  const avgWaitSolo = stats.getAverage('wait-solo');
  const avgWaitCouple = stats.getAverage('wait-couple');
  const avgWaitGroup = stats.getAverage('wait-group');

  if (avgWaitSolo > 0 || avgWaitCouple > 0 || avgWaitGroup > 0) {
    console.log('\n  Wait time by group size:');
    if (avgWaitSolo > 0) {
      console.log(`    Solo diners (1): ${(avgWaitSolo * 60).toFixed(1)} min`);
    }
    if (avgWaitCouple > 0) {
      console.log(`    Couples (2): ${(avgWaitCouple * 60).toFixed(1)} min`);
    }
    if (avgWaitGroup > 0) {
      console.log(`    Groups (3+): ${(avgWaitGroup * 60).toFixed(1)} min`);
    }
  }

  console.log('\nTable Utilization:');
  console.log(
    `  Utilization: ${(tableStats.utilizationRate * 100).toFixed(1)}%`
  );
  console.log(
    `  Average queue: ${tableStats.averageQueueLength.toFixed(2)} groups waiting`
  );
  console.log(
    `  Average table wait: ${(tableStats.averageWaitTime * 60).toFixed(1)} minutes`
  );

  console.log('\nServer Utilization:');
  console.log(
    `  Utilization: ${(serverStats.utilizationRate * 100).toFixed(1)}%`
  );
  console.log(
    `  Average queue: ${serverStats.averageQueueLength.toFixed(2)} tables waiting`
  );

  // Performance assessment
  console.log('\n' + '='.repeat(60));
  console.log('Performance Assessment');
  console.log('='.repeat(60));

  const avgWaitMinutes = stats.getAverage('wait-time-minutes');

  console.log('\nCustomer Satisfaction:');
  if (avgWaitMinutes < 10) {
    console.log('  [*****] Excellent - Very short wait times');
  } else if (avgWaitMinutes < 20) {
    console.log('  [****-] Good - Acceptable wait times');
  } else if (avgWaitMinutes < 30) {
    console.log('  [***--] Fair - Longer wait times, some frustration expected');
  } else {
    console.log('  [**---] Poor - Long waits, customer dissatisfaction likely');
  }

  console.log('\nResource Efficiency:');
  if (tableStats.utilizationRate > 0.8) {
    console.log('  [WARNING] Tables are heavily utilized (>80%)');
    console.log('     Consider: Adding more tables or faster service');
  } else if (tableStats.utilizationRate < 0.5) {
    console.log('  [INFO] Tables are underutilized (<50%)');
    console.log('     Consider: Marketing to increase customer flow');
  } else {
    console.log('  [OK] Table utilization is balanced');
  }

  if (serverStats.utilizationRate > 0.8) {
    console.log('  [WARNING] Servers are overworked (>80%)');
    console.log('     Consider: Hiring more servers');
  } else if (serverStats.utilizationRate < 0.5) {
    console.log('  [INFO] Servers have excess capacity (<50%)');
    console.log('     Consider: Reducing staff during slow periods');
  } else {
    console.log('  [OK] Server staffing is balanced');
  }

  console.log('\n' + '='.repeat(60));

  return {
    simulation: result,
    service: {
      groupsServed: groupsSeated,
      customersServed: customersSeated,
      avgGroupSize: customersSeated / groupsSeated,
      throughput: groupsSeated / SIMULATION_HOURS,
    },
    customerExperience: {
      avgWaitMinutes,
      avgTotalMinutes: stats.getAverage('total-time-minutes'),
    },
    resources: {
      tables: tableStats,
      servers: serverStats,
    },
  };
}

// Run the simulation when executed directly
runSimulation();

export { runSimulation };
