import { describe, it, expect } from 'vitest';
import {
  Simulation,
  Statistics,
  Experiment,
  ValidationError,
} from '../../src/index.js';
import { csvCell } from '../../src/utils/csv.js';

describe('CSV escaping', () => {
  it('csvCell quotes separators and neutralises formula prefixes', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell(3.5)).toBe('3.5');
    expect(csvCell(-2)).toBe('-2'); // numbers are never prefixed
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line\nbreak')).toBe('"line\nbreak"');
    expect(csvCell('=SUM(A1:A9)')).toBe("'=SUM(A1:A9)");
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-x')).toBe("'-x");
    expect(csvCell('@cmd')).toBe("'@cmd");
    expect(csvCell('=1,2')).toBe('"\'=1,2"');
  });

  it('Statistics.toCSV escapes metric names', () => {
    const sim = new Simulation();
    const stats = new Statistics(sim);
    stats.increment('=HYPERLINK("x")', 2);
    stats.recordValue('queue,length', 3);
    stats.enableSampleTracking('wait "time"');
    stats.recordSample('wait "time"', 1);
    const csv = stats.toCSV();
    expect(csv).toContain(`"'=HYPERLINK(""x"")",2`);
    expect(csv).toContain('"queue,length",3');
    expect(csv).toContain('"wait ""time""",1,');
  });

  it('Experiment CSVs escape parameter values and reject dangerous parameter names', () => {
    const exp = new Experiment<{ label: string }, { v: number }>((p) => ({
      v: p.label.length,
    }));
    const sweep = exp.sweep({ label: ['=cmd', 'a,b'] }, { replications: 1 });
    const lines = sweep.toCSV().split('\n');
    expect(lines[1]!.startsWith(`'=cmd,`)).toBe(true);
    expect(lines[2]!.startsWith('"a,b",')).toBe(true);
    expect(() =>
      // @ts-expect-error deliberately hostile key
      exp.sweep({ __proto__: [1] }, { replications: 1 })
    ).toThrow(ValidationError);
  });
});
