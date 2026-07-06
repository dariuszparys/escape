import { describe, expect, test } from 'vitest';
import {
  BOSSES,
  ELITES,
  ENEMIES,
  MINIONS,
  eliteHpForDepth,
  enemyHpForDepth,
  getEnemyTierForDepth,
  intentBonusForDepth,
  spawnBoss,
  spawnElite,
  spawnEncounter,
  spawnEnemy,
  spawnMinionPack,
  spawnScenarioEncounter,
  toEngineEnemies,
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

  test('a room-20 boss has more HP than a room-10 boss (depth term applied)', () => {
    const room10 = spawnBoss(new SequenceRng([0]), 10);
    const room20 = spawnBoss(new SequenceRng([0]), 20);

    expect(room20.def.id).toBe(room10.def.id); // same boss def for a fair comparison
    expect(room20.hp).toBeGreaterThan(room10.hp);
    expect(room20.maxHp).toBe(room20.hp);
  });

  test('boss HP increases monotonically across later bosses, deterministically', () => {
    const hpAt = (depth: number) => spawnBoss(new SequenceRng([0]), depth).hp;
    expect(hpAt(10)).toBeLessThan(hpAt(20));
    expect(hpAt(20)).toBeLessThan(hpAt(30));
    expect(hpAt(30)).toBe(hpAt(30)); // deterministic for a fixed seed/depth
  });

  test('the room-10 boss is unchanged by the depth term', () => {
    const boss = spawnBoss(new SequenceRng([0]), 10);
    expect(boss.hp).toBe(boss.def.baseHp);
  });

  test('normal enemy HP increases monotonically with depth across the run', () => {
    const hpAt = (depth: number) => spawnEnemy(new SequenceRng([0]), depth).hp;
    expect(hpAt(8)).toBeLessThan(hpAt(18));
    expect(hpAt(18)).toBeLessThan(hpAt(28));
  });
});

describe('elite encounter class (U5/R2)', () => {
  test('spawnElite returns only elite-tier defs', () => {
    for (let i = 0; i < 20; i++) {
      const elite = spawnElite(new SequenceRng([i / 20]), 5);
      expect(elite.def.tier).toBe('elite');
      expect(ELITES.some((def) => def.id === elite.def.id)).toBe(true);
    }
  });

  test('spawnEnemy never returns an elite def (tier-ladder isolation)', () => {
    const eliteIds = new Set(ELITES.map((def) => def.id));
    for (let depth = 1; depth <= 12; depth++) {
      const enemy = spawnEnemy(new SequenceRng([0]), depth);
      expect(eliteIds.has(enemy.def.id)).toBe(false);
    }
    // Also true of the raw roster: ENEMIES and ELITES are disjoint arrays.
    for (const def of ENEMIES) {
      expect(def.tier).not.toBe('elite');
    }
  });

  test('3-5 elites are authored, each with a distinct id', () => {
    expect(ELITES.length).toBeGreaterThanOrEqual(3);
    expect(ELITES.length).toBeLessThanOrEqual(5);
    expect(new Set(ELITES.map((def) => def.id)).size).toBe(ELITES.length);
  });

  test('every elite carries HP clearly above strong-tier baseHp (34-40, U12)', () => {
    for (const def of ELITES) {
      expect(def.baseHp, `${def.id} baseHp`).toBeGreaterThan(40);
    }
  });

  test('elite HP scaling is steeper than normal-tier scaling at the same depth (slope, not just base)', () => {
    // Compare the per-depth DELTA each formula adds, holding baseHp fixed, so the
    // assertion is about the scaling slope rather than the (trivially higher) base.
    const baseHp = 25;
    const normalDelta = enemyHpForDepth(baseHp, 8) - enemyHpForDepth(baseHp, 2);
    const eliteDelta = eliteHpForDepth(baseHp, 8) - eliteHpForDepth(baseHp, 2);
    expect(eliteDelta).toBeGreaterThan(normalDelta);
  });

  test('elite HP increases monotonically with depth across the run', () => {
    const hpAt = (depth: number) => spawnElite(new SequenceRng([0]), depth).hp;
    expect(hpAt(8)).toBeLessThan(hpAt(18));
    expect(hpAt(18)).toBeLessThan(hpAt(28));
  });
});

