import { describe, expect, test } from 'vitest';
import {
  BOSSES,
  ENEMIES,
  getEnemyTierForDepth,
  intentBonusForDepth,
  spawnBoss,
  spawnEnemy,
} from './enemies';
import { SequenceRng } from '../game/test-rng';
import {
  createIntentState,
  empowerPattern,
  intentView,
  resolveIntent,
  telegraphIntent,
  type IntentPattern,
} from '../game/intentPatterns';

describe('enemy generation', () => {
  test('enemy tiers follow dungeon depth', () => {
    expect(getEnemyTierForDepth(2)).toBe('weak');
    expect(getEnemyTierForDepth(4)).toBe('medium');
    expect(getEnemyTierForDepth(8)).toBe('strong');
  });

  test('spawns carry no card decks — behavior is the authored intent pattern (U9)', () => {
    const enemy = spawnEnemy(new SequenceRng([0]), 2);
    expect(enemy.def.pattern.cycle.length).toBeGreaterThan(0);
    const boss = spawnBoss(new SequenceRng([0]));
    expect(boss.def.boss).toBe(true);
    expect(boss.def.pattern.special?.interval).toBeGreaterThanOrEqual(2);
  });

  test('a stratum-2 boss has more HP than a stratum-1 boss (depth term applied)', () => {
    const stratum1 = spawnBoss(new SequenceRng([0]), 10);
    const stratum2 = spawnBoss(new SequenceRng([0]), 20);

    expect(stratum2.def.id).toBe(stratum1.def.id); // same boss def for a fair comparison
    expect(stratum2.hp).toBeGreaterThan(stratum1.hp);
    expect(stratum2.maxHp).toBe(stratum2.hp);
  });

  test('boss HP increases monotonically across deeper strata, deterministically', () => {
    const hpAt = (depth: number) => spawnBoss(new SequenceRng([0]), depth).hp;
    expect(hpAt(10)).toBeLessThan(hpAt(20));
    expect(hpAt(20)).toBeLessThan(hpAt(30));
    expect(hpAt(30)).toBe(hpAt(30)); // deterministic for a fixed seed/depth
  });

  test('the stratum-1 boss is unchanged by the depth term', () => {
    const boss = spawnBoss(new SequenceRng([0]), 10);
    expect(boss.hp).toBe(boss.def.baseHp);
  });

  test('normal enemy HP increases monotonically with depth across strata', () => {
    const hpAt = (depth: number) => spawnEnemy(new SequenceRng([0]), depth).hp;
    expect(hpAt(8)).toBeLessThan(hpAt(18));
    expect(hpAt(18)).toBeLessThan(hpAt(28));
  });
});

describe('intent patterns (U9, R5/R6)', () => {
  const RESOLVABLE_KINDS = ['damage', 'block', 'heal', 'status'];
  const all = [...ENEMIES, ...BOSSES];

  test('every enemy and boss carries a non-empty intent cycle', () => {
    for (const def of all) {
      expect(def.pattern.cycle.length, `${def.id} needs cycle entries`).toBeGreaterThan(0);
    }
  });

  test('every intent entry telegraphs and resolves only engine-legal effects', () => {
    for (const def of all) {
      const entries = [
        ...def.pattern.cycle,
        ...(def.pattern.special ? [def.pattern.special.entry] : []),
      ];
      for (const entry of entries) {
        expect(entry.telegraph.length, `${def.id}/${entry.name} telegraph`).toBeGreaterThan(0);
        expect(entry.effects.length, `${def.id}/${entry.name} effects`).toBeGreaterThan(0);
        for (const effect of entry.effects) {
          expect(RESOLVABLE_KINDS, `${def.id}/${entry.name} kind ${effect.kind}`).toContain(
            effect.kind,
          );
        }
      }
    }
  });

  test('boss specials fold into interval entries on the player-turn counter', () => {
    for (const def of BOSSES) {
      expect(def.pattern.special, `${def.id} keeps its interval special`).toBeDefined();
      expect(def.pattern.special!.interval).toBeGreaterThanOrEqual(2);
    }
  });

  test('archetype character survives: statuses stay on pressure enemies, block on bruisers', () => {
    const kindsOf = (id: string) =>
      new Set(
        [...ENEMIES, ...BOSSES]
          .find((def) => def.id === id)!
          .pattern.cycle.flatMap((entry) => entry.effects.map((effect) => effect.kind)),
      );
    expect(kindsOf('cultist')).toContain('status');
    expect(kindsOf('necromancer')).toContain('status');
    expect(kindsOf('armored_goblin')).toContain('block');
    expect(kindsOf('ogre')).toContain('block');
    expect(kindsOf('bandit')).toContain('damage');
    expect(kindsOf('knight')).toContain('damage');
  });
});

