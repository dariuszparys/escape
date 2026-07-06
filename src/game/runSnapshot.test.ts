import { describe, expect, test } from 'vitest';
import { makeNextRoom, makeStartRoom } from '../dungeon/rooms';
import { hasSafeTrapRoute, isLaneDriftTrap } from '../dungeon/traps';
import { RunState } from '../state';
import { SequenceRng } from './test-rng';
import {
  RUN_SNAPSHOT_STORAGE_KEY,
  clearRunSnapshot,
  loadRunSnapshot,
  normalizeRunSnapshot,
  saveRunSnapshot,
  serializeRunSnapshot,
  type HydratedRunSnapshot,
} from './runSnapshot';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  length = 0;

  clear(): void {
    this.values.clear();
    this.length = 0;
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

function snapshot(): HydratedRunSnapshot {
  const run = new RunState('seed', 'run-snapshot');
  run.depth = 6;
  const room = {
    depth: 6,
    event: 'chest' as const,
    openDoors: ['N' as const, 'E' as const],
    blockedDoor: 'S' as const,
    spikes: [],
    cleared: false,
  };
  return {
    version: 1,
    run,
    room,
    origin: { x: 720, y: -528 },
    player: { x: 1080, y: -240 },
    facing: 'N',
    rngState: '!state,1,2,3',
    roomBuildRngState: '!state,4,5,6',
    nextRoomOptions: {
      N: { room: makeStartRoom(), rngState: '!state,7,8,9' },
    },
  };
}

describe('run snapshots', () => {
  test('serializes and hydrates pure run and dungeon state', () => {
    const serialized = serializeRunSnapshot(snapshot());
    const hydrated = normalizeRunSnapshot(JSON.parse(JSON.stringify(serialized)));

    expect(hydrated).not.toBeNull();
    if (!hydrated) throw new Error('Expected hydrated snapshot');
    expect(hydrated.run).toBeInstanceOf(RunState);
    expect(hydrated.run.toJSON()).toEqual(snapshot().run.toJSON());
    expect(hydrated.room).toEqual(snapshot().room);
    expect(hydrated.nextRoomOptions.N?.room).toEqual(makeStartRoom());
  });

  test('saves, loads, and clears the single snapshot slot', () => {
    const storage = new MemoryStorage();

    saveRunSnapshot(snapshot(), storage);
    expect(storage.getItem(RUN_SNAPSHOT_STORAGE_KEY)).not.toBeNull();
    expect(loadRunSnapshot(storage)?.run.runId).toBe('run-snapshot');

    clearRunSnapshot(storage);
    expect(loadRunSnapshot(storage)).toBeNull();
  });

  test('rejects corrupt snapshots without throwing', () => {
    const storage = new MemoryStorage();
    storage.setItem(RUN_SNAPSHOT_STORAGE_KEY, '{bad json');

    expect(loadRunSnapshot(storage)).toBeNull();
    expect(normalizeRunSnapshot({ version: 1, run: {}, room: {} })).toBeNull();
  });

  test('preserves moving trap descriptors through serialization and hydration', () => {
    const trapRoom = makeNextRoom(
      new SequenceRng([0.95, 0.2, 0.7, 0.4, 0.8, 0.1, 0.6, 0.3, 0.9]),
      5,
      'N',
    );
    const original = snapshot();
    original.room = trapRoom;
    original.nextRoomOptions.E = {
      room: makeNextRoom(new SequenceRng([0.95, 0.3, 0.5, 0.7, 0.1, 0.9]), 6, 'E'),
      rngState: '!state,trap,next',
    };

    const hydrated = normalizeRunSnapshot(
      JSON.parse(JSON.stringify(serializeRunSnapshot(original))),
    );

    expect(hydrated).not.toBeNull();
    if (!hydrated) throw new Error('Expected hydrated trap snapshot');
    expect(hydrated.room.spikes).toEqual(trapRoom.spikes);
    expect(hydrated.room.spikes.filter(isLaneDriftTrap).length).toBeGreaterThan(
      hydrated.room.spikes.length / 2,
    );
    expect(hasSafeTrapRoute(hydrated.room.spikes, hydrated.room.blockedDoor ?? 'S')).toBe(true);
    expect(hydrated.nextRoomOptions.E?.room.spikes).toEqual(
      original.nextRoomOptions.E?.room.spikes,
    );
  });

  test('hydrates legacy static spike snapshots without motion metadata', () => {
    const raw = serializeRunSnapshot(snapshot());
    raw.room = {
      depth: 5,
      event: 'trap',
      openDoors: ['N', 'E', 'W'],
      blockedDoor: 'S',
      spikes: [
        { col: 4, row: 4 },
        { col: 9, row: 6 },
      ],
      cleared: false,
    };

    const hydrated = normalizeRunSnapshot(JSON.parse(JSON.stringify(raw)));

    expect(hydrated).not.toBeNull();
    expect(hydrated?.room.spikes).toEqual([
      { col: 4, row: 4 },
      { col: 9, row: 6 },
    ]);
  });

  test('rejects malformed moving trap descriptors without throwing', () => {
    const raw = serializeRunSnapshot(snapshot());
    raw.room = {
      depth: 5,
      event: 'trap',
      openDoors: ['N', 'E', 'W'],
      blockedDoor: 'S',
      spikes: [
        {
          col: 4,
          row: 4,
          motion: {
            kind: 'lane',
            axis: 'x',
            from: { col: 4, row: 4 },
            to: { col: 999, row: 4 },
            periodMs: 2600,
            phaseMs: 0,
          },
        },
      ],
      cleared: false,
    };

    expect(normalizeRunSnapshot(JSON.parse(JSON.stringify(raw)))).toBeNull();
  });
});
