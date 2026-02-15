/**
 * Hospital Emergency Room Simulation
 *
 * Demonstrates priority queue functionality in a realistic healthcare scenario.
 * Patients arrive with different triage levels (critical, urgent, routine) and
 * are treated based on priority rather than arrival order.
 *
 * This example compares:
 * - FIFO (First In First Out) - traditional queue, no priority
 * - Priority Queue - patients treated by severity level
 */

import { Simulation, Resource, timeout } from '../../src/index.js';

// Triage levels (lower number = higher priority)
enum TriageLevel {
  CRITICAL = 1,  // Life-threatening emergencies
  URGENT = 2,    // Serious but not immediately life-threatening
  ROUTINE = 3,   // Non-urgent cases
}

const triageName: Record<TriageLevel, string> = {
  [TriageLevel.CRITICAL]: 'Critical',
  [TriageLevel.URGENT]: 'Urgent',
  [TriageLevel.ROUTINE]: 'Routine',
};

interface PatientStats {
  id: number;
  triage: TriageLevel;
  arrivalTime: number;
  waitTime: number;
  treatmentStartTime: number;
}

/**
 * Run ER simulation with specified queue discipline
 */
function runERSimulation(
  discipline: 'fifo' | 'priority',
  numPatients: number = 30,
  numDoctors: number = 2
): PatientStats[] {
  const sim = new Simulation();
  const er = new Resource(sim, numDoctors, {
    name: 'ER Doctors',
    queueDiscipline: discipline,
  });

  const stats: PatientStats[] = [];

  // Patient arrival and treatment process
  function* patient(id: number, triage: TriageLevel, arrivalTime: number) {
    // Wait until arrival time
    if (arrivalTime > 0) {
      yield* timeout(arrivalTime);
    }

    const actualArrival = sim.now;

    // Request doctor (with priority based on triage level)
    yield er.request(triage);

    const treatmentStart = sim.now;
    const waitTime = treatmentStart - actualArrival;

    // Treatment duration varies by severity
    const treatmentDuration = triage === TriageLevel.CRITICAL ? 30 :
                             triage === TriageLevel.URGENT ? 20 : 10;

    yield* timeout(treatmentDuration);
    er.release();

    stats.push({
      id,
      triage,
      arrivalTime: actualArrival,
      waitTime,
      treatmentStartTime: treatmentStart,
    });
  }

  // Generate patient arrivals with realistic distribution
  // ~40% routine, ~40% urgent, ~20% critical
  const triageDistribution = [
    TriageLevel.CRITICAL,
    TriageLevel.CRITICAL,
    TriageLevel.URGENT,
    TriageLevel.URGENT,
    TriageLevel.URGENT,
    TriageLevel.URGENT,
    TriageLevel.ROUTINE,
    TriageLevel.ROUTINE,
    TriageLevel.ROUTINE,
    TriageLevel.ROUTINE,
  ];

  for (let i = 0; i < numPatients; i++) {
    const triage = triageDistribution[i % triageDistribution.length];
    const arrivalTime = Math.random() * 60; // Arrive within first 60 minutes
    sim.process(() => patient(i + 1, triage, arrivalTime));
  }

  sim.run();

  return stats.sort((a, b) => a.id - b.id);
}

/**
 * Calculate statistics by triage level
 */
