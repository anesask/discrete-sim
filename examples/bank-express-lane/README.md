# Bank Express Lane

A bank where express customers (quick transactions) are served before regular customers whenever both are waiting. Shows non-preemptive priority queuing on a single `Resource`.

## What it shows

- One `Resource` for the tellers with `queueDiscipline: 'priority'`.
- Two customer types requesting with different priorities: express `request(0)`, regular `request(10)`. Lower number is served first; a customer already being served is never interrupted (that would need `preemptive: true`, see the hospital examples).
- Wait-time and queue statistics split by customer type, so the cost of the express lane to regular customers is visible.

## The pattern

```typescript
const tellers = new Resource(sim, 2, { queueDiscipline: 'priority' });

function* expressCustomer() {
  yield tellers.request(0);        // jumps ahead of waiting regular customers
  yield* timeout(rng.exponential(2));
  tellers.release();
}

function* regularCustomer() {
  yield tellers.request(10);
  yield* timeout(rng.exponential(6));
  tellers.release();
}
```

## Running

```bash
npx tsx examples/bank-express-lane/index.ts
```

## Things to try

- Give express customers the same priority as regular ones and compare the waits: the express lane only redistributes waiting, it does not create capacity.
- Add a `Schedule` that opens a third teller during the rush.
- Use `Experiment` to sweep the share of express customers and plot regular-customer p95 wait.

## Related

- `examples/bank-tellers`: SLA tracking and a staffing schedule.
- `examples/hospital-er`: FIFO versus priority compared side by side.
