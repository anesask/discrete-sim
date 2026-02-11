import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  analyzeExportsForReact,
  warnReactCompatibilityIssues,
  withReactCompatCheck,
} from '../../src/utils/react-compat-checker.js';

describe('ReactCompatChecker', () => {
  describe('analyzeExportsForReact', () => {
    it('should detect default exports', () => {
      const exports = {
        default: function Component() {},
      };

      const analysis = analyzeExportsForReact(exports);

      expect(analysis.hasDefaultExport).toBe(true);
      expect(analysis.namedExports).toHaveLength(0);
    });

    it('should identify React hooks', () => {
      const exports = {
        useSimulation: () => {},
        useStats: () => {},
        notAHook: () => {},
      };

      const analysis = analyzeExportsForReact(exports);

      expect(analysis.hooks).toEqual(['useSimulation', 'useStats']);
      expect(analysis.hooks).not.toContain('notAHook');
    });

    it('should identify React components (PascalCase)', () => {
      const exports = {
        SimulationProvider: () => {},
        StatsDisplay: () => {},
        notAComponent: () => {},
      };

      const analysis = analyzeExportsForReact(exports);

      expect(analysis.components).toEqual([
        'SimulationProvider',
        'StatsDisplay',
      ]);
      expect(analysis.components).not.toContain('notAComponent');
    });

    it('should detect incomplete hook names', () => {
      const exports = {
        use: () => {},
        useSim: () => {},
      };

      const analysis = analyzeExportsForReact(exports);

      expect(analysis.issues).toContain(
        'Hook "use" has an incomplete name which may cause Fast Refresh issues'
      );
      expect(analysis.issues).not.toContain(
        'Hook "useSim" has an incomplete name which may cause Fast Refresh issues'
      );
    });

    it('should warn about mixed default and hook exports', () => {
      const exports = {
        default: () => {},
        useSimulation: () => {},
      };

      const analysis = analyzeExportsForReact(exports);

      expect(analysis.issues).toContain(
        'Mixing default exports with React hooks can cause Fast Refresh issues. ' +
          'Consider using only named exports for hooks.'
      );
    });

    it('should warn about mixed default and component exports', () => {
      const exports = {
        default: () => {},
        SimulationProvider: () => {},
      };

      const analysis = analyzeExportsForReact(exports);

      expect(analysis.issues).toContain(
        'Mixing default exports with named component exports may cause Fast Refresh issues. ' +
          'Consider using either all named exports or a single default export.'
      );
    });

    it('should warn about mixed React and non-React exports', () => {
      const exports = {
        useSimulation: () => {},
        SOME_CONSTANT: 'value',
        helperFunction: () => {},
      };

      const analysis = analyzeExportsForReact(exports);

      expect(analysis.issues).toContain(
        'Mixing React components/hooks with non-React exports can cause Fast Refresh issues. ' +
          'Consider separating React and non-React exports into different files.'
      );
    });

    it('should not warn for clean named exports only', () => {
      const exports = {
        useSimulation: () => {},
        useStats: () => {},
        SimulationProvider: () => {},
      };

      const analysis = analyzeExportsForReact(exports);

      expect(analysis.issues).toHaveLength(0);
    });

    it('should not warn for single default export', () => {
      const exports = {
        default: () => {},
      };

      const analysis = analyzeExportsForReact(exports);

      expect(analysis.issues).toHaveLength(0);
    });

    it('should handle empty exports', () => {
      const exports = {};

      const analysis = analyzeExportsForReact(exports);

      expect(analysis.hasDefaultExport).toBe(false);
      expect(analysis.namedExports).toHaveLength(0);
      expect(analysis.hooks).toHaveLength(0);
      expect(analysis.components).toHaveLength(0);
      expect(analysis.issues).toHaveLength(0);
    });
  });

  describe('warnReactCompatibilityIssues', () => {
    let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
    let originalNodeEnv: string | undefined;

    beforeEach(() => {
      consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      originalNodeEnv = process.env.NODE_ENV;
    });

    afterEach(() => {
      (consoleWarnSpy as { mockRestore: () => void }).mockRestore();
      process.env.NODE_ENV = originalNodeEnv;
    });

    it('should log warnings in development mode', () => {
      process.env.NODE_ENV = 'development';

      const exports = {
        default: () => {},
        useSimulation: () => {},
      };

      warnReactCompatibilityIssues('TestModule', exports);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[discrete-sim] React Fast Refresh warnings for "TestModule":'
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Mixing default exports with React hooks can cause Fast Refresh issues. ' +
          'Consider using only named exports for hooks.'
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'See: https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-react#consistent-components-exports'
      );
    });

    it('should not log warnings in production mode', () => {
      process.env.NODE_ENV = 'production';

      const exports = {
        default: () => {},
        useSimulation: () => {},
      };

      warnReactCompatibilityIssues('TestModule', exports);

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should not log when there are no issues', () => {
      process.env.NODE_ENV = 'development';

      const exports = {
        useSimulation: () => {},
        SimulationProvider: () => {},
      };

      warnReactCompatibilityIssues('TestModule', exports);

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should log multiple issues', () => {
      process.env.NODE_ENV = 'development';

      const exports = {
        default: () => {},
        useSimulation: () => {},
        SimulationProvider: () => {},
        CONSTANT: 'value',
      };

      const analysis = analyzeExportsForReact(exports);
      warnReactCompatibilityIssues('TestModule', exports);

      // Check that warnings were logged
      expect(consoleWarnSpy).toHaveBeenCalled();

      // The actual issues from our analysis
      // We should have 2 issues: mixed default+hooks and mixed default+components
      // (React+non-React warning is only triggered when there's no default export)
      expect(analysis.issues.length).toBe(2);

      // Verify the correct warnings were issued
      expect(analysis.issues).toContain(
        'Mixing default exports with React hooks can cause Fast Refresh issues. ' +
          'Consider using only named exports for hooks.'
      );
      expect(analysis.issues).toContain(
        'Mixing default exports with named component exports may cause Fast Refresh issues. ' +
          'Consider using either all named exports or a single default export.'
      );
    });
  });

  describe('withReactCompatCheck', () => {
    let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
    let originalNodeEnv: string | undefined;

    beforeEach(() => {
      consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      originalNodeEnv = process.env.NODE_ENV;
    });

    afterEach(() => {
      (consoleWarnSpy as { mockRestore: () => void }).mockRestore();
      process.env.NODE_ENV = originalNodeEnv;
    });

    it('should return exports unchanged', () => {
      process.env.NODE_ENV = 'development';

      const exports = {
        useSimulation: () => {},
        SimulationProvider: () => {},
      };

      const wrapped = withReactCompatCheck('TestModule', exports);

      expect(wrapped).toBe(exports);
      expect(wrapped.useSimulation).toBe(exports.useSimulation);
      expect(wrapped.SimulationProvider).toBe(exports.SimulationProvider);
    });

    it('should check compatibility in development', () => {
      process.env.NODE_ENV = 'development';

      const exports = {
        default: () => {},
        useSimulation: () => {},
      };

      withReactCompatCheck('TestModule', exports);

      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it('should not check compatibility in production', () => {
      process.env.NODE_ENV = 'production';

      const exports = {
        default: () => {},
        useSimulation: () => {},
      };

      withReactCompatCheck('TestModule', exports);

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should preserve type information', () => {
      interface MyExports extends Record<string, unknown> {
        useSimulation: () => void;
        SimulationProvider: () => void;
      }

      const exports: MyExports = {
        useSimulation: () => {},
        SimulationProvider: () => {},
      };

      const wrapped = withReactCompatCheck('TestModule', exports);

      // TypeScript should recognize wrapped as MyExports
      void wrapped; // Type check - ensure wrapped maintains MyExports type
      expect(wrapped).toBe(exports);
    });
  });

  describe('Performance', () => {
    it('should analyze large export objects efficiently', () => {
      const exports: Record<string, unknown> = {};

      // Create 1000 exports
      for (let i = 0; i < 1000; i++) {
        if (i % 3 === 0) {
          exports[`useHook${i}`] = () => {};
        } else if (i % 3 === 1) {
          exports[`Component${i}`] = () => {};
        } else {
          exports[`utility${i}`] = () => {};
        }
      }

      const startTime = performance.now();
      const analysis = analyzeExportsForReact(exports);
      const endTime = performance.now();

      // Should complete within 10ms even for 1000 exports
      expect(endTime - startTime).toBeLessThan(10);

      // Verify correctness
      expect(analysis.hooks.length).toBeGreaterThan(300);
      expect(analysis.components.length).toBeGreaterThan(300);
      expect(analysis.namedExports.length).toBe(1000);
    });

    it('should skip analysis in production with zero overhead', () => {
      process.env.NODE_ENV = 'production';

      const exports = {
        default: () => {},
        useSimulation: () => {},
        Component: () => {},
      };

      const startTime = performance.now();

      // Call multiple times to test overhead
      for (let i = 0; i < 1000; i++) {
        warnReactCompatibilityIssues('TestModule', exports);
      }

      const endTime = performance.now();

      // Should have minimal overhead in production (< 10ms for 1000 calls)
      // Relaxed from 1ms to 10ms to account for CI/CD environment variations
      expect(endTime - startTime).toBeLessThan(10);

      process.env.NODE_ENV = undefined;
    });
  });

  describe('Edge Cases', () => {
    it('should handle null and undefined values in exports', () => {
      const exports = {
        nullExport: null,
        undefinedExport: undefined,
        useValidHook: () => {},
      };

      const analysis = analyzeExportsForReact(exports);

      expect(analysis.hooks).toContain('useValidHook');
      expect(analysis.namedExports).toContain('nullExport');
      expect(analysis.namedExports).toContain('undefinedExport');
    });

    it('should handle exports with special characters', () => {
      const exports = {
        use$Special: () => {},
        'Component-With-Dashes': () => {},
        _privateExport: () => {},
      };

      const analysis = analyzeExportsForReact(exports);

      expect(analysis.hooks).toContain('use$Special');
      expect(analysis.components).toContain('Component-With-Dashes');
      expect(analysis.namedExports).toContain('_privateExport');
    });

    it('should handle circular references in exports', () => {
      const exports: Record<string, unknown> = {
        useSimulation: () => {},
      };
      // Create circular reference
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      exports.circular = exports;

      // Should not throw
      expect(() => analyzeExportsForReact(exports)).not.toThrow();

      const analysis = analyzeExportsForReact(exports);
      expect(analysis.hooks).toContain('useSimulation');
    });
  });
});
