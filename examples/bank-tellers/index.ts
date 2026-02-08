/**
 * Bank Tellers Simulation Example
 *
 * Simulates a bank branch with multiple teller windows serving different
 * types of transactions:
 * - Quick transactions (deposits, withdrawals)
 * - Complex transactions (loans, account opening)
 *
 * This example demonstrates:
 * - Service type differentiation
 * - Customer prioritization
 * - Performance metrics and SLA tracking
 * - Peak hour management
 */

import {
  Simulation,
  Resource,
  Statistics,
  Random,
  timeout,
} from '../../src/index.js';

// Simulation parameters
const SIMULATION_HOURS = 6; // 6-hour banking day
const CUSTOMER_ARRIVAL_RATE = 12; // customers per hour
const NUM_TELLERS = 3;
const RANDOM_SEED = 789;

// Service level agreement (SLA) targets
const SLA_WAIT_TIME_MINUTES = 10; // Target: serve within 10 minutes

// Service time parameters (in hours)
const QUICK_SERVICE_MEAN = 0.05; // 3 minutes
const QUICK_SERVICE_STDDEV = 0.017; // +/-1 minute
const COMPLEX_SERVICE_MEAN = 0.167; // 10 minutes
const COMPLEX_SERVICE_STDDEV = 0.05; // +/-3 minutes

/**
 * Transaction type definition
 */
type TransactionType = 'quick' | 'complex';

/**
 * Generate transaction type (70% quick, 30% complex)
 */
function generateTransactionType(rng: Random): TransactionType {
  return rng.uniform(0, 1) < 0.7 ? 'quick' : 'complex';
}

/**
 * Customer process: arrive, wait, get served, leave
 */
function* customerProcess(
  id: number,
  transactionType: TransactionType,
  tellers: Resource,
  stats: Statistics,
  rng: Random,
  sim: Simulation
) {
  const arrivalTime = sim.now;

  // Wait for teller
  yield tellers.request();
  const serviceStartTime = sim.now;
  const waitTime = serviceStartTime - arrivalTime;

  // Track wait time
  const waitTimeMinutes = waitTime * 60;
  stats.recordValue('wait-time', waitTime);
  stats.recordValue('wait-time-minutes', waitTimeMinutes);
  stats.recordSample('wait-time-minutes', waitTimeMinutes); // For percentiles
  stats.increment('customers-served');

  // Track by transaction type
  if (transactionType === 'quick') {
    stats.recordValue('wait-quick', waitTime);
    stats.increment('quick-transactions');
  } else {
    stats.recordValue('wait-complex', waitTime);
    stats.increment('complex-transactions');
  }

  // Track SLA compliance
  const withinSLA = waitTime * 60 <= SLA_WAIT_TIME_MINUTES;
  if (withinSLA) {
    stats.increment('sla-met');
  } else {
    stats.increment('sla-missed');
    stats.recordValue('sla-violation', waitTime * 60 - SLA_WAIT_TIME_MINUTES);
  }

  // Service time depends on transaction type
  let serviceTime: number;
  if (transactionType === 'quick') {
    serviceTime = Math.max(
      0.017,
      rng.normal(QUICK_SERVICE_MEAN, QUICK_SERVICE_STDDEV)
    );
  } else {
    serviceTime = Math.max(
      0.05,
      rng.normal(COMPLEX_SERVICE_MEAN, COMPLEX_SERVICE_STDDEV)
    );
  }

  yield* timeout(serviceTime);

  // Release teller
  tellers.release();

  // Track total time in bank
  const totalTime = sim.now - arrivalTime;
  const totalTimeMinutes = totalTime * 60;
  stats.recordValue('total-time', totalTime);
  stats.recordValue('total-time-minutes', totalTimeMinutes);
  stats.recordSample('total-time-minutes', totalTimeMinutes); // For percentiles
}

/**
 * Arrival process: customers arrive at random intervals
 */
