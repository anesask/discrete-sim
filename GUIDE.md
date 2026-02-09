# Beginner's Guide to Discrete-Event Simulation

## What is Discrete-Event Simulation?

**Simulation** lets you test ideas in a virtual environment before committing resources in the real world. Like a flight simulator for pilots, discrete-event simulation (DES) helps you understand and optimize complex systems.

**Discrete** means time jumps from event to event, rather than flowing continuously. Instead of tracking every millisecond, we only care about moments when something changes in the system.

**Example:** In a coffee shop simulation:
- Customer arrives (event)
- Service begins (event)
- Customer leaves (event)
- Barista waiting idle (not tracked - nothing changes)

## When to Use Simulation

**Use simulation when:**
- Systems involve randomness (arrival times, service durations)
- Resources are shared and limited (servers, machines, staff)
- Mathematical formulas are too complex or don't exist
- You need to test "what if" scenarios without real-world risk
- You want to understand system behavior over time
- You need to optimize resource allocation or scheduling

**Avoid simulation when:**
- Simple formulas work (e.g., average = sum / count)
- The system is deterministic with no randomness
- You only need rough estimates
- Real-world testing is faster and cheaper

## Types of Simulation

Different simulation techniques exist for different problems:

### Discrete-Event Simulation (This Library)
**Best for:** Systems where state changes happen at specific points in time.

**Examples:**
- Customer service queues (banks, call centers, airports)
- Manufacturing and assembly lines
- Hospital emergency rooms
- Network packet routing
- Supply chain and logistics
- Restaurant operations

**Characteristics:**
- Time jumps between events
- Focus on queuing and resource contention
- Good for capacity planning and bottleneck analysis

### Continuous Simulation
**Best for:** Systems with continuously changing variables.

**Examples:**
- Chemical processes and reactions
- Weather and climate modeling
- Fluid dynamics
- Population growth models
- Economic systems

**Characteristics:**
- Time flows continuously
- Uses differential equations
- Tracks smooth changes over time

### Agent-Based Simulation
**Best for:** Systems with many independent entities making decisions.

**Examples:**
- Traffic patterns and urban planning
- Epidemic spread (COVID-19, flu)
- Market behavior and economics
- Social networks and crowd behavior
- Ecosystem modeling

**Characteristics:**
- Individual agents follow simple rules
- Complex behavior emerges from interactions
- Bottom-up modeling approach

### Monte Carlo Simulation
**Best for:** Understanding probability and risk.

**Examples:**
- Financial risk analysis
- Project cost estimation
- Reliability testing
- Portfolio optimization
- Physics simulations

**Characteristics:**
- Repeated random sampling
- Produces probability distributions
- Focuses on uncertainty and variability

**When to choose Discrete-Event Simulation:**
If your problem involves entities moving through stages, waiting for resources, or processing through queues, discrete-event simulation is the right choice.

## Core Concepts

### 1. Simulation Time
A virtual clock that jumps between events. Not real-world time.

```typescript
sim.now  // Current simulation time (e.g., 145.3 time units)
```

### 2. Events
Things that happen at specific times. The simulation processes events in chronological order.

```typescript
sim.schedule(10, () => console.log('Event at time 10'));
```

### 3. Processes
Entities that move through the system (customers, products, packets). Defined using generator functions.

```typescript
function* customer() {
  yield* timeout(5);           // Wait or travel
  yield resource.request();    // Request resource
  yield* timeout(3);           // Use resource
  resource.release();          // Release resource
}
```

### 4. Resources
Limited-capacity shared entities (servers, machines, staff). Processes must request and release them.

```typescript
const server = new Resource(sim, 2);  // 2 servers available
```

## Your First Simulation

A simple coffee shop with one barista:

```typescript
import { Simulation, Resource, timeout } from 'discrete-sim';

const sim = new Simulation();
const barista = new Resource(sim, 1);  // 1 barista

function* customer(id: number) {
  console.log(`Customer ${id} arrives at ${sim.now}`);

  yield barista.request();  // Wait for barista to be available
  console.log(`Customer ${id} orders at ${sim.now}`);

  yield* timeout(5);  // Service takes 5 minutes
  barista.release();

  console.log(`Customer ${id} leaves at ${sim.now}`);
}

// Create 3 customers arriving at different times
sim.process(() => customer(1));
sim.schedule(2, () => sim.process(() => customer(2)));
sim.schedule(3, () => sim.process(() => customer(3)));

sim.run();
```

