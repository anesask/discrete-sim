/**
 * Emergency Hospital Simulation Example
 *
 * Simulates an emergency department with priority-based preemptive service.
 * Patient types by severity (using triage levels):
 * - Critical (Priority 0): Life-threatening, can preempt lower priority patients
 * - Urgent (Priority 5): Serious but stable
 * - Standard (Priority 10): Non-life-threatening
 *
 * This example demonstrates:
 * - PREEMPTIVE resource allocation (critical cases interrupt lower priority)
 * - Process interruption and recovery (PreemptionError handling)
 * - Multi-level priority system
 * - Preemption statistics tracking
 * - Emergency triage protocol simulation
 *
 * Key insight: When a critical patient arrives and all beds are occupied,
 * the lowest-priority patient is preempted (moved to waiting) to free a bed.
 */

import {
  Simulation,
  Resource,
  Statistics,
  Random,
  timeout,
  PreemptionError,
} from '../../src/index.js';

// Simulation parameters
const SIMULATION_HOURS = 12; // 12-hour shift
const CRITICAL_ARRIVAL_RATE = 2; // critical patients per hour
const URGENT_ARRIVAL_RATE = 4; // urgent patients per hour
const STANDARD_ARRIVAL_RATE = 6; // standard patients per hour
const NUM_BEDS = 3; // Emergency department beds
const RANDOM_SEED = 999;

// Priority levels (triage system)
const PRIORITY_CRITICAL = 0; // Life-threatening
const PRIORITY_URGENT = 5; // Serious but stable
const PRIORITY_STANDARD = 10; // Non-life-threatening

// Treatment time parameters (in hours)
const CRITICAL_TREATMENT_MEAN = 0.5; // 30 minutes
const CRITICAL_TREATMENT_STDDEV = 0.17; // +/-10 minutes
const URGENT_TREATMENT_MEAN = 0.33; // 20 minutes
const URGENT_TREATMENT_STDDEV = 0.1; // +/-6 minutes
const STANDARD_TREATMENT_MEAN = 0.25; // 15 minutes
const STANDARD_TREATMENT_STDDEV = 0.083; // +/-5 minutes

/**
 * Patient severity level
 */
type SeverityLevel = 'critical' | 'urgent' | 'standard';

/**
 * Get priority for severity level
 */
function getPriority(severity: SeverityLevel): number {
  switch (severity) {
    case 'critical':
      return PRIORITY_CRITICAL;
    case 'urgent':
      return PRIORITY_URGENT;
    case 'standard':
      return PRIORITY_STANDARD;
  }
}

/**
 * Get treatment parameters for severity level
 */
function getTreatmentParams(severity: SeverityLevel): [number, number] {
  switch (severity) {
    case 'critical':
      return [CRITICAL_TREATMENT_MEAN, CRITICAL_TREATMENT_STDDEV];
    case 'urgent':
      return [URGENT_TREATMENT_MEAN, URGENT_TREATMENT_STDDEV];
    case 'standard':
      return [STANDARD_TREATMENT_MEAN, STANDARD_TREATMENT_STDDEV];
  }
}

/**
 * Patient process: arrive, wait for bed, receive treatment, leave
 * Can be preempted if a higher-priority patient arrives
 */
