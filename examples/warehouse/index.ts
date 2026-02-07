/**
 * Warehouse Simulation Example
 *
 * Simulates a warehouse receiving and processing shipments:
 * 1. Trucks arrive at loading dock
 * 2. Unload cargo using forklift
 * 3. Inspect items
 * 4. Store in warehouse
 *
 * This example demonstrates:
 * - Multiple resource types (docks, forklifts, inspectors)
 * - Multi-stage processes
 * - Resource contention and queuing
 * - Realistic workflow modeling
 */

import {
  Simulation,
  Resource,
  Statistics,
  Random,
  timeout,
} from '../../src/index.js';

// Simulation parameters
const NUM_TRUCKS = 50;
const TRUCK_ARRIVAL_RATE = 0.2; // trucks per hour
const NUM_LOADING_DOCKS = 2;
const NUM_FORKLIFTS = 3;
const NUM_INSPECTORS = 2;
const RANDOM_SEED = 123;

// Process time parameters (in hours)
const UNLOAD_TIME_MEAN = 0.5;
const UNLOAD_TIME_STDDEV = 0.1;
const INSPECTION_TIME_MEAN = 0.3;
const INSPECTION_TIME_STDDEV = 0.05;
const STORAGE_TIME_MEAN = 0.2;
const STORAGE_TIME_STDDEV = 0.05;

/**
 * Truck process: arrive, unload, inspect, store, depart
 */
function* truckProcess(
  id: number,
  dock: Resource,
  forklift: Resource,
  inspector: Resource,
  stats: Statistics,
  rng: Random,
  sim: Simulation
) {
  const arrivalTime = sim.now;

  // 1. Request loading dock
  yield dock.request();
  const dockStartTime = sim.now;
  stats.recordValue('dock-wait', dockStartTime - arrivalTime);

  // 2. Request forklift for unloading
  yield forklift.request();
  const forkliftStartTime = sim.now;
  stats.recordValue('forklift-wait', forkliftStartTime - dockStartTime);

  // Unload cargo
  const unloadTime = Math.max(
    0.1,
    rng.normal(UNLOAD_TIME_MEAN, UNLOAD_TIME_STDDEV)
  );
  yield* timeout(unloadTime);

  // Release forklift and dock
  forklift.release();
  dock.release();

  // 3. Request inspector
  yield inspector.request();
  const inspectionStartTime = sim.now;
  stats.recordValue('inspection-wait', inspectionStartTime - forkliftStartTime);

  // Inspect cargo
  const inspectionTime = Math.max(
    0.05,
    rng.normal(INSPECTION_TIME_MEAN, INSPECTION_TIME_STDDEV)
  );
  yield* timeout(inspectionTime);

  inspector.release();

  // 4. Store cargo (no resource needed - just time)
  const storageTime = Math.max(
    0.05,
    rng.normal(STORAGE_TIME_MEAN, STORAGE_TIME_STDDEV)
  );
  yield* timeout(storageTime);

  // Track total time in system
  const totalTime = sim.now - arrivalTime;
  stats.recordValue('total-time', totalTime);
  stats.increment('trucks-processed');
}

/**
 * Arrival process: generates trucks at random intervals
 */
function* arrivalProcess(
  dock: Resource,
  forklift: Resource,
  inspector: Resource,
  stats: Statistics,
  rng: Random,
  sim: Simulation
) {
  for (let i = 0; i < NUM_TRUCKS; i++) {
    // Create and start truck process
    sim.process(() =>
      truckProcess(i, dock, forklift, inspector, stats, rng, sim)
    );

    // Wait for next truck arrival (exponential inter-arrival time)
    const interarrivalTime = rng.exponential(1 / TRUCK_ARRIVAL_RATE);
    yield* timeout(interarrivalTime);
  }
}

/**
 * Run the warehouse simulation
 */
