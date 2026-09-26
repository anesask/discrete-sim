# Traffic Light Intersection

Cars arrive at an intersection and wait for the green light. The light is a `SimEvent`: one `trigger()` releases every waiting car at once. Shows broadcast-style coordination between processes.

## What it shows

- `SimEvent` as a signal many processes wait on: `yield greenLight.wait()`.
- A controller process that cycles the light: `trigger()` on green, `reset()` on red so the next cycle can be awaited again.
- Cars that arrive while the light is green pass without waiting, because `wait()` returns immediately on an already-triggered event.
- Wait-time statistics for cars, and how many were released per green phase.

## The pattern

```typescript
const greenLight = new SimEvent(sim, 'green');

function* controller() {
  while (true) {
    yield* timeout(RED_SECONDS);
    greenLight.trigger();            // every waiting car proceeds
    yield* timeout(GREEN_SECONDS);
    greenLight.reset();              // red again: new arrivals wait
  }
}

function* car(id: number) {
  const arrived = sim.now;
  yield greenLight.wait();           // immediate if already green
  stats.recordSample('wait', sim.now - arrived);
}
```

## Running

```bash
npx tsx examples/traffic-light/index.ts
```

## Things to try

- Add a second direction with its own event and make the controller alternate them.
- Give cars a patience limit with `anyOf([greenLight.wait(), timeout(patience)])` and count the ones that turn around.
- Drive the phase lengths from a `Schedule` (longer greens in rush hour).

## Related

- `docs/guide/schedules.md`: SimEvent and Schedule reference.
- `examples/bank-renege`: races between a request and a timeout.
