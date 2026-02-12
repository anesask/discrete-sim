import { describe, it, expect } from 'vitest';
import {
  Simulation,
  Store,
  Process,
  ProcessGenerator,
  timeout,
  ValidationError,
} from '../../src/index.js';

// Test item types
interface Pallet {
  id: string;
  destination: string;
  weight: number;
}

interface Patient {
  id: number;
  name: string;
  severity: number; // 1-5, higher is more severe
}

describe('Store', () => {
  describe('Construction', () => {
    it('should create store with valid capacity', () => {
      const sim = new Simulation();
      const store = new Store<Pallet>(sim, 100);

      expect(store.capacity).toBe(100);
      expect(store.size).toBe(0);
      expect(store.available).toBe(100);
      expect(store.name).toBe('Store');
      expect(store.items).toEqual([]);
    });

    it('should create store with custom name', () => {
      const sim = new Simulation();
      const store = new Store(sim, 50, { name: 'Warehouse' });

      expect(store.name).toBe('Warehouse');
    });

    it('should reject zero capacity', () => {
      const sim = new Simulation();
      expect(() => new Store(sim, 0)).toThrow(ValidationError);
    });

    it('should reject negative capacity', () => {
      const sim = new Simulation();
      expect(() => new Store(sim, -10)).toThrow(ValidationError);
    });

    it('should reject NaN capacity', () => {
      const sim = new Simulation();
      expect(() => new Store(sim, NaN)).toThrow(ValidationError);
    });

    it('should reject empty name', () => {
      const sim = new Simulation();
      expect(() => new Store(sim, 100, { name: '' })).toThrow(
        ValidationError
      );
    });
  });

  describe('Basic Put Operations', () => {
    it('should put item when space available', () => {
      const sim = new Simulation();
      const store = new Store<Pallet>(sim, 100);
      let putCompleted = false;

      const pallet: Pallet = { id: 'P1', destination: 'NYC', weight: 500 };

      function* producer(): ProcessGenerator {
        yield store.put(pallet);
        putCompleted = true;
      }

      new Process(sim, producer).start();

      expect(store.size).toBe(1);
      expect(store.available).toBe(99);
      expect(putCompleted).toBe(true);
      expect(store.items).toEqual([pallet]);
    });

    it('should put multiple items', () => {
      const sim = new Simulation();
      const store = new Store<Pallet>(sim, 100);

      const p1: Pallet = { id: 'P1', destination: 'NYC', weight: 500 };
      const p2: Pallet = { id: 'P2', destination: 'LA', weight: 600 };
      const p3: Pallet = { id: 'P3', destination: 'CHI', weight: 450 };

      function* producer(): ProcessGenerator {
        yield store.put(p1);
        yield store.put(p2);
        yield store.put(p3);
      }

      new Process(sim, producer).start();

      expect(store.size).toBe(3);
      expect(store.available).toBe(97);
      expect(store.items).toEqual([p1, p2, p3]);
    });

    it('should block when store is full', () => {
      const sim = new Simulation();
      const store = new Store<string>(sim, 2);
      let putCompleted = false;

      function* producer(): ProcessGenerator {
        yield store.put('item1');
        yield store.put('item2');
        yield store.put('item3'); // Should block
        putCompleted = true;
      }

      new Process(sim, producer).start();

      expect(store.size).toBe(2);
      expect(putCompleted).toBe(false);
      expect(store.putQueueLength).toBe(1);
    });

    it('should reject null item', () => {
      const sim = new Simulation();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const store = new Store<any>(sim, 100);

      expect(() => store.put(null)).toThrow(ValidationError);
    });

    it('should reject undefined item', () => {
      const sim = new Simulation();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const store = new Store<any>(sim, 100);

      expect(() => store.put(undefined)).toThrow(ValidationError);
    });
  });

  describe('Basic Get Operations (FIFO)', () => {
    it('should get item when available (FIFO)', () => {
      const sim = new Simulation();
      const store = new Store<string>(sim, 100);
      let retrievedItem: string | undefined;

      function* setup(): ProcessGenerator {
        yield store.put('item1');
        yield store.put('item2');
      }

      function* consumer(): ProcessGenerator {
        const request = store.get();
        yield request;
        retrievedItem = request.retrievedItem!;
      }

      new Process(sim, setup).start();
      new Process(sim, consumer).start();

      expect(retrievedItem).toBe('item1'); // FIFO
      expect(store.size).toBe(1);
      expect(store.items).toEqual(['item2']);
    });

    it('should get multiple items in FIFO order', () => {
      const sim = new Simulation();
      const store = new Store<number>(sim, 100);
      const retrieved: number[] = [];

      function* setup(): ProcessGenerator {
        yield store.put(10);
        yield store.put(20);
        yield store.put(30);
      }

      function* consumer(): ProcessGenerator {
        for (let i = 0; i < 3; i++) {
          const request = store.get();
          yield request;
          retrieved.push(request.retrievedItem!);
        }
      }

      new Process(sim, setup).start();
      new Process(sim, consumer).start();

      expect(retrieved).toEqual([10, 20, 30]); // FIFO order
      expect(store.size).toBe(0);
    });

    it('should block when store is empty', () => {
      const sim = new Simulation();
      const store = new Store<string>(sim, 100);
      let getCompleted = false;

      function* consumer(): ProcessGenerator {
        const request = store.get();
        yield request;
        getCompleted = true;
      }

      new Process(sim, consumer).start();

      expect(getCompleted).toBe(false);
      expect(store.getQueueLength).toBe(1);
    });
  });

  describe('Filter-Based Retrieval', () => {
    it('should get item matching filter', () => {
      const sim = new Simulation();
      const store = new Store<Pallet>(sim, 100);
      let retrieved: Pallet | undefined;

      const p1: Pallet = { id: 'P1', destination: 'NYC', weight: 500 };
      const p2: Pallet = { id: 'P2', destination: 'LA', weight: 600 };
      const p3: Pallet = { id: 'P3', destination: 'NYC', weight: 450 };

      function* setup(): ProcessGenerator {
        yield store.put(p1);
        yield store.put(p2);
        yield store.put(p3);
      }

      function* consumer(): ProcessGenerator {
        const request = store.get((p) => p.destination === 'LA');
        yield request;
        retrieved = request.retrievedItem!;
      }

      new Process(sim, setup).start();
      new Process(sim, consumer).start();

      expect(retrieved).toEqual(p2);
      expect(store.size).toBe(2);
      expect(store.items).toEqual([p1, p3]);
    });

    it('should return first match when multiple items match', () => {
      const sim = new Simulation();
      const store = new Store<Pallet>(sim, 100);
      let retrieved: Pallet | undefined;

      const p1: Pallet = { id: 'P1', destination: 'NYC', weight: 500 };
      const p2: Pallet = { id: 'P2', destination: 'NYC', weight: 600 };
      const p3: Pallet = { id: 'P3', destination: 'LA', weight: 450 };

      function* setup(): ProcessGenerator {
        yield store.put(p1);
        yield store.put(p2);
        yield store.put(p3);
      }

      function* consumer(): ProcessGenerator {
        const request = store.get((p) => p.destination === 'NYC');
        yield request;
        retrieved = request.retrievedItem!;
      }

      new Process(sim, setup).start();
      new Process(sim, consumer).start();

      expect(retrieved).toEqual(p1); // First match
      expect(store.size).toBe(2);
    });

    it('should block when no items match filter', () => {
      const sim = new Simulation();
      const store = new Store<Pallet>(sim, 100);
      let getCompleted = false;

      const p1: Pallet = { id: 'P1', destination: 'NYC', weight: 500 };

      function* setup(): ProcessGenerator {
        yield store.put(p1);
      }

      function* consumer(): ProcessGenerator {
        const request = store.get((p) => p.destination === 'LA');
        yield request;
        getCompleted = true;
      }

      new Process(sim, setup).start();
      new Process(sim, consumer).start();

      expect(getCompleted).toBe(false);
      expect(store.getQueueLength).toBe(1);
      expect(store.size).toBe(1); // Item still in store
    });

    it('should unblock when matching item is added', () => {
      const sim = new Simulation();
      const store = new Store<Pallet>(sim, 100);
      let retrieved: Pallet | undefined;

      const p1: Pallet = { id: 'P1', destination: 'NYC', weight: 500 };
      const p2: Pallet = { id: 'P2', destination: 'LA', weight: 600 };

      function* setup(): ProcessGenerator {
        yield store.put(p1);
      }

      function* consumer(): ProcessGenerator {
        const request = store.get((p) => p.destination === 'LA');
        yield request;
        retrieved = request.retrievedItem!;
      }

      function* lateProducer(): ProcessGenerator {
        yield* timeout(5);
        yield store.put(p2); // This should unblock consumer
      }

      new Process(sim, setup).start();
      new Process(sim, consumer).start();
      new Process(sim, lateProducer).start();

      sim.run(10);

      expect(retrieved).toEqual(p2);
      expect(store.size).toBe(1);
      expect(store.items).toEqual([p1]);
    });

    it('should handle complex filter predicates', () => {
      const sim = new Simulation();
      const store = new Store<Patient>(sim, 100);
      let retrieved: Patient | undefined;

      const patient1: Patient = { id: 1, name: 'Alice', severity: 2 };
      const patient2: Patient = { id: 2, name: 'Bob', severity: 5 };
      const patient3: Patient = { id: 3, name: 'Charlie', severity: 3 };

      function* setup(): ProcessGenerator {
        yield store.put(patient1);
        yield store.put(patient2);
        yield store.put(patient3);
      }

      function* consumer(): ProcessGenerator {
        // Get patient with severity >= 4
        const request = store.get((p) => p.severity >= 4);
        yield request;
        retrieved = request.retrievedItem!;
      }

      new Process(sim, setup).start();
      new Process(sim, consumer).start();

      expect(retrieved).toEqual(patient2);
      expect(store.size).toBe(2);
    });

    it('should reject invalid filter (not a function)', () => {
      const sim = new Simulation();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const store = new Store<any>(sim, 100);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      expect(() => store.get('not a function' as any)).toThrow(
        ValidationError
      );
    });
  });

  describe('Queue Management', () => {
    it('should fulfill put request when space becomes available', () => {
      const sim = new Simulation();
      const store = new Store<string>(sim, 2);
      let putCompleted = false;

      function* producer(): ProcessGenerator {
        yield store.put('item1');
        yield store.put('item2');
        yield store.put('item3'); // Will block
        putCompleted = true;
      }

      function* consumer(): ProcessGenerator {
        yield* timeout(5);
        const request = store.get();
        yield request; // Free space
      }

      new Process(sim, producer).start();
      new Process(sim, consumer).start();

      sim.run(10);

      expect(putCompleted).toBe(true);
      expect(store.size).toBe(2);
    });

    it('should fulfill get request when item becomes available', () => {
      const sim = new Simulation();
      const store = new Store<number>(sim, 100);
      let retrieved: number | undefined;

      function* consumer(): ProcessGenerator {
        const request = store.get();
        yield request;
        retrieved = request.retrievedItem!;
      }

      function* producer(): ProcessGenerator {
        yield* timeout(5);
        yield store.put(42);
      }

      new Process(sim, consumer).start();
      new Process(sim, producer).start();

      sim.run(10);

      expect(retrieved).toBe(42);
    });

    it('should process queued get requests in FIFO order', () => {
      const sim = new Simulation();
      const store = new Store<number>(sim, 100);
      const completionOrder: number[] = [];

      function* consumer(id: number): ProcessGenerator {
        const request = store.get();
        yield request;
        completionOrder.push(id);
      }

      // Queue 3 consumers
      new Process(sim, () => consumer(1)).start();
      new Process(sim, () => consumer(2)).start();
      new Process(sim, () => consumer(3)).start();

      expect(store.getQueueLength).toBe(3);

      // Producer adds items
      function* producer(): ProcessGenerator {
        yield* timeout(5);
        yield store.put(100);
        yield store.put(200);
        yield store.put(300);
      }

      new Process(sim, producer).start();
      sim.run(10);

      expect(completionOrder).toEqual([1, 2, 3]);
      expect(store.size).toBe(0);
    });

    it('should handle multiple filtered gets waiting', () => {
      const sim = new Simulation();
      const store = new Store<Pallet>(sim, 100);
      const retrieved: string[] = [];

      function* consumerNYC(): ProcessGenerator {
        const request = store.get((p) => p.destination === 'NYC');
        yield request;
        retrieved.push(request.retrievedItem!.id);
      }

      function* consumerLA(): ProcessGenerator {
        const request = store.get((p) => p.destination === 'LA');
        yield request;
        retrieved.push(request.retrievedItem!.id);
      }

      // Start consumers (both will block)
      new Process(sim, consumerNYC).start();
      new Process(sim, consumerLA).start();

      expect(store.getQueueLength).toBe(2);

      // Add items
      function* producer(): ProcessGenerator {
        yield* timeout(5);
        yield store.put({ id: 'P1', destination: 'LA', weight: 500 });
        yield store.put({ id: 'P2', destination: 'NYC', weight: 600 });
      }

      new Process(sim, producer).start();
      sim.run(10);

      expect(retrieved.length).toBe(2);
      expect(retrieved).toContain('P1');
      expect(retrieved).toContain('P2');
    });

    it('should handle mixed put and get queues', () => {
      const sim = new Simulation();
      const store = new Store<string>(sim, 1);

      function* producer(): ProcessGenerator {
        yield store.put('item1');
        yield store.put('item2'); // Will block
      }

      function* consumer(): ProcessGenerator {
        yield store.get(); // Will block initially, then get item1
      }

      new Process(sim, producer).start();
      new Process(sim, consumer).start();

      sim.run(1);

      // Consumer got item1, producer added item2
      expect(store.size).toBe(1);
      expect(store.putQueueLength).toBe(0);
      expect(store.getQueueLength).toBe(0);
    });
  });

  describe('Statistics', () => {
    it('should track total puts and gets', () => {
      const sim = new Simulation();
      const store = new Store<number>(sim, 100);

      function* process(): ProcessGenerator {
        yield store.put(1);
        yield store.put(2);
        yield store.get();
        yield store.put(3);
        yield store.get();
      }

      new Process(sim, process).start();

      const stats = store.stats;
      expect(stats.totalPuts).toBe(3);
      expect(stats.totalGets).toBe(2);
    });

    it('should track average size over time', () => {
      const sim = new Simulation();
      const store = new Store<number>(sim, 100);

      function* process(): ProcessGenerator {
        yield* timeout(10); // Empty for 10 time units
        yield store.put(1);
        yield store.put(2);
        yield* timeout(10); // Size 2 for 10 time units
      }

      new Process(sim, process).start();
      sim.run(20);

      const stats = store.stats;
      // Average: (0*10 + 2*10) / 20 = 1
      expect(stats.averageSize).toBeCloseTo(1, 1);
    });

    it('should track wait times', () => {
      const sim = new Simulation();
      const store = new Store<number>(sim, 100);

      function* consumer(): ProcessGenerator {
        const request = store.get();
        yield request; // Will wait 5 time units
      }

      function* producer(): ProcessGenerator {
        yield* timeout(5);
        yield store.put(42);
      }

      new Process(sim, consumer).start();
      new Process(sim, producer).start();

      sim.run(10);

      const stats = store.stats;
      expect(stats.averageGetWaitTime).toBe(5);
    });

    it('should track queue lengths over time', () => {
      const sim = new Simulation();
      const store = new Store<number>(sim, 100);

      function* consumer(): ProcessGenerator {
        const request = store.get(); // Will queue
        yield request;
      }

      function* producer(): ProcessGenerator {
        yield* timeout(10);
        yield store.put(42); // Fulfill at t=10
      }

      new Process(sim, consumer).start();
      new Process(sim, producer).start();

      sim.run(20);

      const stats = store.stats;
      // Get queue length 1 for 10 time units, then 0
      expect(stats.averageGetQueueLength).toBeCloseTo(0.5, 1);
    });
  });

  describe('Type Safety and Generics', () => {
    it('should enforce type safety with generics', () => {
      const sim = new Simulation();
      const store = new Store<Pallet>(sim, 100);

      const pallet: Pallet = { id: 'P1', destination: 'NYC', weight: 500 };

      function* process(): ProcessGenerator {
        yield store.put(pallet);
        const request = store.get();
        yield request;
        const retrieved: Pallet = request.retrievedItem!;
        expect(retrieved.id).toBe('P1');
      }

      new Process(sim, process).start();
    });

    it('should work with primitive types', () => {
      const sim = new Simulation();
      const store = new Store<string>(sim, 10);

      function* process(): ProcessGenerator {
        yield store.put('hello');
        yield store.put('world');
        const req1 = store.get();
        yield req1;
        expect(req1.retrievedItem).toBe('hello');
      }

      new Process(sim, process).start();
    });

    it('should work with any type when not specified', () => {
      const sim = new Simulation();
      const store = new Store(sim, 10);

      function* process(): ProcessGenerator {
        yield store.put({ custom: 'object' });
        yield store.put([1, 2, 3]);
        yield store.put('string');
        const req = store.get();
        yield req;
        expect(req.retrievedItem).toEqual({ custom: 'object' });
      }

      new Process(sim, process).start();
    });
  });

  describe('Edge Cases', () => {
    it('should handle store at full capacity', () => {
      const sim = new Simulation();
      const store = new Store<number>(sim, 3);

      function* producer(): ProcessGenerator {
        yield store.put(1);
        yield store.put(2);
        yield store.put(3);
      }

      new Process(sim, producer).start();

      expect(store.size).toBe(3);
      expect(store.available).toBe(0);

      function* blockedProducer(): ProcessGenerator {
        yield store.put(4);
      }

      new Process(sim, blockedProducer).start();
      expect(store.putQueueLength).toBe(1);
    });

    it('should handle empty store', () => {
      const sim = new Simulation();
      const store = new Store<number>(sim, 100);

      expect(store.size).toBe(0);
      expect(store.items).toEqual([]);

      function* consumer(): ProcessGenerator {
        const request = store.get();
        yield request;
      }

      new Process(sim, consumer).start();
      expect(store.getQueueLength).toBe(1);
    });

    it('should handle rapid put/get alternation', () => {
      const sim = new Simulation();
      const store = new Store<number>(sim, 100);
      let count = 0;

      function* process(): ProcessGenerator {
        for (let i = 0; i < 10; i++) {
          yield store.put(i);
          const request = store.get();
          yield request;
          count++;
        }
      }

      new Process(sim, process).start();

      expect(count).toBe(10);
      expect(store.size).toBe(0);
    });

    it('should handle exact capacity operations', () => {
      const sim = new Simulation();
      const store = new Store<string>(sim, 5);

      function* fillStore(): ProcessGenerator {
        for (let i = 0; i < 5; i++) {
          yield store.put(`item${i}`);
        }
      }

      new Process(sim, fillStore).start();

      expect(store.size).toBe(5);
      expect(store.available).toBe(0);

      function* emptyStore(): ProcessGenerator {
        for (let i = 0; i < 5; i++) {
          yield store.get();
        }
      }

      new Process(sim, emptyStore).start();

      expect(store.size).toBe(0);
      expect(store.available).toBe(5);
    });

    it('should maintain items array integrity', () => {
      const sim = new Simulation();
      const store = new Store<Pallet>(sim, 10);

      const p1: Pallet = { id: 'P1', destination: 'NYC', weight: 500 };
      const p2: Pallet = { id: 'P2', destination: 'LA', weight: 600 };
      const p3: Pallet = { id: 'P3', destination: 'CHI', weight: 450 };

      function* setup(): ProcessGenerator {
        yield store.put(p1);
        yield store.put(p2);
        yield store.put(p3);
      }

      new Process(sim, setup).start();

      // Get middle item
      function* getMiddle(): ProcessGenerator {
        const request = store.get((p) => p.id === 'P2');
        yield request;
      }

      new Process(sim, getMiddle).start();

      expect(store.size).toBe(2);
      expect(store.items).toEqual([p1, p3]); // P2 removed
    });
  });

  describe('Items Array Access', () => {
    it('should provide read-only items array', () => {
      const sim = new Simulation();
      const store = new Store<number>(sim, 10);

      function* setup(): ProcessGenerator {
        yield store.put(1);
        yield store.put(2);
        yield store.put(3);
      }

      new Process(sim, setup).start();

      const items = store.items;
      expect(items).toEqual([1, 2, 3]);
      expect(Array.isArray(items)).toBe(true);
    });

    it('should return shallow copy (modifications do not affect store directly)', () => {
      const sim = new Simulation();
      const store = new Store<number>(sim, 10);

      function* setup(): ProcessGenerator {
        yield store.put(1);
        yield store.put(2);
      }

      new Process(sim, setup).start();

      const items = store.items as number[];
      items.push(3); // Modify the copy

      // Store should still have only 2 items
      expect(store.items.length).toBe(2);
      expect(store.items).toEqual([1, 2]);
    });
  });
});
