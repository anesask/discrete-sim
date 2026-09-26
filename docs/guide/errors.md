# Errors and Validation

Every public method validates its inputs and throws a `ValidationError` with a message that says what to do instead.

The library provides comprehensive input validation with helpful error messages to catch common mistakes early:

```typescript
import { ValidationError } from 'discrete-sim';

// Example: Negative capacity
try {
  const resource = new Resource(sim, -1);
} catch (error) {
  console.error(error.message);
  // "capacity must be at least 1 (got -1). Resource must have at least 1 unit of capacity"
}

// Example: Invalid timeout
try {
  yield * timeout(-5);
} catch (error) {
  console.error(error.message);
  // "delay must be non-negative (got -5). Use timeout(0) for immediate continuation..."
}

// Example: Releasing unrequested resource
try {
  resource.release();
} catch (error) {
  console.error(error.message);
  // "Cannot release resource 'Server': no units currently in use. Did you forget to request it first?"
}
```

**ValidationError** includes context information for debugging:

```typescript
try {
  sim.schedule(-10, () => {});
} catch (error) {
  if (error instanceof ValidationError) {
    console.log(error.context); // { delay: -10 }
  }
}
```

**Common Validations:**

- Delays must be non-negative and finite (no NaN/Infinity)
- Resource capacity must be a positive integer
- Cannot release resources that aren't in use
- Process state transitions must be valid (can't start a running process)
- Generator functions must yield proper types (Timeout, ResourceRequest, Condition)
- Random seeds must be finite integers within safe range (0 to 2^32-1)
