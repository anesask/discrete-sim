/**
 * Traffic Light Intersection Simulation
 *
 * This example demonstrates process coordination using SimEvent.
 * Cars arrive at an intersection and must wait for a green light.
 * The traffic light cycles between red and green states.
 *
 * Key concepts:
 * - SimEvent for broadcasting state changes (green light)
 * - Process coordination (cars waiting for signal)
 * - Recurring events with reset()
 * - Real-world traffic modeling
 */

import { Simulation, SimEvent, timeout, Statistics } from '../../src/index.js';

// Traffic light controller
function* trafficLight(
  sim: Simulation,
  greenLight: SimEvent,
  redDuration: number,
  greenDuration: number
) {
  while (true) {
    // Red light period
    yield* timeout(redDuration);

    // Change to green
    console.log(`[${sim.now.toFixed(0)}] Traffic light: RED → GREEN`);
    greenLight.trigger({ time: sim.now, phase: 'green' });

    // Green light period
    yield* timeout(greenDuration);

    // Change to red (reset event for next cycle)
    console.log(`[${sim.now.toFixed(0)}] Traffic light: GREEN → RED`);
    greenLight.reset();
  }
}

// Car arriving at intersection
function* car(
  sim: Simulation,
  id: number,
  arrivalTime: number,
  greenLight: SimEvent,
  stats: Statistics
) {
  yield* timeout(arrivalTime);

  const arrival = sim.now;
  console.log(`[${sim.now.toFixed(0)}] Car ${id}: arrived at intersection`);

  // Wait for green light
  yield greenLight.wait();

  const crossing = sim.now;
  const waitTime = crossing - arrival;

  console.log(
    `[${sim.now.toFixed(0)}] Car ${id}: crossing (waited ${waitTime.toFixed(1)}s)`
  );

  // Record wait time
  stats.recordSample('wait-time', waitTime);
}

// Main simulation
function runSimulation() {
  const sim = new Simulation();
  const stats = new Statistics(sim);
  stats.enableSampleTracking('wait-time'); // Enable sample tracking for wait times
  const greenLight = new SimEvent(sim, 'green-light');

  // Traffic light cycles: 30s red, 20s green
  const RED_DURATION = 30;
  const GREEN_DURATION = 20;

  console.log('=== Traffic Light Intersection Simulation ===\n');
  console.log(`Red duration: ${RED_DURATION}s`);
  console.log(`Green duration: ${GREEN_DURATION}s\n`);

  // Start traffic light controller
  sim.process(() => trafficLight(sim, greenLight, RED_DURATION, GREEN_DURATION));

  // Cars arrive at random intervals
  const carArrivals = [
    5,  // Arrives during first red
    12, // Arrives during first red
    25, // Arrives near end of first red
    35, // Arrives during first green
    55, // Arrives during second red
    70, // Arrives during second red
    85, // Arrives during second green
  ];

  carArrivals.forEach((arrivalTime, index) => {
    sim.process(() => car(sim, index + 1, arrivalTime, greenLight, stats));
  });

  // Run simulation for 100 seconds
  sim.run(100);

  // Print statistics
  console.log('\n=== Simulation Results ===');
  console.log(`Total cars: ${stats.getSampleCount('wait-time')}`);
  console.log(`Average wait time: ${stats.getSampleMean('wait-time').toFixed(2)}s`);
  console.log(`Min wait time: ${stats.getMin('wait-time').toFixed(2)}s`);
  console.log(`Max wait time: ${stats.getMax('wait-time').toFixed(2)}s`);
  console.log(`Median wait time (P50): ${stats.getPercentile('wait-time', 50).toFixed(2)}s`);
  console.log(`95th percentile wait time: ${stats.getPercentile('wait-time', 95).toFixed(2)}s`);
}

// Run the simulation
runSimulation();
