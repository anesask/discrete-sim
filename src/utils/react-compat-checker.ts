/**
 * React Fast Refresh Compatibility Checker
 *
 * @deprecated This module is unrelated to discrete-event simulation and will be
 * removed from the public API in v0.3.0. A standalone copy lives in
 * `examples/react-integration/react-compat-checker.ts`; copy it into your own
 * project if you rely on it.
 */

let deprecationWarned = false;

/** NODE_ENV when running under Node or a bundler that defines process; undefined in plain browsers */
function nodeEnv(): string | undefined {
  return typeof process !== 'undefined' ? process.env?.NODE_ENV : undefined;
}

/**
 * Emit the deprecation notice once per process, outside test and production runs.
 */
function warnDeprecatedOnce(): void {
  if (deprecationWarned) return;
  const env = nodeEnv();
  if (env === 'production' || env === 'test') return;
  deprecationWarned = true;
  console.warn(
    '[discrete-sim] analyzeExportsForReact, warnReactCompatibilityIssues and withReactCompatCheck ' +
      'are deprecated and will be removed in v0.3.0. Copy examples/react-integration/react-compat-checker.ts ' +
      'into your project instead.'
  );
}

/**
 * @deprecated Will be removed in v0.3.0. See module notice.
 */
export interface ExportAnalysis {
  hasDefaultExport: boolean;
  namedExports: string[];
  hooks: string[];
  components: string[];
  issues: string[];
}

/**
 * Analyzes module exports for React Fast Refresh compatibility issues
 *
 * @deprecated Will be removed in v0.3.0. See module notice.
 */
export function analyzeExportsForReact(
  exports: Record<string, unknown>
): ExportAnalysis {
  warnDeprecatedOnce();

  const analysis: ExportAnalysis = {
    hasDefaultExport: false,
    namedExports: [],
    hooks: [],
    components: [],
    issues: [],
  };

  // Check for default export
  if ('default' in exports) {
    analysis.hasDefaultExport = true;
  }

  // Analyze named exports
  Object.keys(exports).forEach((exportName) => {
    if (exportName === 'default') return;

    analysis.namedExports.push(exportName);

    // Identify hooks (start with 'use')
    if (exportName.startsWith('use')) {
      analysis.hooks.push(exportName);

      // Check for incomplete hook names
      if (exportName.length <= 4) {
        analysis.issues.push(
          `Hook "${exportName}" has an incomplete name which may cause Fast Refresh issues`
        );
      }
    }

    // Identify components (PascalCase)
    if (/^[A-Z]/.test(exportName)) {
      analysis.components.push(exportName);
    }
  });

  // Check for problematic patterns
  if (analysis.hasDefaultExport && analysis.hooks.length > 0) {
    analysis.issues.push(
      'Mixing default exports with React hooks can cause Fast Refresh issues. ' +
        'Consider using only named exports for hooks.'
    );
  }

  if (analysis.hasDefaultExport && analysis.components.length > 0) {
    analysis.issues.push(
      'Mixing default exports with named component exports may cause Fast Refresh issues. ' +
        'Consider using either all named exports or a single default export.'
    );
  }

  // Check for mixed component and non-component exports
  const hasNonReactExports = analysis.namedExports.some(
    (name) =>
      !analysis.hooks.includes(name) && !analysis.components.includes(name)
  );

  if (
    hasNonReactExports &&
    (analysis.hooks.length > 0 || analysis.components.length > 0)
  ) {
    analysis.issues.push(
      'Mixing React components/hooks with non-React exports can cause Fast Refresh issues. ' +
        'Consider separating React and non-React exports into different files.'
    );
  }

  return analysis;
}

/**
 * Logs warnings for React Fast Refresh compatibility issues
 *
 * @deprecated Will be removed in v0.3.0. See module notice.
 */
export function warnReactCompatibilityIssues(
  moduleName: string,
  exports: Record<string, unknown>
): void {
  warnDeprecatedOnce();

  if (nodeEnv() === 'production') return;

  const analysis = analyzeExportsForReact(exports);

  if (analysis.issues.length > 0) {
    console.warn(
      `[discrete-sim] React Fast Refresh warnings for "${moduleName}":`
    );
    analysis.issues.forEach((issue) => {
      console.warn(`${issue}`);
    });
    console.warn(
      'See: https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-react#consistent-components-exports'
    );
  }
}

/**
 * Higher-order function to wrap React module exports with compatibility checking
 *
 * @deprecated Will be removed in v0.3.0. See module notice.
 */
export function withReactCompatCheck<T extends Record<string, unknown>>(
  moduleName: string,
  exports: T
): T {
  warnDeprecatedOnce();

  if (nodeEnv() !== 'production') {
    warnReactCompatibilityIssues(moduleName, exports);
  }
  return exports;
}