function* patientProcess(
  id: number,
  severity: SeverityLevel,
  beds: Resource,
  stats: Statistics,
  rng: Random,
  sim: Simulation
) {
  const arrivalTime = sim.now;
  const priority = getPriority(severity);
  let attemptCount = 0;
  let wasPreempted = false;

  while (attemptCount < 10) {
    // Allow up to 10 retries
    attemptCount++;

    try {
      const waitStartTime = sim.now;

      // Request bed with priority
      yield beds.request(priority);

      const treatmentStartTime = sim.now;
      const waitTime = treatmentStartTime - waitStartTime;

      // Track wait time (only for initial wait, not after preemption)
      if (attemptCount === 1) {
        stats.recordValue(`wait-${severity}`, waitTime);
        stats.recordValue(`wait-${severity}-minutes`, waitTime * 60);
      }

      // Get treatment duration
      const [meanTreatment, stddevTreatment] = getTreatmentParams(severity);
      const treatmentTime = Math.max(
        0.083, // Minimum 5 minutes
        rng.normal(meanTreatment, stddevTreatment)
      );

      // Receive treatment
      yield* timeout(treatmentTime);

      // Treatment completed successfully
      beds.release();

      // Track successful completion
      stats.increment(`${severity}-completed`);
      if (wasPreempted) {
        stats.increment(`${severity}-completed-after-preemption`);
      }

      // Track total time
      const totalTime = sim.now - arrivalTime;
      stats.recordValue(`total-${severity}`, totalTime);
      stats.recordValue(`total-${severity}-minutes`, totalTime * 60);

      return; // Successfully treated, exit
    } catch (err) {
      if (err instanceof PreemptionError) {
        // Patient was preempted by higher priority patient
        wasPreempted = true;
        stats.increment(`${severity}-preempted`);

        // Record when this occurred
        stats.increment('total-preemptions-patient-view');

        // Patient waits and will retry
        // In real ED, they'd go back to waiting room
        yield* timeout(0.01); // Brief moment before retrying
      } else {
        throw err; // Unexpected error
      }
    }
  }

  // If we get here, patient gave up after too many preemptions
  stats.increment(`${severity}-abandoned`);
}

/**
 * Arrival process for a specific severity level
 */
function* arrivalProcess(
  severity: SeverityLevel,
  arrivalRate: number,
  beds: Resource,
  stats: Statistics,
  rng: Random,
  sim: Simulation,
  until: number
) {
  let patientId = 0;

  while (sim.now < until) {
    stats.increment(`${severity}-arrived`);

    // Create patient process
    sim.process(() =>
      patientProcess(patientId++, severity, beds, stats, rng, sim)
    );

    // Wait for next arrival
    const interarrivalTime = rng.exponential(1 / arrivalRate);
    yield* timeout(interarrivalTime);
  }
}

/**
 * Run the emergency hospital simulation
 */
