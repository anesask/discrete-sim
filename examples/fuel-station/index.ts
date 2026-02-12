/**
 * Fuel Station Simulation Example
 *
 * Simulates a gas station with a fuel tank that serves trucks and receives
 * periodic tanker deliveries.
 *
 * This example demonstrates:
 * - Buffer resource for storing homogeneous quantities (fuel)
 * - Producer-consumer pattern (tankers deliver, trucks consume)
 * - Queue management when tank runs low
 * - Statistics tracking for inventory management
 */

import {
  Simulation,
  Buffer,
  Random,
  timeout,
} from '../../src/index.js';

// Simulation parameters
const SIMULATION_HOURS = 24; // 24-hour simulation
const TANK_CAPACITY = 10000; // gallons
const INITIAL_FUEL = 5000; // Start half full
const RANDOM_SEED = 456;

// Truck parameters
const TRUCK_ARRIVAL_RATE = 8; // trucks per hour (one every 7.5 minutes)
const FUEL_PER_TRUCK_MIN = 50; // gallons
const FUEL_PER_TRUCK_MAX = 150; // gallons
const REFUEL_TIME = 0.1; // hours (6 minutes)

// Tanker parameters
const TANKER_DELIVERY_INTERVAL = 6; // hours between deliveries
const TANKER_DELIVERY_AMOUNT = 5000; // gallons per delivery
const TANKER_FILL_TIME = 0.5; // hours (30 minutes)

// Low fuel threshold for warnings
const LOW_FUEL_THRESHOLD = 1000; // gallons

/**
 * Customer truck that arrives to refuel
 */
function* truck(
  sim: Simulation,
  id: number,
  fuelTank: Buffer,
  rng: Random
): Generator {
  const arrivalTime = sim.now;
  const fuelNeeded = Math.round(
    rng.uniform(FUEL_PER_TRUCK_MIN, FUEL_PER_TRUCK_MAX)
  );

  console.log(
    `[${sim.now.toFixed(2)}h] Truck ${id} arrives, needs ${fuelNeeded} gallons (tank level: ${fuelTank.level})`
  );

  // Check if tank is running low
  if (fuelTank.level < LOW_FUEL_THRESHOLD && fuelTank.level >= fuelNeeded) {
    console.log(
      `[${sim.now.toFixed(2)}h] ⚠️  WARNING: Fuel tank running low (${fuelTank.level} gallons remaining)`
    );
  }

  // Request fuel from tank
  yield fuelTank.get(fuelNeeded);

  const waitTime = sim.now - arrivalTime;
  if (waitTime > 0) {
    console.log(
      `[${sim.now.toFixed(2)}h] Truck ${id} waited ${(waitTime * 60).toFixed(1)} minutes for fuel`
    );
  }

  console.log(
    `[${sim.now.toFixed(2)}h] Truck ${id} starts refueling ${fuelNeeded} gallons (tank now: ${fuelTank.level})`
  );

  // Refueling time
  yield* timeout(REFUEL_TIME);

  console.log(
    `[${sim.now.toFixed(2)}h] Truck ${id} departs (refueled ${fuelNeeded} gallons)`
  );
}

/**
 * Tanker that delivers fuel to the station
 */
function* tanker(
  sim: Simulation,
  deliveryNumber: number,
  fuelTank: Buffer
): Generator {
  console.log(
    `[${sim.now.toFixed(2)}h] 🚛 TANKER ${deliveryNumber} arrives with ${TANKER_DELIVERY_AMOUNT} gallons (tank: ${fuelTank.level}/${fuelTank.capacity})`
  );

  // Fill time
  yield* timeout(TANKER_FILL_TIME);

  // Deliver fuel to tank
  yield fuelTank.put(TANKER_DELIVERY_AMOUNT);

  console.log(
    `[${sim.now.toFixed(2)}h] 🚛 TANKER ${deliveryNumber} delivered ${TANKER_DELIVERY_AMOUNT} gallons (tank now: ${fuelTank.level}/${fuelTank.capacity}, available: ${fuelTank.available})`
  );
}

/**
 * Generator that schedules tanker deliveries
 */
function* tankerScheduler(sim: Simulation, fuelTank: Buffer): Generator {
  let deliveryCount = 0;

  while (true) {
    // Wait for next delivery time
    yield* timeout(TANKER_DELIVERY_INTERVAL);

    deliveryCount++;
    // Start tanker delivery process
    sim.process(() => tanker(sim, deliveryCount, fuelTank));
  }
}

