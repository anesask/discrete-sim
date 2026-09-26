# Buffer, Store and Batch

Three ways to hold things: `Buffer` for homogeneous quantities, `Store` for distinct objects, `Batch` for collecting items and releasing them together.

## Buffer

Model resources that store **homogeneous quantities** (tokens) rather than discrete capacity units. Perfect for fuel tanks, money, raw materials, bandwidth, or any inventory of identical items.

```typescript
import { Buffer } from 'discrete-sim';

// Create a fuel tank with 10,000 gallon capacity
const fuelTank = new Buffer(sim, 10000, {
  name: 'Fuel Tank',
  initialLevel: 5000, // Start half full
});

// Truck refueling (consumer)
function* truck() {
  yield fuelTank.get(50); // Get 50 gallons (blocks if insufficient)
  yield* timeout(0.1); // Refuel for 6 minutes
}

// Tanker delivery (producer)
function* tanker() {
  yield* timeout(6); // Travel time
  yield fuelTank.put(5000); // Deliver 5000 gallons (blocks if insufficient space)
}

// Check status
console.log(fuelTank.level); // Current amount: 5000
console.log(fuelTank.available); // Space available: 5000
console.log(fuelTank.capacity); // Maximum: 10000
```

**Buffer Queue Disciplines (v0.1.8+):**

Buffers support independent queue disciplines for put and get operations:

```typescript
const buffer = new Buffer(sim, 1000, {
  name: 'Inventory',
  putQueueDiscipline: 'priority', // Priority for deliveries
  getQueueDiscipline: 'fifo', // FIFO for withdrawals
});

// High priority delivery (rush order)
function* urgentDelivery() {
  yield buffer.put(100, 1); // priority = 1 (high)
  // Delivered before lower priority puts
}

// Normal delivery
function* normalDelivery() {
  yield buffer.put(50, 10); // priority = 10 (low)
}
```

**Key Differences from Resource:**

| Feature        | Resource                                    | Buffer                                 |
| -------------- | ------------------------------------------- | -------------------------------------- |
| **Models**     | Discrete capacity units (servers, machines) | Continuous quantities (fuel, money)    |
| **Operations** | `request()` / `release()`                   | `put()` / `get()`                      |
| **Capacity**   | Integer units (1, 2, 3...)                  | Any number (50.5 gallons, 1250 tokens) |
| **Use Case**   | Limited workers, processors                 | Inventory, storage, bandwidth          |

**Buffer Statistics:**

```typescript
const stats = fuelTank.stats;

console.log(stats.totalPuts); // Number of deliveries
console.log(stats.totalGets); // Number of withdrawals
console.log(stats.totalAmountPut); // Total fuel delivered
console.log(stats.totalAmountGot); // Total fuel consumed
console.log(stats.averageLevel); // Time-weighted average inventory level
console.log(stats.averagePutWaitTime); // Average wait time for deliveries
console.log(stats.averageGetWaitTime); // Average wait time for withdrawals
console.log(stats.averagePutQueueLength); // Average delivery queue length
console.log(stats.averageGetQueueLength); // Average withdrawal queue length
```

**Complete Example:** See [`examples/fuel-station/`](../../examples/fuel-station/) for a full simulation of a gas station with trucks and tanker deliveries.

## Store

Model resources that store **distinct JavaScript objects** rather than homogeneous quantities. Perfect for warehouses, parking lots, patient queues, or any inventory with unique items.

```typescript
import { Store } from 'discrete-sim';

interface Pallet {
  id: string;
  destination: string;
  weight: number;
}

// Create warehouse with capacity for 100 pallets
const warehouse = new Store<Pallet>(sim, 100, { name: 'Warehouse' });

// Store a pallet
function* receivePallet(pallet: Pallet) {
  yield warehouse.put(pallet);
  console.log(`Stored pallet ${pallet.id}`);
}

// Retrieve FIFO (no filter)
function* shipNext() {
  const request = warehouse.get();
  yield request;
  const pallet = request.retrievedItem!;
  console.log(`Shipping ${pallet.id}`);
}

// Retrieve by filter (destination)
function* shipToNYC() {
  const request = warehouse.get((p) => p.destination === 'NYC');
  yield request;
  const pallet = request.retrievedItem!;
  console.log(`Shipping ${pallet.id} to NYC`);
}

// Inspect current items
console.log(warehouse.size); // Number of items stored
console.log(warehouse.available); // Space available
console.log(warehouse.items); // Read-only array of items
```

