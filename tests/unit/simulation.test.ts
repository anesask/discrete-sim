import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Simulation } from '../../src/core/Simulation';
import { timeout } from '../../src/core/Process';
import { Resource } from '../../src/resources/Resource';

describe('Simulation', () => {
  let sim: Simulation;

  beforeEach(() => {
    sim = new Simulation();
  });

  describe('initialization', () => {
    it('should initialize with default time 0', () => {
      expect(sim.now).toBe(0);
    });

    it('should initialize with custom initial time', () => {
      const customSim = new Simulation({ initialTime: 100 });
      expect(customSim.now).toBe(100);
    });

    it('should accept random seed option', () => {
      const seededSim = new Simulation({ randomSeed: 42 });
      expect(seededSim).toBeDefined();
    });

    it('should accept logging option', () => {
      const loggingSim = new Simulation({ enableLogging: false });
      expect(loggingSim).toBeDefined();
    });
  });

  describe('event scheduling', () => {
    it('should schedule an event with delay', () => {
      const callback = vi.fn();
      const eventId = sim.schedule(10, callback);

      expect(eventId).toMatch(/^event-\d+$/);
      expect(callback).not.toHaveBeenCalled();
    });

    it('should throw error for negative delay', () => {
      expect(() => {
        sim.schedule(-1, () => {});
      }).toThrow('delay must be non-negative');
    });

    it('should allow zero delay', () => {
      const callback = vi.fn();
      sim.schedule(0, callback);
      sim.step();

      expect(callback).toHaveBeenCalled();
      expect(sim.now).toBe(0);
    });

    it('should support priority parameter', () => {
      const highPriority = vi.fn();
      const lowPriority = vi.fn();

      sim.schedule(10, lowPriority, 10);
      sim.schedule(10, highPriority, 1);

      sim.step();
      expect(highPriority).toHaveBeenCalled();
      expect(lowPriority).not.toHaveBeenCalled();

      sim.step();
      expect(lowPriority).toHaveBeenCalled();
    });
  });

  describe('process() helper', () => {
    it('should create and start a process', () => {
      const events: string[] = [];

      const proc = sim.process(function* () {
        events.push('start');
        yield* timeout(10);
        events.push('middle');
        yield* timeout(5);
        events.push('end');
      });

      expect(proc).toBeDefined();
      expect(proc.isRunning).toBe(true);
      expect(events).toEqual(['start']);

      sim.run();

      expect(proc.isCompleted).toBe(true);
      expect(events).toEqual(['start', 'middle', 'end']);
      expect(sim.now).toBe(15);
    });

    it('should return Process instance for further control', () => {
      const proc = sim.process(function* () {
        yield* timeout(10);
      });

      expect(proc.isRunning).toBe(true);
      expect(proc.isCompleted).toBe(false);

      sim.run();

      expect(proc.isCompleted).toBe(true);
    });

    it('should allow multiple processes', () => {
      const order: number[] = [];

      sim.process(function* () {
        yield* timeout(10);
        order.push(1);
      });

      sim.process(function* () {
        yield* timeout(5);
        order.push(2);
      });

      sim.process(function* () {
        yield* timeout(15);
        order.push(3);
      });

      sim.run();

      expect(order).toEqual([2, 1, 3]);
    });

    it('should work with resources', () => {
      const resource = new Resource(sim, 1);
      const events: string[] = [];

      sim.process(function* () {
        events.push('p1-request');
        yield resource.request();
        events.push('p1-acquired');
        yield* timeout(10);
        resource.release();
        events.push('p1-released');
      });

      sim.process(function* () {
        events.push('p2-request');
        yield resource.request();
        events.push('p2-acquired');
        resource.release();
        events.push('p2-released');
      });

      sim.run();

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

  describe('event cancellation', () => {
    it('should cancel a scheduled event', () => {
      const callback = vi.fn();
      const eventId = sim.schedule(10, callback);

      const cancelled = sim.cancel(eventId);
      expect(cancelled).toBe(true);

      sim.run();

      expect(callback).not.toHaveBeenCalled();
      expect(sim.now).toBe(0);
    });

    it('should return false when cancelling non-existent event', () => {
      const cancelled = sim.cancel('non-existent-id');
      expect(cancelled).toBe(false);
    });

    it('should allow cancelling before execution', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const callback3 = vi.fn();

      sim.schedule(10, callback1);
      const id2 = sim.schedule(20, callback2);
      sim.schedule(30, callback3);

      sim.cancel(id2);

      sim.run();

      expect(callback1).toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();
      expect(callback3).toHaveBeenCalled();
    });

    it('should not affect other events when cancelling', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const callback3 = vi.fn();

      sim.schedule(10, callback1);
      const id2 = sim.schedule(15, callback2);
      sim.schedule(20, callback3);

      expect(sim.statistics.eventsInQueue).toBe(3);

      sim.cancel(id2);

      expect(sim.statistics.eventsInQueue).toBe(2);

      sim.run();

      expect(callback1).toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();
      expect(callback3).toHaveBeenCalled();
      expect(sim.now).toBe(20);
    });

    it('should handle cancelling multiple events', () => {
      const callbacks = [vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn()];
      const ids = callbacks.map((cb, i) => sim.schedule((i + 1) * 10, cb));

      // Cancel every other event
      sim.cancel(ids[1]!);
      sim.cancel(ids[3]!);

      sim.run();

      expect(callbacks[0]).toHaveBeenCalled();
      expect(callbacks[1]).not.toHaveBeenCalled();
      expect(callbacks[2]).toHaveBeenCalled();
      expect(callbacks[3]).not.toHaveBeenCalled();
      expect(callbacks[4]).toHaveBeenCalled();
    });

    it('should return false when trying to cancel already executed event', () => {
      const callback = vi.fn();
      const eventId = sim.schedule(10, callback);

      sim.step();

      expect(callback).toHaveBeenCalled();

      const cancelled = sim.cancel(eventId);
      expect(cancelled).toBe(false);
    });

    it('should work with priority events', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const callback3 = vi.fn();

      sim.schedule(10, callback1, 10);
      const id2 = sim.schedule(10, callback2, 5);
      sim.schedule(10, callback3, 1);

      sim.cancel(id2);

      sim.run();

      expect(callback1).toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();
      expect(callback3).toHaveBeenCalled();
    });

    it('should work within event callbacks', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const callback3 = vi.fn();

      let id3: string;

      sim.schedule(10, () => {
        callback1();
        sim.cancel(id3);
      });
      sim.schedule(20, callback2);
      id3 = sim.schedule(30, callback3);

      sim.run();

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
      expect(callback3).not.toHaveBeenCalled();
    });
  });

  describe('stepping through simulation', () => {
    it('should execute one event per step', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      sim.schedule(10, callback1);
      sim.schedule(20, callback2);

      const stepped1 = sim.step();
      expect(stepped1).toBe(true);
      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).not.toHaveBeenCalled();
      expect(sim.now).toBe(10);

      const stepped2 = sim.step();
      expect(stepped2).toBe(true);
      expect(callback2).toHaveBeenCalledTimes(1);
      expect(sim.now).toBe(20);
    });

    it('should return false when stepping with no events', () => {
      const stepped = sim.step();
      expect(stepped).toBe(false);
      expect(sim.now).toBe(0);
    });

    it('should advance time to event time', () => {
      sim.schedule(50, () => {});
      expect(sim.now).toBe(0);

      sim.step();
      expect(sim.now).toBe(50);
    });

    it('should execute events in time order', () => {
      const order: number[] = [];

      sim.schedule(30, () => order.push(3));
      sim.schedule(10, () => order.push(1));
      sim.schedule(20, () => order.push(2));

      sim.step();
      sim.step();
      sim.step();

      expect(order).toEqual([1, 2, 3]);
    });
  });

  describe('running simulation', () => {
    it('should run until target time', () => {
      const callback = vi.fn();
      sim.schedule(10, callback);
      sim.schedule(20, callback);
      sim.schedule(30, callback);

      const result = sim.run(25);

      expect(result.endTime).toBe(25);
      expect(callback).toHaveBeenCalledTimes(2); // Only events at time 10 and 20
      expect(sim.now).toBe(25);
    });

    it('should run until queue is empty if no target specified', () => {
      const callback = vi.fn();
      sim.schedule(10, callback);
      sim.schedule(20, callback);
      sim.schedule(30, callback);

      const result = sim.run();

      expect(result.endTime).toBe(30);
      expect(callback).toHaveBeenCalledTimes(3);
      expect(sim.now).toBe(30);
    });

    it('should return correct event count', () => {
      sim.schedule(10, () => {});
      sim.schedule(20, () => {});
      sim.schedule(30, () => {});

      const result = sim.run();

      expect(result.eventsProcessed).toBe(3);
    });

    it('should populate statistics in result', () => {
      sim.schedule(10, () => {});
      sim.schedule(20, () => {});

      const result = sim.run(25);

      expect(result.statistics).toBeDefined();
      expect(result.statistics.currentTime).toBe(25);
      expect(result.statistics.eventsProcessed).toBe(2);
      expect(result.statistics.eventsInQueue).toBe(0);
    });

    it('should handle empty queue', () => {
      const result = sim.run(100);

      expect(result.endTime).toBe(100);
      expect(result.eventsProcessed).toBe(0);
      expect(sim.now).toBe(100);
    });

    it('should advance to target time even if no events scheduled', () => {
      const result = sim.run(50);

      expect(result.endTime).toBe(50);
      expect(sim.now).toBe(50);
    });

    it('should throw error if already running', () => {
      sim.schedule(10, () => {
        expect(() => {
          sim.run(100);
        }).toThrow('Simulation is already running');
      });

      sim.run();
    });

    it('should throw error for negative until parameter', () => {
      expect(() => {
        sim.run(-1);
      }).toThrow('until must be non-negative');
    });

    it('should throw error for NaN until parameter', () => {
      expect(() => {
        sim.run(NaN);
      }).toThrow('until must be a finite number');
    });

    it('should throw error for Infinity until parameter', () => {
      expect(() => {
        sim.run(Infinity);
      }).toThrow('until must be a finite number');
    });

    it('should allow zero as until parameter', () => {
      const result = sim.run(0);
      expect(result.endTime).toBe(0);
    });

    it('should handle events scheduled during execution', () => {
      const order: number[] = [];

      sim.schedule(10, () => {
        order.push(1);
        sim.schedule(5, () => order.push(3)); // Schedules at time 15
      });

      sim.schedule(20, () => order.push(2));

      sim.run();

      expect(order).toEqual([1, 3, 2]);
    });
  });

  describe('reset functionality', () => {
    it('should reset time to initial value', () => {
      sim.schedule(100, () => {});
      sim.run();

      expect(sim.now).toBe(100);

      sim.reset();
      expect(sim.now).toBe(0);
    });

    it('should reset to custom initial time', () => {
      const customSim = new Simulation({ initialTime: 50 });
      customSim.schedule(100, () => {});
      customSim.run();

      expect(customSim.now).toBe(150); // 50 (initial) + 100 (delay)

      customSim.reset();
      expect(customSim.now).toBe(50);
    });

    it('should clear event queue', () => {
      const callback = vi.fn();
      sim.schedule(10, callback);
      sim.schedule(20, callback);

      sim.reset();
      sim.run();

      expect(callback).not.toHaveBeenCalled();
    });

    it('should reset event counter', () => {
      sim.schedule(10, () => {});
      sim.run();

      const result1 = sim.run(20);
      expect(result1.eventsProcessed).toBe(0);

      sim.reset();
      sim.schedule(10, () => {});
      const result2 = sim.run();

      expect(result2.eventsProcessed).toBe(1);
    });

    it('should throw error if reset during run', () => {
      sim.schedule(10, () => {
        expect(() => {
          sim.reset();
        }).toThrow('Cannot reset while simulation is running');
      });

      sim.run();
    });

    it('should allow running again after reset', () => {
      const callback = vi.fn();

      sim.schedule(10, callback);
      sim.run();
      expect(callback).toHaveBeenCalledTimes(1);

      sim.reset();
      sim.schedule(10, callback);
      sim.run();
      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('should interrupt running processes during reset', () => {
      const events: string[] = [];

      sim.process(function* () {
        events.push('start');
        try {
          yield* timeout(100);
          events.push('completed');
        } catch (error) {
          events.push('interrupted');
        }
      });

      expect(events).toEqual(['start']);

      sim.reset();

      expect(events).toEqual(['start', 'interrupted']);
    });

    it('should interrupt multiple processes during reset', () => {
      const events: string[] = [];

      sim.process(function* () {
        events.push('p1-start');
        try {
          yield* timeout(100);
          events.push('p1-completed');
        } catch (error) {
          events.push('p1-interrupted');
        }
      });

      sim.process(function* () {
        events.push('p2-start');
        try {
          yield* timeout(50);
          events.push('p2-completed');
        } catch (error) {
          events.push('p2-interrupted');
        }
      });

      expect(events).toEqual(['p1-start', 'p2-start']);

      sim.reset();

      expect(events).toEqual([
        'p1-start',
        'p2-start',
        'p1-interrupted',
        'p2-interrupted',
      ]);
    });

    it('should clear active processes Set after reset', () => {
      // Create processes
      const p1 = sim.process(function* () {
        yield* timeout(100);
      });

      const p2 = sim.process(function* () {
        yield* timeout(50);
      });

      // Verify they're running
      expect(p1.isRunning).toBe(true);
      expect(p2.isRunning).toBe(true);

      // Reset
      sim.reset();

      // Verify they're interrupted
      expect(p1.isInterrupted).toBe(true);
      expect(p2.isInterrupted).toBe(true);

      // Create new process after reset should work
      const p3 = sim.process(function* () {
        yield* timeout(10);
      });

      expect(p3.isRunning).toBe(true);

      sim.run();

      expect(p3.isCompleted).toBe(true);
      expect(sim.now).toBe(10);
    });

    it('should interrupt processes that handle the error and continue', () => {
      const events: string[] = [];

      sim.process(function* () {
        events.push('start');
        try {
          yield* timeout(100);
          events.push('completed-after-timeout');
        } catch (error) {
          events.push('caught-error');
          // Process tries to continue after catching error
          // However, reset() clears the event queue, so any new timeouts won't execute
        }
        events.push('generator-finished');
      });

      expect(events).toEqual(['start']);

      sim.reset();

      // Process caught the error and finished (no more yields after catch)
      expect(events).toEqual(['start', 'caught-error', 'generator-finished']);
    });

    it('should handle reset with completed processes', () => {
      const events: string[] = [];

      sim.process(function* () {
        events.push('p1');
        yield* timeout(5);
        events.push('p1-done');
      });

      sim.process(function* () {
        events.push('p2');
        yield* timeout(100);
        events.push('p2-done');
      });

      // Run until first process completes
      sim.run(5);

      expect(events).toEqual(['p1', 'p2', 'p1-done']);

      // Reset should only interrupt the still-running process
      sim.reset();

      // p2 never completed, no error handler so just interrupted
      expect(events).toEqual(['p1', 'p2', 'p1-done']);
      expect(sim.now).toBe(0);
    });

    it('should handle processes with resources during reset', () => {
      const resource = new Resource(sim, 1);
      const events: string[] = [];

      sim.process(function* () {
        events.push('start');
        try {
          yield resource.request();
          events.push('acquired');
          yield* timeout(100);
          resource.release();
          events.push('released');
        } catch (error) {
          events.push('interrupted');
          if (resource.available < resource.capacity) {
            resource.release();
            events.push('cleanup-release');
          }
        }
      });

      expect(events).toEqual(['start', 'acquired']);
      expect(resource.available).toBe(0); // Resource is in use

      sim.reset();

      expect(events).toEqual([
        'start',
        'acquired',
        'interrupted',
        'cleanup-release',
      ]);
      expect(resource.available).toBe(1); // Resource released
    });
  });

  describe('event handlers', () => {
    it('should call step handler for each event', () => {
      const stepHandler = vi.fn();
      sim.on('step', stepHandler);

      sim.schedule(10, () => {});
      sim.schedule(20, () => {});

      sim.run();

      expect(stepHandler).toHaveBeenCalledTimes(2);
    });

    it('should call complete handler when run finishes', () => {
      const completeHandler = vi.fn();
      sim.on('complete', completeHandler);

      sim.schedule(10, () => {});
      sim.run();

      expect(completeHandler).toHaveBeenCalledTimes(1);
      expect(completeHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          endTime: 10,
          eventsProcessed: 1,
        })
      );
    });

    it('should call error handler when event throws', () => {
      const errorHandler = vi.fn();
      sim.on('error', errorHandler);

      const error = new Error('Test error');
      sim.schedule(10, () => {
        throw error;
      });

      expect(() => {
        sim.run();
      }).toThrow('Test error');

      expect(errorHandler).toHaveBeenCalledWith(error);
    });

    it('should allow removing event handlers', () => {
      const handler = vi.fn();
      sim.on('step', handler);

      sim.schedule(10, () => {});
      sim.step();
      expect(handler).toHaveBeenCalledTimes(1);

      sim.off('step', handler);
      sim.schedule(20, () => {});
      sim.step();
      expect(handler).toHaveBeenCalledTimes(1); // Not called again
    });

    it('should preserve event handlers across resets', () => {
      const stepHandler = vi.fn();
      sim.on('step', stepHandler);

      sim.schedule(10, () => {});
      sim.run();
      expect(stepHandler).toHaveBeenCalledTimes(1);

      sim.reset();
      sim.schedule(10, () => {});
      sim.run();
      expect(stepHandler).toHaveBeenCalledTimes(2);
    });
  });

  describe('simultaneous events', () => {
    it('should handle multiple events at the same time', () => {
      const callbacks = [vi.fn(), vi.fn(), vi.fn()];

      callbacks.forEach((cb) => sim.schedule(10, cb));

      sim.run();

      callbacks.forEach((cb) => expect(cb).toHaveBeenCalledTimes(1));
      expect(sim.now).toBe(10);
    });

    it('should respect priority for simultaneous events', () => {
      const order: number[] = [];

      sim.schedule(10, () => order.push(3), 3);
      sim.schedule(10, () => order.push(1), 1);
      sim.schedule(10, () => order.push(2), 2);

      sim.run();

      expect(order).toEqual([1, 2, 3]);
    });
  });

  describe('statistics', () => {
    it('should provide basic statistics', () => {
      sim.schedule(10, () => {});
      sim.schedule(20, () => {});

      const stats = sim.statistics;

      expect(stats).toHaveProperty('currentTime');
      expect(stats).toHaveProperty('eventsProcessed');
      expect(stats).toHaveProperty('eventsInQueue');
    });

    it('should track current time in statistics', () => {
      sim.schedule(50, () => {});
      sim.run();

      expect(sim.statistics.currentTime).toBe(50);
    });

    it('should track events processed', () => {
      sim.schedule(10, () => {});
      sim.schedule(20, () => {});
      sim.run();

      expect(sim.statistics.eventsProcessed).toBe(2);
    });

    it('should track events in queue', () => {
      sim.schedule(10, () => {});
      sim.schedule(20, () => {});

      expect(sim.statistics.eventsInQueue).toBe(2);

      sim.step();
      expect(sim.statistics.eventsInQueue).toBe(1);
    });
  });

  describe('complex scenarios', () => {
    it('should handle recursive event scheduling', () => {
      const order: number[] = [];
      let count = 0;

      const recursiveEvent = () => {
        order.push(count++);
        if (count < 5) {
          sim.schedule(10, recursiveEvent);
        }
      };

      sim.schedule(10, recursiveEvent);
      sim.run();

      expect(order).toEqual([0, 1, 2, 3, 4]);
      expect(sim.now).toBe(50);
    });

    it('should handle interleaved event scheduling', () => {
      const order: string[] = [];

      sim.schedule(10, () => {
        order.push('A');
        sim.schedule(15, () => order.push('C')); // Scheduled at 10+15=25
      });

      sim.schedule(20, () => {
        order.push('B');
        sim.schedule(5, () => order.push('D')); // Scheduled at 20+5=25
      });

      sim.run();

      // Order: A at t=10, B at t=20, C and D both at t=25
      expect(order).toEqual(['A', 'B', 'C', 'D']);
    });

    it('should maintain accuracy with many events', () => {
      let sum = 0;
      const n = 1000;

      for (let i = 1; i <= n; i++) {
        sim.schedule(i, () => {
          sum += i;
        });
      }

      sim.run();

      const expectedSum = (n * (n + 1)) / 2;
      expect(sum).toBe(expectedSum);
      expect(sim.now).toBe(n);
    });
  });

  describe('event tracing', () => {
    it('should be disabled by default', () => {
      sim.schedule(10, () => {});
      sim.run();

      const trace = sim.getEventTrace();
      expect(trace.length).toBe(0);
    });

    it('should enable and disable tracing', () => {
      sim.enableEventTrace();
      sim.schedule(10, () => {});
      sim.run();

      expect(sim.getEventTrace().length).toBe(1);

      sim.disableEventTrace();
      sim.schedule(20, () => {});
      sim.run();

      // Still just 1 event (second wasn't traced)
      expect(sim.getEventTrace().length).toBe(1);
    });

    it('should record event details', () => {
      sim.enableEventTrace();

      sim.schedule(10, () => {}, 5); // priority 5
      sim.schedule(20, () => {}, 3); // priority 3

      sim.run();

      const trace = sim.getEventTrace();
      expect(trace.length).toBe(2);

      expect(trace[0]).toMatchObject({
        time: 10,
        priority: 5,
        executedAt: 1,
      });

      expect(trace[1]).toMatchObject({
        time: 20,
        priority: 3,
        executedAt: 2,
      });

      // IDs should be present
      expect(trace[0]!.id).toMatch(/^event-\d+$/);
      expect(trace[1]!.id).toMatch(/^event-\d+$/);
    });

    it('should clear event trace', () => {
      sim.enableEventTrace();

      sim.schedule(10, () => {});
      sim.schedule(20, () => {});
      sim.run();

      expect(sim.getEventTrace().length).toBe(2);

      sim.clearEventTrace();
      expect(sim.getEventTrace().length).toBe(0);
    });

    it('should handle priority ordering in trace', () => {
      sim.enableEventTrace();

      // Schedule with different priorities at same time
      sim.schedule(10, () => {}, 10); // Low priority
      sim.schedule(10, () => {}, 0); // High priority
      sim.schedule(10, () => {}, 5); // Medium priority

      sim.run();

      const trace = sim.getEventTrace();
      expect(trace.length).toBe(3);

      // Should execute in priority order (0, 5, 10)
      expect(trace[0]!.priority).toBe(0);
      expect(trace[1]!.priority).toBe(5);
      expect(trace[2]!.priority).toBe(10);
    });

    it('should work with step() method', () => {
      sim.enableEventTrace();

      sim.schedule(10, () => {});
      sim.schedule(20, () => {});

      sim.step();
      expect(sim.getEventTrace().length).toBe(1);

      sim.step();
      expect(sim.getEventTrace().length).toBe(2);
    });

    it('should return readonly array', () => {
      sim.enableEventTrace();
      sim.schedule(10, () => {});
      sim.run();

      const trace = sim.getEventTrace();

      // TypeScript should prevent mutation, but verify runtime behavior
      expect(trace.length).toBe(1);
      expect(Array.isArray(trace)).toBe(true);
    });
  });
});
