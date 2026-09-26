# Schedules and Events

Time-varying parameters with `Schedule`, and process coordination with `SimEvent`.

## Schedules and Time-Varying Capacity

Real systems have rush hours and shifts. A `Schedule` holds a piecewise-constant value over simulation time, optionally repeating every `period`:

```typescript
import { Schedule } from 'discrete-sim';

const arrivalRate = new Schedule<number>(sim, {
  period: 24, // repeats daily
  segments: [
    { from: 0, to: 8, value: 0.5 },
    { from: 8, to: 12, value: 5 }, // morning rush
    { from: 12, to: 13, value: 2 },
    { from: 13, to: 17, value: 4 },
    { from: 17, to: 24, value: 0.5 },
  ],
});

function* arrivals() {
  while (true) {
    yield* timeout(rng.exponential(1 / arrivalRate.current));
    sim.process(customer);
  }
}

// Staffing follows a shift plan; capacity changes while the simulation runs
const staffing = new Schedule<number>(sim, {
  period: 24,
  segments: [
    { from: 0, to: 9, value: 1 },
    { from: 9, to: 17, value: 4 },
    { from: 17, to: 24, value: 2 },
  ],
});
staffing.onChange((n) => tellers.setCapacity(n), { immediate: true });

// Or react to boundaries inside your own process
const next = yield * staffing.waitForChange(); // resumes at the next boundary
```

`resource.setCapacity(n)` grants waiting requests immediately when capacity grows. When it shrinks, nobody is interrupted: surplus units are shed as they are released, and queued requests wait until usage is back under the new capacity. Segments may hold objects to bundle several parameters. Non-periodic schedules keep their last value; gaps return `defaultValue` or throw.

## SimEvent: signalling between processes

`SimEvent` lets processes wait for a signal and be released together.

```typescript
import { SimEvent } from 'discrete-sim';

const gateOpen = new SimEvent(sim, 'gate-open');

function* car() {
  yield gateOpen.wait();          // blocks until trigger()
  console.log(`car passes at ${sim.now}, signal value: ${String(gateOpen.value)}`);
}

function* controller() {
  yield* timeout(10);
  gateOpen.trigger({ lane: 2 });  // resumes every waiter, passes a value
  gateOpen.reset();               // reuse for the next cycle
}
```

- `wait()` returns immediately if the event is already triggered.
- `isTriggered`, `value` and `waitingCount` expose the state.
- Interrupting a waiting process removes it from the waiter list.
- Combine with `anyOf` for "signal or timeout" patterns (see Processes).
