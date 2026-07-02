import { describe, expect, test } from 'vitest';
import { ROOM_THREAT_CONTACT_RADIUS, TILE } from '../config';
import type { GameRng } from '../game/rng';
import { SequenceRng } from '../game/test-rng';
import {
  createRoomThreatState,
  evaluateRoomThreatEscape,
  isInsideRoomThreatBounds,
  updateRoomThreatState,
  battleStartModifier,
} from './roomThreat';

function countingRng(fractions: number[] = [0]): { rng: GameRng; fracCalls: () => number } {
  let calls = 0;
  const frac = () => {
    const value = fractions[Math.min(calls, fractions.length - 1)];
    calls++;
    return value;
  };
  const rng: GameRng = {
    frac() {
      return frac();
    },
    between(min: number) {
      return min;
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error('Cannot pick from an empty array.');
      return items[Math.min(items.length - 1, Math.floor(frac() * items.length))];
    },
  };

  return { rng, fracCalls: () => calls };
}

describe('room threat rules', () => {
  test('safe-entry grace prevents immediate battle readiness', () => {
    const state = createRoomThreatState(new SequenceRng([0]), {
      kind: 'normal',
      profileId: 'alert_chase',
      entryDoor: 'S',
    });
    const result = updateRoomThreatState(state, {
      player: state.position,
      deltaMs: 100,
    });

    expect(result.graceActive).toBe(true);
    expect(result.contactReady).toBe(false);
  });

  test('contact becomes battle-ready after grace', () => {
    const state = createRoomThreatState(new SequenceRng([0]), {
      kind: 'normal',
      profileId: 'ignore',
      entryDoor: 'S',
    });
    const player = { x: state.position.x + ROOM_THREAT_CONTACT_RADIUS - 2, y: state.position.y };
    const result = updateRoomThreatState(state, {
      player,
      deltaMs: 1000,
    });

    expect(result.graceActive).toBe(false);
    expect(result.contactReady).toBe(true);
  });

  test('normal unresolved encounters can be escaped without clearing or rewards', () => {
    expect(evaluateRoomThreatEscape('normal', false)).toEqual({
      allowed: true,
      clearThreat: false,
      grantBattleReward: false,
    });
  });

  test('boss encounters block escape until victory flow clears them', () => {
    expect(evaluateRoomThreatEscape('boss', false)).toEqual({
      allowed: false,
      clearThreat: false,
      grantBattleReward: false,
    });
  });

  test('safe placement avoids every entry-door breathing area', () => {
    const entryDoors = ['N', 'E', 'S', 'W'] as const;

    for (const entryDoor of entryDoors) {
      const state = createRoomThreatState(new SequenceRng([0]), {
        kind: 'normal',
        profileId: 'alert_chase',
        entryDoor,
      });

      if (entryDoor === 'N') expect(state.position.y).toBeGreaterThanOrEqual(TILE * 3);
      if (entryDoor === 'S') expect(state.position.y).toBeLessThanOrEqual(TILE * 7);
      if (entryDoor === 'W') expect(state.position.x).toBeGreaterThanOrEqual(TILE * 3);
      if (entryDoor === 'E') expect(state.position.x).toBeLessThanOrEqual(TILE * 11);
    }
  });

  test('alert-chase profile advances through readable intent states', () => {
    const state = createRoomThreatState(new SequenceRng([0]), {
      kind: 'normal',
      profileId: 'alert_chase',
      entryDoor: null,
    });

    const alert = updateRoomThreatState(state, {
      player: { x: state.position.x + TILE * 4, y: state.position.y },
      deltaMs: 1000,
    });
    const chase = updateRoomThreatState(alert.state, {
      player: { x: alert.state.position.x + TILE, y: alert.state.position.y },
      deltaMs: 100,
    });

    expect(alert.state.intent).toBe('alert');
    expect(chase.state.intent).toBe('chase');
  });

  test('initial placement and patrol target are deterministic for the same seed inputs', () => {
    const first = createRoomThreatState(new SequenceRng([0.35, 0.8]), {
      kind: 'normal',
      profileId: 'patrol',
      entryDoor: 'W',
    });
    const second = createRoomThreatState(new SequenceRng([0.35, 0.8]), {
      kind: 'normal',
      profileId: 'patrol',
      entryDoor: 'W',
    });

    expect(second.position).toEqual(first.position);
    expect(second.patrolTarget).toEqual(first.patrolTarget);
  });

  test('stationary profiles do not consume unused patrol randomness', () => {
    const normal = countingRng([0.4, 0.9]);
    const boss = countingRng([0.4, 0.9]);

    createRoomThreatState(normal.rng, {
      kind: 'normal',
      profileId: 'ignore',
      entryDoor: 'W',
    });
    createRoomThreatState(boss.rng, {
      kind: 'boss',
      profileId: 'boss_pressure',
      entryDoor: null,
    });

    expect(normal.fracCalls()).toBe(1);
    expect(boss.fracCalls()).toBe(0);
  });

  test('movement remains inside room bounds across patrol and chase updates', () => {
    let state = createRoomThreatState(new SequenceRng([0.6, 0.1]), {
      kind: 'normal',
      profileId: 'patrol',
      entryDoor: 'S',
    });

    for (let i = 0; i < 80; i++) {
      state = updateRoomThreatState(state, {
        player: { x: TILE * 14, y: TILE * 9 },
        deltaMs: 100,
      }).state;

      expect(isInsideRoomThreatBounds(state.position)).toBe(true);
    }
  });
});

describe('battleStartModifier (R17/KTD7)', () => {
  const state = (kind: 'normal' | 'boss', intent: 'ignore' | 'alert' | 'chase') => ({
    kind,
    intent,
  });

  test('an ambushed enemy grants no modifier', () => {
    expect(battleStartModifier(state('normal', 'ignore'))).toBeNull();
  });

  test('alerted and chasing enemies start guarded, chase harder than alert', () => {
    const alert = battleStartModifier(state('normal', 'alert'));
    const chase = battleStartModifier(state('normal', 'chase'));
    expect(alert?.enemyOpeningBlock).toBe(2);
    expect(chase?.enemyOpeningBlock).toBe(3);
  });

  test('boss pressure outranks every normal intent', () => {
    for (const intent of ['ignore', 'alert', 'chase'] as const) {
      expect(battleStartModifier(state('boss', intent))?.enemyOpeningBlock).toBe(4);
    }
  });
});
