# M/M/1 Queue Example

Classic single-server queue simulation that validates against queuing theory.

## What is M/M/1?

- **M**: Markovian (exponential) arrival process
- **M**: Markovian (exponential) service times
- **1**: Single server

This is one of the most fundamental queuing models in operations research.

## Theoretical Background

For an M/M/1 queue with arrival rate lambda and service rate mu:

- **Utilization**: rho = lambda/mu
- **Average wait time in queue**: E[W] = rho/(mu - lambda)
- **Average queue length**: E[Q] = rho^2/(1 - rho)
- **Average time in system**: E[T] = 1/(mu - lambda)

**Stability condition**: lambda < mu (arrival rate must be less than service rate)

## Running the Example

```bash
# From the examples/mm1-queue directory
npx tsx index.ts

# Or from the project root
npx tsx examples/mm1-queue/index.ts
```

## What It Demonstrates

1. **Exponential Distributions**: Using `Random.exponential()` for realistic inter-arrival and service times
2. **Statistics Collection**: Tracking wait times, queue lengths, and utilization
3. **Validation**: Comparing simulation results to theoretical predictions
4. **Reproducibility**: Using seeded RNG (seed=42) for consistent results

## Expected Output

```
==============================================================
M/M/1 Queue Simulation
==============================================================
Arrival rate (lambda): 0.7 customers/time unit
Service rate (mu): 1.0 customers/time unit
Utilization (rho): 0.700
Number of customers: 10000
Random seed: 42

Running simulation...
Simulation completed in 214ms
Simulated time: 14293.25 time units
Events processed: 20000

==============================================================
Simulation Results vs. Theory
==============================================================

Customers:
  Served: 10000

Server Utilization:
  Theoretical: 0.7000
  Simulated:   0.6975
  Error:       0.0025

Average Wait Time in Queue:
  Theoretical: 2.3333
  Simulated:   2.3861
  Error:       0.0528

Average Queue Length:
  Theoretical: 1.6333
  Simulated:   1.6694
  Error:       0.0361

Average Time in System:
  Theoretical: 3.3333
  Simulated:   3.3861
  Error:       0.0528

==============================================================
Validation
==============================================================
Utilization error:   0.36%
Wait time error:     2.26%
Queue length error:  2.21%

[OK] VALIDATION PASSED: All metrics within 10% of theory
==============================================================
```

## Key Parameters

```typescript
const ARRIVAL_RATE = 0.7;  // lambda = 0.7 customers/time unit
const SERVICE_RATE = 1.0;  // mu = 1.0 customers/time unit
const NUM_CUSTOMERS = 10000;
const RANDOM_SEED = 42;    // For reproducibility
```

You can adjust these parameters to explore different scenarios:
- **Light traffic**: lambda = 0.3, mu = 1.0 -> rho = 0.3 (30% busy)
- **Moderate traffic**: lambda = 0.7, mu = 1.0 -> rho = 0.7 (70% busy, good validation)
- **Heavy traffic**: lambda = 0.9, mu = 1.0 -> rho = 0.9 (90% busy, high variance!)

**Note on High Utilization**: At rho >= 0.9, queues exhibit high variance and require 100,000+ customers for accurate validation. The example uses rho = 0.7 for reliable validation with 10,000 customers.

## Why This Matters

This example proves that the simulation library correctly models:
1. **Exponential processes** (arrivals and service)
2. **Queueing behavior** (FIFO, correct wait times)
3. **Time-weighted statistics** (utilization, queue length)
4. **Discrete-event semantics** (correct event ordering)

If this validates correctly, you can trust the library for more complex simulations!

## Extending This Example

Try modifying the code to explore:
- Multiple servers (M/M/c queue)
- Different arrival/service rates
- Finite queue capacity
- Priority customers
- Time-dependent arrival rates

## References

- Kleinrock, L. (1975). *Queueing Systems, Volume 1: Theory*
- Gross, D., & Harris, C. M. (1998). *Fundamentals of Queueing Theory*
