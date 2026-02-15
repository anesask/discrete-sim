import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  Simulation,
  SimEvent,
  Resource,
  Buffer,
  Store,
  timeout,
} from '../../src/index.js';

describe('Observability and Trace Mode', () => {
  let sim: Simulation;

  beforeEach(() => {
    sim = new Simulation();
  });

  describe('Trace Configuration', () => {
    it('should start with all tracing disabled', () => {
      expect(sim.isTraceEnabled('events')).toBe(false);
      expect(sim.isTraceEnabled('resources')).toBe(false);
      expect(sim.isTraceEnabled('processes')).toBe(false);
      expect(sim.isTraceEnabled('simEvents')).toBe(false);
    });

    it('should enable all tracing by default', () => {
      sim.enableTrace();

      expect(sim.isTraceEnabled('events')).toBe(true);
      expect(sim.isTraceEnabled('resources')).toBe(true);
      expect(sim.isTraceEnabled('processes')).toBe(true);
      expect(sim.isTraceEnabled('simEvents')).toBe(true);
    });

    it('should enable selective tracing', () => {
      sim.enableTrace({ resources: true, simEvents: false });

      expect(sim.isTraceEnabled('events')).toBe(true);
      expect(sim.isTraceEnabled('resources')).toBe(true);
      expect(sim.isTraceEnabled('processes')).toBe(true);
      expect(sim.isTraceEnabled('simEvents')).toBe(false);
    });

    it('should disable all tracing', () => {
      sim.enableTrace();
      sim.disableTrace();

      expect(sim.isTraceEnabled('events')).toBe(false);
      expect(sim.isTraceEnabled('resources')).toBe(false);
      expect(sim.isTraceEnabled('processes')).toBe(false);
      expect(sim.isTraceEnabled('simEvents')).toBe(false);
    });

    it('should allow re-enabling after disable', () => {
      sim.enableTrace({ resources: true });
      sim.disableTrace();
      sim.enableTrace({ simEvents: true });

      expect(sim.isTraceEnabled('simEvents')).toBe(true);
    });
  });

  describe('SimEvent Tracing', () => {
    it('should emit trace:simevent on event.trigger()', () => {
      const event = new SimEvent(sim, 'test-event');
      const handler = vi.fn();

      sim.enableTrace({ simEvents: true });
      sim.on('trace:simevent', handler);

      event.trigger('payload');

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'event:trigger',
          name: 'test-event',
          value: 'payload',
          waitingProcessCount: 0,
          time: 0,
        })
      );
    });

    it('should emit trace:simevent on event.wait()', () => {
      const event = new SimEvent(sim, 'test-event');
      const handler = vi.fn();

      sim.enableTrace({ simEvents: true });
      sim.on('trace:simevent', handler);

      sim.process(function* () {
        yield event.wait();
      });

      sim.run(0); // Start process

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'event:wait',
          name: 'test-event',
          waitingCount: 1,
          time: 0,
        })
      );
    });

    it('should emit trace:simevent on event.reset()', () => {
      const event = new SimEvent(sim, 'test-event');
      const handler = vi.fn();

      sim.enableTrace({ simEvents: true });
      sim.on('trace:simevent', handler);

      event.trigger();
      handler.mockClear();

      event.reset();

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'event:reset',
          name: 'test-event',
          time: 0,
        })
      );
    });

    it('should NOT emit when tracing disabled', () => {
      const event = new SimEvent(sim, 'test-event');
      const handler = vi.fn();

      sim.disableTrace();
      sim.on('trace:simevent', handler);

      event.trigger();
      event.reset();

      expect(handler).not.toHaveBeenCalled();
    });

    it('should track event lifecycle with tracing', () => {
      const event = new SimEvent(sim, 'lifecycle');
      const events: string[] = [];

      sim.enableTrace({ simEvents: true });
      sim.on('trace:simevent', (data: any) => {
        events.push(`${data.operation}@${data.time}`);
      });

      sim.process(function* () {
        yield event.wait();
      });

      sim.process(function* () {
        yield* timeout(5);
        event.trigger('data');
      });

      sim.run();

      expect(events).toContain('event:wait@0');
      expect(events).toContain('event:trigger@5');
    });
  });

  describe('Multiple Event Handlers', () => {
    it('should support multiple trace handlers', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      sim.enableTrace({ simEvents: true });
      sim.on('trace:simevent', handler1);
      sim.on('trace:simevent', handler2);

      const event = new SimEvent(sim, 'test');
      event.trigger();

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });

    it('should allow handler removal', () => {
      const handler = vi.fn();

      sim.enableTrace({ simEvents: true });
      sim.on('trace:simevent', handler);
      sim.off('trace:simevent', handler);

      const event = new SimEvent(sim, 'test');
      event.trigger();

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('Integration with Existing Events', () => {
    it('should work alongside step events', () => {
      const stepHandler = vi.fn();
      const traceHandler = vi.fn();

      sim.on('step', stepHandler);
      sim.enableTrace({ simEvents: true });
      sim.on('trace:simevent', traceHandler);

      const event = new SimEvent(sim, 'test');
      sim.process(function* () {
        yield* timeout(5);
        event.trigger();
      });

      sim.run();

      expect(stepHandler.mock.calls.length).toBeGreaterThan(0);
      expect(traceHandler).toHaveBeenCalled();
    });

    it('should work alongside complete events', () => {
      const completeHandler = vi.fn();
      const traceHandler = vi.fn();

      sim.on('complete', completeHandler);
      sim.enableTrace({ simEvents: true });
      sim.on('trace:simevent', traceHandler);

      const event = new SimEvent(sim, 'test');
      event.trigger();

      sim.run();

      expect(completeHandler).toHaveBeenCalled();
    });
  });

  describe('Real-world Tracing Scenario', () => {
    it('should trace complex event coordination pattern', () => {
      const barrier = new SimEvent(sim, 'barrier');
      const allEvents: Array<{ operation: string; time: number; name: string }> = [];

      sim.enableTrace({ simEvents: true });
      sim.on('trace:simevent', (data: any) => {
        allEvents.push({
          operation: data.operation,
          time: data.time,
          name: data.name,
        });
      });

      // Three workers arriving at different times
      [5, 10, 15].forEach((arrivalTime) => {
        sim.process(function* () {
          yield* timeout(arrivalTime);
          yield barrier.wait();
        });
      });

      // Coordinator waits for all, then releases
      sim.process(function* () {
        while (barrier.waitingCount < 3) {
          yield* timeout(1);
        }
        barrier.trigger({ count: 3 });
      });

      sim.run();

      // Should have 3 waits and 1 trigger
      const waits = allEvents.filter((e) => e.operation === 'event:wait');
      const triggers = allEvents.filter((e) => e.operation === 'event:trigger');

      expect(waits).toHaveLength(3);
      expect(triggers).toHaveLength(1);
      expect(triggers[0]!.time).toBe(16); // Trigger at time 16 (coordinator checks after last arrival at 15)
    });
  });

  describe('Trace Performance', () => {
    it('should not slow down simulation when disabled', () => {
      const event = new SimEvent(sim, 'perf-test');

      sim.disableTrace();

      for (let i = 0; i < 100; i++) {
        sim.process(function* () {
          yield event.wait();
        });
      }

      sim.process(function* () {
        yield* timeout(1);
        event.trigger();
      });

      const start = Date.now();
      sim.run();
      const duration = Date.now() - start;

      // Should complete quickly (< 100ms for 100 processes)
      expect(duration).toBeLessThan(100);
    });
  });

  describe('Trace Handler Error Handling', () => {
    it('should propagate errors from trace handlers', () => {
      const event = new SimEvent(sim, 'error-test');

      sim.enableTrace({ simEvents: true });
      sim.on('trace:simevent', () => {
        throw new Error('Handler error');
      });

      // Error in trace handler should propagate when process starts
      expect(() => {
        sim.process(function* () {
          yield event.wait();
        });
      }).toThrow('Handler error');
    });
  });
});