**Key Differences: Buffer vs Store**

| Feature       | Buffer              | Store                           |
| ------------- | ------------------- | ------------------------------- |
| **Stores**    | Numeric quantities  | Distinct objects                |
| **Put/Get**   | Amount (number)     | Item (object)                   |
| **Retrieval** | Always FIFO         | FIFO or filter-based            |
| **Use Case**  | Fuel, money, tokens | Pallets, patients, vehicles     |
| **Example**   | `buffer.get(50)`    | `store.get(p => p.id === 'P1')` |

**Filter-Based Retrieval:**

```typescript
// Get by property value
const req = store.get((item) => item.priority === 1);

// Get by complex condition
const req = store.get(
  (item) => item.destination === 'NYC' && item.weight > 500
);

// Get by ID
const req = store.get((item) => item.id === 'P0042');

// No filter = FIFO (first in, first out)
const req = store.get();
```

**Store Queue Disciplines (v0.1.13+):**

Like Resource and Buffer, a Store can order its _waiting_ put and get requests with FIFO (default), LIFO or priority disciplines. The discipline decides which waiting process is served first; it does not change which stored item an unfiltered `get()` returns (always the oldest matching item).

```typescript
const warehouse = new Store<Pallet>(sim, 100, {
  putQueueDiscipline: 'priority', // rush deliveries jump the queue when full
  getQueueDiscipline: { type: 'priority', tieBreaker: 'fifo' },
});

// Lower number = higher priority. When the store is full, rush deliveries are
// admitted before routine ones, regardless of arrival order.
function* rushDelivery(pallet: Pallet) {
  yield warehouse.put(pallet, 1);
}
function* routineDelivery(pallet: Pallet) {
  yield warehouse.put(pallet, 10);
}

// Express shipping waits ahead of standard shipping for the next matching pallet
function* expressPickup() {
  const req = warehouse.get((p) => p.destination === 'NYC', 1);
  yield req;
  ship(req.retrievedItem!);
}
```

**Store Statistics:**

```typescript
const stats = warehouse.stats;

console.log(stats.totalPuts); // Number of items stored
console.log(stats.totalGets); // Number of items retrieved
console.log(stats.averageSize); // Time-weighted average inventory
console.log(stats.averagePutWaitTime); // Average wait to store
console.log(stats.averageGetWaitTime); // Average wait to retrieve
console.log(stats.averagePutQueueLength); // Average store queue length
console.log(stats.averageGetQueueLength); // Average retrieve queue length
```

**Important Behaviors:**

- **Get blocks** until matching item is available
- **Put blocks** when store is at capacity
- **Multiple filters** can wait simultaneously
- **First match** is returned when multiple items match filter
- **FIFO within matches** - items are searched in order stored

**Complete Example:** See [`examples/warehouse-store/`](../../examples/warehouse-store/) for a full simulation of a distribution warehouse with filtered retrieval.

## Batch

Collect items and process them together: oven loads, shipping containers, database commits.

```typescript
import { Batch } from 'discrete-sim';

const oven = new Batch<Part>(sim, 10, { maxWait: 15 }); // full load, or 15 min after the first part

function* producer(part: Part) {
  yield oven.put(part); // blocks while a finished load is still waiting to be taken
}

function* baker() {
  while (true) {
    const load = oven.take();
    yield load; // resumes when a load is ready
    yield* timeout(30); // cure load.items; load.isPartial tells if maxWait released it
  }
}

oven.stats; // totalBatches, partialBatches, averageBatchSize, averageItemWaitTime, averagePutWaitTime, averageTakeWaitTime
```

Pass `unbounded: true` to accumulate without back-pressure. See [`examples/batch-oven/`](../../examples/batch-oven/).
