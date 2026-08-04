---
title: Difficulty Rebalance — Tier Scarcity, Upgrade Caps, and a Real Back Half
type: feat
date: 2026-08-04
topic: difficulty-rebalance
origin: owner report — "the current run is too easy"
artifact_contract: ce-unified-plan/v1
---

## Goal Capsule

**Objective.** Close the single-card snowball the owner reported (open with free Quick
Jabs, funnel every rest-room upgrade into Sunder, end with one card dealing 60+ against
a 34 HP player), and stop the 100-room arc flattening out after the first decade.

**Product authority.** Owner-selected during planning: keep the existing HP combat model
(the design document's "deck as health / mill" pillar is explicitly **not** adopted);
cap upgrades at one per card; escalate encounter shape rather than enemy stats; make
tier gate rarity; make tier visible on the card face; teach the harness to hunt this
exploit class.

**Execution profile.** Content + rules change across `src/data`, `src/dungeon`,
`src/game`, and `src/gfx`, validated against the survival harness as a coupled set per
`docs/solutions/design-patterns/decouple-enemy-power-from-player-reward-scaling.md`.

## Diagnosis

The reported combo was real, but it was a symptom of three faults compounding.

**1. The snowball.** `upgradeCard` had no ceiling and `REST_UPGRADE_GOLD_COST` never
escalated, so a run could buy the same card's upgrade indefinitely. Sunder is
`[damage 4, Vulnerable, damage 4]`: each upgrade paid `+2` twice, its self-applied
Vulnerable banked the second hit at ×1.5, and `modifiedDamage` runs per damage
sub-effect so `STRENGTH_CAP = 8` counted twice. Six upgrades reached 40 raw / ~60 with
Strength, against `PLAYER_MAX_HP = 34`.

**2. Tier stopped gating rarity.** `cardTierWeightsForDepth` shifted a point from tier 2
into tier 3 every decade, ending near `[0, 1, 9]` — about 90% tier-3 offers by room 100.

**3. The back half did not escalate.** `DEEP_HP_SLOPE = 0.03` adds roughly +3 enemy HP
across rooms 11–100 and `intentBonusForDepth` actually _drops_ after depth 10, while the
deep room table ran 22% potion + 22% rest against the shallow table's 10% + 8%. Player
power climbed for 90 rooms against a flat enemy curve.

## Units delivered

- **U1 — Upgrade cap.** `MAX_CARD_UPGRADES = 1`, tracked by an optional `Card.upgrades`
  counter (absent ⇒ 0, so suspended runs restore without migration). `isCardUpgradable`
  is the single choke point: the rest picker, the sim, and the rules all respect it.
- **U2 — Tier scarcity.** Tier-3 weight is capped by `MAX_TIER3_WEIGHT = 3` and the
  per-decade tier-3 drift is removed; depth improves offers by fading tier 1 instead.
  Card-lint pins the ceiling, the tier-2 ≥ tier-3 ordering, and monotonicity across all
  100 depths.
- **U3 — 0-cost damage lint.** `MAX_ZERO_COST_DAMAGE` closes the hole the original
  0-cost lint left (it bounded Strength and energy+draw, never raw damage). Set at Quick
  Jab's existing value as a ceiling on future authoring — see "Rejected" below.
- **U4 — Deep encounter mix.** Deep room tables cut recovery 44% → 40% and restore
  encounters 24% → 29%; deep encounters lean back toward undiluted solo enemies.
- **U5 — Curses.** A `CurseId`-typed `shuffleCurse` rider with a second, heavier
  `leaden` variant. The Hexweaver elite's curse is upgraded to Leaden; one strong-tier
  enemy (necromancer, 1-in-4 beats) now carries a curse. Battle-scoped, never draftable.
- **U6 — Card face truthfulness.** `cardFaceText` derives an upgraded card's blurb from
  its live effects, fixing a face that printed its original numbers after an upgrade.
- **U7 — Tier borders.** `tierBorder()` in a Phaser-free `src/gfx/cardTier.ts`: bronze /
  silver / double-framed gold, with stroke width varying alongside colour so the band
  reads at hand-fan scale and without colour.
- **U8 — Exploit-seeking harness.** `SimRestPolicy` (`balanced` | `mono`) plus
  `assessRestPolicyDominance`, and `peakCardUpgrades` tracking on every run result.

## Findings

**Packs are a variety knob, not a difficulty knob.** A pack splits one solo's damage
budget across bodies the player focus-fires down, so it is _easier_ than the solo it
replaces even with `PACK_HP_MULTIPLIER = 1.3`. Measured: raising deep pack frequency
lifted the strong loadout's escape rate 0.425 → 0.475; lowering it brought every band
back into range. The deep curve now leans toward solo enemies, the opposite of the
original intent.

**Quick Jab is load-bearing.** Cutting it 4 → 3 moved the LEAN reference deck's boss
win rate 0.602 → 0.475 (3000 fights) because that point decides a kill turn.

**The harness grades a strawman player.** `SIM_DECK_THIN_THRESHOLD = 9` puts the deck
over the threshold almost always, so the simulated player spends nearly every rest on
_removal_ and rarely upgrades — 0.33 average peak upgrades per run against 0.93 for an
upgrade-first policy. Head to head on the strong loadout, upgrade-first won **0.683**
against the default's **0.183**. Raising the threshold to 13 lifts the strong loadout's
escape rate from 0.18 to **0.51**: the game is materially easier than the bands imply,
because a real player upgrades. This is filed as follow-up, not fixed here — see below.

## Rejected during implementation

- **Nerfing Quick Jab.** The owner's report called the free Jab "ok"; the reference-deck
  anchor then showed a single point off it breaks LEAN's boss win floor. The lint became
  a ceiling on future 0-cost cards instead of a nerf to this one.
- **Splitting the upgrade damage budget across multi-hit effects.** Once the cap exists,
  it moved the bands too little to justify the extra rule, and what it did move fell only
  on the Barbarian's multi-hit kit.
- **A curse rider on the Bone Oracle boss special.** A recurring dilution tax on the
  fight with the fewest outs pushed LEAN under its boss win floor.
- **A curse rider on the ogre's 3-beat cycle.** Curse cost scales with fight length, so
  it taxed slow damage-over-time decks hardest and pushed the Necromancer reference deck
  under `ARCHETYPE_HARD_FIGHT_FLOOR`.

## Follow-up (owner decision required)

Fixing `SIM_DECK_THIN_THRESHOLD` is the correct change and the single highest-value item
remaining, but it re-calibrates **every** band at once — bare/mid/strong plus the whole
scenario matrix — because those numbers were fit against the weaker policy. Converging
them again needs owner-set difficulty targets (notably: how hard should Lost Left Arm and
Enemies Are Doubled be for a competent player?), so it is deliberately not folded in here.
The characterization test in `balanceSimulator.test.ts` pins the gap so it cannot widen
unnoticed and fails loudly when it is closed.

Also still open, and untouched by this change: **Scout Charges are unobtainable** in the
shipped game (`campfirePrep.ts` sets `scoutCharges` to 0 with no grant path) while the
simulator models a scouted router, making the harness optimistic about routing.

## Verification

| Check           | Command                                            | Result                |
| --------------- | -------------------------------------------------- | --------------------- |
| Types           | `npm run typecheck`                                | clean                 |
| Lint            | `npm run lint`                                     | clean                 |
| Build           | `npm run build`                                    | succeeds              |
| Tests           | `npm test`                                         | 531 passed / 48 files |
| Format          | `npm run format:check`                             | clean                 |
| Balance bands   | `npx vitest run src/game/balanceSimulator.test.ts` | all bands in range    |
| Reference decks | `npx vitest run src/game/referenceDecks.test.ts`   | HP-cost bands hold    |

Browser smoke (`npm run dev`): tier borders render bronze / silver / double-framed gold
at both full and hand-fan scale; `Sunder+` reads `Deal 6, Vulnerable 3, Deal 6` at 12 ATK
and `Guard+` reads `Gain 10 block`, confirming the derived face text.

`runSignature`'s golden was deliberately re-goldened (room table, tier weights, pack odds,
and upgrade cap all change values consumed from the same draw sequence). Determinism
itself is unaffected: the same-seed stability test still passes across 50 seeds.

**Known pre-existing issue, not introduced here:** long card blurbs (e.g. Sunder's)
overflow the card face in surfaces that render descriptions. The derived upgraded text is
shorter than the authored text (28 vs 31 chars), so this change does not worsen it.
