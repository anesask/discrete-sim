import { describe, it, expect, beforeEach } from 'vitest';
import { Simulation } from '../../src/core/Simulation';
import {
  Process,
  timeout,
  waitFor,
  Timeout,
  ConditionTimeoutError,
} from '../../src/core/Process';
import { Resource } from '../../src/resources/Resource';

describe('Process', () => {
  let sim: Simulation;

  beforeEach(() => {
    sim = new Simulation();
  });

  describe('initialization and lifecycle', () => {
    it('should create process in pending state', () => {
      function* processGen() {
        yield* timeout(10);
      }

      const process = new Process(sim, processGen);

      expect(process.isRunning).toBe(false);
      expect(process.isCompleted).toBe(false);
      expect(process.isInterrupted).toBe(false);
    });

    it('should transition to running when started', () => {
      function* processGen() {
        yield* timeout(10);
      }

      const process = new Process(sim, processGen);
      process.start();

      expect(process.isRunning).toBe(true);
      expect(process.isCompleted).toBe(false);
    });

    it('should transition to completed when done', () => {
      function* processGen() {
        yield* timeout(10);
      }

      const process = new Process(sim, processGen);
      process.start();
      sim.run();

      expect(process.isRunning).toBe(false);
      expect(process.isCompleted).toBe(true);
    });

    it('should throw error when starting twice', () => {
      function* processGen() {
        yield* timeout(10);
      }

      const process = new Process(sim, processGen);
      process.start();

      expect(() => {
        process.start();
      }).toThrow("Cannot start process in state 'running'");
    });

    it('should throw error when starting completed process', () => {
      function* processGen() {
        yield* timeout(10);
      }

      const process = new Process(sim, processGen);
      process.start();
      sim.run();

      expect(() => {
        process.start();
      }).toThrow("Cannot start process in state 'completed'");
    });
  });

  describe('timeout functionality', () => {
    it('should wait for specified timeout', () => {
      const events: string[] = [];

      function* processGen() {
        events.push('start');
        yield* timeout(10);
        events.push('after-timeout');
      }

      const process = new Process(sim, processGen);
      process.start();

      expect(events).toEqual(['start']);
      expect(sim.now).toBe(0);

      sim.run();

      expect(events).toEqual(['start', 'after-timeout']);
      expect(sim.now).toBe(10);
    });

    it('should handle multiple timeouts', () => {
      const times: number[] = [];

      function* processGen() {
        times.push(sim.now);
        yield* timeout(5);
        times.push(sim.now);
        yield* timeout(10);
        times.push(sim.now);
        yield* timeout(3);
        times.push(sim.now);
      }

      const process = new Process(sim, processGen);
      process.start();
      sim.run();

      expect(times).toEqual([0, 5, 15, 18]);
    });

    it('should handle zero timeout', () => {
      const events: string[] = [];

      function* processGen() {
        events.push('before');
        yield* timeout(0);
        events.push('after');
      }

      const process = new Process(sim, processGen);
      process.start();
      sim.run();

      expect(events).toEqual(['before', 'after']);
    });

    it('should throw error for negative timeout', () => {
      expect(() => {
        new Timeout(-1);
      }).toThrow('delay must be non-negative');
    });
  });

  describe('resource integration', () => {
    it('should yield resource requests', () => {
      const resource = new Resource(sim, 1);
      const events: string[] = [];

      function* processGen() {
        events.push('before-request');
        yield resource.request();
        events.push('after-request');
        resource.release();
        events.push('after-release');
      }

      const process = new Process(sim, processGen);
      process.start();
      sim.run();

      expect(events).toEqual([
        'before-request',
        'after-request',
        'after-release',
      ]);
    });

    it('should wait for resource availability', () => {
      const resource = new Resource(sim, 1);
      const events: string[] = [];

      function* process1() {
        events.push('p1-request');
        yield resource.request();
        events.push('p1-acquired');
        yield* timeout(10);
        resource.release();
        events.push('p1-released');
      }

      function* process2() {
        events.push('p2-request');
        yield resource.request();
        events.push('p2-acquired');
        resource.release();
        events.push('p2-released');
      }

      const p1 = new Process(sim, process1);
      const p2 = new Process(sim, process2);

      p1.start();
      p2.start();
      sim.run();

      // With asynchronous callbacks, p1-released occurs before p2-acquired
      expect(events).toEqual([
        'p1-request',
        'p1-acquired',
        'p2-request',
        'p1-released',
        'p2-acquired',
        'p2-released',
      ]);
    });
  });

  describe('process interruption', () => {
    it('should interrupt running process', () => {
      const events: string[] = [];

      function* processGen() {
        events.push('start');
        yield* timeout(10);
        events.push('after-timeout');
      }

      const process = new Process(sim, processGen);
      process.start();

      sim.schedule(5, () => {
        events.push('interrupt');
        process.interrupt();
      });

      sim.run();

      expect(events).toEqual(['start', 'interrupt']);
      expect(process.isInterrupted).toBe(true);
      expect(process.isRunning).toBe(false);
    });

    it('should throw error when interrupting non-running process', () => {
      function* processGen() {
        yield* timeout(10);
      }

      const process = new Process(sim, processGen);

      expect(() => {
        process.interrupt();
      }).toThrow("Cannot interrupt process in state 'pending'");
    });

    it('should allow process to handle interruption', () => {
      const events: string[] = [];

      function* processGen() {
        try {
          events.push('start');
          yield* timeout(10);
          events.push('normal-completion');
        } catch (error) {
          events.push('caught-interrupt');
        }
      }

      const process = new Process(sim, processGen);
      process.start();

      sim.schedule(5, () => {
        process.interrupt(new Error('Test interrupt'));
      });

      sim.run();

      expect(events).toEqual(['start', 'caught-interrupt']);
    });

    it('should pass interrupt reason to process', () => {
      let caughtError: Error | null = null;

      function* processGen() {
        try {
          yield* timeout(10);
        } catch (error) {
          caughtError = error as Error;
        }
      }

      const process = new Process(sim, processGen);
      process.start();

      const interruptError = new Error('Custom interrupt reason');
      sim.schedule(5, () => {
        process.interrupt(interruptError);
      });

      sim.run();

      expect(caughtError).toBe(interruptError);
      expect(caughtError!.message).toBe('Custom interrupt reason');
    });
  });

  describe('waitFor condition', () => {
    it('should wait until condition becomes true', () => {
      let counter = 0;
      const events: string[] = [];

      function* processGen() {
        events.push('start');
        yield* waitFor(() => counter >= 5);
        events.push('condition-met');
      }

      const process = new Process(sim, processGen);
      process.start();

      // Increment counter every time unit
      for (let i = 0; i < 10; i++) {
        sim.schedule(i, () => {
          counter++;
        });
      }

      sim.run();

      expect(events).toEqual(['start', 'condition-met']);
      expect(counter).toBeGreaterThanOrEqual(5);
    });

    it('should check condition immediately if already true', () => {
      const events: string[] = [];

      function* processGen() {
        events.push('start');
        yield* waitFor(() => true);
        events.push('condition-met');
      }

      const process = new Process(sim, processGen);
      process.start();
      sim.run();

      expect(events).toEqual(['start', 'condition-met']);
    });

    it('should use custom polling interval', () => {
      let counter = 0;
      const checkTimes: number[] = [];

      function* processGen() {
        yield* waitFor(
          () => {
            checkTimes.push(sim.now);
            return counter >= 5;
          },
          { interval: 5 }
        );
      }

      const process = new Process(sim, processGen);
      process.start();

      // Increment counter every time unit
      for (let i = 0; i < 30; i++) {
        sim.schedule(i, () => {
          counter++;
        });
      }

      sim.run();

      expect(process.isCompleted).toBe(true);
      // Should check at: 0, 5, 10, 15, 20, 25 (meets at 5)
      expect(checkTimes).toEqual([0, 5]);
    });

    it('should throw ConditionTimeoutError when maxIterations exceeded', () => {
      const events: string[] = [];
      let errorCaught = false;

      function* processGen() {
        events.push('start');
        try {
          yield* waitFor(() => false, { maxIterations: 5 });
          events.push('condition-met');
        } catch (error) {
          events.push('error-caught');
          if (error instanceof ConditionTimeoutError) {
            errorCaught = true;
            expect(error.iterations).toBe(5);
            expect(error.message).toContain('exceeded 5 iterations');
          }
        }
        events.push('end');
      }

      const process = new Process(sim, processGen);
      process.start();
      sim.run();

      expect(events).toEqual(['start', 'error-caught', 'end']);
      expect(errorCaught).toBe(true);
      expect(process.isCompleted).toBe(true);
    });

    it('should work with custom interval and maxIterations', () => {
      const counter = 0;
      const checkTimes: number[] = [];
      let errorCaught = false;

      function* processGen() {
        try {
          yield* waitFor(
            () => {
              checkTimes.push(sim.now);
              return counter >= 100; // Never true
            },
            { interval: 10, maxIterations: 3 }
          );
        } catch (error) {
          if (error instanceof ConditionTimeoutError) {
            errorCaught = true;
            expect(error.iterations).toBe(3);
          }
        }
      }

      const process = new Process(sim, processGen);
      process.start();
      sim.run();

      expect(errorCaught).toBe(true);
      // Should check at: 0, 10, 20, 30 (timeout after 30)
      expect(checkTimes).toEqual([0, 10, 20, 30]);
      expect(sim.now).toBe(30);
    });

    it('should handle maxIterations of 0', () => {
      let errorCaught = false;

      function* processGen() {
        try {
          yield* waitFor(() => false, { maxIterations: 0 });
        } catch (error) {
          if (error instanceof ConditionTimeoutError) {
            errorCaught = true;
            expect(error.iterations).toBe(0);
          }
        }
      }

      const process = new Process(sim, processGen);
      process.start();
      sim.run();

      expect(errorCaught).toBe(true);
      expect(sim.now).toBe(0);
    });

    it('should validate interval parameter', () => {
      expect(() => {
        waitFor(() => true, { interval: -1 }).next();
      }).toThrow('interval must be non-negative');

      expect(() => {
        waitFor(() => true, { interval: NaN }).next();
      }).toThrow('interval must be a finite number');

      expect(() => {
        waitFor(() => true, { interval: Infinity }).next();
      }).toThrow('interval must be a finite number');
    });

    it('should validate maxIterations parameter', () => {
      expect(() => {
        waitFor(() => true, { maxIterations: -1 }).next();
      }).toThrow('maxIterations must be non-negative');

      expect(() => {
        waitFor(() => true, { maxIterations: NaN }).next();
      }).toThrow('maxIterations must be a finite number or Infinity');
    });

    it('should allow Infinity as maxIterations', () => {
      let counter = 0;

      function* processGen() {
        yield* waitFor(() => counter >= 5, { maxIterations: Infinity });
      }

      const process = new Process(sim, processGen);
      process.start();

      // Increment counter every time unit
      for (let i = 0; i < 10; i++) {
        sim.schedule(i, () => {
          counter++;
        });
      }

      sim.run();

      expect(process.isCompleted).toBe(true);
    });

    it('should not count initial check as an iteration', () => {
      const checkTimes: number[] = [];

      function* processGen() {
        yield* waitFor(
          () => {
            checkTimes.push(sim.now);
            return sim.now >= 3;
          },
          { interval: 1, maxIterations: 3 }
        );
      }

      const process = new Process(sim, processGen);
      process.start();
      sim.run();

      // Initial check at 0, then iterations at 1, 2, 3
      expect(checkTimes).toEqual([0, 1, 2, 3]);
      expect(process.isCompleted).toBe(true);
    });

    it('should allow interval of 0 for immediate rechecks', () => {
      let counter = 0;
      const checkTimes: number[] = [];

      function* processGen() {
        yield* waitFor(
          () => {
            checkTimes.push(sim.now);
            counter++;
            return counter >= 3;
          },
          { interval: 0 }
        );
      }

      const process = new Process(sim, processGen);
      process.start();
      sim.run();

      expect(process.isCompleted).toBe(true);
      // All checks happen at time 0 (immediate rechecks)
      expect(checkTimes).toEqual([0, 0, 0]);
    });
  });

  describe('complex process scenarios', () => {
    it('should handle process with multiple steps', () => {
      const resource = new Resource(sim, 1);
      const timeline: Array<{ time: number; event: string }> = [];

      function* processGen() {
        timeline.push({ time: sim.now, event: 'start' });

        yield* timeout(5);
        timeline.push({ time: sim.now, event: 'after-first-timeout' });

        yield resource.request();
        timeline.push({ time: sim.now, event: 'resource-acquired' });

        yield* timeout(10);
        timeline.push({ time: sim.now, event: 'after-second-timeout' });

        resource.release();
        timeline.push({ time: sim.now, event: 'resource-released' });
      }

      const process = new Process(sim, processGen);
      process.start();
      sim.run();

      expect(timeline).toEqual([
        { time: 0, event: 'start' },
        { time: 5, event: 'after-first-timeout' },
        { time: 5, event: 'resource-acquired' },
        { time: 15, event: 'after-second-timeout' },
        { time: 15, event: 'resource-released' },
      ]);
    });

    it('should handle multiple concurrent processes', () => {
      const events: Array<{ time: number; process: number; event: string }> =
        [];

      function* createProcessGen(id: number) {
        events.push({ time: sim.now, process: id, event: 'start' });
        yield* timeout(id * 5);
        events.push({ time: sim.now, process: id, event: 'complete' });
      }

      const p1 = new Process(sim, () => createProcessGen(1));
      const p2 = new Process(sim, () => createProcessGen(2));
      const p3 = new Process(sim, () => createProcessGen(3));

      p1.start();
      p2.start();
      p3.start();

      sim.run();

      expect(events).toHaveLength(6);
      expect(events[0]).toEqual({ time: 0, process: 1, event: 'start' });
      expect(events[1]).toEqual({ time: 0, process: 2, event: 'start' });
      expect(events[2]).toEqual({ time: 0, process: 3, event: 'start' });
      expect(events[3]).toEqual({ time: 5, process: 1, event: 'complete' });
      expect(events[4]).toEqual({ time: 10, process: 2, event: 'complete' });
      expect(events[5]).toEqual({ time: 15, process: 3, event: 'complete' });
    });

    it('should handle process with loops', () => {
      const iterations: number[] = [];

      function* processGen() {
        for (let i = 0; i < 3; i++) {
          yield* timeout(5);
          iterations.push(sim.now);
        }
      }

      const process = new Process(sim, processGen);
      process.start();
      sim.run();

      expect(iterations).toEqual([5, 10, 15]);
      expect(process.isCompleted).toBe(true);
    });
  });
});
