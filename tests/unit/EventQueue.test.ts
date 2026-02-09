import { describe, it, expect, beforeEach } from 'vitest';
import { EventQueue } from '../../src/core/EventQueue';

describe('EventQueue', () => {
  let queue: EventQueue;

  beforeEach(() => {
    queue = new EventQueue();
  });

  describe('basic operations', () => {
    it('should initialize as empty', () => {
      expect(queue.length).toBe(0);
      expect(queue.isEmpty).toBe(true);
      expect(queue.peek()).toBeUndefined();
      expect(queue.pop()).toBeUndefined();
    });

    it('should push and pop a single event', () => {
      const callback = () => {};
      const id = queue.push({ time: 10, priority: 0, callback });

      expect(queue.length).toBe(1);
      expect(queue.isEmpty).toBe(false);
      expect(id).toMatch(/^event-\d+$/);

      const event = queue.pop();
      expect(event).toBeDefined();
      expect(event?.time).toBe(10);
      expect(event?.priority).toBe(0);
      expect(event?.callback).toBe(callback);
      expect(event?.id).toBe(id);

      expect(queue.length).toBe(0);
      expect(queue.isEmpty).toBe(true);
    });

    it('should peek without removing', () => {
      queue.push({ time: 10, priority: 0, callback: () => {} });

      const peeked1 = queue.peek();
      expect(peeked1?.time).toBe(10);
      expect(queue.length).toBe(1);

      const peeked2 = queue.peek();
      expect(peeked2?.time).toBe(10);
      expect(queue.length).toBe(1);

      const popped = queue.pop();
      expect(popped?.time).toBe(10);
      expect(queue.length).toBe(0);
    });

    it('should clear all events', () => {
      queue.push({ time: 10, priority: 0, callback: () => {} });
      queue.push({ time: 20, priority: 0, callback: () => {} });
      queue.push({ time: 30, priority: 0, callback: () => {} });

      expect(queue.length).toBe(3);

      queue.clear();

      expect(queue.length).toBe(0);
      expect(queue.isEmpty).toBe(true);
      expect(queue.peek()).toBeUndefined();
    });
  });

  describe('event removal', () => {
    it('should remove an event by ID', () => {
      const id1 = queue.push({ time: 10, priority: 0, callback: () => {} });
      const id2 = queue.push({ time: 20, priority: 0, callback: () => {} });
      const id3 = queue.push({ time: 30, priority: 0, callback: () => {} });

      expect(queue.length).toBe(3);

      const removed = queue.remove(id2);
      expect(removed).toBe(true);
      expect(queue.length).toBe(2);

      const event1 = queue.pop();
      expect(event1?.id).toBe(id1);

      const event2 = queue.pop();
      expect(event2?.id).toBe(id3);

      expect(queue.length).toBe(0);
    });

    it('should return false when removing non-existent event', () => {
      queue.push({ time: 10, priority: 0, callback: () => {} });

      const removed = queue.remove('non-existent-id');
      expect(removed).toBe(false);
      expect(queue.length).toBe(1);
    });

    it('should handle removing the only event', () => {
      const id = queue.push({ time: 10, priority: 0, callback: () => {} });

      const removed = queue.remove(id);
      expect(removed).toBe(true);
      expect(queue.length).toBe(0);
      expect(queue.isEmpty).toBe(true);
    });

    it('should handle removing from middle of heap', () => {
      const ids: string[] = [];
      for (let i = 0; i < 10; i++) {
        ids.push(queue.push({ time: i * 10, priority: 0, callback: () => {} }));
      }

      expect(queue.length).toBe(10);

      // Remove middle element
      const removed = queue.remove(ids[5]!);
      expect(removed).toBe(true);
      expect(queue.length).toBe(9);

      // Verify heap property is maintained
      let prevTime = -1;
      while (!queue.isEmpty) {
        const event = queue.pop();
        expect(event!.time).toBeGreaterThanOrEqual(prevTime);
        prevTime = event!.time;
      }
    });

    it('should handle removing first event', () => {
      const id1 = queue.push({ time: 10, priority: 0, callback: () => {} });
      queue.push({ time: 20, priority: 0, callback: () => {} });
      queue.push({ time: 30, priority: 0, callback: () => {} });

      const removed = queue.remove(id1);
      expect(removed).toBe(true);
      expect(queue.length).toBe(2);

      const event = queue.pop();
      expect(event?.time).toBe(20);
    });

    it('should handle removing last event', () => {
      queue.push({ time: 10, priority: 0, callback: () => {} });
      queue.push({ time: 20, priority: 0, callback: () => {} });
      const id3 = queue.push({ time: 30, priority: 0, callback: () => {} });

      const removed = queue.remove(id3);
      expect(removed).toBe(true);
      expect(queue.length).toBe(2);

      queue.pop();
      const event = queue.pop();
      expect(event?.time).toBe(20);
    });

    it('should maintain heap property after removal', () => {
      const ids: string[] = [];
      // Add events with various times
      ids.push(queue.push({ time: 50, priority: 0, callback: () => {} }));
      ids.push(queue.push({ time: 30, priority: 0, callback: () => {} }));
      ids.push(queue.push({ time: 70, priority: 0, callback: () => {} }));
      ids.push(queue.push({ time: 20, priority: 0, callback: () => {} }));
      ids.push(queue.push({ time: 40, priority: 0, callback: () => {} }));
      ids.push(queue.push({ time: 60, priority: 0, callback: () => {} }));
      ids.push(queue.push({ time: 80, priority: 0, callback: () => {} }));

      // Remove an event from the middle
      queue.remove(ids[2]!);

      // Pop all events and verify they come out in order
      const times: number[] = [];
      while (!queue.isEmpty) {
        times.push(queue.pop()!.time);
      }

      // Verify sorted order
      for (let i = 1; i < times.length; i++) {
        expect(times[i]!).toBeGreaterThanOrEqual(times[i - 1]!);
      }
    });
  });

  describe('event ordering', () => {
    it('should order events by time (earliest first)', () => {
      queue.push({ time: 30, priority: 0, callback: () => {} });
      queue.push({ time: 10, priority: 0, callback: () => {} });
      queue.push({ time: 20, priority: 0, callback: () => {} });

      expect(queue.pop()?.time).toBe(10);
      expect(queue.pop()?.time).toBe(20);
      expect(queue.pop()?.time).toBe(30);
    });

    it('should break ties by priority (lower priority value = higher priority)', () => {
      queue.push({ time: 10, priority: 5, callback: () => {} });
      queue.push({ time: 10, priority: 1, callback: () => {} });
      queue.push({ time: 10, priority: 3, callback: () => {} });

      expect(queue.pop()?.priority).toBe(1);
      expect(queue.pop()?.priority).toBe(3);
      expect(queue.pop()?.priority).toBe(5);
    });

    it('should be deterministic when time and priority are equal', () => {
      const id1 = queue.push({ time: 10, priority: 0, callback: () => {} });
      const id2 = queue.push({ time: 10, priority: 0, callback: () => {} });
      const id3 = queue.push({ time: 10, priority: 0, callback: () => {} });

      // Events with same time and priority should come out in insertion order
      expect(queue.pop()?.id).toBe(id1);
      expect(queue.pop()?.id).toBe(id2);
      expect(queue.pop()?.id).toBe(id3);
    });

    it('should maintain correct order with mixed times and priorities', () => {
      queue.push({ time: 10, priority: 5, callback: () => {} }); // 3rd
      queue.push({ time: 5, priority: 10, callback: () => {} }); // 1st (earliest time)
      queue.push({ time: 10, priority: 1, callback: () => {} }); // 2nd (same time, better priority)
      queue.push({ time: 15, priority: 0, callback: () => {} }); // 4th

      const events = [];
      while (!queue.isEmpty) {
        events.push(queue.pop());
      }

      expect(events[0]?.time).toBe(5);
      expect(events[1]?.time).toBe(10);
      expect(events[1]?.priority).toBe(1);
      expect(events[2]?.time).toBe(10);
      expect(events[2]?.priority).toBe(5);
      expect(events[3]?.time).toBe(15);
    });
  });

  describe('performance', () => {
    it('should handle 10,000 events efficiently', () => {
      const startTime = Date.now();
      const n = 10000;

      // Insert 10,000 events in random order
      for (let i = 0; i < n; i++) {
        queue.push({
          time: Math.random() * 1000,
          priority: Math.floor(Math.random() * 10),
          callback: () => {},
        });
      }

      const insertTime = Date.now() - startTime;
      expect(queue.length).toBe(n);

      // Extract all events
      const extractStart = Date.now();
      let prevTime = -Infinity;
      let prevPriority = -Infinity;

      while (!queue.isEmpty) {
        const event = queue.pop();
        expect(event).toBeDefined();

        // Verify ordering
        if (event) {
          if (event.time === prevTime) {
            expect(event.priority).toBeGreaterThanOrEqual(prevPriority);
            prevPriority = event.priority;
          } else {
            expect(event.time).toBeGreaterThanOrEqual(prevTime);
            prevTime = event.time;
            prevPriority = event.priority;
          }
        }
      }

      const extractTime = Date.now() - extractStart;
      const totalTime = Date.now() - startTime;

      // Performance expectations: should complete reasonably fast
      // Note: Thresholds are generous to account for:
      // - System load variations
      // - localeCompare() overhead for deterministic ordering
      // - Test verification overhead (ordering checks)
      expect(totalTime).toBeLessThan(5000);
      expect(insertTime).toBeLessThan(2000);
      expect(extractTime).toBeLessThan(3000);

      console.log(`EventQueue performance test:`);
      console.log(`  - Insert ${n} events: ${insertTime}ms`);
      console.log(`  - Extract ${n} events: ${extractTime}ms`);
      console.log(`  - Total time: ${totalTime}ms`);
    });

  });

  describe('edge cases', () => {
    it('should handle events with negative priorities', () => {
      queue.push({ time: 10, priority: -5, callback: () => {} });
      queue.push({ time: 10, priority: 0, callback: () => {} });
      queue.push({ time: 10, priority: -10, callback: () => {} });

      expect(queue.pop()?.priority).toBe(-10);
      expect(queue.pop()?.priority).toBe(-5);
      expect(queue.pop()?.priority).toBe(0);
    });

    it('should handle events with very large time values', () => {
      queue.push({ time: Number.MAX_SAFE_INTEGER, priority: 0, callback: () => {} });
      queue.push({ time: Number.MAX_SAFE_INTEGER - 1, priority: 0, callback: () => {} });

      expect(queue.pop()?.time).toBe(Number.MAX_SAFE_INTEGER - 1);
      expect(queue.pop()?.time).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('should handle events at time 0', () => {
      queue.push({ time: 0, priority: 0, callback: () => {} });
      queue.push({ time: 1, priority: 0, callback: () => {} });

      expect(queue.pop()?.time).toBe(0);
      expect(queue.pop()?.time).toBe(1);
    });

    it('should assign unique IDs to all events', () => {
      const ids = new Set<string>();

      for (let i = 0; i < 100; i++) {
        const id = queue.push({ time: i, priority: 0, callback: () => {} });
        expect(ids.has(id)).toBe(false);
        ids.add(id);
      }

      expect(ids.size).toBe(100);
    });
  });
});
