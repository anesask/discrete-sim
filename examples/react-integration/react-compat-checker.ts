/**
 * React Fast Refresh Compatibility Checker (standalone copy)
 *
 * This used to ship inside the discrete-sim package. It has nothing to do with
 * discrete-event simulation, so it now lives here as an example utility. Copy
 * this file into your React project if you want the checks.
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
 */
export function analyzeExportsForReact(
  exports: Record<string, unknown>
): ExportAnalysis {
  const analysis: ExportAnalysis = {
    hasDefaultExport: false,
    namedExports: [],
    hooks: [],
    components: [],
    issues: [],
  };

  if ('default' in exports) {
    analysis.hasDefaultExport = true;
  }

  Object.keys(exports).forEach((exportName) => {
    if (exportName === 'default') return;

    analysis.namedExports.push(exportName);

    if (exportName.startsWith('use')) {
      analysis.hooks.push(exportName);
      if (exportName.length <= 4) {
        analysis.issues.push(
          `Hook "${exportName}" has an incomplete name which may cause Fast Refresh issues`
        );
      }
    }

    if (/^[A-Z]/.test(exportName)) {
      analysis.components.push(exportName);
    }
  });

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
 * Logs warnings for React Fast Refresh compatibility issues (development only)
 */
export function warnReactCompatibilityIssues(
  moduleName: string,
  exports: Record<string, unknown>
): void {
  if (process.env.NODE_ENV === 'production') return;

  const analysis = analyzeExportsForReact(exports);

  if (analysis.issues.length > 0) {
    console.warn(`React Fast Refresh warnings for "${moduleName}":`);
    analysis.issues.forEach((issue) => console.warn(issue));
    console.warn(
      'See: https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-react#consistent-components-exports'
    );
  }
}

/**
 * Wrap a module's exports to get compatibility warnings in development
 */
export function withReactCompatCheck<T extends Record<string, unknown>>(
  moduleName: string,
  exports: T
): T {
  if (process.env.NODE_ENV !== 'production') {
    warnReactCompatibilityIssues(moduleName, exports);
  }
  return exports;
}