describe('intent patterns (U9, R5/R6)', () => {
  // `strength` (self-buff ritual) joined the legal enemy effect kinds with the combat-depth
  // rework — single-hit bruisers/bosses ramp with it; multi-hit enemies deliberately do not.
  const RESOLVABLE_KINDS = ['damage', 'block', 'heal', 'status', 'strength'];
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

describe('elite intent patterns (U5, R2)', () => {
  // Deliberately NOT folded into the ENEMIES/BOSSES `all` array above: `shuffleCurse`
  // is legal here but must stay absent from that block's allowlist, since it is an
  // engine-routed rider consumed by turnEngine's shuffleIntoDrawPile hook, not a
  // per-target combat resolution kind like damage/block/heal/status.
  const RESOLVABLE_KINDS = ['damage', 'block', 'heal', 'status', 'shuffleCurse', 'strength'];

  test('every elite carries a non-empty intent cycle', () => {
    for (const def of ELITES) {
      expect(def.pattern.cycle.length, `${def.id} needs cycle entries`).toBeGreaterThan(0);
    }
  });

  test('every elite intent entry telegraphs and resolves only engine-legal effects', () => {
    for (const def of ELITES) {
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

  test('each concept elite is present with its signature mechanic', () => {
    const byId = (id: string) => ELITES.find((def) => def.id === id)!;

    // Bruiser: a scaling special heavier than every cycle hit (race check).
    const bruiser = byId('elite_berserker');
    expect(bruiser.pattern.special).toBeDefined();
    const bruiserCycleMax = Math.max(
      ...bruiser.pattern.cycle.flatMap((e) =>
        e.effects.filter((eff) => eff.kind === 'damage').map((eff) => eff.amount),
      ),
    );
    const bruiserSpecialDamage = bruiser.pattern
      .special!.entry.effects.filter((eff) => eff.kind === 'damage')
      .reduce((sum, eff) => sum + eff.amount, 0);
    expect(bruiserSpecialDamage).toBeGreaterThan(bruiserCycleMax);

    // Lurker: dormancy (block, no damage) turns plus one high-damage burst turn.
    const lurker = byId('elite_stalker');
    const lurkerKinds = lurker.pattern.cycle.map((e) => e.effects.map((eff) => eff.kind));
    expect(lurkerKinds.filter((kinds) => kinds.includes('block')).length).toBeGreaterThanOrEqual(2);
    expect(lurkerKinds.some((kinds) => kinds.includes('damage'))).toBe(true);

    // Hexer: a shuffleCurse rider alongside an honest status telegraph, in the same entry.
    const hexer = byId('elite_hexweaver');
    const curseEntry = hexer.pattern.cycle.find((e) =>
      e.effects.some((eff) => eff.kind === 'shuffleCurse'),
    )!;
    expect(curseEntry).toBeDefined();
    expect(curseEntry.effects.some((eff) => eff.kind === 'status')).toBe(true);
    expect(intentView(curseEntry).kind).toBe('status'); // honest telegraph, shuffleCurse doesn't hijack it

    // Leech: heal effects riding alongside damage (self-targeted heal-on-hit).
    const leech = byId('elite_bloodleech');
    const leechKinds = leech.pattern.cycle.flatMap((e) => e.effects.map((eff) => eff.kind));
    expect(leechKinds).toContain('heal');
    expect(leechKinds).toContain('damage');

    // Duelist (optional 5th): every entry mixes block-and-strike.
    const duelist = ELITES.find((def) => def.id === 'elite_duelist');
    if (duelist) {
      for (const entry of duelist.pattern.cycle) {
        const kinds = entry.effects.map((eff) => eff.kind);
        expect(kinds, `${entry.name} should mix block+damage`).toContain('block');
        expect(kinds).toContain('damage');
      }
    }
  });
});

describe('depth-scaled intent damage (U13/R10)', () => {
  test('the bonus climbs through the first decade, then resets lower and climbs gently', () => {
    // Weak tier (depths 1-3) stays gentle; the medium tier on gets a flat +2 "punch" so fights
    // cost real HP and a decade accumulates attrition (combat-depth rebaseline).
    expect(intentBonusForDepth(2)).toBe(1);
    expect(intentBonusForDepth(6)).toBe(5);
    expect(intentBonusForDepth(10)).toBe(7);
    expect(intentBonusForDepth(11)).toBeLessThan(intentBonusForDepth(10));
    expect(intentBonusForDepth(100)).toBeGreaterThan(intentBonusForDepth(11));
    expect(intentBonusForDepth(100)).toBeLessThan(intentBonusForDepth(10) + 1);
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
        'Cinder Curse',
        'Talon Rake',
        'Venom Spit',
        'Blood Sigil',
        'Cinder Curse',
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
        'Withering Hex', // now sits before Dark Bolt so its Vulnerable lands on it
        'Dark Bolt',
        'Reap', // turn 4: special fires
        'Bone Ward', // cycle resumes at the entry it would have played next
        'Soul Rot',
        'Withering Hex',
        'Reap', // turn 8
        'Dark Bolt',
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
        [{ kind: 'damage', amount: 11 }], // Quick Slash: 8 -> 11
        [
          { kind: 'damage', amount: 4 },
          { kind: 'damage', amount: 8 }, // Twin Strike: heaviest is the 5, not the 4
        ],
        [
          { kind: 'damage', amount: 8 }, // Feint: 5 -> 8
          { kind: 'block', amount: 4 },
        ],
        [{ kind: 'damage', amount: 14 }], // Lunge: 11 -> 14
      ]);
    });

    test('cultist', () => {
      const empowered = empowerPattern(defById('cultist').pattern, 3);
      expect(empowered.cycle.map((entry) => entry.effects)).toEqual([
        [{ kind: 'status', status: 'burn', amount: 3, duration: 2 }], // Cinder Curse: no damage, untouched
        [{ kind: 'damage', amount: 10 }], // Talon Rake: 7 -> 10
        [
          { kind: 'damage', amount: 7 }, // Venom Spit: 4 -> 7
          { kind: 'status', status: 'poison', amount: 3, duration: 2 },
        ],
        [
          { kind: 'status', status: 'poison', amount: 3, duration: 3 }, // Blood Sigil: no damage, untouched
          { kind: 'status', status: 'burn', amount: 3, duration: 2 },
          { kind: 'status', status: 'weak', amount: 1, duration: 1 },
        ],
      ]);
    });

    test('armored_goblin (cycle and special both empowered independently)', () => {
      const empowered = empowerPattern(defById('armored_goblin').pattern, 3);
      expect(empowered.cycle.map((entry) => entry.effects)).toEqual([
        [{ kind: 'block', amount: 8 }], // Shield Up: no damage, untouched
        [
          { kind: 'damage', amount: 10 }, // Shield Slam: 7 -> 10
          { kind: 'block', amount: 4 },
        ],
        [{ kind: 'damage', amount: 13 }], // Crush: 10 -> 13
      ]);
      expect(empowered.special!.entry.effects).toEqual([
        { kind: 'block', amount: 4 },
        { kind: 'damage', amount: 14 }, // Shield Bash: 11 -> 14
      ]);
    });

    test('knight', () => {
      const empowered = empowerPattern(defById('knight').pattern, 3);
      expect(empowered.cycle.map((entry) => entry.effects)).toEqual([
        [
          { kind: 'damage', amount: 9 }, // Sword Combo: tie broken in favor of the first hit, 6 -> 9
          { kind: 'damage', amount: 6 },
        ],
        [
          { kind: 'block', amount: 6 },
          { kind: 'damage', amount: 10 }, // Guarded Cut: 7 -> 10
          { kind: 'status', status: 'frail', amount: 1, duration: 1 },
        ],
        [
          { kind: 'damage', amount: 7 }, // Riposte Flurry: tie broken in favor of the first hit, 4 -> 7
          { kind: 'damage', amount: 4 },
          { kind: 'damage', amount: 4 },
        ],
        [{ kind: 'damage', amount: 17 }], // Heavy Blade: 14 -> 17
      ]);
    });

    test('necromancer (cycle and special both empowered independently)', () => {
      const empowered = empowerPattern(defById('necromancer').pattern, 3);
      expect(empowered.cycle.map((entry) => entry.effects)).toEqual([
        [{ kind: 'status', status: 'poison', amount: 4, duration: 2 }], // Soul Rot: no damage, untouched
        [
          { kind: 'damage', amount: 8 }, // Withering Hex: 5 -> 8 (now before Dark Bolt so its Vulnerable lands)
          { kind: 'status', status: 'burn', amount: 3, duration: 2 },
          { kind: 'status', status: 'vulnerable', amount: 1, duration: 2 },
        ],
        [{ kind: 'damage', amount: 13 }], // Dark Bolt: 10 -> 13
        [
          { kind: 'block', amount: 5 }, // Bone Ward: no damage, untouched
          { kind: 'status', status: 'poison', amount: 3, duration: 2 },
        ],
      ]);
      expect(empowered.special!.entry.effects).toEqual([
        { kind: 'damage', amount: 11 }, // Reap: 8 -> 11
        { kind: 'status', status: 'poison', amount: 4, duration: 3 },
      ]);
    });

    test('ogre (cycle and special both empowered independently)', () => {
      const empowered = empowerPattern(defById('ogre').pattern, 3);
      expect(empowered.cycle.map((entry) => entry.effects)).toEqual([
        [{ kind: 'block', amount: 10 }], // Brace Up: no damage, untouched
        [{ kind: 'damage', amount: 16 }], // Smash: 13 -> 16
        [
          { kind: 'block', amount: 5 },
          { kind: 'damage', amount: 13 }, // Guarded Smash: 10 -> 13
        ],
      ]);
      expect(empowered.special!.entry.effects).toEqual([
        { kind: 'damage', amount: 20 }, // Earthbreaker: 17 -> 20
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
      expect(view.magnitude).toBe(5);
      expect(entry.telegraph.toLowerCase()).toMatch(/ward|guard|shield|brace|lattice/);
    });

    test('escalating specials telegraph as attacks, matching their damage-led effects', () => {
      expect(intentView(defById('armored_goblin').pattern.special!.entry).kind).toBe('attack');
      expect(intentView(defById('necromancer').pattern.special!.entry).kind).toBe('attack');
      expect(intentView(defById('ogre').pattern.special!.entry).kind).toBe('attack');
    });
  });
});

describe('multi-enemy packs (spawnEncounter)', () => {
  test('the first two depths always spawn a clean 1v1', () => {
    // frac 0.9 would otherwise favor a pack; depth <= 2 forces solo before any roll.
    for (const depth of [1, 2]) {
      const pack = spawnEncounter(new SequenceRng([0.9, 0.9]), depth);
      expect(pack).toHaveLength(1);
      expect(ENEMIES.some((def) => def.id === pack[0].def.id)).toBe(true);
    }
  });

  test('a low solo roll keeps a single normal enemy past depth 2', () => {
    // frac 0 < PACK_SOLO_CHANCE -> solo; the foe is a normal-tier enemy, not a minion.
    const pack = spawnEncounter(new SequenceRng([0]), 5);
    expect(pack).toHaveLength(1);
    expect(MINIONS.some((def) => def.id === pack[0].def.id)).toBe(false);
  });

  test('a high solo roll spawns a minion pack of 2 or 3', () => {
    const pair = spawnEncounter(new SequenceRng([0.9, 0.9]), 5); // pack, size roll 0.9 -> size 2
    const trio = spawnEncounter(new SequenceRng([0.9, 0.1]), 5); // pack, size roll 0.1 -> size 3
    expect(pair).toHaveLength(2);
    expect(trio).toHaveLength(3);
    for (const foe of [...pair, ...trio]) {
      expect(MINIONS.some((def) => def.id === foe.def.id)).toBe(true);
    }
  });

  test("a pack's combined HP is anchored near a solo enemy of the tier (budget)", () => {
    for (const depth of [3, 5, 8]) {
      const solo = enemyHpForDepth(spawnEnemy(new SequenceRng([0]), depth).def.baseHp, depth);
      for (const size of [2, 3]) {
        const pack = spawnMinionPack(new SequenceRng([0.9]), depth, size);
        expect(pack).toHaveLength(size);
        const totalHp = pack.reduce((sum, foe) => sum + foe.hp, 0);
        // Total pack HP ~ 1.3x a solo (PACK_HP_MULTIPLIER offsets focus-fire), give or take rounding
        // and the per-foe floor. It is clearly in a solo's ballpark, never a runaway wall.
        expect(totalHp).toBeGreaterThan(solo);
        expect(totalHp).toBeLessThan(solo * 2.2 + size * 6);
        for (const foe of pack) expect(foe.hp).toBeGreaterThanOrEqual(6);
      }
    }
  });

  test('pack spawning is deterministic under a scripted rng', () => {
    const seq = () => new SequenceRng([0.9, 0.1, 0.4, 0.7, 0.2]);
    const a = spawnEncounter(seq(), 6).map((m) => ({ id: m.def.id, hp: m.hp }));
    const b = spawnEncounter(seq(), 6).map((m) => ({ id: m.def.id, hp: m.hp }));
    expect(a).toEqual(b);
  });

  test('toEngineEnemies gives pack foes unique ids but leaves a solo bare', () => {
    const pack = spawnMinionPack(new SequenceRng([0.9]), 5, 3);
    const ids = toEngineEnemies(pack).map((enemy) => enemy.id);
    expect(new Set(ids).size).toBe(3); // unique even when all three are the same minion type
    const solo = toEngineEnemies([spawnEnemy(new SequenceRng([0]), 5)]);
    expect(solo[0].id).not.toContain('#');
  });

  test('every minion has a telegraphable intent cycle', () => {
    for (const def of MINIONS) {
      expect(def.pattern.cycle.length).toBeGreaterThan(0);
      for (const entry of def.pattern.cycle) {
        expect(entry.effects.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('scenario encounter spawning', () => {
  test('Enemies Are Doubled turns normal rooms into two full normal enemies', () => {
    const pack = spawnScenarioEncounter(new SequenceRng([0, 0.5]), 5, 'normal', 'enemies_doubled');

    expect(pack).toHaveLength(2);
    for (const foe of pack) {
      expect(MINIONS.some((def) => def.id === foe.def.id)).toBe(false);
      expect(foe.hp).toBe(enemyHpForDepth(foe.def.baseHp, 5));
    }
  });

  test('doubled normals do not use the minion-pack budget branch', () => {
    const pack = spawnScenarioEncounter(
      new SequenceRng([0.9, 0.9, 0.1]),
      5,
      'normal',
      'enemies_doubled',
    );

    expect(pack).toHaveLength(2);
    expect(pack.every((foe) => MINIONS.some((def) => def.id === foe.def.id))).toBe(false);
  });

  test('non-doubled normal scenarios keep the existing spawnEncounter shape', () => {
    const pack = spawnScenarioEncounter(new SequenceRng([0.9, 0.9, 0]), 5, 'normal', null);

    expect(pack).toHaveLength(2);
    expect(pack.every((foe) => MINIONS.some((def) => def.id === foe.def.id))).toBe(true);
  });

  test('Enemies Are Doubled does not duplicate elites or bosses', () => {
    const elite = spawnScenarioEncounter(new SequenceRng([0]), 5, 'elite', 'enemies_doubled');
    const boss = spawnScenarioEncounter(new SequenceRng([0]), 10, 'boss', 'enemies_doubled');

    expect(elite).toHaveLength(1);
    expect(elite[0].def.tier).toBe('elite');
    expect(boss).toHaveLength(1);
    expect(boss[0].def.boss).toBe(true);
  });
});
