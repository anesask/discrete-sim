/**
 * Warehouse Distribution Center Simulation
 *
 * Simulates a distribution warehouse that receives and ships pallets.
 * Demonstrates Store resource for managing distinct objects with filtering.
 *
 * This example shows:
 * - Store resource for distinct items (pallets with unique IDs)
 * - FIFO retrieval (no filter)
 * - Filter-based retrieval (by destination, priority)
 * - Statistics tracking for inventory management
 */

import {
  Simulation,
  Store,
  Resource,
  Random,
  timeout,
} from '../../src/index.js';

// Simulation parameters
const SIMULATION_HOURS = 48; // 2-day simulation
const WAREHOUSE_CAPACITY = 100; // pallets
const NUM_FORKLIFTS = 3;
const RANDOM_SEED = 789;

// Arrival parameters
const RECEIVING_RATE = 5; // pallets per hour
const SHIPPING_RATE = 4.5; // pallets per hour

// Processing times (hours)
const RECEIVING_TIME = 0.15; // 9 minutes to receive
const SHIPPING_TIME = 0.2; // 12 minutes to ship

// Destinations and their priorities
const DESTINATIONS = [
  { name: 'NYC', priority: 1, weight: 0.3 },
  { name: 'LA', priority: 2, weight: 0.25 },
  { name: 'CHI', priority: 1, weight: 0.25 },
  { name: 'MIA', priority: 3, weight: 0.2 },
] as const;

/**
 * Pallet definition
 */
interface Pallet {
  id: string;
  destination: string;
  weight: number;
  priority: number;
  receivedAt: number;
}

/**
 * Select random destination based on weights
 */
function selectDestination(rng: Random): { name: string; priority: number } {
  const r = rng.uniform(0, 1);
  let cumulative = 0;

  for (const dest of DESTINATIONS) {
    cumulative += dest.weight;
    if (r < cumulative) {
      return { name: dest.name, priority: dest.priority };
    }
  }

  return DESTINATIONS[0]!; // Fallback
}

/**
 * Receiving process - pallets arrive and are stored
 */
function* receivePallet(
  sim: Simulation,
  palletId: number,
  warehouse: Store<Pallet>,
  forklift: Resource,
  rng: Random
): Generator {
  const arrivalTime = sim.now;
  const dest = selectDestination(rng);
  const weight = Math.round(rng.uniform(200, 800));

  const pallet: Pallet = {
    id: `P${palletId.toString().padStart(4, '0')}`,
    destination: dest.name,
    weight,
    priority: dest.priority,
    receivedAt: arrivalTime,
  };

  console.log(
    `[${sim.now.toFixed(2)}h] 📦 RECEIVING: Pallet ${pallet.id} for ${pallet.destination} (${weight}kg, Priority ${pallet.priority})`
  );

  // Wait for forklift
  yield forklift.request();

  // Receiving time
  yield* timeout(RECEIVING_TIME);

  // Store pallet
  yield warehouse.put(pallet);

  console.log(
    `[${sim.now.toFixed(2)}h] ✓ STORED: Pallet ${pallet.id} (warehouse: ${warehouse.size}/${warehouse.capacity})`
  );

  forklift.release();
}

/**
 * Shipping process - FIFO (first in, first out)
 */
function* shipFIFO(
  sim: Simulation,
  shipmentId: number,
  warehouse: Store<Pallet>,
  forklift: Resource
): Generator {
  console.log(
    `[${sim.now.toFixed(2)}h] 🚚 SHIP-FIFO: Waiting for any pallet...`
  );

  // Wait for forklift
  yield forklift.request();

  // Get next pallet (FIFO - no filter)
  const request = warehouse.get();
  yield request;
  const pallet = request.retrievedItem!;

  const waitTime = sim.now - pallet.receivedAt;

  console.log(
    `[${sim.now.toFixed(2)}h] 📤 SHIPPING: Pallet ${pallet.id} to ${pallet.destination} (waited ${(waitTime * 60).toFixed(1)}min, warehouse: ${warehouse.size}/${warehouse.capacity})`
  );

  // Shipping time
  yield* timeout(SHIPPING_TIME);

  console.log(
    `[${sim.now.toFixed(2)}h] ✓ SHIPPED: Pallet ${pallet.id} (FIFO #${shipmentId})`
  );

  forklift.release();
}

/**
 * Priority shipping - gets high priority pallets first
 */
