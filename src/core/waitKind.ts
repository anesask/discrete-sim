/**
 * Numeric discriminant carried by every value a process can yield. The
 * scheduler switches on it instead of walking a chain of instanceof checks,
 * which was the single largest cost on the hot path.
 *
 * @internal
 */
export const WaitKind = {
  Timeout: 1,
  Condition: 2,
  Resource: 3,
  BufferPut: 4,
  BufferGet: 5,
  StorePut: 6,
  StoreGet: 7,
  BatchPut: 8,
  BatchTake: 9,
  State: 10,
  SimEvent: 11,
  ProcessDone: 12,
  AnyOf: 13,
  AllOf: 14,
} as const;

export type WaitKind = (typeof WaitKind)[keyof typeof WaitKind];