**Output:**
```
Customer 1 arrives at 0
Customer 1 orders at 0
Customer 2 arrives at 2
Customer 3 arrives at 3
Customer 1 leaves at 5
Customer 2 orders at 5
Customer 2 leaves at 10
Customer 3 orders at 10
Customer 3 leaves at 15
```

**What happened:**
- Customer 1 arrives first and gets served immediately (time 0-5)
- Customers 2 and 3 arrive while Customer 1 is being served
- They wait in queue until the barista is free
- They get served in order of arrival

## Common Patterns

### Pattern 1: Continuous Arrivals
Generate entities at random intervals.

```typescript
function* arrivalGenerator() {
  let id = 1;
  while (true) {
    sim.process(() => customer(id++));
    yield* timeout(random.exponential(1/6));  // Average 6 minutes between arrivals
  }
}
```

### Pattern 2: Waiting for Conditions
Poll a condition until it becomes true.

```typescript
yield* waitFor(() => someValue > 10, {
  interval: 5,        // Check every 5 time units
  maxIterations: 100  // Timeout after 100 checks
});
```

### Pattern 3: Priority Queues
Higher-priority requests served first (lower number = higher priority).

```typescript
yield resource.request(0);  // Priority 0 (highest)
```

## Collecting Statistics

Track metrics during simulation to analyze system performance:

```typescript
const stats = new Statistics(sim);

// Time-weighted average (how a value changes over time)
stats.record('queue-length', barista.queueLength);

// Sample tracking (individual measurements)
stats.enableSampleTracking('wait-time');
stats.recordSample('wait-time', waitTime);

// After simulation, analyze results
console.log(stats.getTimeWeightedAverage('queue-length'));
console.log(stats.getPercentile('wait-time', 0.95));  // 95th percentile
console.log(stats.getVariance('wait-time'));
```

## Common Mistakes

### 1. Not Using yield*
Generator functions require `yield*` when calling other generators.

```typescript
// Wrong
yield timeout(5);

// Correct
yield* timeout(5);
```

### 2. Forgetting to Release Resources
Always release resources, even when errors occur.

```typescript
// Wrong - resource leaked if error occurs
yield resource.request();
// ... if error happens, resource never released

// Correct - use try/finally
try {
  yield resource.request();
  yield* timeout(5);
} finally {
  resource.release();
}
```

### 3. Infinite Loops Without Yields
Loops must yield control back to the simulator.

```typescript
// Wrong - freezes simulation
while (true) {
  // No yield - infinite loop blocks everything
}

// Correct - yield to advance time
while (true) {
  yield* timeout(1);
  // Process continues after delay
}
```

## Understanding Randomness

Real systems have variability. Use probability distributions to model it:

```typescript
const random = new Random(sim, 12345);  // Seed for reproducibility

// Uniform: equal probability (e.g., random delay between 5-10)
yield* timeout(random.uniform(5, 10));

// Exponential: arrival times in queueing systems
yield* timeout(random.exponential(1/6));  // Average 6 minutes

// Normal: natural variation (e.g., human task times)
yield* timeout(random.normal(10, 2));  // Mean 10, std dev 2

// Triangular: estimates with min/max/most-likely
yield* timeout(random.triangular(5, 15, 8));
```

## Next Steps

1. **Run examples**: Check the `/examples` folder for real-world scenarios
2. **Read API docs**: See README.md for complete API reference
3. **Experiment**: Modify examples to test your own ideas
4. **Ask for help**: Open an issue on GitHub if you get stuck

## Quick Reference

### Key Classes
- `Simulation`: Main simulation engine
- `Resource`: Limited-capacity shared resource
- `Statistics`: Collect and analyze metrics
- `Random`: Reproducible random number generation

### Process Helpers
- `timeout(delay)`: Wait for time to pass
- `waitFor(predicate, options)`: Wait for condition
- `resource.request(priority?)`: Acquire resource
- `resource.release()`: Release resource

### Common Random Distributions
- `random.uniform(min, max)`: Equal probability
- `random.exponential(lambda)`: Arrival/service times
- `random.normal(mean, stdDev)`: Natural variation
- `random.triangular(min, max, mode)`: Estimates with uncertainty

## Learning Resources

- **SimPy**: Python DES library with similar concepts
- **Queueing Theory**: Mathematical foundation for service systems
- **Operations Research**: Broader field of optimization and decision-making

---

**Key Principle:** Simulation is about asking "what if?" questions safely. Start simple, validate with known results, then gradually add complexity.
