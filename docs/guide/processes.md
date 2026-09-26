# Processes

Processes are generator functions. `yield` hands control back to the scheduler until the thing you yielded is done.

## Writing Processes

Processes are described using generator functions. Use `yield` to wait for events.

```typescript
function* myProcess() {
  yield* timeout(5); // Wait 5 time units
  yield resource.request(); // Wait for resource
  yield* timeout(10); // Use resource for 10 units
  resource.release(); // Release resource

  // Wait for condition with custom polling
  yield* waitFor(() => someValue > 10, {
    interval: 5, // Check every 5 time units
    maxIterations: 100, // Timeout after 100 checks
  });
}

// Create and start a process
sim.process(myProcess);

// Or keep a reference for later control
const proc = sim.process(myProcess);
proc.interrupt(); // Can interrupt if needed
```

## Process Composition

Wait for another process, race several waits, or wait for all of them.

```typescript
import { anyOf, allOf, timeout } from 'discrete-sim';

// Join: wait for a child process to finish
function* dispatcher() {
  const truck = sim.process(loadTruck);
  const done = truck.done();
  yield done; // resumes when loadTruck ends
  console.log(done.result?.state); // 'completed' | 'interrupted'
}

// Race: request with a patience limit (reneging)
function* impatientCustomer() {
  const request = teller.request();
  const result = yield* anyOf([request, timeout(10)]);
  if (result.winner === request) {
    yield* timeout(5); // served
    teller.release();
  } else {
    stats.increment('reneged'); // gave up; the request left the queue automatically
  }
}

// Barrier: wait for everything
function* assembly() {
  yield* allOf([partA.done(), partB.done(), crane.request()]);
  // both parts are finished and the crane is ours
}
```

Branches can be resource, buffer and store requests, `event.wait()`, `process.done()` and `timeout(n)`. When an `anyOf` settles, every branch that has not completed is cancelled: queued requests leave their queues, timeouts are unscheduled, event waiters are removed. If several branches complete at the same instant they are all listed in `result.completed`, and any resource they acquired is yours to release. `waitFor()` conditions are polled and cannot be combined; use a `SimEvent` instead.

Interrupting a process cancels whatever it is waiting on, including all pending branches of a composite wait.

See [`examples/bank-renege/`](../../examples/bank-renege/) for a complete reneging model.
