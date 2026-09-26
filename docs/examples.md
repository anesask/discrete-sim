# Examples

Every example is a runnable script under `examples/`; run one with `npx tsx examples/<name>/index.ts`.

### Replicated M/M/c Experiment

Thirty replications of an M/M/1 queue with a confidence interval next to the theoretical mean wait, then a sweep over the number of servers with common random numbers.

```bash
npx tsx examples/experiment-mm1/index.ts
```

[Full documentation](../examples/experiment-mm1/README.md)

### Bank with Impatient Customers (Reneging)

Customers race a teller request against their patience with `anyOf`; those who give up leave the queue cleanly.

```bash
npx tsx examples/bank-renege/index.ts
```

[Full documentation](../examples/bank-renege/README.md)

### Batch Oven (Batching)

Parts are cured in loads of ten, or whatever has accumulated after 15 minutes; back-pressure holds arrivals while a finished load waits.

```bash
npx tsx examples/batch-oven/index.ts
```

[Full documentation](../examples/batch-oven/README.md)

### Hospital Emergency Room (Priority Queues)

Demonstrates priority queue disciplines in a realistic healthcare triage scenario. Compares FIFO vs Priority queuing to show how critical patients benefit from priority-based treatment.

```bash
npx tsx examples/hospital-er/index.ts
```

**Key Features:**

- Three triage levels (Critical, Urgent, Routine)
- Comparison of FIFO vs Priority queue disciplines
- Statistical analysis showing 70-85% reduction in critical patient wait times
- Real-world demonstration of queue discipline trade-offs

[Full documentation](../examples/hospital-er/README.md)

### M/M/1 Queue (Validation)

Classic single-server queue with theoretical validation. Demonstrates exponential distributions and statistics collection.

```bash
npx tsx examples/mm1-queue/index.ts
```

**Key Features:**

- Validates simulation against queuing theory
- Shows 99%+ accuracy for queue metrics
- Demonstrates reproducible results with seeded RNG

[Full documentation](../examples/mm1-queue/README.md)

### Warehouse Simulation

Multi-stage process with multiple resource types (docks, forklifts, inspectors).

```bash
npx tsx examples/warehouse/index.ts
```

**Key Features:**

- Multiple resource types with different capacities
- Bottleneck identification and analysis
- Multi-stage workflow modeling

[Full documentation](../examples/warehouse/README.md)

### Restaurant Simulation

Customer service with variable group sizes and satisfaction metrics.

```bash
npx tsx examples/restaurant/index.ts
```

**Key Features:**

- Variable-size customer groups (1-6 people)
- Service phases (order, eat, pay)
- Customer satisfaction assessment

[Full documentation](../examples/restaurant/README.md)

### Bank Tellers

SLA tracking and staffing optimization with different transaction types.

```bash
npx tsx examples/bank-tellers/index.ts
```

**Key Features:**

- Service Level Agreement (SLA) tracking
- Quick vs. complex transaction differentiation
- Automated staffing recommendations

[Full documentation](../examples/bank-tellers/README.md)

### Bank Express Lane (Priority Queue)

Express customers are served before regular ones whenever both wait, on a single `Resource` with a priority queue. Shows what an express lane costs the other customers.

```bash
npx tsx examples/bank-express-lane/index.ts
```

[Full documentation](../examples/bank-express-lane/README.md)

### Emergency Department with Preemption

Critical patients take the doctor away from lower-priority treatments in progress; the interrupted process handles `PreemptionError` and resumes later.

```bash
npx tsx examples/hospital-emergency/index.ts
```

[Full documentation](../examples/hospital-emergency/README.md)

### Traffic Light (SimEvent)

Cars wait for a green light broadcast with `SimEvent`; the controller cycles the light with `trigger()` and `reset()`.

```bash
npx tsx examples/traffic-light/index.ts
```

[Full documentation](../examples/traffic-light/README.md)

### Fuel Station (Buffer)

Trucks draw fuel from a tank modelled as a `Buffer`; tanker deliveries refill it. Shows blocking get and put on a continuous quantity.

```bash
npx tsx examples/fuel-station/index.ts
```

[Full documentation](../examples/fuel-station/README.md)

### Warehouse Store (Store with Filters)

Pallets are stored and retrieved by destination with filtered `Store.get()`; deliveries use a priority put queue when the warehouse is full.

```bash
npx tsx examples/warehouse-store/index.ts
```

[Full documentation](../examples/warehouse-store/README.md)
