# Contributing to discrete-sim

Thank you for your interest in contributing to discrete-sim! This document provides guidelines and instructions for contributing to the project.

## Table of Contents
- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Testing Guidelines](#testing-guidelines)
- [Submitting Changes](#submitting-changes)
- [Architecture Guidelines](#architecture-guidelines)

## Code of Conduct

This project adheres to a standard code of conduct:
- Be respectful and inclusive
- Focus on constructive feedback
- Prioritize the project's goals and user experience
- Maintain professional communication

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- Git
- TypeScript knowledge
- Understanding of discrete-event simulation concepts (helpful but not required)

### Initial Setup

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/yourusername/discrete-sim.git
   cd discrete-sim
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Run tests to verify setup**
   ```bash
   npm test
   ```

4. **Build the project**
   ```bash
   npm run build
   ```

### Development Commands

```bash
# Run tests in watch mode
npm test

# Run tests once
npm test -- --run

# Run tests with coverage
npm run test:coverage

# Build for production
npm run build

# Lint code
npm run lint

# Format code
npm run format
```

## Development Workflow

### 1. Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/bug-description
```

Branch naming conventions:
- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation updates
- `refactor/` - Code refactoring
- `test/` - Test additions or modifications
- `perf/` - Performance improvements

### 2. Make Changes

- Write clean, readable code
- Follow TypeScript strict mode requirements
- Add tests for new functionality
- Update documentation as needed
- Keep commits focused and atomic

### 3. Commit Guidelines

We follow conventional commit messages:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, semicolons, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `perf`: Performance improvements
- `chore`: Build process or tooling changes

**Example:**
```bash
git commit -m "feat(resource): add priority queuing support

Implements priority-based resource queuing to allow processes
with higher priority to jump the queue.

Closes #42"
```

### 4. Keep Your Branch Updated

```bash
git fetch origin
git rebase origin/main
```

### 5. Push and Create Pull Request

```bash
git push origin feature/your-feature-name
```

Then create a pull request on GitHub with a clear description of your changes.

## Coding Standards

### Code Style Rules

These rules ensure consistency across the codebase:

1. **No Emojis**
   - NEVER use emojis or non-ASCII characters in source code, examples, or documentation
   - Use ASCII equivalents instead
   ```typescript
   // Bad
   console.log('✓ Test passed');
   console.log('λ = 1/μ');

   // Good
   console.log('[PASS] Test passed');
   console.log('lambda = 1/mu');
   ```

2. **JSDoc Comments Required**
   - All public APIs must have comprehensive JSDoc comments
   - Include `@param`, `@returns`, `@throws`, and `@example` tags
   ```typescript
   /**
    * Schedule an event to occur after a delay.
    *
    * @param delay - Time delay from now (must be >= 0)
    * @param callback - Function to execute when event occurs
    * @param priority - Priority for breaking ties (default: 0)
    * @returns The unique ID of the scheduled event
    *
    * @throws {ValidationError} If delay is negative
    *
    * @example
    * ```typescript
    * const id = sim.schedule(10, () => console.log('Event!'));
    * ```
    */
   schedule(delay: number, callback: () => void, priority = 0): string {
     // ...
   }
   ```

3. **Consistent Error Messages**
   - All validation errors should use ValidationError class
   - Include helpful context and suggestions
   - Follow pattern: "what's wrong (got X). suggestion"
   ```typescript
   // Good
   throw new ValidationError(
     'delay must be non-negative (got -5). Use timeout(0) for immediate continuation',
     { delay: -5 }
   );

   // Bad
   throw new Error('Invalid delay');
   ```

4. **Export All Public Types**
   - All user-facing types, classes, and interfaces must be exported from index.ts
   - Internal types should NOT be exported
   ```typescript
   // index.ts - Good
   export { Simulation, SimulationOptions, SimulationResult } from './core/Simulation.js';
   export { Resource, ResourceOptions } from './resources/Resource.js';

   // Internal type - Good (not exported)
   type ProcessState = 'pending' | 'running' | 'completed';
   ```

### TypeScript Guidelines

1. **Use TypeScript strict mode** - Already configured
   ```typescript
   // Good: Explicit types
   function processEvent(event: Event): void {
     // ...
   }

   // Bad: Implicit any
   function processEvent(event) {
     // ...
   }
   ```

2. **Prefer interfaces for public APIs**
   ```typescript
   // Good
   export interface SimulationOptions {
     initialTime?: number;
   }

   // Avoid for public APIs (use for internal types)
   type SimulationOptions = {
     initialTime?: number;
   };
   ```

3. **Use readonly where appropriate**
   ```typescript
   class Event {
     constructor(
       public readonly time: number,
       public readonly callback: () => void
     ) {}
   }
   ```

4. **Avoid `any` - use `unknown` if type is truly unknown**
   ```typescript
   // Bad
   function process(data: any) { }

   // Good
   function process(data: unknown) {
     if (typeof data === 'string') {
       // ...
     }
   }
   ```

### Code Style

- **Formatting:** Run `npm run format` before committing
- **Linting:** Run `npm run lint` and fix all issues
- **Line Length:** Maximum 100 characters (Prettier configured)
- **Indentation:** 2 spaces (configured in .editorconfig)
- **Quotes:** Single quotes for strings (Prettier)
- **Semicolons:** Required (Prettier)

### Naming Conventions

- **Classes:** PascalCase (`Simulation`, `Resource`, `EventQueue`)
- **Interfaces:** PascalCase (`ResourceOptions`, `Event`)
- **Functions/Methods:** camelCase (`schedule`, `request`, `release`)
- **Constants:** UPPER_SNAKE_CASE (`DEFAULT_CAPACITY`)
- **Private members:** Prefix with `_` if needed (`_acquire`, `_queue`)
- **Type parameters:** Single uppercase letter or PascalCase (`T`, `TEvent`)

### Documentation

1. **JSDoc Structure**
   - Description: Clear one-sentence summary
   - Detailed explanation (if needed): Additional context
   - `@param`: Document all parameters with type and description
   - `@returns`: Document return value
   - `@throws`: Document all error cases
   - `@example`: Provide at least one usage example
   - Complexity notes: O(n) complexity for algorithms

   ```typescript
   /**
    * Binary heap-based priority queue for efficient event scheduling.
    * Events are ordered by time, then priority, then insertion order.
    * Provides O(log n) insertion and removal operations.
    *
    * @example
    * ```typescript
    * const queue = new EventQueue();
    * const id = queue.push({ time: 10, priority: 0, callback: () => {} });
    * const next = queue.peek(); // O(1)
    * const event = queue.pop(); // O(log n)
    * ```
    */
   export class EventQueue {
     /**
      * Add an event to the queue.
      * The event is inserted maintaining heap property.
      *
      * @param event - The event to add (time, priority, callback)
      * @returns The unique ID assigned to the event
      *
      * @example
      * ```typescript
      * const id = queue.push({
      *   time: 10,
      *   priority: 0,
      *   callback: () => console.log('Hello')
      * });
      * ```
      */
     push(event: Omit<Event, 'id'>): string {
       // ...
     }
   }
   ```

2. **Inline Comments**
   - Use for complex logic that isn't obvious
   - Explain the "why", not the "what"
   - Keep comments concise and relevant
   ```typescript
   // Good: Explains why
   // Update statistics BEFORE changing state to capture accurate time-weighted averages
   this.updateStatistics();
   this.inUseCount++;

   // Bad: States the obvious
   // Increment inUseCount
   this.inUseCount++;
   ```

3. **ASCII-Only Documentation**
   - Use plain ASCII in all documentation
   - Replace special characters with descriptive text
   ```typescript
   // Bad
   // λ = 1/μ (arrival rate)

   // Good
   // lambda = 1/mu (arrival rate)
   ```

## Testing Guidelines

### Test Structure

We use Vitest with the following structure:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';

describe('ComponentName', () => {
  beforeEach(() => {
    // Setup
  });

  describe('feature group', () => {
    it('should do something specific', () => {
      // Arrange
      const sim = new Simulation();

      // Act
      sim.schedule(10, () => {});

      // Assert
      expect(sim.now).toBe(0);
    });
  });
});
```

### Test Requirements

1. **Coverage:** Maintain 80%+ overall, 95%+ for core modules
2. **Test types needed:**
   - Unit tests for all public methods
   - Integration tests for component interactions
   - Edge case testing (boundary conditions, errors)
   - Performance tests for critical paths

3. **Test naming:** Use descriptive names
   ```typescript
   // Good
   it('should throw error when requesting negative capacity resource', () => {})

   // Bad
   it('test resource', () => {})
   ```

4. **Assertions:** Use specific matchers
   ```typescript
   // Good
   expect(value).toBe(5);
   expect(array).toEqual([1, 2, 3]);
   expect(stats.utilizationRate).toBeCloseTo(0.75, 2);

   // Avoid
   expect(value == 5).toBe(true);
   ```

### Running Tests

```bash
# Watch mode (recommended during development)
npm test

# Single run
npm test -- --run

# Coverage report
npm run test:coverage

# Specific test file
npm test -- tests/unit/Resource.test.ts
```

## Submitting Changes

### Pull Request Process

1. **Ensure all tests pass**
   ```bash
   npm test -- --run
   npm run build
   npm run lint
   ```

2. **Update documentation**
   - Add/update JSDoc comments
   - Update README.md if needed
   - Add examples for new features

3. **Create detailed PR description**
   - What changes were made
   - Why the changes were necessary
   - How to test the changes
   - Any breaking changes
   - Related issues

4. **PR Template:**
   ```markdown
   ## Description
   Brief description of changes

   ## Type of Change
   - [ ] Bug fix
   - [ ] New feature
   - [ ] Breaking change
   - [ ] Documentation update

   ## Testing
   - [ ] All existing tests pass
   - [ ] Added tests for new functionality
   - [ ] Manual testing performed

   ## Checklist
   - [ ] Code follows project style guidelines
   - [ ] Self-review completed
   - [ ] Documentation updated
   - [ ] No console warnings/errors

   ## Related Issues
   Closes #XX
   ```

5. **Respond to review feedback**
   - Address all comments
   - Push updates to the same branch
   - Mark resolved conversations

## Architecture Guidelines

### Discrete-Event Simulation Principles

1. **Synchronous Execution**
   - Processes execute synchronously until they yield
   - No Promises in simulation timeline (use callbacks)
   - Events scheduled through `simulation.schedule()`

2. **Time Management**
   - Simulation time only advances via event processing
   - Never use `setTimeout` or `setInterval`
   - All delays go through `timeout()` helper

3. **Resource Semantics**
   - Use token-based API (not Promises)
   - Callbacks execute immediately when resources available
   - FIFO queuing by default

### Adding New Components

When adding major new components:

1. **Create feature branch**
2. **Write tests first** (TDD approach encouraged)
3. **Implement incrementally**
4. **Document thoroughly**
5. **Add integration tests**
6. **Update IMPLEMENTATION_LOG.md**

### File Organization

```
src/
├── core/           # Core simulation engine
├── resources/      # Resource management
├── statistics/     # Statistics (future)
├── random/         # Random number generation (future)
└── index.ts        # Public API exports

tests/
├── unit/           # Unit tests (one file per source file)
├── integration/    # Integration tests
└── performance/    # Performance benchmarks (future)
```

### Breaking Changes

Breaking changes require:
- Major version bump
- Migration guide in PR description
- Deprecation warnings where possible
- Update to CHANGELOG.md

## Questions?

- Open an issue for bugs or feature requests
- Use discussions for questions
- Check existing issues before creating new ones

## License

By contributing, you agree that your contributions will be licensed under the same license as the project (see LICENSE file).