/**
 * Generator that creates arriving trucks
 */
function* truckGenerator(
  sim: Simulation,
  fuelTank: Buffer,
  rng: Random
): Generator {
  let truckCount = 0;

  while (true) {
    // Exponential inter-arrival time (Poisson process)
    const interArrivalTime = rng.exponential(1 / TRUCK_ARRIVAL_RATE);
    yield* timeout(interArrivalTime);

    truckCount++;
    // Start truck process
    sim.process(() => truck(sim, truckCount, fuelTank, rng));
  }
}

/**
 * Print final statistics
 */
function printStatistics(fuelTank: Buffer, sim: Simulation): void {
  const stats = fuelTank.stats;

  console.log('\n' + '='.repeat(70));
  console.log('FUEL STATION SIMULATION RESULTS');
  console.log('='.repeat(70));
  console.log(`Simulation Duration: ${SIMULATION_HOURS} hours`);
  console.log(`\nFuel Tank Capacity: ${TANK_CAPACITY} gallons`);
  console.log(`Initial Fuel Level: ${INITIAL_FUEL} gallons`);
  console.log(`Final Fuel Level: ${fuelTank.level} gallons`);
  console.log(
    `\n${'─'.repeat(70)}\nOPERATIONS SUMMARY\n${'─'.repeat(70)}`
  );
  console.log(`Total Trucks Served: ${stats.totalGets}`);
  console.log(`Total Fuel Dispensed: ${stats.totalAmountGot.toFixed(0)} gallons`);
  console.log(
    `Average Fuel per Truck: ${(stats.totalAmountGot / stats.totalGets).toFixed(1)} gallons`
  );
  console.log(`\nTotal Tanker Deliveries: ${stats.totalPuts}`);
  console.log(`Total Fuel Delivered: ${stats.totalAmountPut.toFixed(0)} gallons`);
  console.log(
    `Average Delivery Size: ${(stats.totalAmountPut / stats.totalPuts).toFixed(0)} gallons`
  );

  console.log(
    `\n${'─'.repeat(70)}\nQUEUE PERFORMANCE\n${'─'.repeat(70)}`
  );
  console.log(
    `Average Truck Wait Time: ${(stats.averageGetWaitTime * 60).toFixed(2)} minutes`
  );
  console.log(
    `Average Truck Queue Length: ${stats.averageGetQueueLength.toFixed(2)}`
  );

  if (stats.averagePutWaitTime > 0) {
    console.log(
      `Average Tanker Wait Time: ${(stats.averagePutWaitTime * 60).toFixed(2)} minutes`
    );
  } else {
    console.log(`Average Tanker Wait Time: 0.00 minutes (never waited)`);
  }
  console.log(
    `Average Tanker Queue Length: ${stats.averagePutQueueLength.toFixed(2)}`
  );

  console.log(
    `\n${'─'.repeat(70)}\nINVENTORY METRICS\n${'─'.repeat(70)}`
  );
  console.log(
    `Average Fuel Level: ${stats.averageLevel.toFixed(0)} gallons (${((stats.averageLevel / TANK_CAPACITY) * 100).toFixed(1)}% capacity)`
  );

  // Calculate inventory turnover
  const turnover = stats.totalAmountGot / stats.averageLevel;
  console.log(`Inventory Turnover: ${turnover.toFixed(2)}x`);

  // Net flow
  const netFlow = stats.totalAmountPut - stats.totalAmountGot;
  console.log(
    `Net Fuel Flow: ${netFlow >= 0 ? '+' : ''}${netFlow.toFixed(0)} gallons`
  );

  console.log('='.repeat(70) + '\n');
}

/**
 * Main simulation
 */
function runSimulation(): void {
  console.log('Starting Fuel Station Simulation...\n');

  // Create simulation
  const sim = new Simulation();
  const rng = new Random(RANDOM_SEED);

  // Create fuel tank buffer
  const fuelTank = new Buffer(sim, TANK_CAPACITY, {
    name: 'Fuel Tank',
    initialLevel: INITIAL_FUEL,
  });

  // Start truck arrival generator
  sim.process(() => truckGenerator(sim, fuelTank, rng));

  // Start tanker delivery scheduler
  sim.process(() => tankerScheduler(sim, fuelTank));

  // Run simulation
  sim.run(SIMULATION_HOURS);

  // Print results
  printStatistics(fuelTank, sim);
}

// Run the simulation
runSimulation();