function* arrivalProcess(
  tellers: Resource,
  stats: Statistics,
  rng: Random,
  sim: Simulation,
  until: number
) {
  let customerId = 0;

  while (sim.now < until) {
    // Generate transaction type
    const transactionType = generateTransactionType(rng);

    // Create customer process
    sim.process(() =>
      customerProcess(customerId++, transactionType, tellers, stats, rng, sim)
    );

    // Wait for next arrival
    const interarrivalTime = rng.exponential(1 / CUSTOMER_ARRIVAL_RATE);
    yield* timeout(interarrivalTime);
  }
}

/**
 * Run the bank tellers simulation
 */
function runSimulation() {
  console.log('='.repeat(60));
  console.log('Bank Tellers Simulation');
  console.log('='.repeat(60));
  console.log(`Simulation duration: ${SIMULATION_HOURS} hours`);
  console.log(`Arrival rate: ${CUSTOMER_ARRIVAL_RATE} customers/hour`);
  console.log(`Number of tellers: ${NUM_TELLERS}`);
  console.log(`SLA target: Serve within ${SLA_WAIT_TIME_MINUTES} minutes`);
  console.log(`Random seed: ${RANDOM_SEED}`);
  console.log();

  // Create simulation components
  const sim = new Simulation();
  const tellers = new Resource(sim, NUM_TELLERS, { name: 'Tellers' });
  const stats = new Statistics(sim);
  const rng = new Random(RANDOM_SEED);

  // Enable sample tracking for advanced statistics (v0.1.2+)
  stats.enableSampleTracking('wait-time-minutes');
  stats.enableSampleTracking('total-time-minutes');

  // Start arrival process
  sim.process(() =>
    arrivalProcess(tellers, stats, rng, sim, SIMULATION_HOURS)
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
  const customersServed = stats.getCount('customers-served');
  const quickTransactions = stats.getCount('quick-transactions');
  const complexTransactions = stats.getCount('complex-transactions');
  const slaMet = stats.getCount('sla-met');
  const slaMissed = stats.getCount('sla-missed');
  const tellerStats = tellers.stats;

  // Display results
  console.log('='.repeat(60));
  console.log('Simulation Results');
  console.log('='.repeat(60));

  console.log('\nService Summary:');
  console.log(`  Total customers served: ${customersServed}`);
  console.log(`  Quick transactions: ${quickTransactions} (${((quickTransactions / customersServed) * 100).toFixed(1)}%)`);
  console.log(`  Complex transactions: ${complexTransactions} (${((complexTransactions / customersServed) * 100).toFixed(1)}%)`);
  console.log(`  Throughput: ${(customersServed / SIMULATION_HOURS).toFixed(1)} customers/hour`);

  console.log('\nWait Time Performance:');
  console.log(
    `  Average wait time: ${stats.getAverage('wait-time-minutes').toFixed(1)} minutes`
  );
  console.log(
    `  P50 (median): ${stats.getPercentile('wait-time-minutes', 50).toFixed(1)} minutes`
  );
  console.log(
    `  P95: ${stats.getPercentile('wait-time-minutes', 95).toFixed(1)} minutes`
  );
  console.log(
    `  P99: ${stats.getPercentile('wait-time-minutes', 99).toFixed(1)} minutes`
  );
  console.log(
    `  Std Dev: ${stats.getStdDev('wait-time-minutes').toFixed(1)} minutes`
  );
  console.log(
    `  Quick transactions: ${(stats.getAverage('wait-quick') * 60).toFixed(1)} minutes`
  );
  console.log(
    `  Complex transactions: ${(stats.getAverage('wait-complex') * 60).toFixed(1)} minutes`
  );

  console.log('\nSLA Compliance:');
  const slaComplianceRate = slaMet / (slaMet + slaMissed);
  console.log(`  Target: ${SLA_WAIT_TIME_MINUTES} minutes or less`);
  console.log(`  Met SLA: ${slaMet} customers (${(slaComplianceRate * 100).toFixed(1)}%)`);
  console.log(`  Missed SLA: ${slaMissed} customers (${((1 - slaComplianceRate) * 100).toFixed(1)}%)`);

  if (slaMissed > 0) {
    const avgViolation = stats.getAverage('sla-violation');
    console.log(
      `  Average SLA violation: ${avgViolation.toFixed(1)} minutes over target`
    );
  }

  console.log('\nTeller Utilization:');
  console.log(
    `  Utilization: ${(tellerStats.utilizationRate * 100).toFixed(1)}%`
  );
  console.log(
    `  Average queue length: ${tellerStats.averageQueueLength.toFixed(2)} customers`
  );
  console.log(
    `  Total wait time: ${tellerStats.averageWaitTime.toFixed(2)} hours per customer`
  );

  console.log('\nTime in Bank:');
  console.log(
    `  Average total time: ${stats.getAverage('total-time-minutes').toFixed(1)} minutes`
  );
  console.log(
    `  P50 (median): ${stats.getPercentile('total-time-minutes', 50).toFixed(1)} minutes`
  );
  console.log(
    `  P95: ${stats.getPercentile('total-time-minutes', 95).toFixed(1)} minutes`
  );
  console.log(
    `  P99: ${stats.getPercentile('total-time-minutes', 99).toFixed(1)} minutes`
  );

  // Performance assessment
  console.log('\n' + '='.repeat(60));
  console.log('Performance Assessment');
  console.log('='.repeat(60));

  // SLA compliance grading
  console.log('\nSLA Compliance Grade:');
  if (slaComplianceRate >= 0.95) {
    console.log('  [*****] Excellent (>=95%)');
  } else if (slaComplianceRate >= 0.90) {
    console.log('  [****-] Good (90-95%)');
  } else if (slaComplianceRate >= 0.80) {
    console.log('  [***--] Fair (80-90%)');
  } else {
    console.log('  [**---] Poor (<80%)');
  }

  // Staffing recommendations
  console.log('\nStaffing Recommendations:');
  const avgWaitMinutes = stats.getAverage('wait-time-minutes');

  if (tellerStats.utilizationRate > 0.85 || avgWaitMinutes > SLA_WAIT_TIME_MINUTES) {
    console.log('  [WARNING] UNDERSTAFFED:');
    if (tellerStats.utilizationRate > 0.85) {
      console.log(`     - Teller utilization high (${(tellerStats.utilizationRate * 100).toFixed(1)}%)`);
    }
    if (avgWaitMinutes > SLA_WAIT_TIME_MINUTES) {
      console.log(`     - Average wait exceeds SLA (${avgWaitMinutes.toFixed(1)} min > ${SLA_WAIT_TIME_MINUTES} min)`);
    }
    console.log(`     - Consider adding ${Math.ceil((NUM_TELLERS * 0.3))} more teller(s)`);
  } else if (tellerStats.utilizationRate < 0.5) {
    console.log('  [INFO] OVERSTAFFED:');
    console.log(`     - Teller utilization low (${(tellerStats.utilizationRate * 100).toFixed(1)}%)`);
    console.log(`     - Consider reducing staff by ${Math.floor(NUM_TELLERS * 0.25)} teller(s)`);
  } else {
    console.log('  [OK] WELL-STAFFED: Current staffing appears optimal');
  }

  // Service mix analysis
  console.log('\nService Mix Analysis:');
  const complexRatio = complexTransactions / customersServed;
  if (complexRatio > 0.4) {
    console.log('  [INFO] High proportion of complex transactions (>40%)');
    console.log('     Consider: Dedicated specialist window for complex services');
  } else if (complexRatio < 0.2) {
    console.log('  [INFO] Low proportion of complex transactions (<20%)');
    console.log('     Consider: Promote self-service kiosks for quick transactions');
  } else {
    console.log('  [OK] Balanced service mix');
  }

  console.log('\n' + '='.repeat(60));

  return {
    simulation: result,
    service: {
      customersServed,
      quickTransactions,
      complexTransactions,
      throughput: customersServed / SIMULATION_HOURS,
    },
    sla: {
      met: slaMet,
      missed: slaMissed,
      complianceRate: slaComplianceRate,
    },
    performance: {
      avgWaitMinutes,
      avgTotalMinutes: stats.getAverage('total-time-minutes'),
      tellerUtilization: tellerStats.utilizationRate,
    },
  };
}

// Run the simulation when executed directly
runSimulation();

export { runSimulation };
