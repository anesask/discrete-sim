# Simulation Engine

The `Simulation` owns the virtual clock and the event queue. Time advances from event to event, never in real time, unless you ask for it.

## Seeding

`new Simulation({ randomSeed: 42 })` seeds the built-in generator `sim.random`. Take named streams from it (`sim.random.stream('arrivals')`) for independent sources of randomness. `sim.seed` is always defined, so a run can report the seed that produced it. See [Random Numbers](random.md).

## Simulation Time

The simulation maintains a virtual clock that advances from event to event (not real-time).

```typescript
const sim = new Simulation();
console.log(sim.now); // 0

sim.schedule(10, () => console.log(`Time: ${sim.now}`));
sim.run(); // Outputs: "Time: 10"
```

**Event Cancellation:**

You can cancel scheduled events before they execute:

```typescript
const eventId = sim.schedule(100, () => console.log('This will be cancelled'));
sim.cancel(eventId); // Returns true if cancelled, false if not found

// Useful for timeout patterns
const timeoutId = sim.schedule(30, () => console.log('Timeout!'));
// ... do some work ...
sim.cancel(timeoutId); // Cancel if work completes early
```

## Async and Real-Time Execution

`sim.run()` blocks until the simulation is done. For browser pages, dashboards and teaching tools use the non-blocking variants:

```typescript
// Non-blocking: process events in batches, yield to the event loop in between
sim.on('progress', ({ now, eventsProcessed, eventsInQueue }) => render(now));
const result = await sim.runAsync({ until: 10_000, batchSize: 500 });

// Paced to wall-clock time: 0.1 s of real time per simulation unit
const handle = sim.runRealtime({ factor: 0.1, until: 1000 });
pauseButton.onclick = () =>
  handle.isPaused ? handle.resume() : handle.pause();
speedSlider.oninput = (e) => handle.setFactor(Number(e.target.value));
stopButton.onclick = () => handle.stop();
await handle.done; // resolves with the same SimulationResult as run()
```

`runAsync` gives exactly the same result as `run()` for the same model and seed; it only changes when the host gets control back. `runRealtime` executes each event when its simulation time is due; events that are overdue after a speed change run as fast as possible until the clock catches up. Only one run can be in flight per simulation.

## Debugging and Event Tracing

Enable detailed event tracing for debugging and analysis:

```typescript
import { Simulation } from 'discrete-sim';

const sim = new Simulation();

// Enable event tracing
sim.enableEventTrace();

sim.schedule(10, () => console.log('Event 1'), 5);
sim.schedule(20, () => console.log('Event 2'), 3);
sim.schedule(10, () => console.log('Event 3'), 0);

sim.run();

// Get execution trace
const trace = sim.getEventTrace();

trace.forEach((entry) => {
  console.log(`Event ${entry.id}:`);
  console.log(`  Time: ${entry.time}`);
  console.log(`  Priority: ${entry.priority}`);
  console.log(`  Executed at: ${entry.executedAt}`);
});

// Clear trace for next run
sim.clearEventTrace();

// Disable tracing when done
sim.disableEventTrace();
```

Event tracing is useful for:

- Understanding event execution order
- Debugging priority scheduling issues
- Performance analysis
- Verifying simulation correctness
