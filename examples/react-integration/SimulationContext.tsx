import { createContext, useContext, useState, useRef, ReactNode } from 'react';
import { SimulationEngine } from 'discrete-sim';

// Types should be in a separate file for better organization
interface SimulationStats {
  ordersProcessed: number;
  averageFulfillmentTime: number;
  workerUtilization: number;
  forkLiftUtilization: number;
  queueLength: number;
  currentTime: number;
}

interface SimulationContextType {
  simulationRef: React.MutableRefObject<SimulationEngine | null>;
  isRunning: boolean;
  setIsRunning: (value: boolean) => void;
  speed: number;
  setSpeed: (value: number) => void;
  stats: SimulationStats;
  setStats: (stats: SimulationStats) => void;
}

// Private context (not exported to avoid mixing exports)
const SimulationContext = createContext<SimulationContextType | undefined>(undefined);

/**
 * SimulationProvider component
 *
 * @example
 * ```tsx
 * <SimulationProvider>
 *   <App />
 * </SimulationProvider>
 * ```
 */
export function SimulationProvider({ children }: { children: ReactNode }) {
  const simulationRef = useRef<SimulationEngine | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [stats, setStats] = useState<SimulationStats>({
    ordersProcessed: 0,
    averageFulfillmentTime: 0,
    workerUtilization: 0,
    forkLiftUtilization: 0,
    queueLength: 0,
    currentTime: 0,
  });

  const value = {
    simulationRef,
    isRunning,
    setIsRunning,
    speed,
    setSpeed,
    stats,
    setStats,
  };

  return (
    <SimulationContext.Provider value={value}>
      {children}
    </SimulationContext.Provider>
  );
}

/**
 * Hook to access simulation context
 * Must be used within a SimulationProvider
 *
 * @example
 * ```tsx
 * const { isRunning, setIsRunning, stats } = useSimulation();
 * ```
 */
export function useSimulation() {
  const context = useContext(SimulationContext);
  if (!context) {
    throw new Error('useSimulation must be used within a SimulationProvider');
  }
  return context;
}

// Export types separately to avoid mixing with component exports
export type { SimulationStats, SimulationContextType };