function analyzeStats(stats: PatientStats[]) {
  const byTriage = new Map<TriageLevel, PatientStats[]>();

  for (const stat of stats) {
    if (!byTriage.has(stat.triage)) {
      byTriage.set(stat.triage, []);
    }
    byTriage.get(stat.triage)!.push(stat);
  }

  console.log('\n📊 Wait Time Statistics by Triage Level:\n');
  console.log('Level      | Count | Avg Wait | Min Wait | Max Wait');
  console.log('-----------|-------|----------|----------|----------');

  for (const level of [TriageLevel.CRITICAL, TriageLevel.URGENT, TriageLevel.ROUTINE]) {
    const patients = byTriage.get(level) || [];
    if (patients.length === 0) continue;

    const waitTimes = patients.map(p => p.waitTime);
    const avgWait = waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length;
    const minWait = Math.min(...waitTimes);
    const maxWait = Math.max(...waitTimes);

    console.log(
      `${triageName[level].padEnd(10)} | ${patients.length.toString().padStart(5)} | ` +
      `${avgWait.toFixed(1).padStart(8)} | ${minWait.toFixed(1).padStart(8)} | ${maxWait.toFixed(1).padStart(8)}`
    );
  }

  // Overall statistics
  const allWaitTimes = stats.map(s => s.waitTime);
  const overallAvg = allWaitTimes.reduce((a, b) => a + b, 0) / allWaitTimes.length;
  console.log('-----------|-------|----------|----------|----------');
  console.log(
    `Overall    | ${stats.length.toString().padStart(5)} | ${overallAvg.toFixed(1).padStart(8)} | ` +
    `${Math.min(...allWaitTimes).toFixed(1).padStart(8)} | ${Math.max(...allWaitTimes).toFixed(1).padStart(8)}`
  );
}

/**
 * Compare FIFO vs Priority queue disciplines
 */
function compareQueueDisciplines() {
  console.log('\n🏥 Hospital Emergency Room Simulation\n');
  console.log('═'.repeat(60));
  console.log('\nScenario: 30 patients, 2 doctors, 60-minute arrival window');
  console.log('Patient mix: 20% Critical, 40% Urgent, 40% Routine\n');

  console.log('═'.repeat(60));
  console.log('\n📋 FIFO Queue (First-Come, First-Served)');
  console.log('─'.repeat(60));
  const fifoStats = runERSimulation('fifo', 30, 2);
  analyzeStats(fifoStats);

  console.log('\n═'.repeat(60));
  console.log('\n⭐ Priority Queue (Triage-Based)');
  console.log('─'.repeat(60));
  const priorityStats = runERSimulation('priority', 30, 2);
  analyzeStats(priorityStats);

  // Comparison summary
  console.log('\n═'.repeat(60));
  console.log('\n💡 Key Insights:\n');

  const fifoCritical = fifoStats.filter(s => s.triage === TriageLevel.CRITICAL);
  const priorityCritical = priorityStats.filter(s => s.triage === TriageLevel.CRITICAL);

  if (fifoCritical.length > 0 && priorityCritical.length > 0) {
    const fifoAvg = fifoCritical.reduce((sum, s) => sum + s.waitTime, 0) / fifoCritical.length;
    const priorityAvg = priorityCritical.reduce((sum, s) => sum + s.waitTime, 0) / priorityCritical.length;
    const improvement = ((fifoAvg - priorityAvg) / fifoAvg * 100).toFixed(1);

    console.log(`   Critical patients wait ${improvement}% less with priority queuing`);
    console.log(`   FIFO avg: ${fifoAvg.toFixed(1)} min | Priority avg: ${priorityAvg.toFixed(1)} min`);
  }

  const fifoRoutine = fifoStats.filter(s => s.triage === TriageLevel.ROUTINE);
  const priorityRoutine = priorityStats.filter(s => s.triage === TriageLevel.ROUTINE);

  if (fifoRoutine.length > 0 && priorityRoutine.length > 0) {
    const fifoAvg = fifoRoutine.reduce((sum, s) => sum + s.waitTime, 0) / fifoRoutine.length;
    const priorityAvg = priorityRoutine.reduce((sum, s) => sum + s.waitTime, 0) / priorityRoutine.length;
    const increase = ((priorityAvg - fifoAvg) / fifoAvg * 100).toFixed(1);

    console.log(`\n   Routine patients wait ${increase}% more (acceptable trade-off)`);
    console.log(`   FIFO avg: ${fifoAvg.toFixed(1)} min | Priority avg: ${priorityAvg.toFixed(1)} min`);
  }

  console.log('\n   ✓ Priority queuing saves lives by treating critical cases faster');
  console.log('   ✓ Overall system efficiency remains similar');
  console.log('   ✓ Resource allocation matches medical urgency\n');
}

// Run the comparison
compareQueueDisciplines();