function runSimulation() {
  console.log('='.repeat(75));
  console.log('Emergency Hospital Simulation - Preemptive Resource Allocation');
  console.log('='.repeat(75));
  console.log(`Simulation duration: ${SIMULATION_HOURS} hours`);
  console.log(`Emergency department beds: ${NUM_BEDS}`);
  console.log();
  console.log('Patient Arrival Rates:');
  console.log(`  Critical (priority ${PRIORITY_CRITICAL}): ${CRITICAL_ARRIVAL_RATE} patients/hour`);
  console.log(`  Urgent   (priority ${PRIORITY_URGENT}): ${URGENT_ARRIVAL_RATE} patients/hour`);
  console.log(`  Standard (priority ${PRIORITY_STANDARD}): ${STANDARD_ARRIVAL_RATE} patients/hour`);
  console.log(`  Total: ${CRITICAL_ARRIVAL_RATE + URGENT_ARRIVAL_RATE + STANDARD_ARRIVAL_RATE} patients/hour`);
  console.log();
  console.log('Preemption Protocol:');
  console.log('  - PREEMPTIVE: Critical patients can interrupt lower-priority treatment');
  console.log('  - When all beds full, lowest-priority patient is preempted');
  console.log('  - Preempted patients return to queue and retry');
  console.log(`  Random seed: ${RANDOM_SEED}`);
  console.log();

  // Create simulation components
  const sim = new Simulation();
  const beds = new Resource(sim, NUM_BEDS, {
    name: 'ED Beds',
    preemptive: true, // Enable preemption for critical cases
  });
  const stats = new Statistics(sim);
  const rng = new Random(RANDOM_SEED);

  // Start arrival processes for all severity levels
  sim.process(() =>
    arrivalProcess(
      'critical',
      CRITICAL_ARRIVAL_RATE,
      beds,
      stats,
      rng,
      sim,
      SIMULATION_HOURS
    )
  );
  sim.process(() =>
    arrivalProcess(
      'urgent',
      URGENT_ARRIVAL_RATE,
      beds,
      stats,
      rng,
      sim,
      SIMULATION_HOURS
    )
  );
  sim.process(() =>
    arrivalProcess(
      'standard',
      STANDARD_ARRIVAL_RATE,
      beds,
      stats,
      rng,
      sim,
      SIMULATION_HOURS
    )
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
  const criticalArrived = stats.getCount('critical-arrived');
  const urgentArrived = stats.getCount('urgent-arrived');
  const standardArrived = stats.getCount('standard-arrived');
  const totalArrived = criticalArrived + urgentArrived + standardArrived;

  const criticalCompleted = stats.getCount('critical-completed');
  const urgentCompleted = stats.getCount('urgent-completed');
  const standardCompleted = stats.getCount('standard-completed');
  const totalCompleted = criticalCompleted + urgentCompleted + standardCompleted;

  const criticalPreempted = stats.getCount('critical-preempted');
  const urgentPreempted = stats.getCount('urgent-preempted');
  const standardPreempted = stats.getCount('standard-preempted');

  const bedStats = beds.stats;

  // Display results
  console.log('='.repeat(75));
  console.log('Simulation Results');
  console.log('='.repeat(75));

  console.log('\nPatient Volume:');
  console.log(`  Total arrived: ${totalArrived} patients`);
  console.log(`  Critical: ${criticalArrived} (${((criticalArrived / totalArrived) * 100).toFixed(1)}%)`);
  console.log(`  Urgent:   ${urgentArrived} (${((urgentArrived / totalArrived) * 100).toFixed(1)}%)`);
  console.log(`  Standard: ${standardArrived} (${((standardArrived / totalArrived) * 100).toFixed(1)}%)`);

  console.log('\nTreatment Completion:');
  console.log(`  Total completed: ${totalCompleted} patients`);
  console.log(`  Critical: ${criticalCompleted}/${criticalArrived} (${((criticalCompleted / criticalArrived) * 100).toFixed(1)}%)`);
  console.log(`  Urgent:   ${urgentCompleted}/${urgentArrived} (${((urgentCompleted / urgentArrived) * 100).toFixed(1)}%)`);
  console.log(`  Standard: ${standardCompleted}/${standardArrived} (${((standardCompleted / standardArrived) * 100).toFixed(1)}%)`);

  console.log('\nWait Times (Initial Wait):');
  const criticalWait = stats.getAverage('wait-critical-minutes');
  const urgentWait = stats.getAverage('wait-urgent-minutes');
  const standardWait = stats.getAverage('wait-standard-minutes');
  console.log(`  Critical: ${criticalWait.toFixed(1)} minutes`);
  console.log(`  Urgent:   ${urgentWait.toFixed(1)} minutes`);
  console.log(`  Standard: ${standardWait.toFixed(1)} minutes`);

  console.log('\nTotal Time in ED:');
  const criticalTotal = stats.getAverage('total-critical-minutes');
  const urgentTotal = stats.getAverage('total-urgent-minutes');
  const standardTotal = stats.getAverage('total-standard-minutes');
  console.log(`  Critical: ${criticalTotal.toFixed(1)} minutes`);
  console.log(`  Urgent:   ${urgentTotal.toFixed(1)} minutes`);
  console.log(`  Standard: ${standardTotal.toFixed(1)} minutes`);

  console.log('\n' + '='.repeat(75));
  console.log('Preemption Analysis');
  console.log('='.repeat(75));

  console.log('\nPreemption Events:');
  console.log(`  Total preemptions (resource view): ${bedStats.totalPreemptions}`);
  console.log(`  Critical patients preempted: ${criticalPreempted}`);
  console.log(`  Urgent patients preempted:   ${urgentPreempted}`);
  console.log(`  Standard patients preempted: ${standardPreempted}`);

  if (bedStats.totalPreemptions > 0) {
    console.log('\nPreemption Impact:');
    const criticalAfterPreemption = stats.getCount(
      'critical-completed-after-preemption'
    );
    const urgentAfterPreemption = stats.getCount(
      'urgent-completed-after-preemption'
    );
    const standardAfterPreemption = stats.getCount(
      'standard-completed-after-preemption'
    );

    if (standardPreempted > 0) {
      console.log(
        `  Standard patients: ${standardPreempted} preemptions, ${standardAfterPreemption} completed after preemption`
      );
    }
    if (urgentPreempted > 0) {
      console.log(
        `  Urgent patients: ${urgentPreempted} preemptions, ${urgentAfterPreemption} completed after preemption`
      );
    }
    if (criticalPreempted > 0) {
      console.log(
        `  Critical patients: ${criticalPreempted} preemptions (unusual!)`
      );
    }
  }

  console.log('\nResource Utilization:');
  console.log(`  Bed utilization: ${(bedStats.utilizationRate * 100).toFixed(1)}%`);
  console.log(`  Average queue length: ${bedStats.averageQueueLength.toFixed(2)} patients`);
  console.log(`  Total requests: ${bedStats.totalRequests}`);

  // Performance assessment
  console.log('\n' + '='.repeat(75));
  console.log('Emergency Department Performance');
  console.log('='.repeat(75));

  console.log('\nCritical Care Performance:');
  if (criticalCompleted === criticalArrived) {
    console.log('  [OK] ALL critical patients treated');
  } else {
    const remaining = criticalArrived - criticalCompleted;
    console.log(`  [WARNING] ${remaining} critical patient(s) still in system at end`);
  }

  if (criticalWait < 5) {
    console.log(`  [OK] Excellent response time (${criticalWait.toFixed(1)} min < 5 min target)`);
  } else if (criticalWait < 10) {
    console.log(`  [WARNING] Acceptable response time (${criticalWait.toFixed(1)} min)`);
  } else {
    console.log(`  [WARNING] SLOW response time (${criticalWait.toFixed(1)} min > 10 min)`);
  }

  console.log('\nPreemption System Effectiveness:');
  if (bedStats.totalPreemptions > 0) {
    console.log(`  [OK] Preemption system active: ${bedStats.totalPreemptions} preemptions occurred`);
    if (standardPreempted > urgentPreempted && urgentPreempted > criticalPreempted) {
      console.log('  [OK] Correct triage: Most preemptions affected lower-priority patients');
    }
    console.log('  -> Critical patients successfully prioritized over non-critical');
  } else {
    console.log('  [INFO] No preemptions occurred');
    console.log('  -> System not busy enough to require preemption');
  }

  console.log('\nCapacity Assessment:');
  if (bedStats.utilizationRate > 0.85) {
    console.log('  [WARNING] OVERCAPACITY:');
    console.log(`     - Bed utilization: ${(bedStats.utilizationRate * 100).toFixed(1)}%`);
    console.log(`     -> Add ${Math.ceil(NUM_BEDS * 0.3)} more bed(s)`);
    console.log('     -> High preemption rate indicates capacity strain');
  } else if (bedStats.utilizationRate > 0.7) {
    console.log('  [WARNING] Near capacity during peaks');
    console.log(`     - Bed utilization: ${(bedStats.utilizationRate * 100).toFixed(1)}%`);
    console.log('     -> Current capacity adequate but monitor closely');
  } else {
    console.log('  [OK] Adequate capacity');
    console.log(`     - Bed utilization: ${(bedStats.utilizationRate * 100).toFixed(1)}%`);
  }

  console.log('\n' + '='.repeat(75));

  return {
    simulation: result,
    patients: {
      arrived: { critical: criticalArrived, urgent: urgentArrived, standard: standardArrived },
      completed: { critical: criticalCompleted, urgent: urgentCompleted, standard: standardCompleted },
    },
    preemptions: {
      total: bedStats.totalPreemptions,
      bySeverity: {
        critical: criticalPreempted,
        urgent: urgentPreempted,
        standard: standardPreempted,
      },
    },
    performance: {
      waitTimes: { critical: criticalWait, urgent: urgentWait, standard: standardWait },
      bedUtilization: bedStats.utilizationRate,
    },
  };
}

// Run the simulation when executed directly
runSimulation();

export { runSimulation };
