/**
 * Validation utilities for discrete-event simulation.
 * Provides clear, actionable error messages for common validation scenarios.
 * All validation functions throw ValidationError with helpful context when validation fails.
 *
 * @example
 * ```typescript
 * import { validateNonNegative, ValidationError } from 'discrete-sim';
 *
 * try {
 *   validateNonNegative(-5, 'delay');
 * } catch (error) {
 *   if (error instanceof ValidationError) {
 *     console.log(error.message); // "delay must be non-negative (got -5)"
 *     console.log(error.context); // { delay: -5 }
 *   }
 * }
 * ```
 */

/**
 * Validation error class with context information.
 * Extends Error with an optional context object for debugging.
 *
 * @example
 * ```typescript
 * throw new ValidationError(
 *   'Value must be positive',
 *   { value: -1, paramName: 'delay' }
 * );
 * ```
 */
export class ValidationError extends Error {
  constructor(message: string, public readonly context?: Record<string, unknown>) {
    super(message);
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Validate that a number is non-negative (>= 0).
 * Throws ValidationError if the value is negative.
 *
 * @param value - The value to validate
 * @param paramName - Name of the parameter (for error message)
 * @param context - Additional context for error message (optional)
 *
 * @throws {ValidationError} If value < 0
 *
 * @example
 * ```typescript
 * validateNonNegative(5, 'delay'); // OK
 * validateNonNegative(-1, 'delay'); // Throws ValidationError
 * validateNonNegative(-1, 'delay', 'Use timeout(0) for immediate'); // Custom context
 * ```
 */
export function validateNonNegative(
  value: number,
  paramName: string,
  context?: string
): void {
  if (value < 0) {
    const msg = context
      ? `${paramName} must be non-negative (got ${value}). ${context}`
      : `${paramName} must be non-negative (got ${value})`;
    throw new ValidationError(msg, { [paramName]: value });
  }
}

/**
 * Validate that a number is positive (> 0).
 * Throws ValidationError if the value is zero or negative.
 *
 * @param value - The value to validate
 * @param paramName - Name of the parameter (for error message)
 * @param context - Additional context for error message (optional)
 *
 * @throws {ValidationError} If value <= 0
 *
 * @example
 * ```typescript
 * validatePositive(5, 'mean'); // OK
 * validatePositive(0, 'mean'); // Throws ValidationError
 * validatePositive(-1, 'mean'); // Throws ValidationError
 * ```
 */
export function validatePositive(
  value: number,
  paramName: string,
  context?: string
): void {
  if (value <= 0) {
    const msg = context
      ? `${paramName} must be positive (got ${value}). ${context}`
      : `${paramName} must be positive (got ${value})`;
    throw new ValidationError(msg, { [paramName]: value });
  }
}

/**
 * Validate that a number is at least a minimum value.
 * Throws ValidationError if value is less than the minimum.
 *
 * @param value - The value to validate
 * @param minimum - The minimum allowed value (inclusive)
 * @param paramName - Name of the parameter (for error message)
 * @param context - Additional context for error message (optional)
 *
 * @throws {ValidationError} If value < minimum
 *
 * @example
 * ```typescript
 * validateMinimum(5, 1, 'capacity'); // OK
 * validateMinimum(0, 1, 'capacity'); // Throws ValidationError
 * ```
 */
export function validateMinimum(
  value: number,
  minimum: number,
  paramName: string,
  context?: string
): void {
  if (value < minimum) {
    const msg = context
      ? `${paramName} must be at least ${minimum} (got ${value}). ${context}`
      : `${paramName} must be at least ${minimum} (got ${value})`;
    throw new ValidationError(msg, { [paramName]: value, minimum });
  }
}

/**
 * Validate that a number is finite (not NaN or Infinity).
 * Throws ValidationError if the value is NaN, Infinity, or -Infinity.
 *
 * @param value - The value to validate
 * @param paramName - Name of the parameter (for error message)
 * @param context - Additional context for error message (optional)
 *
 * @throws {ValidationError} If value is NaN, Infinity, or -Infinity
 *
 * @example
 * ```typescript
 * validateFinite(5, 'delay'); // OK
 * validateFinite(NaN, 'delay'); // Throws ValidationError
 * validateFinite(Infinity, 'delay'); // Throws ValidationError
 * ```
 */
export function validateFinite(
  value: number,
  paramName: string,
  context?: string
): void {
  if (!Number.isFinite(value)) {
    const msg = context
      ? `${paramName} must be a finite number (got ${value}). ${context}`
      : `${paramName} must be a finite number (got ${value})`;
    throw new ValidationError(msg, { [paramName]: value });
  }
}

/**
 * Validate that a value is an integer (whole number).
 * Throws ValidationError if the value has a fractional part.
 *
 * @param value - The value to validate
 * @param paramName - Name of the parameter (for error message)
 * @param context - Additional context for error message (optional)
 *
 * @throws {ValidationError} If value is not an integer
 *
 * @example
 * ```typescript
 * validateInteger(5, 'capacity'); // OK
 * validateInteger(5.5, 'capacity'); // Throws ValidationError
 * ```
 */
export function validateInteger(
  value: number,
  paramName: string,
  context?: string
): void {
  if (!Number.isInteger(value)) {
    const msg = context
      ? `${paramName} must be an integer (got ${value}). ${context}`
      : `${paramName} must be an integer (got ${value})`;
    throw new ValidationError(msg, { [paramName]: value });
  }
}

/**
 * Validate resource capacity (must be a positive integer).
 * Combines finite, integer, and minimum validations.
 *
 * @param capacity - The capacity value to validate
 * @param resourceName - Optional resource name for better error messages
 *
 * @throws {ValidationError} If capacity is not a finite positive integer >= 1
 *
 * @example
 * ```typescript
 * validateCapacity(5); // OK
 * validateCapacity(5, 'Server'); // OK with resource name
 * validateCapacity(0, 'Server'); // Throws: "Resource 'Server' must have at least 1 unit"
 * validateCapacity(5.5); // Throws: capacity must be a whole number
 * ```
 */
export function validateCapacity(capacity: number, resourceName?: string): void {
  const name = resourceName ? `Resource '${resourceName}'` : 'Resource';

  validateFinite(capacity, 'capacity', `${name} capacity must be a valid number`);
  validateInteger(capacity, 'capacity', `${name} capacity must be a whole number`);
  validateMinimum(
    capacity,
    1,
    'capacity',
    `${name} must have at least 1 unit of capacity`
  );
}

/**
 * Validate simulation time value.
 * Ensures time is finite and non-negative (or positive if allowZero is false).
 *
 * @param time - The time value to validate
 * @param paramName - Name of the parameter (default: 'time')
 * @param allowZero - Whether zero is allowed (default: true)
 *
 * @throws {ValidationError} If time is not finite, negative, or zero (when not allowed)
 *
 * @example
 * ```typescript
 * validateTime(10); // OK
 * validateTime(0); // OK (allowZero defaults to true)
 * validateTime(0, 'delay', false); // Throws: delay must be greater than zero
 * validateTime(NaN); // Throws: time must be a valid number
 * ```
 */
export function validateTime(
  time: number,
  paramName: string = 'time',
  allowZero: boolean = true
): void {
  validateFinite(time, paramName, 'Simulation time must be a valid number');

  if (allowZero) {
    validateNonNegative(
      time,
      paramName,
      'Simulation time cannot be negative'
    );
  } else {
    validatePositive(
      time,
      paramName,
      'Simulation time must be greater than zero'
    );
  }
}

/**
 * Validate that min is less than max.
 * Used for range validations (uniform random, etc).
 *
 * @param min - The minimum value
 * @param max - The maximum value
 * @param context - Additional context for error message (optional)
 *
 * @throws {ValidationError} If min >= max
 *
 * @example
 * ```typescript
 * validateRange(0, 10); // OK
 * validateRange(10, 10); // Throws: min must be less than max
 * validateRange(10, 5); // Throws: min must be less than max
 * ```
 */
export function validateRange(
  min: number,
  max: number,
  context?: string
): void {
  if (min >= max) {
    const msg = context
      ? `min must be less than max (got min=${min}, max=${max}). ${context}`
      : `min must be less than max (got min=${min}, max=${max})`;
    throw new ValidationError(msg, { min, max });
  }
}

/**
 * Validate that an array is not empty.
 * Used for choice operations and similar array-based functions.
 *
 * @param array - The array to validate
 * @param paramName - Name of the parameter (for error message)
 * @param context - Additional context for error message (optional)
 *
 * @throws {ValidationError} If array.length === 0
 *
 * @example
 * ```typescript
 * validateNonEmptyArray([1, 2, 3], 'items'); // OK
 * validateNonEmptyArray([], 'items'); // Throws: items cannot be empty
 * ```
 */
export function validateNonEmptyArray<T>(
  array: T[],
  paramName: string,
  context?: string
): void {
  if (array.length === 0) {
    const msg = context
      ? `${paramName} cannot be empty. ${context}`
      : `${paramName} cannot be empty`;
    throw new ValidationError(msg);
  }
}

/**
 * Validate resource release operation.
 * Ensures that a resource has units in use before releasing.
 *
 * @param releaseAmount - Number of units being released (currently always 1)
 * @param inUse - Number of units currently in use
 * @param resourceName - Name of the resource (for error message)
 *
 * @throws {ValidationError} If no units are in use or releasing more than in use
 *
 * @example
 * ```typescript
 * validateRelease(1, 2, 'Server'); // OK
 * validateRelease(1, 0, 'Server'); // Throws: no units currently in use
 * validateRelease(3, 2, 'Server'); // Throws: cannot release 3 units, only 2 in use
 * ```
 */
export function validateRelease(
  releaseAmount: number,
  inUse: number,
  resourceName: string
): void {
  if (inUse === 0) {
    throw new ValidationError(
      `Cannot release resource '${resourceName}': no units currently in use. Did you forget to request it first?`,
      { resourceName }
    );
  }

  if (releaseAmount > inUse) {
    throw new ValidationError(
      `Cannot release ${releaseAmount} units from resource '${resourceName}': only ${inUse} units in use`,
      { releaseAmount, inUse, resourceName }
    );
  }
}

/**
 * Validate that a process is in an allowed state for an operation.
 * Used to prevent invalid state transitions.
 *
 * @param currentState - The current process state
 * @param allowedStates - Array of states that are valid for the operation
 * @param operation - Name of the operation being performed (for error message)
 *
 * @throws {ValidationError} If currentState is not in allowedStates
 *
 * @example
 * ```typescript
 * validateProcessState('pending', ['pending'], 'start'); // OK
 * validateProcessState('running', ['pending'], 'start'); // Throws: Cannot start in 'running' state
 * validateProcessState('running', ['running'], 'interrupt'); // OK
 * ```
 */
export function validateProcessState(
  currentState: string,
  allowedStates: string[],
  operation: string
): void {
  if (!allowedStates.includes(currentState)) {
    throw new ValidationError(
      `Cannot ${operation} process in state '${currentState}'. Process must be in one of: ${allowedStates.join(', ')}`,
      { currentState, allowedStates, operation }
    );
  }
}

/**
 * Validate that a value yielded from a process generator is valid.
 * Ensures only Timeout, ResourceRequest, or Condition are yielded.
 *
 * @param value - The yielded value to validate
 *
 * @throws {ValidationError} If value is not a valid yield type
 *
 * @example
 * ```typescript
 * // These are validated automatically by Process.step()
 * validateYieldedValue(new Timeout(5)); // OK
 * validateYieldedValue(resource.request()); // OK
 * validateYieldedValue(new Condition(() => true)); // OK
 * validateYieldedValue('invalid'); // Throws: Invalid yield value
 * ```
 */
export function validateYieldedValue(value: unknown): void {
  const validTypes = ['Timeout', 'ResourceRequest', 'Condition'];
  const typeName = value?.constructor?.name;

  if (!typeName || !validTypes.includes(typeName)) {
    throw new ValidationError(
      `Invalid yield value in process generator. Expected one of: ${validTypes.join(', ')}. Got: ${typeName || typeof value}. ` +
      `Did you forget to use yield* for timeout() or forget to call resource.request()?`,
      { receivedType: typeName || typeof value, validTypes }
    );
  }
}