function runSimulation() {
  console.log('='.repeat(60));
  console.log('Warehouse Simulation');
  console.log('='.repeat(60));
  console.log(`Number of trucks: ${NUM_TRUCKS}`);
  console.log(`Arrival rate: ${TRUCK_ARRIVAL_RATE} trucks/hour`);
  console.log(`Loading docks: ${NUM_LOADING_DOCKS}`);
  console.log(`Forklifts: ${NUM_FORKLIFTS}`);
  console.log(`Inspectors: ${NUM_INSPECTORS}`);
  console.log(`Random seed: ${RANDOM_SEED}`);
  console.log();

  // Create simulation components
  const sim = new Simulation();
  const dock = new Resource(sim, NUM_LOADING_DOCKS, { name: 'Loading Dock' });
  const forklift = new Resource(sim, NUM_FORKLIFTS, { name: 'Forklift' });
  const inspector = new Resource(sim, NUM_INSPECTORS, { name: 'Inspector' });
  const stats = new Statistics(sim);
  const rng = new Random(RANDOM_SEED);

  // Start arrival process
  sim.process(() =>
    arrivalProcess(dock, forklift, inspector, stats, rng, sim)
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
  const trucksProcessed = stats.getCount('trucks-processed');
  const dockStats = dock.stats;
  const forkliftStats = forklift.stats;
  const inspectorStats = inspector.stats;

  // Display results
  console.log('='.repeat(60));
  console.log('Simulation Results');
  console.log('='.repeat(60));

  console.log('\nThroughput:');
  console.log(`  Trucks processed: ${trucksProcessed}`);
  console.log(
    `  Average time in system: ${stats.getAverage('total-time').toFixed(2)} hours`
  );

  console.log('\nLoading Dock:');
  console.log(
    `  Utilization: ${(dockStats.utilizationRate * 100).toFixed(1)}%`
  );
  console.log(
    `  Average wait time: ${dockStats.averageWaitTime.toFixed(2)} hours`
  );
  console.log(
    `  Average queue length: ${dockStats.averageQueueLength.toFixed(2)}`
  );

  console.log('\nForklift:');
  console.log(
    `  Utilization: ${(forkliftStats.utilizationRate * 100).toFixed(1)}%`
  );
  console.log(
    `  Average wait time: ${forkliftStats.averageWaitTime.toFixed(2)} hours`
  );
  console.log(
    `  Average queue length: ${forkliftStats.averageQueueLength.toFixed(2)}`
  );

  console.log('\nInspector:');
  console.log(
    `  Utilization: ${(inspectorStats.utilizationRate * 100).toFixed(1)}%`
  );
  console.log(
    `  Average wait time: ${inspectorStats.averageWaitTime.toFixed(2)} hours`
  );
  console.log(
    `  Average queue length: ${inspectorStats.averageQueueLength.toFixed(2)}`
  );

  console.log('\nWait Time Breakdown:');
  console.log(
    `  Average dock wait: ${stats.getAverage('dock-wait').toFixed(2)} hours`
  );
  console.log(
    `  Average forklift wait: ${stats.getAverage('forklift-wait').toFixed(2)} hours`
  );
  console.log(
    `  Average inspection wait: ${stats.getAverage('inspection-wait').toFixed(2)} hours`
  );

  // Identify bottlenecks
  console.log('\n' + '='.repeat(60));
  console.log('Bottleneck Analysis');
  console.log('='.repeat(60));

  const utilizations = [
    { name: 'Loading Dock', utilization: dockStats.utilizationRate },
    { name: 'Forklift', utilization: forkliftStats.utilizationRate },
    { name: 'Inspector', utilization: inspectorStats.utilizationRate },
  ];

  utilizations.sort((a, b) => b.utilization - a.utilization);

  console.log('\nResource Utilization (sorted):');
  for (const { name, utilization } of utilizations) {
    const bar = '#'.repeat(Math.floor(utilization * 50));
    console.log(`  ${name.padEnd(15)} ${(utilization * 100).toFixed(1)}% ${bar}`);
  }

  const bottleneck = utilizations[0];
  if (bottleneck && bottleneck.utilization > 0.8) {
    console.log(`\n[WARNING] BOTTLENECK: ${bottleneck.name} is heavily utilized (${(bottleneck.utilization * 100).toFixed(1)}%)`);
    console.log(`   Consider adding more ${bottleneck.name} resources.`);
  } else {
    console.log('\n[OK] No severe bottlenecks detected (all resources < 80% utilized)');
  }

  console.log('\n' + '='.repeat(60));

  return {
    simulation: result,
    resources: {
      dock: dockStats,
      forklift: forkliftStats,
      inspector: inspectorStats,
    },
    statistics: {
      trucksProcessed,
      avgTotalTime: stats.getAverage('total-time'),
      avgDockWait: stats.getAverage('dock-wait'),
      avgForkliftWait: stats.getAverage('forklift-wait'),
      avgInspectionWait: stats.getAverage('inspection-wait'),
    },
  };
}

// Run the simulation when executed directly
runSimulation();

export { runSimulation };
