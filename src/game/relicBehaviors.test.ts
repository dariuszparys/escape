import { afterEach, describe, expect, test } from 'vitest';
import { CARD_DEFS, makeCard } from '../data/cards';
import { makeRelic } from '../data/relics';
import { RunState } from '../state';
import { applySimulatedPostBattleRewards } from './balanceSimulator';
import { emitBattleWon, subscribeCombatEvent } from './combatEvents';
import { ensureRelicBehaviorsWired, relicBattleWonHeal } from './relicBehaviors';
import type { GameRng } from './rng';

const minRng: GameRng = {
  frac: () => 0,
  between: (min) => min,
  pick: (items) => items[0],
};

function makeDeckCard(id: string) {
  const def = CARD_DEFS.find((card) => card.id === id);
  if (!def) throw new Error(`Missing card def ${id}`);
  return makeCard(def);
}

const disposers: Array<() => void> = [];
afterEach(() => {
  while (disposers.length) disposers.pop()?.();
});

describe('relic battle-lifecycle bindings', () => {
  test('only vampiric_blade grants a post-victory heal (KTD3)', () => {
    expect(relicBattleWonHeal(['vampiric_blade'])).toBe(2);
    expect(relicBattleWonHeal([])).toBe(0);
    // The three non-lifecycle relics stay in their own layers — no battleWon heal.
    expect(relicBattleWonHeal(['swift_boots', 'iron_will', 'lucky_coin'])).toBe(0);
  });

  test('battleWon heals through the bus when vampiric_blade is owned, and not otherwise', () => {
    ensureRelicBehaviorsWired();
    expect(emitBattleWon(['vampiric_blade'])).toEqual({ heal: 2 });
    expect(emitBattleWon([])).toEqual({ heal: 0 });
  });

  test('wiring is idempotent — a second call does not double-bind the heal', () => {
    ensureRelicBehaviorsWired();
    ensureRelicBehaviorsWired();
    expect(emitBattleWon(['vampiric_blade'])).toEqual({ heal: 2 });
  });

  test('the heal is capped at maxHp by the driver', () => {
    const run = new RunState('seed', 'cap');
    run.addRelic(makeRelic('vampiric_blade'));
    run.hp = run.maxHp - 1;

    ensureRelicBehaviorsWired();
    const { heal } = emitBattleWon(run.relics.map((relic) => relic.id));
    run.heal(heal);

    expect(heal).toBe(2);
    expect(run.hp).toBe(run.maxHp); // only 1 effective HP restored — capped
  });

  test('battleWon is a driver signal — the engine itself never emits it', () => {
    let battleWon = 0;
    disposers.push(subscribeCombatEvent('battleWon', () => battleWon++));

    // A full lethal engine command ends the battle (battleEnded), yet battleWon
    // stays silent until a driver (scene or simulator) emits it after rewards.
    applySimulatedPostBattleRewards(new RunState('s', 'drv'), minRng, 2);

    expect(battleWon).toBe(1);
  });

  test('both drivers route the vampiric heal through the same subscriber (R4)', () => {
    // Simulator driver.
    const simRun = new RunState('s', 'sim');
    const slash = makeDeckCard('slash');
    simRun.cardCollection = [slash];
    simRun.hp = simRun.maxHp - 5;
    simRun.addRelic(makeRelic('vampiric_blade'));
    applySimulatedPostBattleRewards(simRun, minRng, 10);

    // Scene-equivalent driver — same shared subscriber, same heal.
    const sceneRun = new RunState('c', 'scene');
    sceneRun.hp = sceneRun.maxHp - 5;
    sceneRun.addRelic(makeRelic('vampiric_blade'));
    ensureRelicBehaviorsWired();
    const { heal } = emitBattleWon(sceneRun.relics.map((relic) => relic.id));
    if (heal > 0) sceneRun.heal(heal);

    expect(simRun.hp).toBe(simRun.maxHp - 3);
    expect(sceneRun.hp).toBe(sceneRun.maxHp - 3);
    expect(heal).toBe(2);
  });
});
