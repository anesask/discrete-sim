import { describe, it, expect, beforeEach } from 'vitest';
import { Simulation } from '../../src/core/Simulation.js';
import { Process, timeout } from '../../src/core/Process.js';
import { Store } from '../../src/resources/Store.js';
import { Resource } from '../../src/resources/Resource.js';
import { Buffer } from '../../src/resources/Buffer.js';

interface Pallet {
  id: string;
  destination: string;
  weight: number;
}

interface Task {
  id: number;
  priority: number;
  duration: number;
}

describe('Store Integration Tests', () => {
  let sim: Simulation;

  beforeEach(() => {
    sim = new Simulation();
  });

  describe('Store + Resource Integration', () => {
    it('should coordinate store access with resource usage', () => {
      const warehouse = new Store<Pallet>(sim, 50, { name: 'Warehouse' });
      const forklift = new Resource(sim, 2, { name: 'Forklift' });
      const events: string[] = [];

      function* storeItem(pallet: Pallet) {
        events.push(`Store ${pallet.id} start`);
        yield forklift.request();
        yield* timeout(1);
        yield warehouse.put(pallet);
        forklift.release();
        events.push(`Store ${pallet.id} done`);
      }

      function* retrieveItem() {
        events.push('Retrieve start');
        yield forklift.request();
        const request = warehouse.get();
        yield request;
        yield* timeout(1);
        forklift.release();
        events.push(`Retrieve ${request.retrievedItem!.id} done`);
      }

      // Store 3 items
      new Process(sim, () => storeItem({ id: 'P1', destination: 'NYC', weight: 100 })).start();
      new Process(sim, () => storeItem({ id: 'P2', destination: 'LA', weight: 200 })).start();
      new Process(sim, () => storeItem({ id: 'P3', destination: 'CHI', weight: 150 })).start();

      // Retrieve 2 items
      sim.schedule(5, () => {
        new Process(sim, retrieveItem).start();
        new Process(sim, retrieveItem).start();
      });

      sim.run(20);

      expect(warehouse.size).toBe(1); // 3 stored - 2 retrieved
      expect(events.filter((e) => e.includes('done')).length).toBe(5);
    });

    it('should handle filtered retrieval with resource coordination', () => {
      const store = new Store<Pallet>(sim, 100);
      const resource = new Resource(sim, 1);
      const retrieved: string[] = [];

      function* addItem(pallet: Pallet) {
        yield resource.request();
        yield store.put(pallet);
        resource.release();
      }

      function* getByDestination(dest: string) {
        yield resource.request();
        const request = store.get((p) => p.destination === dest);
        yield request;
        retrieved.push(request.retrievedItem!.id);
        resource.release();
      }

      // Add items
      new Process(sim, () => addItem({ id: 'P1', destination: 'NYC', weight: 100 })).start();
      new Process(sim, () => addItem({ id: 'P2', destination: 'LA', weight: 200 })).start();
      new Process(sim, () => addItem({ id: 'P3', destination: 'NYC', weight: 150 })).start();

      // Get NYC items
      sim.schedule(2, () => {
        new Process(sim, () => getByDestination('NYC')).start();
        new Process(sim, () => getByDestination('NYC')).start();
      });

      sim.run(10);

      expect(retrieved.length).toBe(2);
      expect(retrieved).toContain('P1');
      expect(retrieved).toContain('P3');
      expect(store.size).toBe(1); // P2 remains
    });
  });

  describe('Store + Buffer Integration', () => {
    it('should combine distinct items (Store) with quantities (Buffer)', () => {
      interface Part {
        partNumber: string;
        quantity: number;
      }

      const partStore = new Store<Part>(sim, 50);
      const quantityBuffer = new Buffer(sim, 1000, { initialLevel: 500 });

      function* manufacturePart(partNum: string, qty: number) {
        // Get raw materials from buffer
        yield quantityBuffer.get(qty);
        yield* timeout(2);

        // Store finished part
        yield partStore.put({ partNumber: partNum, quantity: qty });
      }

      function* shipPart(partNum: string) {
        const request = partStore.get((p) => p.partNumber === partNum);
        yield request;
        const part = request.retrievedItem!;

        // Add back to buffer (recycle)
        yield quantityBuffer.put(part.quantity);
      }

      new Process(sim, () => manufacturePart('A100', 50)).start();
      new Process(sim, () => manufacturePart('B200', 75)).start();
      new Process(sim, () => manufacturePart('C300', 60)).start();

      sim.schedule(10, () => {
        new Process(sim, () => shipPart('B200')).start();
      });

      sim.run(15);

      expect(partStore.size).toBe(2); // A100 and C300 remain
      // Initial: 500, Get: 50+75+60=185, Put back: 75
      // Final: 500 - 185 + 75 = 390
      expect(quantityBuffer.level).toBe(390);
    });
  });

  describe('Complex Filtering Scenarios', () => {
    it('should handle multiple concurrent filtered gets', () => {
      const taskQueue = new Store<Task>(sim, 100);
      const completedTasks: number[] = [];

      function* addTask(task: Task) {
        yield taskQueue.put(task);
      }

      function* worker(priority: number) {
        const request = taskQueue.get((t) => t.priority === priority);
        yield request;
        const task = request.retrievedItem!;
        yield* timeout(task.duration);
        completedTasks.push(task.id);
      }

      // Add tasks with different priorities
      new Process(sim, () => addTask({ id: 1, priority: 1, duration: 1 })).start();
      new Process(sim, () => addTask({ id: 2, priority: 2, duration: 2 })).start();
      new Process(sim, () => addTask({ id: 3, priority: 1, duration: 1 })).start();
      new Process(sim, () => addTask({ id: 4, priority: 3, duration: 3 })).start();
      new Process(sim, () => addTask({ id: 5, priority: 2, duration: 2 })).start();

      // Start workers for each priority
      new Process(sim, () => worker(1)).start();
      new Process(sim, () => worker(1)).start();
      new Process(sim, () => worker(2)).start();
      new Process(sim, () => worker(2)).start();
      new Process(sim, () => worker(3)).start();

      sim.run(10);

      expect(completedTasks.length).toBe(5);
      expect(taskQueue.size).toBe(0);
    });

    it('should handle dynamic filter conditions', () => {
      const inventory = new Store<Pallet>(sim, 100);
      const shipped: Pallet[] = [];

      function* receive(pallet: Pallet) {
        yield inventory.put(pallet);
      }

      function* shipHeaviest() {
        if (inventory.items.length === 0) return;

        const heaviest = inventory.items.reduce((a, b) =>
          a.weight > b.weight ? a : b
        );

        const request = inventory.get((p) => p.id === heaviest.id);
        yield request;
        shipped.push(request.retrievedItem!);
      }

      // Add pallets
      new Process(sim, () => receive({ id: 'P1', destination: 'NYC', weight: 300 })).start();
      new Process(sim, () => receive({ id: 'P2', destination: 'LA', weight: 500 })).start();
      new Process(sim, () => receive({ id: 'P3', destination: 'CHI', weight: 200 })).start();

      // Ship heaviest
      sim.schedule(2, () => {
        new Process(sim, shipHeaviest).start();
      });

      sim.run(5);

      expect(shipped.length).toBe(1);
      expect(shipped[0]!.id).toBe('P2'); // Heaviest
      expect(inventory.size).toBe(2);
    });
  });

  describe('Multi-Store Workflows', () => {
    it('should handle assembly line with multiple stores', () => {
      const rawParts = new Store<string>(sim, 50);
      const assemblies = new Store<string>(sim, 50);
      const finished = new Store<string>(sim, 50);

      function* stage1Worker() {
        for (let i = 0; i < 5; i++) {
          const req = rawParts.get();
          yield req;
          yield* timeout(2);
          yield assemblies.put(`Assembly-${req.retrievedItem}`);
        }
      }

      function* stage2Worker() {
        for (let i = 0; i < 5; i++) {
          const req = assemblies.get();
          yield req;
          yield* timeout(3);
          yield finished.put(`Finished-${req.retrievedItem}`);
        }
      }

      // Add raw parts
      for (let i = 1; i <= 5; i++) {
        new Process(sim, function* () {
          yield rawParts.put(`Part-${i}`);
        }).start();
      }

      new Process(sim, stage1Worker).start();
      new Process(sim, stage2Worker).start();

      sim.run(30);

      expect(rawParts.size).toBe(0);
      expect(assemblies.size).toBe(0);
      expect(finished.size).toBe(5);
    });
  });

  describe('Statistics and Performance', () => {
    it('should track comprehensive statistics across workflow', () => {
      const store = new Store<Pallet>(sim, 100);
      let totalStored = 0;
      let totalRetrieved = 0;

      function* storer() {
        for (let i = 0; i < 10; i++) {
          yield* timeout(1);
          yield store.put({ id: `P${i}`, destination: 'NYC', weight: 100 });
          totalStored++;
        }
      }

      function* retriever() {
        for (let i = 0; i < 10; i++) {
          yield* timeout(1.5);
          const req = store.get();
          yield req;
          totalRetrieved++;
        }
      }

      new Process(sim, storer).start();
      new Process(sim, retriever).start();

      sim.run(20);

      const stats = store.stats;
      expect(stats.totalPuts).toBe(10);
      expect(stats.totalGets).toBe(10);
      expect(stats.averageSize).toBeGreaterThan(0);
      expect(totalStored).toBe(10);
      expect(totalRetrieved).toBe(10);
    });

    it('should handle large store with many items', () => {
      const store = new Store<number>(sim, 1000);

      function* bulkLoad() {
        for (let i = 0; i < 100; i++) {
          yield store.put(i);
        }
      }

      function* bulkRetrieve() {
        for (let i = 0; i < 50; i++) {
          const req = store.get((n) => n % 2 === 0); // Get even numbers
          yield req;
        }
      }

      new Process(sim, bulkLoad).start();
      sim.schedule(1, () => {
        new Process(sim, bulkRetrieve).start();
      });

      sim.run(5);

      expect(store.size).toBe(50); // 100 - 50
      expect(store.stats.totalPuts).toBe(100);
      expect(store.stats.totalGets).toBe(50);
    });
  });

  describe('Edge Cases and Robustness', () => {
    it('should handle rapid put/get with filters', () => {
      const store = new Store<{ id: number; type: string }>(sim, 100);
      let typeACount = 0;
      let typeBCount = 0;

      function* rapidPut() {
        for (let i = 0; i < 20; i++) {
          yield store.put({ id: i, type: i % 2 === 0 ? 'A' : 'B' });
          yield* timeout(0.1);
        }
      }

      function* getTypeA() {
        for (let i = 0; i < 10; i++) {
          const req = store.get((item) => item.type === 'A');
          yield req;
          typeACount++;
          yield* timeout(0.2);
        }
      }

      function* getTypeB() {
        for (let i = 0; i < 10; i++) {
          const req = store.get((item) => item.type === 'B');
          yield req;
          typeBCount++;
          yield* timeout(0.2);
        }
      }

      new Process(sim, rapidPut).start();
      new Process(sim, getTypeA).start();
      new Process(sim, getTypeB).start();

      sim.run(5);

      expect(typeACount).toBe(10);
      expect(typeBCount).toBe(10);
      expect(store.size).toBe(0);
    });

    it('should maintain item ordering integrity', () => {
      const store = new Store<number>(sim, 100);
      const retrieved: number[] = [];

      function* addNumbers() {
        for (let i = 1; i <= 10; i++) {
          yield store.put(i);
        }
      }

      function* getOddNumbers() {
        for (let i = 0; i < 5; i++) {
          const req = store.get((n) => n % 2 === 1);
          yield req;
          retrieved.push(req.retrievedItem!);
        }
      }

      new Process(sim, addNumbers).start();
      new Process(sim, getOddNumbers).start();

      sim.run(5);

      expect(retrieved).toEqual([1, 3, 5, 7, 9]); // In order
      expect(store.size).toBe(5); // Even numbers remain
    });
  });
});