function* shipPriority(
  sim: Simulation,
  warehouse: Store<Pallet>,
  forklift: Resource,
  targetPriority: number
): Generator {
  console.log(
    `[${sim.now.toFixed(2)}h] 🚚 PRIORITY-SHIP: Waiting for priority ${targetPriority} pallet...`
  );

  // Wait for forklift
  yield forklift.request();

  // Get high priority pallet
  const request = warehouse.get((p) => p.priority === targetPriority);
  yield request;
  const pallet = request.retrievedItem!;

  const waitTime = sim.now - pallet.receivedAt;

  console.log(
    `[${sim.now.toFixed(2)}h] 🔥 PRIORITY: Shipping ${pallet.id} to ${pallet.destination} (P${pallet.priority}, waited ${(waitTime * 60).toFixed(1)}min)`
  );

  // Faster shipping for priority
  yield* timeout(SHIPPING_TIME * 0.8);

  console.log(`[${sim.now.toFixed(2)}h] ✓ PRIORITY-SHIPPED: Pallet ${pallet.id}`);

  forklift.release();
}

/**
 * Destination-specific shipping
 */
function* shipToDestination(
  sim: Simulation,
  warehouse: Store<Pallet>,
  forklift: Resource,
  destination: string
): Generator {
  console.log(
    `[${sim.now.toFixed(2)}h] 🚚 DEST-SHIP: Waiting for ${destination} pallet...`
  );

  // Wait for forklift
  yield forklift.request();

  // Get pallet for specific destination
  const request = warehouse.get((p) => p.destination === destination);
  yield request;
  const pallet = request.retrievedItem!;

  const waitTime = sim.now - pallet.receivedAt;

  console.log(
    `[${sim.now.toFixed(2)}h] 🎯 DEST: Shipping ${pallet.id} to ${destination} (waited ${(waitTime * 60).toFixed(1)}min)`
  );

  yield* timeout(SHIPPING_TIME);

  console.log(`[${sim.now.toFixed(2)}h] ✓ DEST-SHIPPED: Pallet ${pallet.id} to ${destination}`);

  forklift.release();
}

/**
 * Receiving truck generator
 */
function* receivingTrucks(
  sim: Simulation,
  warehouse: Store<Pallet>,
  forklift: Resource,
  rng: Random
): Generator {
  let palletCount = 0;

  while (true) {
    const interArrivalTime = rng.exponential(1 / RECEIVING_RATE);
    yield* timeout(interArrivalTime);

    palletCount++;
    sim.process(() => receivePallet(sim, palletCount, warehouse, forklift, rng));
  }
}

/**
 * Shipping truck generator (FIFO)
 */
function* shippingTrucksFIFO(
  sim: Simulation,
  warehouse: Store<Pallet>,
  forklift: Resource,
  rng: Random
): Generator {
  let shipmentCount = 0;

  while (true) {
    const interDepartureTime = rng.exponential(1 / SHIPPING_RATE);
    yield* timeout(interDepartureTime);

    shipmentCount++;
    sim.process(() => shipFIFO(sim, shipmentCount, warehouse, forklift));
  }
}

/**
 * Priority shipping scheduler
 */
function* priorityShippingScheduler(
  sim: Simulation,
  warehouse: Store<Pallet>,
  forklift: Resource
): Generator {
  while (true) {
    yield* timeout(6); // Every 6 hours, ship priority items

    // Ship all priority 1 items
    const priority1Count = warehouse.items.filter((p) => p.priority === 1).length;

    if (priority1Count > 0) {
      console.log(
        `\n[${sim.now.toFixed(2)}h] ⚡ PRIORITY BATCH: Found ${priority1Count} priority 1 items\n`
      );

      for (let i = 0; i < priority1Count; i++) {
        sim.process(() => shipPriority(sim, warehouse, forklift, 1));
      }
    }
  }
}

/**
 * Destination-specific shipping (daily routes)
 */
function* destinationRoutes(
  sim: Simulation,
  warehouse: Store<Pallet>,
  forklift: Resource
): Generator {
  const routeSchedule = [
    { destination: 'NYC', time: 8 },
    { destination: 'LA', time: 16 },
    { destination: 'CHI', time: 24 },
    { destination: 'MIA', time: 32 },
  ];

  for (const route of routeSchedule) {
    yield* timeout(route.time);

    const destCount = warehouse.items.filter(
      (p) => p.destination === route.destination
    ).length;

    if (destCount > 0) {
      console.log(
        `\n[${sim.now.toFixed(2)}h] 🚛 ${route.destination} ROUTE: ${destCount} pallets ready\n`
      );

      // Ship up to 5 pallets per route
      const shipCount = Math.min(destCount, 5);
      for (let i = 0; i < shipCount; i++) {
        sim.process(() =>
          shipToDestination(sim, warehouse, forklift, route.destination)
        );
      }
    }
  }
}

