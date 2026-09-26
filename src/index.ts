// Core simulation engine
export {
  Simulation,
  SimulationOptions,
  SimulationResult,
  TraceOptions,
  RunAsyncOptions,
  RealtimeOptions,
  RealtimeHandle,
  ProgressInfo,
} from './core/Simulation.js';
export { EventQueue, Event } from './core/EventQueue.js';

// Time-varying parameters
export {
  Schedule,
  ScheduleSegment,
  ScheduleOptions,
  OnChangeOptions,
} from './core/Schedule.js';

// Event coordination
export { SimEvent, SimEventRequest } from './core/SimEvent.js';

// Queue disciplines
export {
  QueueDiscipline,
  QueueDisciplineConfig,
} from './types/queue-discipline.js';

// Process-based modeling
export {
  Process,
  ProcessGenerator,
  Timeout,
  Condition,
  WaitForOptions,
  PreemptionError,
  ConditionTimeoutError,
  ProcessDoneRequest,
  ProcessDoneResult,
  AnyOfRequest,
  AnyOfResult,
  AllOfRequest,
  Waitable,
  WaitableInput,
  timeout,
  waitFor,
  anyOf,
  allOf,
} from './core/Process.js';

// Resource management
export {
  Resource,
  ResourceOptions,
  ResourceStatistics,
  ResourceRequest,
} from './resources/Resource.js';

export {
  Buffer,
  BufferOptions,
  BufferStatistics,
  BufferPutRequest,
  BufferGetRequest,
} from './resources/Buffer.js';

export {
  Store,
  StoreOptions,
  StoreStatistics,
  StorePutRequest,
  StoreGetRequest,
} from './resources/Store.js';

export {
  Batch,
  BatchOptions,
  BatchStatistics,
  BatchPutRequest,
  BatchTakeRequest,
} from './resources/Batch.js';

// Statistics collection
export {
  Statistics,
  TimePoint,
  HistogramBin,
  ConfidenceInterval,
  SampleTrackingOptions,
  BatchMeansResult,
  BatchMeansOptions,
  SummaryStatistics,
} from './statistics/Statistics.js';

// Experiments: replications and parameter sweeps
export {
  Experiment,
  ReplicationResult,
  SweepResult,
  deriveSeed,
} from './experiment/Experiment.js';
export type {
  ModelFn,
  ReplicationOptions,
  MetricSummary,
  ComparisonRow,
  ParameterSpace,
} from './experiment/Experiment.js';

// Random number generation
export { Random, WeightedValue, EmpiricalOptions } from './random/Random.js';

// Validation utilities
export { ValidationError } from './utils/validation.js';

// React compatibility utilities
export {
  analyzeExportsForReact,
  warnReactCompatibilityIssues,
  withReactCompatCheck,
} from './utils/react-compat-checker.js';
export type { ExportAnalysis } from './utils/react-compat-checker.js';
