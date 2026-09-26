# Architecture, Performance and Design

How the library is put together and what it deliberately does not do.

## Architecture

### Event Queue

Binary min-heap priority queue with O(log n) operations. Events ordered by:

1. Time (ascending)
2. Priority (ascending)
3. ID (deterministic tie-breaking)

### Process Execution

Generator-based with synchronous execution until first yield. Supports:

- `timeout(delay)`: Wait for time to pass
- `resource.request()`: Acquire resource (returns token to yield)
- `waitFor(predicate, options)`: Wait for condition with configurable polling
  - `interval`: Polling interval in simulation time (default: 1)
  - `maxIterations`: Maximum polling attempts before timeout (default: Infinity)
  - Throws `ConditionTimeoutError` when max iterations exceeded

### Resource Management

Token-based API with synchronous callbacks to maintain discrete-event semantics. Avoids Promise microtask queue for deterministic execution.

### Statistics Collection

Time-weighted averaging for continuous metrics:

```
average = sum(value_i * duration_i) / total_time
```

Sample statistics (mean, variance, standard deviation) use Welford's online algorithm for O(1) incremental updates with excellent numerical stability.

## Limitations and Performance

### Scale Considerations

discrete-sim is designed for **small to medium-scale simulations** (up to ~100,000 events). Performance characteristics:

- **10,000 events**: ~100ms (excellent for prototyping and education)
- **100,000 events**: ~1-2s (good for most practical applications)
- **1,000,000+ events**: May become slow (8-15 minutes) due to JavaScript's performance characteristics

These benchmarks are for single simulation runs.
For Monte Carlo analysis with multiple independent runs, consider using Node.js worker threads for parallelization.

### Memory Considerations

- **Event queue**: Each event uses ~100-150 bytes of memory
- **Statistics with sample tracking**: Stores all samples in memory - can grow large for long simulations
- **Timeseries recording**: Unbounded growth - use selectively for critical metrics
- **Practical limit**: ~1-2 million concurrent events before memory pressure on typical systems

### When to Consider Alternatives

Consider **SimPy** (Python) or other tools if you need:

- **Very large-scale simulations** (millions of events with heavy statistics)
- **High-performance computing** requirements
- **Integration with scientific Python** (NumPy, SciPy, Pandas) for complex analysis
- **Parallel simulation** across dozens of CPU cores
- **Academic research** where Python is the established standard

### When discrete-sim is the Right Choice

Use discrete-sim when you need:

- **Web applications** or browser-based simulation dashboards
- **Integration with Node.js/TypeScript** codebases
- **Type safety and excellent IDE support** for development
- **Zero dependencies** and lightweight deployment
- **Serverless environments** (AWS Lambda, Cloudflare Workers)
- **Interactive teaching tools** with immediate feedback
- **Rapid prototyping** with modern JavaScript tooling

### Performance Tips

1. **Disable sample tracking** when not needed - use time-weighted averages instead
2. **Limit timeseries recording** to critical metrics only
3. **Use warm-up periods** to exclude initial transient behavior
4. **Batch independent simulations** using worker threads for Monte Carlo analysis
5. **Profile before optimizing** - use event tracing to identify bottlenecks
6. **Statistics are optimized** - Mean, variance, and standard deviation use Welford's online algorithm (O(1) queries)

## Design Decisions

### Why Generators Instead of Async/Await?

Generators provide synchronous execution within the simulation timeline, while Promises execute in the microtask queue outside our control. This maintains discrete-event semantics and deterministic execution order.

### Why Token-Based Resources?

The `resource.request()` returns a token to yield, not a Promise. This allows synchronous callback execution when resources become available, keeping everything in the simulation timeline.

### Why LCG for Random Numbers?

Linear Congruential Generator is simple, fast, and sufficient for simulation. It's deterministic (critical for reproducibility) and has acceptable statistical properties for most applications.