/**
 * Print final statistics
 */
function printStatistics(
  warehouse: Store<Pallet>,
  sim: Simulation,
  forklift: Resource
): void {
  const warehouseStats = warehouse.stats;
  const forkliftStats = forklift.stats;

  console.log('\n' + '='.repeat(70));
  console.log('WAREHOUSE DISTRIBUTION CENTER RESULTS');
  console.log('='.repeat(70));
  console.log(`Simulation Duration: ${SIMULATION_HOURS} hours`);

  console.log(
    `\n${'─'.repeat(70)}\nWAREHOUSE OPERATIONS\n${'─'.repeat(70)}`
  );
  console.log(`Warehouse Capacity: ${warehouse.capacity} pallets`);
  console.log(`Final Inventory: ${warehouse.size} pallets`);
  console.log(`\nTotal Pallets Received: ${warehouseStats.totalPuts}`);
  console.log(`Total Pallets Shipped: ${warehouseStats.totalGets}`);
  console.log(`Net Flow: ${warehouseStats.totalPuts - warehouseStats.totalGets} pallets`);

  console.log(
    `\n${'─'.repeat(70)}\nPERFORMANCE METRICS\n${'─'.repeat(70)}`
  );
  console.log(
    `Average Warehouse Occupancy: ${warehouseStats.averageSize.toFixed(1)} pallets (${((warehouseStats.averageSize / warehouse.capacity) * 100).toFixed(1)}%)`
  );
  console.log(
    `Average Receiving Wait: ${(warehouseStats.averagePutWaitTime * 60).toFixed(2)} minutes`
  );
  console.log(
    `Average Shipping Wait: ${(warehouseStats.averageGetWaitTime * 60).toFixed(2)} minutes`
  );

  console.log(
    `\n${'─'.repeat(70)}\nQUEUE STATISTICS\n${'─'.repeat(70)}`
  );
  console.log(
    `Average Receiving Queue: ${warehouseStats.averagePutQueueLength.toFixed(2)}`
  );
  console.log(
    `Average Shipping Queue: ${warehouseStats.averageGetQueueLength.toFixed(2)}`
  );

  console.log(
    `\n${'─'.repeat(70)}\nFORKLIFT UTILIZATION\n${'─'.repeat(70)}`
  );
  console.log(`Number of Forklifts: ${forklift.capacity}`);
  console.log(
    `Forklift Utilization: ${(forkliftStats.utilizationRate * 100).toFixed(1)}%`
  );
  console.log(`Total Operations: ${forkliftStats.totalRequests}`);
  console.log(
    `Average Wait for Forklift: ${(forkliftStats.averageWaitTime * 60).toFixed(2)} minutes`
  );

  console.log(
    `\n${'─'.repeat(70)}\nINVENTORY BREAKDOWN\n${'─'.repeat(70)}`
  );
  const remaining = warehouse.items;
  const byDestination = new Map<string, number>();

  remaining.forEach((p) => {
    byDestination.set(p.destination, (byDestination.get(p.destination) || 0) + 1);
  });

  if (remaining.length > 0) {
    console.log('Current Inventory by Destination:');
    byDestination.forEach((count, dest) => {
      console.log(`  ${dest}: ${count} pallets`);
    });
  } else {
    console.log('Warehouse is empty');
  }

  console.log('='.repeat(70) + '\n');
}

/**
 * Main simulation
 */
function runSimulation(): void {
  console.log('Starting Warehouse Distribution Simulation...\n');

  const sim = new Simulation();
  const rng = new Random(RANDOM_SEED);

  // Create warehouse and forklifts
  const warehouse = new Store<Pallet>(sim, WAREHOUSE_CAPACITY, {
    name: 'Distribution Warehouse',
  });
  const forklift = new Resource(sim, NUM_FORKLIFTS, {
    name: 'Forklift',
  });

  // Start receiving process
  sim.process(() => receivingTrucks(sim, warehouse, forklift, rng));

  // Start shipping process (FIFO)
  sim.process(() => shippingTrucksFIFO(sim, warehouse, forklift, rng));

  // Start priority shipping scheduler
  sim.process(() => priorityShippingScheduler(sim, warehouse, forklift));

  // Start destination-specific routes
  sim.process(() => destinationRoutes(sim, warehouse, forklift));

  // Run simulation
  sim.run(SIMULATION_HOURS);

  // Print results
  printStatistics(warehouse, sim, forklift);
}

// Run the simulation
runSimulation();
