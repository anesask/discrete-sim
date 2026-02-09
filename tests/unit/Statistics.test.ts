import { describe, it, expect, beforeEach } from 'vitest';
import { Simulation } from '../../src/core/Simulation';
import { Statistics } from '../../src/statistics/Statistics';

describe('Statistics', () => {
  let sim: Simulation;
  let stats: Statistics;

  beforeEach(() => {
    sim = new Simulation();
    stats = new Statistics(sim);
  });

  describe('initialization', () => {
    it('should create statistics collector', () => {
      expect(stats).toBeDefined();
    });

    it('should return 0 for unrecorded metrics', () => {
      expect(stats.getAverage('unknown')).toBe(0);
      expect(stats.getCount('unknown')).toBe(0);
      expect(stats.getTimeseries('unknown')).toEqual([]);
    });
  });

  describe('time-weighted averages', () => {
    it('should record and retrieve simple value', () => {
      stats.recordValue('metric', 10);
      expect(stats.getAverage('metric')).toBe(10);
    });

    it('should calculate time-weighted average', () => {
      // Record value 5 at time 0
      stats.recordValue('queue', 5);

      // Advance to time 10
      sim.schedule(10, () => {
        // Record value 15 at time 10
        stats.recordValue('queue', 15);
      });

      sim.run();

      // Average = (5 * 10 + 15 * 0) / 10 = 5
      expect(stats.getAverage('queue')).toBe(5);
    });

    it('should handle multiple value changes', () => {
      stats.recordValue('queue', 0);

      sim.schedule(5, () => {
        stats.recordValue('queue', 10);
      });

      sim.schedule(15, () => {
        stats.recordValue('queue', 5);
      });

      sim.schedule(20, () => {
        stats.recordValue('queue', 0);
      });

      sim.run();

      // Average = (0*5 + 10*10 + 5*5 + 0*0) / 20 = 125/20 = 6.25
      expect(stats.getAverage('queue')).toBe(6.25);
    });

    it('should track multiple metrics independently', () => {
      stats.recordValue('metric-a', 10);
      stats.recordValue('metric-b', 20);

      sim.schedule(5, () => {
        stats.recordValue('metric-a', 5);
        stats.recordValue('metric-b', 30);
      });

      sim.run(10);

      // Average = (10*5 + 5*5) / 10 = 75/10 = 7.5
      expect(stats.getAverage('metric-a')).toBe(7.5);
      // Average = (20*5 + 30*5) / 10 = 250/10 = 25
      expect(stats.getAverage('metric-b')).toBe(25);
    });

    it('should handle zero time correctly', () => {
      stats.recordValue('metric', 42);
      expect(stats.getAverage('metric')).toBe(42);
    });

    it('should handle negative values', () => {
      stats.recordValue('balance', -10);

      sim.schedule(5, () => {
        stats.recordValue('balance', 20);
      });

      sim.run(10);

      // Average = (-10*5 + 20*5) / 10 = 50/10 = 5
      expect(stats.getAverage('balance')).toBe(5);
    });
  });

  describe('counters', () => {
    it('should increment counter by default amount', () => {
      stats.increment('events');
      expect(stats.getCount('events')).toBe(1);
    });

    it('should increment counter by custom amount', () => {
      stats.increment('items', 5);
      expect(stats.getCount('items')).toBe(5);
    });

    it('should accumulate increments', () => {
      stats.increment('counter');
      stats.increment('counter');
      stats.increment('counter', 3);
      expect(stats.getCount('counter')).toBe(5);
    });

    it('should track multiple counters independently', () => {
      stats.increment('counter-a', 10);
      stats.increment('counter-b', 20);
      stats.increment('counter-a', 5);

      expect(stats.getCount('counter-a')).toBe(15);
      expect(stats.getCount('counter-b')).toBe(20);
    });

    it('should handle negative increments', () => {
      stats.increment('balance', 100);
      stats.increment('balance', -30);
      expect(stats.getCount('balance')).toBe(70);
    });
  });

  describe('timeseries', () => {
    it('should not record timeseries by default', () => {
      stats.recordValue('metric', 10);
      expect(stats.getTimeseries('metric')).toEqual([]);
    });

    it('should record timeseries when enabled', () => {
      stats.enableTimeseries('metric');
      stats.recordValue('metric', 10);

      sim.schedule(5, () => {
        stats.recordValue('metric', 20);
      });

      sim.run();

      const timeseries = stats.getTimeseries('metric');
      expect(timeseries).toEqual([
        { time: 0, value: 10 },
        { time: 5, value: 20 },
      ]);
    });

    it('should stop recording when disabled', () => {
      stats.enableTimeseries('metric');
      stats.recordValue('metric', 10);

      stats.disableTimeseries('metric');

      sim.schedule(5, () => {
        stats.recordValue('metric', 20);
      });

      sim.run();

      const timeseries = stats.getTimeseries('metric');
      expect(timeseries).toEqual([{ time: 0, value: 10 }]);
    });

    it('should record multiple metrics independently', () => {
      stats.enableTimeseries('metric-a');
      stats.recordValue('metric-a', 1);
      stats.recordValue('metric-b', 100);

      const timeseriesA = stats.getTimeseries('metric-a');
      const timeseriesB = stats.getTimeseries('metric-b');

      expect(timeseriesA).toEqual([{ time: 0, value: 1 }]);
      expect(timeseriesB).toEqual([]);
    });
  });

  describe('export to JSON', () => {
    it('should export empty statistics', () => {
      const json = stats.toJSON();
      expect(json).toEqual({
        simulationTime: 0,
        averages: {},
        counters: {},
        timeseries: {},
        samples: {}, // Added in v0.1.2
      });
    });

    it('should export all statistics types', () => {
      stats.recordValue('avg-metric', 10);
      stats.increment('counter-metric', 5);
      stats.enableTimeseries('ts-metric');
      stats.recordValue('ts-metric', 20);

      sim.schedule(5, () => {
        stats.recordValue('avg-metric', 20);
        stats.increment('counter-metric', 3);
        stats.recordValue('ts-metric', 30);
      });

      sim.run(10);

      const json = stats.toJSON() as {
        simulationTime: number;
        averages: Record<string, number>;
        counters: Record<string, number>;
        timeseries: Record<string, { time: number; value: number }[]>;
      };

      expect(json.simulationTime).toBe(10);
      // Average = (10*5 + 20*5) / 10 = 15
      expect(json.averages['avg-metric']).toBe(15);
      expect(json.counters['counter-metric']).toBe(8);
      expect(json.timeseries['ts-metric']).toEqual([
        { time: 0, value: 20 },
        { time: 5, value: 30 },
      ]);
    });
  });

  describe('export to CSV', () => {
    it('should export empty statistics', () => {
      const csv = stats.toCSV();
      expect(csv).toContain('# Simulation Statistics');
      expect(csv).toContain('Simulation Time,0');
    });

    it('should export averages section', () => {
      stats.recordValue('queue-length', 5);
      const csv = stats.toCSV();

      expect(csv).toContain('# Time-Weighted Averages');
      expect(csv).toContain('Metric,Average');
      expect(csv).toContain('queue-length,5');
    });

    it('should export counters section', () => {
      stats.increment('customers', 10);
      const csv = stats.toCSV();

      expect(csv).toContain('# Counters');
      expect(csv).toContain('Metric,Count');
      expect(csv).toContain('customers,10');
    });

    it('should export timeseries section', () => {
      stats.enableTimeseries('queue');
      stats.recordValue('queue', 5);

      sim.schedule(10, () => {
        stats.recordValue('queue', 10);
      });

      sim.run();

      const csv = stats.toCSV();

      expect(csv).toContain('# Timeseries: queue');
      expect(csv).toContain('Time,Value');
      expect(csv).toContain('0,5');
      expect(csv).toContain('10,10');
    });

    it('should export all sections together', () => {
      stats.recordValue('avg-metric', 10);
      stats.increment('counter-metric', 5);
      stats.enableTimeseries('ts-metric');
      stats.recordValue('ts-metric', 20);

      const csv = stats.toCSV();

      expect(csv).toContain('# Simulation Statistics');
      expect(csv).toContain('# Time-Weighted Averages');
      expect(csv).toContain('# Counters');
      expect(csv).toContain('# Timeseries');
    });
  });

  describe('reset', () => {
    it('should clear all statistics', () => {
      stats.recordValue('metric', 10);
      stats.increment('counter', 5);
      stats.enableTimeseries('ts');
      stats.recordValue('ts', 20);

      stats.reset();

      expect(stats.getAverage('metric')).toBe(0);
      expect(stats.getCount('counter')).toBe(0);
      expect(stats.getTimeseries('ts')).toEqual([]);
    });

    it('should preserve timeseries settings after reset', () => {
      stats.enableTimeseries('metric');
      stats.recordValue('metric', 10);

      stats.reset();

      // Timeseries should still be enabled
      stats.recordValue('metric', 20);
      expect(stats.getTimeseries('metric')).toEqual([{ time: 0, value: 20 }]);
    });
  });

  describe('integration with simulation', () => {
    it('should track resource utilization over time', () => {
      // Simulate resource with varying utilization
      stats.recordValue('utilization', 0);

      sim.schedule(5, () => stats.recordValue('utilization', 1)); // Full at t=5
      sim.schedule(15, () => stats.recordValue('utilization', 0.5)); // Half at t=15
      sim.schedule(25, () => stats.recordValue('utilization', 0)); // Empty at t=25

      sim.run(30);

      // Average = (0*5 + 1*10 + 0.5*10 + 0*5) / 30 = 15/30 = 0.5
      expect(stats.getAverage('utilization')).toBeCloseTo(0.5, 5);
    });

    it('should track events throughout simulation', () => {
      // Count arrivals and departures
      for (let i = 0; i < 10; i++) {
        sim.schedule(i * 2, () => stats.increment('arrivals'));
        sim.schedule(i * 2 + 1, () => stats.increment('departures'));
      }

      sim.run(20);

      expect(stats.getCount('arrivals')).toBe(10);
      expect(stats.getCount('departures')).toBe(10);
    });
  });

  describe('warm-up period', () => {
    it('should set and get warm-up period', () => {
      stats.setWarmupPeriod(100);
      expect(stats.getWarmupPeriod()).toBe(100);
    });

    it('should throw error for negative warm-up period', () => {
      expect(() => stats.setWarmupPeriod(-1)).toThrow(
        'warmup period end time must be non-negative'
      );
    });

    it('should correctly identify if in warm-up', () => {
      stats.setWarmupPeriod(50);

      expect(stats.isInWarmup()).toBe(true); // time = 0

      sim.schedule(30, () => {
        expect(stats.isInWarmup()).toBe(true); // time = 30
      });

      sim.schedule(60, () => {
        expect(stats.isInWarmup()).toBe(false); // time = 60
      });

      sim.run();
    });

    it('should exclude warm-up period from time-weighted average', () => {
      stats.setWarmupPeriod(10);

      // Record value 10 at time 0 (warm-up)
      stats.recordValue('metric', 10);

      sim.schedule(10, () => {
        // At time 10 (end of warm-up), record value 20
        stats.recordValue('metric', 20);
      });

      sim.schedule(20, () => {
        // At time 20, still value 20
        // Average should be 20 (only time 10-20 counts)
        const avg = stats.getAverage('metric');
        expect(avg).toBe(20);
      });

      sim.run();
    });

    it('should handle warm-up period with multiple values', () => {
      stats.setWarmupPeriod(10);

      // Warm-up: value 5 from time 0-10 (excluded)
      stats.recordValue('queue', 5);

      sim.schedule(10, () => {
        // After warm-up: value 10 from time 10-20
        stats.recordValue('queue', 10);
      });

      sim.schedule(20, () => {
        // After warm-up: value 20 from time 20-30
        stats.recordValue('queue', 20);
      });

      sim.schedule(30, () => {
        // Average should be (10*10 + 20*10) / 20 = 15
        const avg = stats.getAverage('queue');
        expect(avg).toBe(15);
      });

      sim.run();
    });

    it('should exclude warm-up period from timeseries', () => {
      stats.enableTimeseries('metric');
      stats.setWarmupPeriod(10);

      stats.recordValue('metric', 5); // time 0 - should be excluded

      sim.schedule(5, () => {
        stats.recordValue('metric', 10); // time 5 - should be excluded
      });

      sim.schedule(10, () => {
        stats.recordValue('metric', 15); // time 10 - should be included
      });

      sim.schedule(15, () => {
        stats.recordValue('metric', 20); // time 15 - should be included
      });

      sim.run(20);

      const timeseries = stats.getTimeseries('metric');
      expect(timeseries.length).toBe(2);
      expect(timeseries[0]).toEqual({ time: 10, value: 15 });
      expect(timeseries[1]).toEqual({ time: 15, value: 20 });
    });

    it('should handle warm-up period equal to simulation time', () => {
      stats.setWarmupPeriod(10);

      stats.recordValue('metric', 100);

      sim.schedule(10, () => {
        // At exactly warm-up end time
        const avg = stats.getAverage('metric');
        expect(avg).toBe(100); // Returns current value when duration is 0
      });

      sim.run();
    });

    it('should work with zero warm-up period (default behavior)', () => {
      // Default warm-up is 0
      expect(stats.getWarmupPeriod()).toBe(0);

      stats.recordValue('metric', 10);

      sim.schedule(10, () => {
        stats.recordValue('metric', 20);
      });

      sim.schedule(20, () => {
        // Average should be (10*10 + 20*10) / 20 = 15
        const avg = stats.getAverage('metric');
        expect(avg).toBe(15);
      });

      sim.run();
    });
  });
});