describe('depth-scaled intent damage (U13/R10)', () => {
  test('the bonus climbs through the first stratum and keeps climbing gently past it', () => {
    expect(intentBonusForDepth(2)).toBe(1);
    expect(intentBonusForDepth(6)).toBe(3);
    expect(intentBonusForDepth(10)).toBe(5);
    expect(intentBonusForDepth(30)).toBeGreaterThan(intentBonusForDepth(10));
    expect(intentBonusForDepth(30)).toBeLessThan(intentBonusForDepth(10) + 20);
  });

  test('spawned instances carry an empowered pattern; the authored def stays pristine', () => {
    const enemy = spawnEnemy(new SequenceRng([0]), 8);
    const defMax = Math.max(
      ...enemy.def.pattern.cycle.flatMap((entry) =>
        entry.effects.filter((effect) => effect.kind === 'damage').map((effect) => effect.amount),
      ),
    );
    const instanceMax = Math.max(
      ...enemy.pattern.cycle.flatMap((entry) =>
        entry.effects.filter((effect) => effect.kind === 'damage').map((effect) => effect.amount),
      ),
    );
    expect(instanceMax).toBe(defMax + intentBonusForDepth(8));
  });
});

describe('U4 medium/strong pattern rebuild (R1)', () => {
  const defById = (id: string) => [...ENEMIES, ...BOSSES].find((def) => def.id === id)!;

  /** Drives telegraphIntent/resolveIntent for turns 1..count, collecting the named entry seen each turn. */
  function namesOverTurns(pattern: IntentPattern, count: number): string[] {
    let state = createIntentState(pattern);
    const seen: string[] = [];
    for (let turn = 1; turn <= count; turn++) {
      state = telegraphIntent(state, turn);
      seen.push(state.current!.name);
      state = resolveIntent(state);
    }
    return seen;
  }

  describe('cycle wrap-around for rebuilt patterns without a special', () => {
    test('bandit: 4-entry cycle wraps cleanly', () => {
      expect(namesOverTurns(defById('bandit').pattern, 8)).toEqual([
        'Quick Slash',
        'Twin Strike',
        'Feint',
        'Lunge',
        'Quick Slash',
        'Twin Strike',
        'Feint',
        'Lunge',
      ]);
    });

    test('cultist: 4-entry cycle wraps cleanly', () => {
      expect(namesOverTurns(defById('cultist').pattern, 8)).toEqual([
        'Ember Curse',
        'Talon Rake',
        'Venom Spit',
        'Blood Sigil',
        'Ember Curse',
        'Talon Rake',
        'Venom Spit',
        'Blood Sigil',
      ]);
    });

    test('knight: 4-entry cycle wraps cleanly', () => {
      expect(namesOverTurns(defById('knight').pattern, 8)).toEqual([
        'Sword Combo',
        'Guarded Cut',
        'Riposte Flurry',
        'Heavy Blade',
        'Sword Combo',
        'Guarded Cut',
        'Riposte Flurry',
        'Heavy Blade',
      ]);
    });
  });

  describe('special intervals interleave without advancing (or resetting) the cycle', () => {
    test('armored_goblin: interval 3 against a 3-entry cycle drifts through every cycle position', () => {
      expect(namesOverTurns(defById('armored_goblin').pattern, 9)).toEqual([
        'Shield Up',
        'Shield Slam',
        'Shield Bash', // turn 3: special fires, cycle index untouched
        'Crush', // cycle resumes exactly where it left off
        'Shield Up',
        'Shield Bash', // turn 6
        'Shield Slam',
        'Crush',
        'Shield Bash', // turn 9
      ]);
    });

    test('necromancer: interval 4 against a 4-entry cycle', () => {
      expect(namesOverTurns(defById('necromancer').pattern, 9)).toEqual([
        'Soul Rot',
        'Dark Bolt',
        'Withering Hex',
        'Reap', // turn 4: special fires
        'Bone Ward', // cycle resumes at the entry it would have played next
        'Soul Rot',
        'Dark Bolt',
        'Reap', // turn 8
        'Withering Hex',
      ]);
    });

    test('ogre: interval 5 against a 3-entry cycle', () => {
      expect(namesOverTurns(defById('ogre').pattern, 10)).toEqual([
        'Brace Up',
        'Smash',
        'Guarded Smash',
        'Brace Up',
        'Earthbreaker', // turn 5: special fires
        'Smash',
        'Guarded Smash',
        'Brace Up',
        'Smash',
        'Earthbreaker', // turn 10
      ]);
    });
  });

  describe('empowerPattern boosts the correct heaviest hit for every rebuilt def', () => {
    test('bandit', () => {
      const empowered = empowerPattern(defById('bandit').pattern, 3);
      expect(empowered.cycle.map((entry) => entry.effects)).toEqual([
        [{ kind: 'damage', amount: 9 }], // Quick Slash: 6 -> 9
        [
          { kind: 'damage', amount: 3 },
          { kind: 'damage', amount: 7 }, // Twin Strike: heaviest is the 4, not the 3
        ],
        [
          { kind: 'damage', amount: 7 }, // Feint: 4 -> 7
          { kind: 'block', amount: 3 },
        ],
        [{ kind: 'damage', amount: 11 }], // Lunge: 8 -> 11
      ]);
    });

    test('cultist', () => {
      const empowered = empowerPattern(defById('cultist').pattern, 3);
      expect(empowered.cycle.map((entry) => entry.effects)).toEqual([
        [{ kind: 'status', status: 'burn', amount: 2, duration: 2 }], // Ember Curse: no damage, untouched
        [{ kind: 'damage', amount: 8 }], // Talon Rake: 5 -> 8
        [
          { kind: 'damage', amount: 6 }, // Venom Spit: 3 -> 6
          { kind: 'status', status: 'poison', amount: 2, duration: 2 },
        ],
        [
          { kind: 'status', status: 'poison', amount: 2, duration: 3 }, // Blood Sigil: no damage, untouched
          { kind: 'status', status: 'burn', amount: 2, duration: 2 },
        ],
      ]);
    });

    test('armored_goblin (cycle and special both empowered independently)', () => {
      const empowered = empowerPattern(defById('armored_goblin').pattern, 3);
      expect(empowered.cycle.map((entry) => entry.effects)).toEqual([
        [{ kind: 'block', amount: 6 }], // Shield Up: no damage, untouched
        [
          { kind: 'damage', amount: 8 }, // Shield Slam: 5 -> 8
          { kind: 'block', amount: 3 },
        ],
        [{ kind: 'damage', amount: 10 }], // Crush: 7 -> 10
      ]);
      expect(empowered.special!.entry.effects).toEqual([
        { kind: 'block', amount: 3 },
        { kind: 'damage', amount: 11 }, // Shield Bash: 8 -> 11
      ]);
    });

    test('knight', () => {
      const empowered = empowerPattern(defById('knight').pattern, 3);
      expect(empowered.cycle.map((entry) => entry.effects)).toEqual([
        [
          { kind: 'damage', amount: 7 }, // Sword Combo: tie broken in favor of the first hit, 4 -> 7
          { kind: 'damage', amount: 4 },
        ],
        [
          { kind: 'block', amount: 5 },
          { kind: 'damage', amount: 8 }, // Guarded Cut: 5 -> 8
        ],
        [
          { kind: 'damage', amount: 6 }, // Riposte Flurry: tie broken in favor of the first hit, 3 -> 6
          { kind: 'damage', amount: 3 },
          { kind: 'damage', amount: 3 },
        ],
        [{ kind: 'damage', amount: 13 }], // Heavy Blade: 10 -> 13
      ]);
    });

    test('necromancer (cycle and special both empowered independently)', () => {
      const empowered = empowerPattern(defById('necromancer').pattern, 3);
      expect(empowered.cycle.map((entry) => entry.effects)).toEqual([
        [{ kind: 'status', status: 'poison', amount: 3, duration: 2 }], // Soul Rot: no damage, untouched
        [{ kind: 'damage', amount: 10 }], // Dark Bolt: 7 -> 10
        [
          { kind: 'damage', amount: 7 }, // Withering Hex: 4 -> 7
          { kind: 'status', status: 'burn', amount: 2, duration: 2 },
        ],
        [
          { kind: 'block', amount: 4 }, // Bone Ward: no damage, untouched
          { kind: 'status', status: 'poison', amount: 2, duration: 2 },
        ],
      ]);
      expect(empowered.special!.entry.effects).toEqual([
        { kind: 'damage', amount: 9 }, // Reap: 6 -> 9
        { kind: 'status', status: 'poison', amount: 3, duration: 3 },
      ]);
    });

    test('ogre (cycle and special both empowered independently)', () => {
      const empowered = empowerPattern(defById('ogre').pattern, 3);
      expect(empowered.cycle.map((entry) => entry.effects)).toEqual([
        [{ kind: 'block', amount: 8 }], // Brace Up: no damage, untouched
        [{ kind: 'damage', amount: 12 }], // Smash: 9 -> 12
        [
          { kind: 'block', amount: 4 },
          { kind: 'damage', amount: 10 }, // Guarded Smash: 7 -> 10
        ],
      ]);
      expect(empowered.special!.entry.effects).toEqual([
        { kind: 'damage', amount: 15 }, // Earthbreaker: 12 -> 15
      ]);
    });
  });

  describe('telegraph honesty for the newly authored pure-status/pure-block entries (R5)', () => {
    test('Blood Sigil (cultist) is a pure status combo and reads like one', () => {
      const entry = defById('cultist').pattern.cycle.find((e) => e.name === 'Blood Sigil')!;
      expect(intentView(entry).kind).toBe('status');
      expect(entry.telegraph.toLowerCase()).toMatch(/rot|flame|venom|poison|burn|curse|sigil/);
    });

    test('Bone Ward (necromancer) is block-primary by intentView priority and its telegraph leads with defense', () => {
      const entry = defById('necromancer').pattern.cycle.find((e) => e.name === 'Bone Ward')!;
      const view = intentView(entry);
      expect(view.kind).toBe('block');
      expect(view.magnitude).toBe(4);
      expect(entry.telegraph.toLowerCase()).toMatch(/ward|guard|shield|brace|lattice/);
    });

    test('escalating specials telegraph as attacks, matching their damage-led effects', () => {
      expect(intentView(defById('armored_goblin').pattern.special!.entry).kind).toBe('attack');
      expect(intentView(defById('necromancer').pattern.special!.entry).kind).toBe('attack');
      expect(intentView(defById('ogre').pattern.special!.entry).kind).toBe('attack');
    });
  });
});
