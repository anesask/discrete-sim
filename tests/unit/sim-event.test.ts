import { describe, it, expect, beforeEach } from 'vitest';
import { Simulation, SimEvent, timeout } from '../../src/index.js';

describe('SimEvent', () => {
  let sim: Simulation;

  beforeEach(() => {
    sim = new Simulation();
  });

  describe('Basic Event Operations', () => {
    it('should create event with name', () => {
      const event = new SimEvent(sim, 'test-event');
      expect(event.name).toBe('test-event');
      expect(event.isTriggered).toBe(false);
      expect(event.waitingCount).toBe(0);
    });

    it('should create event without name (auto-generated)', () => {
      const event = new SimEvent(sim);
      expect(event.name).toMatch(/^event-/);
      expect(event.isTriggered).toBe(false);
    });

    it('should reject empty name', () => {
      expect(() => new SimEvent(sim, '')).toThrow(/name cannot be empty/);
      expect(() => new SimEvent(sim, '   ')).toThrow(/name cannot be empty/);
    });
  });

  describe('Trigger and Reset', () => {
    it('should trigger event without value', () => {
      const event = new SimEvent(sim, 'alarm');

      expect(event.isTriggered).toBe(false);
      event.trigger();
      expect(event.isTriggered).toBe(true);
      expect(event.value).toBeUndefined();
    });

    it('should trigger event with value', () => {
      const event = new SimEvent(sim, 'data-event');
      const payload = { temperature: 100, pressure: 50 };

      event.trigger(payload);
      expect(event.isTriggered).toBe(true);
      expect(event.value).toEqual(payload);
    });

    it('should ignore multiple triggers', () => {
      const event = new SimEvent(sim, 'once');

      event.trigger('first');
      event.trigger('second');

      expect(event.value).toBe('first');
    });

    it('should reset event', () => {
      const event = new SimEvent(sim, 'reset-test');

      event.trigger('data');
      expect(event.isTriggered).toBe(true);
      expect(event.value).toBe('data');

      event.reset();
      expect(event.isTriggered).toBe(false);
      expect(event.value).toBeUndefined();
    });
  });

  describe('Process Coordination', () => {
    it('should resume waiting process when triggered', () => {
      const event = new SimEvent(sim, 'go');
      let processCompleted = false;

      sim.process(function* () {
        yield event.wait();
        processCompleted = true;
      });

      expect(processCompleted).toBe(false);

      event.trigger();
      sim.run();

      expect(processCompleted).toBe(true);
    });

    it('should resume immediately if event already triggered', () => {
      const event = new SimEvent(sim, 'go');
      event.trigger();

      let processCompleted = false;

      sim.process(function* () {
        yield event.wait();
        processCompleted = true;
      });

      sim.run();

      expect(processCompleted).toBe(true);
    });

    it('should track waiting process count', () => {
      const event = new SimEvent(sim, 'barrier');

      sim.process(function* () {
        yield event.wait();
      });

      sim.process(function* () {
        yield event.wait();
      });

      sim.process(function* () {
        yield event.wait();
      });

      sim.run(0); // Run to current time to start processes

      expect(event.waitingCount).toBe(3);

      event.trigger();
      sim.run();

      expect(event.waitingCount).toBe(0);
    });

    it('should pass value to waiting process', () => {
      const event = new SimEvent(sim, 'data');
      let receivedValue: unknown;

      sim.process(function* () {
        const req = event.wait();
        yield req;
        receivedValue = req.value;
      });

      const payload = { status: 'complete', count: 42 };
      event.trigger(payload);
      sim.run();

      expect(receivedValue).toEqual(payload);
    });

    it('should resume multiple processes at same time', () => {
      const event = new SimEvent(sim, 'broadcast');
      const completionTimes: number[] = [];

      for (let i = 0; i < 5; i++) {
        sim.process(function* () {
          yield event.wait();
          completionTimes.push(sim.now);
        });
      }

      sim.process(function* () {
        yield* timeout(10);
        event.trigger();
      });

      sim.run();

      // All processes should complete at time 10
      expect(completionTimes).toEqual([10, 10, 10, 10, 10]);
    });
  });

  describe('Complex Coordination Patterns', () => {
    it('should support barrier synchronization', () => {
      const barrier = new SimEvent(sim, 'barrier');
      const arrivals: number[] = [];
      const departures: number[] = [];
      const workerCount = 3;

      // Workers arrive at different times
      for (let i = 0; i < workerCount; i++) {
        const arrivalTime = (i + 1) * 5;
        sim.process(function* () {
          yield* timeout(arrivalTime);
          arrivals.push(sim.now);
          yield barrier.wait();
          departures.push(sim.now);
        });
      }

      // Coordinator waits for all to arrive, then releases
      sim.process(function* () {
        while (barrier.waitingCount < workerCount) {
          yield* timeout(1);
        }
        barrier.trigger();
      });

      sim.run();

      expect(arrivals).toEqual([5, 10, 15]);
      // All depart at same time (coordinator checks at 16 after last arrival at 15)
      expect(departures).toEqual([16, 16, 16]);
    });

    it('should support recurring events with reset', () => {
      const bell = new SimEvent(sim, 'bell');
      const rings: number[] = [];

      // Bell ringer
      sim.process(function* () {
        for (let i = 0; i < 3; i++) {
          yield* timeout(10);
          bell.trigger();
          bell.reset();
        }
      });

      // Listener
      sim.process(function* () {
        for (let i = 0; i < 3; i++) {
          yield bell.wait();
          rings.push(sim.now);
        }
      });

      sim.run();

      expect(rings).toEqual([10, 20, 30]);
    });

    it('should support conditional waiting with events', () => {
      const greenLight = new SimEvent(sim, 'green');
      const crossings: number[] = [];

      // Cars arrive and wait for green light
      [5, 7, 12].forEach((arrivalTime) => {
        sim.process(function* () {
          yield* timeout(arrivalTime);
          yield greenLight.wait();
          crossings.push(sim.now);
        });
      });

      // Traffic light controller
      sim.process(function* () {
        yield* timeout(10);
        greenLight.trigger();
      });

      sim.run();

      // First two cars (arrived before green at 10) cross at 10
      // Third car (arrived at 12, after green) crosses immediately at 12
      expect(crossings).toEqual([10, 10, 12]);
    });

    it('should support multiple different events', () => {
      const startEvent = new SimEvent(sim, 'start');
      const stopEvent = new SimEvent(sim, 'stop');
      const log: string[] = [];

      sim.process(function* () {
        yield startEvent.wait();
        log.push('started');
        yield stopEvent.wait();
        log.push('stopped');
      });

      sim.process(function* () {
        yield* timeout(5);
        startEvent.trigger();
        yield* timeout(10);
        stopEvent.trigger();
      });

      sim.run();

      expect(log).toEqual(['started', 'stopped']);
    });
  });

  describe('Event with Process Interruption', () => {
    it('should handle process interruption while waiting for event', () => {
      const event = new SimEvent(sim, 'never');
      let wasInterrupted = false;

      const proc = sim.process(function* () {
        try {
          yield event.wait();
        } catch (error) {
          wasInterrupted = true;
        }
      });

      sim.run(0); // Start process
      proc.interrupt(new Error('Cancelled'));

      expect(wasInterrupted).toBe(true);
      expect(event.waitingCount).toBe(0);
    });
  });

  describe('Event Statistics', () => {
    it('should track waiting count correctly', () => {
      const event = new SimEvent(sim, 'counter');

      expect(event.waitingCount).toBe(0);

      sim.process(function* () {
        yield event.wait();
      });
      sim.process(function* () {
        yield event.wait();
      });

      sim.run(0);
      expect(event.waitingCount).toBe(2);

      event.trigger();
      sim.run();
      expect(event.waitingCount).toBe(0);
    });

    it('should handle sequential waiting correctly', () => {
      const event = new SimEvent(sim, 'sequential');
      const log: string[] = [];

      sim.process(function* () {
        yield event.wait();
        log.push('first-complete');
        event.reset();
        yield event.wait();
        log.push('second-complete');
      });

      sim.process(function* () {
        yield* timeout(5);
        event.trigger();
        yield* timeout(5);
        event.trigger();
      });

      sim.run();

      expect(log).toEqual(['first-complete', 'second-complete']);
    });
  });

  describe('Edge Cases', () => {
    it('should handle event triggered before any waiters', () => {
      const event = new SimEvent(sim, 'early');
      event.trigger('early-value');

      let receivedValue: unknown;
      sim.process(function* () {
        const req = event.wait();
        yield req;
        receivedValue = req.value;
      });

      sim.run();

      expect(receivedValue).toBe('early-value');
    });

    it('should handle reset without prior trigger', () => {
      const event = new SimEvent(sim, 'no-trigger');

      // Should not throw
      expect(() => event.reset()).not.toThrow();
      expect(event.isTriggered).toBe(false);
    });

    it('should handle event with null value', () => {
      const event = new SimEvent(sim, 'null-value');
      event.trigger(null);

      expect(event.value).toBe(null);
      expect(event.isTriggered).toBe(true);
    });

    it('should handle event with numeric zero value', () => {
      const event = new SimEvent(sim, 'zero');
      event.trigger(0);

      expect(event.value).toBe(0);
      expect(event.isTriggered).toBe(true);
    });
  });

  describe('Realistic Use Case: Shift Change', () => {
    it('should simulate shift change coordination', () => {
      const shiftChange = new SimEvent(sim, 'shift-change');
      const workerLog: Array<{ worker: string; action: string; time: number }> = [];

      // Morning shift workers
      ['Alice', 'Bob'].forEach((name) => {
        sim.process(function* () {
          workerLog.push({ worker: name, action: 'start-morning', time: sim.now });
          yield shiftChange.wait();
          workerLog.push({ worker: name, action: 'end-morning', time: sim.now });
        });
      });

      // Evening shift workers
      ['Charlie', 'Dana'].forEach((name) => {
        sim.process(function* () {
          yield shiftChange.wait();
          workerLog.push({ worker: name, action: 'start-evening', time: sim.now });
        });
      });

      // Manager triggers shift change at time 480 (8 hours)
      sim.process(function* () {
        yield* timeout(480);
        shiftChange.trigger({ time: 480, shift: 'evening' });
      });

      sim.run();

      // Morning shift starts at 0
      expect(workerLog.filter(l => l.action === 'start-morning')).toHaveLength(2);
      expect(workerLog.filter(l => l.action === 'start-morning' && l.time === 0)).toHaveLength(2);

      // All shift changes happen at 480
      expect(workerLog.filter(l => l.time === 480)).toHaveLength(4);
      expect(workerLog.filter(l => l.action === 'end-morning')).toHaveLength(2);
      expect(workerLog.filter(l => l.action === 'start-evening')).toHaveLength(2);
    });
  });
});
