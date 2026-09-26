# React Integration Guide for discrete-sim

## Driving the Simulation from the UI

Never call `sim.run()` in a click handler: it blocks the page until the whole simulation is done. Use the non-blocking drivers (v0.1.18+):

```tsx
import { useEffect, useRef, useState } from 'react';
import { Simulation, RealtimeHandle } from 'discrete-sim';

export function SimulationControls({ sim }: { sim: Simulation }) {
  const handle = useRef<RealtimeHandle | null>(null);
  const [now, setNow] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const onProgress = (info: unknown) => setNow((info as { now: number }).now);
    sim.on('progress', onProgress);
    return () => sim.off('progress', onProgress);
  }, [sim]);

  const play = () => {
    handle.current = sim.runRealtime({ factor: 0.05 }); // 50 ms per simulation unit
  };
  const togglePause = () => {
    const h = handle.current;
    if (!h) return;
    h.isPaused ? h.resume() : h.pause();
    setPaused(h.isPaused);
  };

  return (
    <div>
      <span>t = {now.toFixed(1)}</span>
      <button onClick={play}>Play</button>
      <button onClick={togglePause}>{paused ? 'Resume' : 'Pause'}</button>
      <input type="range" min="0.001" max="1" step="0.001" onChange={(e) => handle.current?.setFactor(Number(e.target.value))} />
      <button onClick={() => handle.current?.stop()}>Stop</button>
    </div>
  );
}
```

For a fast run whose result you only need at the end, `await sim.runAsync({ batchSize: 1000 })` keeps the page responsive and emits `progress` after every batch for a progress bar.

## Fast Refresh Compatibility

When integrating discrete-sim with React applications, follow these guidelines to ensure compatibility with React Fast Refresh (Hot Module Replacement).

### Best Practices

#### 1. Use Named Exports for Hooks and Components

```tsx
// GOOD - Named exports only
export function SimulationProvider({ children }) { ... }
export function useSimulation() { ... }
```

```tsx
// BAD - Mixed default and named exports
export default function useSimulation() { ... }
export { SimulationProvider }
```

#### 2. Separate React and Non-React Exports

```tsx
// GOOD - SimulationContext.tsx (React only)
export function SimulationProvider({ children }) { ... }
export function useSimulation() { ... }

// GOOD - constants.ts (Non-React)
export const DEFAULT_SPEED = 1;
export const MAX_WORKERS = 10;
```

```tsx
// BAD - Mixed exports in one file
export function useSimulation() { ... }
export const DEFAULT_SPEED = 1; // Non-React export
```

#### 3. Properly Name Your Hooks

```tsx
// GOOD - Complete, descriptive hook names
export function useSimulation() { ... }
export function useSimulationStats() { ... }

// BAD - Incomplete or unclear names
export function useSim() { ... }  // Too short
export function use() { ... }     // Incomplete
```

### Using the Compatibility Checker

A small compatibility checker lives next to this document as
[`react-compat-checker.ts`](./react-compat-checker.ts). Copy it into your project
to get development-time warnings. (The copy exported from the `discrete-sim`
package is deprecated and will be removed in v0.3.0.)

```tsx
import { withReactCompatCheck } from './react-compat-checker';

// Wrap your exports to get warnings in development
export default withReactCompatCheck('SimulationContext', {
  SimulationProvider,
  useSimulation,
});
```

### Checklist for React Integration

- [ ] All React hooks start with "use" and have descriptive names
- [ ] Components and hooks use named exports only
- [ ] React and non-React exports are in separate files
- [ ] No anonymous function exports
- [ ] Context providers are properly typed
- [ ] Error boundaries are in place for simulation components

### Common Issues and Solutions

#### Issue: "Could not Fast Refresh"
**Cause**: Mixed export patterns or incomplete hook names
**Solution**: Use only named exports for React components and hooks

#### Issue: "HMR invalidate"
**Cause**: Non-React exports mixed with React components
**Solution**: Move constants and utilities to separate files

#### Issue: Components not updating on save
**Cause**: Anonymous or improperly exported components
**Solution**: Give all components proper names and use named exports

### Example Project Structure

```
src/
├── components/
│   ├── SimulationControl.tsx    # React components only
│   └── StatsDisplay.tsx
├── hooks/
│   ├── useSimulation.ts         # React hooks only
│   └── useSimulationStats.ts
├── context/
│   └── SimulationContext.tsx    # React context only
├── utils/
│   ├── constants.ts              # Non-React utilities
│   └── helpers.ts
└── types/
    └── simulation.types.ts       # TypeScript types
```

### Vite Configuration

If using Vite, ensure your configuration supports Fast Refresh:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react({
      fastRefresh: true,
      // Include discrete-sim in Fast Refresh
      include: ['**/*.tsx', '**/*.ts'],
    }),
  ],
});
```

### Additional Resources

- [React Fast Refresh Documentation](https://github.com/facebook/react/issues/16604)
- [Vite Plugin React - Consistent Component Exports](https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-react#consistent-components-exports)
- [discrete-sim Examples](https://github.com/your-org/discrete-sim/tree/main/examples)

## Need Help?

If you encounter Fast Refresh issues:

1. Check the browser console for specific error messages
2. Run the compatibility checker on your exports
3. Verify your exports follow the patterns above
4. Open an issue with a minimal reproduction