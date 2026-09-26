# Resources

A `Resource` is a shared, limited-capacity entity: servers, machines, staff. Requests queue when it is busy.

Resources represent shared, limited-capacity entities (servers, machines, staff).

```typescript
const server = new Resource(sim, capacity: 2, { name: 'Server' });

function* worker() {
  yield server.request();  // Acquire resource
  yield* timeout(10);      // Do work
  server.release();        // Release resource
}
```

Resources automatically track:

- Utilization rate
- Average wait time
- Average queue length

**Queue Disciplines (v0.1.8+):**

Resources support three queue disciplines to control how waiting requests are served:

```typescript
// FIFO (First In First Out) - default
const fifoServer = new Resource(sim, 1, {
  queueDiscipline: 'fifo', // Serve in arrival order
});

// LIFO (Last In First Out) - stack behavior
const lifoServer = new Resource(sim, 1, {
  queueDiscipline: 'lifo', // Serve most recent arrival first
});

// Priority Queue - serve by priority value (lower = higher priority)
const priorityServer = new Resource(sim, 1, {
  queueDiscipline: 'priority', // Serve by priority
});

function* customer(priority: number) {
  yield priorityServer.request(priority); // 1 = highest, 10 = lowest
  yield* timeout(5);
  priorityServer.release();
}

// Critical patient (priority 1) served before routine (priority 10)
sim.process(() => customer(10)); // Routine - low priority
sim.process(() => customer(1)); // Critical - high priority, goes first
```

**Priority Tie-Breakers:**

For priority queues, configure how requests with the same priority are ordered:

```typescript
const server = new Resource(sim, 1, {
  queueDiscipline: {
    type: 'priority',
    tieBreaker: 'fifo', // Same priority? Use FIFO (default)
  },
});

// Or use LIFO for same-priority requests
const server = new Resource(sim, 1, {
  queueDiscipline: {
    type: 'priority',
    tieBreaker: 'lifo', // Same priority? Use LIFO
  },
});
```

**Real-World Example:**

See the [Hospital ER example](../../examples/hospital-er/) for a complete demonstration of priority queuing in healthcare triage scenarios.

**Preemptive Resources:**

Preemptive resources allow higher-priority processes to interrupt lower-priority ones:

```typescript
import { Resource, PreemptionError } from 'discrete-sim';

const server = new Resource(sim, 1, {
  name: 'Server',
  preemptive: true, // Enable preemption
});

function* lowPriorityJob() {
  try {
    yield server.request(10); // Low priority
    yield* timeout(100); // Long job
    server.release();
  } catch (err) {
    if (err instanceof PreemptionError) {
      console.log('Job was preempted by higher priority request');
      // Handle preemption - cleanup, retry, etc.
    }
  }
}

function* highPriorityJob() {
  yield server.request(0); // High priority - will preempt low priority
  yield* timeout(5);
  server.release();
}

// Low priority starts first but gets interrupted
const p1 = new Process(sim, lowPriorityJob);
const p2 = new Process(sim, highPriorityJob);
p1.start();
sim.schedule(10, () => p2.start()); // High priority arrives later

sim.run();
```

When preemption occurs:

- The preempted process throws a `PreemptionError`
- The process can catch this error to handle cleanup
- Statistics track the total number of preemptions
