// Core simulation engine
export {
  Simulation,
  SimulationOptions,
  SimulationResult,
  TraceOptions,
} from './core/Simulation.js';
export { EventQueue, Event } from './core/EventQueue.js';

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
  timeout,
  waitFor,
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

// Statistics collection
export {
  Statistics,
  TimePoint,
  HistogramBin,
} from './statistics/Statistics.js';

// Random number generation
export { Random } from './random/Random.js';

// Validation utilities
export { ValidationError } from './utils/validation.js';

// React compatibility utilities
export {
  analyzeExportsForReact,
  warnReactCompatibilityIssues,
  withReactCompatCheck,
} from './utils/react-compat-checker.js';
export type { ExportAnalysis } from './utils/react-compat-checker.js';
