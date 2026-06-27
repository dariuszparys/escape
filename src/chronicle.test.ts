import { describe, expect, test } from 'vitest';
import {
  createDefaultRunChronicle,
  loadRunChronicle,
  normalizeRunChronicle,
  recordRunChronicleEntry,
  saveRunChronicle,
} from './chronicle';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  length = 0;

  clear(): void {
    this.values.clear();
    this.length = this.values.size;
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
    this.length = this.values.size;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
    this.length = this.values.size;
  }
}

describe('run chronicle', () => {
  test('normalizes invalid saved data to defaults', () => {
    expect(normalizeRunChronicle({ runsCompleted: -4, bestDepth: 'bad' as unknown })).toEqual(
      createDefaultRunChronicle(),
    );
  });

  test('clamps bad numeric fields to non-negative integers', () => {
    expect(
      normalizeRunChronicle({
        runsCompleted: 2.8,
        escapes: -10,
        bestDepth: -3,
        bestGold: 12.9,
        bestEnemiesDefeated: -0.1,
        recent: [
          {
            runId: 'run-1',
            completedAt: '2026-06-27T00:00:00.000Z',
            seed: 'seed',
            dailyKey: null,
            escaped: true,
            depth: 8.9,
            enemiesDefeated: -4,
            gold: 3.2,
            emberReward: -10.1,
          },
        ],
      } as const),
    ).toEqual({
      runsCompleted: 2,
      escapes: 0,
      bestDepth: 0,
      bestGold: 12,
      bestEnemiesDefeated: 0,
      lastRunId: null,
      recent: [
        {
          runId: 'run-1',
          completedAt: '2026-06-27T00:00:00.000Z',
          seed: 'seed',
          dailyKey: null,
          escaped: true,
          depth: 8,
          enemiesDefeated: 0,
          gold: 3,
          emberReward: 0,
        },
      ],
    });
  });

  test('round-trips through save/load with a memory storage stub', () => {
    const storage = new MemoryStorage();
    const input = {
      runsCompleted: 2,
      escapes: 1,
      bestDepth: 9,
      bestGold: 7,
      bestEnemiesDefeated: 5,
      lastRunId: 'run-2',
      recent: [
        {
          runId: 'run-2',
          completedAt: '2026-06-27T12:00:00.000Z',
          seed: 'seed-2',
          dailyKey: '2026-06-27',
          escaped: false,
          depth: 7,
          enemiesDefeated: 2,
          gold: 5,
          emberReward: 10,
        },
      ],
    };

    saveRunChronicle(input, storage);
    expect(loadRunChronicle(storage)).toEqual(input);
  });

  test('records a completed run and updates max fields', () => {
    const base = createDefaultRunChronicle();
    const recorded = recordRunChronicleEntry(base, {
      runId: 'run-1',
      completedAt: '2026-06-27T00:00:00.000Z',
      seed: 'seed-1',
      dailyKey: null,
      escaped: true,
      depth: 5,
      enemiesDefeated: 4,
      gold: 12,
      emberReward: 6,
    });

    expect(recorded).toEqual({
      runsCompleted: 1,
      escapes: 1,
      bestDepth: 5,
      bestGold: 12,
      bestEnemiesDefeated: 4,
      lastRunId: 'run-1',
      recent: [
        {
          runId: 'run-1',
          completedAt: '2026-06-27T00:00:00.000Z',
          seed: 'seed-1',
          dailyKey: null,
          escaped: true,
          depth: 5,
          enemiesDefeated: 4,
          gold: 12,
          emberReward: 6,
        },
      ],
    });
  });

  test('is idempotent for the same run id', () => {
    const base = {
      ...createDefaultRunChronicle(),
      runsCompleted: 1,
      lastRunId: 'run-1',
      recent: [
        {
          runId: 'run-1',
          completedAt: '2026-06-27T00:00:00.000Z',
          seed: 'seed-1',
          dailyKey: null,
          escaped: true,
          depth: 5,
          enemiesDefeated: 2,
          gold: 10,
          emberReward: 6,
        },
      ],
    };

    expect(
      recordRunChronicleEntry(base, {
        runId: 'run-1',
        completedAt: '2026-06-27T00:00:00.500Z',
        seed: 'seed-1',
        dailyKey: null,
        escaped: true,
        depth: 99,
        enemiesDefeated: 20,
        gold: 50,
        emberReward: 8,
      }),
    ).toEqual(base);
  });

  test('keeps only the 10 most recent runs', () => {
    const runs = Array.from({ length: 11 }, (_, i) => ({
      runId: `run-${i}`,
      completedAt: new Date(2026, 5, i + 1).toISOString(),
      seed: `seed-${i}`,
      dailyKey: null,
      escaped: false,
      depth: i,
      enemiesDefeated: i,
      gold: i,
      emberReward: i,
    }));

    const chronicle = runs.reduce(
      (record, run) => recordRunChronicleEntry(record, run),
      createDefaultRunChronicle(),
    );

    expect(chronicle.recent.length).toBe(10);
    expect(chronicle.recent[0].runId).toBe('run-10');
    expect(chronicle.recent[9].runId).toBe('run-1');
  });
});
