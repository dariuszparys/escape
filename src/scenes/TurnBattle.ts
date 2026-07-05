import Phaser from 'phaser';
import { playSfx, startAmbience, stopAmbience } from '../audio/sfx';
import { playMusic, stopAllMusic, trackForEncounterKind } from '../audio/music';
import { GAME_H, GAME_W } from '../config';
import { Card, StatusEffectType } from '../data/cards';
import { EnemyInstance } from '../data/enemies';
import { InventoryItem } from '../data/items';
import { cardRulesLines } from '../data/keywords';
import { createCardTooltip, estimateTooltipHeight } from '../gfx/cardTooltip';
import { CARD_H, CARD_W, makeCardView } from '../gfx/cardview';
import { createPileInspector } from '../gfx/pileView';
import { createRelicPanel } from '../gfx/relicPanel';
import { compactRewardImpactLabel, createRewardImpactText } from '../gfx/rewardImpactView';
import { CombatEvent, emitBattleWon } from '../game/combatEvents';
import { IntentPattern } from '../game/intentPatterns';
import { PresentationQueue, PresentationStep } from '../game/presentationQueue';
import { ensureRelicBehaviorsWired } from '../game/relicBehaviors';
import { relicBattleSetup, relicGoldBonusLabel } from '../game/relicRegistry';
import { previewRewardImpact } from '../game/rewardImpact';
import {
  awardEliteBonusGold,
  awardEnemyGold,
  awardRelicEliteGold,
  ELITE_CARD_OFFER_COUNT,
  ELITE_TIER_BIAS_DEPTH,
  rollVictoryCardOffers,
} from '../game/rewards';
import { randomRelic, rollRelicOffers, type Relic } from '../data/relics';
import { GameRng, PhaserGameRng } from '../game/rng';
import {
  buildSliceDeck,
  buildSliceItems,
  nextSliceEnemy,
  sliceEnemy,
  slicePlayer,
} from '../game/sliceBattle';
import { getRun } from '../state';
import { computeTooltipPlacement, TOOLTIP_WIDTH } from '../game/tooltipLayout';
import {
  enemyAnchorsX,
  getTurnBattleLayout,
  HAND_CARD_SCALE,
  handSlotPositions,
  TurnBattleLayout,
  TurnBattleRect,
} from '../game/turnBattleLayout';
import {
  cardCost,
  createBattle,
  endTurn,
  playCard,
  TurnBattleState,
  TurnCommandResult,
  useItem,
} from '../game/turnEngine';

/**
 * Presentation pace per event type, in ms (tuning numbers — an open playtest
 * question, deliberately colocated with the executors they pace). The enemy
 * beat (beatStarted + one effect + turn start) lands around a second (R11).
 */
const STEP_MS: Record<CombatEvent['type'], number> = {
  damageDealt: 0,
  statusApplied: 240,
  battleWon: 0,
  turnStarted: 150,
  blockExpired: 130,
  statusTicked: 260,
  statusFaded: 120,
  stunned: 420,
  energyChanged: 110,
  cardDrawn: 90,
  reshuffled: 400,
  intentTelegraphed: 260,
  intentVoided: 340,
  cardPlayed: 220,
  damageResolved: 280,
  blockGained: 190,
  healed: 210,
  cardDiscarded: 140,
  cardExhausted: 200,
  handDiscarded: 180,
  itemUsed: 200,
  enemyBeatStarted: 300,
  enemyBeatFizzled: 400,
  noPlayableCards: 60,
  battleEnded: 280,
};

function toSteps(events: CombatEvent[]): PresentationStep<CombatEvent>[] {
  return events.map((event) => ({ event, duration: STEP_MS[event.type] ?? 0 }));
}

interface HandView {
  card: Card;
  container: Phaser.GameObjects.Container;
  costText: Phaser.GameObjects.Text;
}

interface SliceSceneData {
  mode?: 'slice';
  enemyId?: string;
  seed?: string;
  restartCount?: number;
}

/** The Dungeon's launch payload (R14): the same run inputs the old scene consumed, now a pack. */
export interface RunBattleSceneData {
  mode: 'run';
  /** One or more enemies to fight together (multi-enemy). Bosses/elites pass a single-element pack. */
  enemies: EnemyInstance[];
  rng: GameRng;
  /** Which room type spawned this battle (U7); read by later units for rewards/music (U8/U10). */
  encounterKind: 'normal' | 'elite' | 'boss';
}

type TurnBattleSceneData = SliceSceneData | RunBattleSceneData;

/** What the scene needs to draw and script one enemy, mode-independent. `id` is the engine
 * combatant id (unique within the pack), so events route to the right on-screen enemy. */
interface EnemyDisplay {
  id: string;
  name: string;
  texture: string;
  hp: number;
  maxHp: number;
  armor: number;
  boss: boolean;
  pattern: IntentPattern;
}

/** Everything drawn for one enemy: sprite, bars, texts, focus ring, and the shown values. */
interface EnemyView {
  display: EnemyDisplay;
  sprite: Phaser.GameObjects.Image;
  hpBar: Phaser.GameObjects.Graphics;
  hpText: Phaser.GameObjects.Text;
  blockText: Phaser.GameObjects.Text;
  statusText: Phaser.GameObjects.Text;
  intentText: Phaser.GameObjects.Text;
  focusRing: Phaser.GameObjects.Graphics;
  anchorX: number;
  spriteY: number;
  shownHp: number;
  shownBlock: number;
  statuses: Map<StatusEffectType, { amount: number; turns: number }>;
}

interface SliceDebugHandle {
  state: () => TurnBattleState;
  playCard: (uid: number) => void;
  endTurn: () => void;
  useItem: (index: number) => void;
  accelerate: () => void;
  skipAll: () => void;
}

const MONO = 'monospace';

/** Always-on-top depth for the hover tooltips (mirrors cardTooltip's TOOLTIP_DEPTH). */
const ITEM_TOOLTIP_DEPTH = 500;

/**
 * Map spawned enemy instances to display records, assigning each a unique id
 * (`goblin#0`, `goblin#1`) that matches the engine's `toEngineEnemies` convention
 * so combat events route to the right on-screen enemy. A solo enemy keeps its bare id.
 */
function displaysFromInstances(pack: EnemyInstance[]): EnemyDisplay[] {
  return pack.map((inst, index) => ({
    id: pack.length === 1 ? inst.def.id : `${inst.def.id}#${index}`,
    name: inst.def.name,
    texture: inst.def.texture,
    hp: inst.hp,
    maxHp: inst.maxHp,
    armor: inst.armor,
    boss: inst.def.boss,
    pattern: inst.pattern,
  }));
}

/** Which generated sprite stands in for a combat item's icon (R-declutter: icons replace text). */
function itemTexture(item: InventoryItem): string {
  switch (item.id) {
    case 'small_potion':
      return 'potion';
    case 'large_potion':
      return 'potion_large';
    case 'iron_armor':
      return 'armor';
    case 'smoke_bomb':
      return 'smoke_bomb';
    case 'bomb':
      return 'bomb';
    default:
      // Fall back by kind so an unmapped item still shows something sensible.
      return item.kind === 'shield' ? 'armor' : item.kind === 'damage' ? 'bomb' : 'potion';
  }
}

/**
 * The Slay-the-Spire-style battle screen (U6). Render and input only: every
 * rule lives in the turn engine, every visual step is replayed by the
 * presentation queue, and input is never gated on animation (R7–R12). The
 * slice sandbox (R24) owns its whole world — no run state, no meta, no
 * chronicle, no battle-end signal, in-scene end panel.
 */
export class TurnBattleScene extends Phaser.Scene {
  private mode: 'slice' | 'run' = 'slice';
  /**
   * Set from RunBattleSceneData in 'run' mode (U7); stays 'normal' for 'slice' mode.
   * Not `private`: read in `runVictory` (U8) for elite reward bias; U10 will also
   * read it for music selection.
   */
  encounterKind: 'normal' | 'elite' | 'boss' = 'normal';
  private baseSeed = '';
  private restartCount = 0;
  private displays: EnemyDisplay[] = [];
  /** The enemy the player's attacks target; click an enemy to move it (click-to-focus). */
  private focusId = '';
  private playerMaxHp = 0;
  /** Flat damage reduction from collected armor (state.ts) — fixed for the whole battle, unlike block. */
  private playerArmor = 0;
  private rng!: GameRng;

  private engineState!: TurnBattleState;
  private queue!: PresentationQueue<CombatEvent>;
  private layout: TurnBattleLayout = getTurnBattleLayout();

  /** True from an accepted end-turn until the next turnStarted/battleEnded step: input only accelerates (R11). */
  private beatActive = false;
  private items: InventoryItem[] = [];

  /** Cards as the PRESENTATION currently shows them (the engine is always ahead). */
  private shownHand: Card[] = [];
  private handViews = new Map<number, HandView>();
  private committedUids = new Set<number>();
  /** Player statuses as the presentation currently shows them; enemy statuses live per EnemyView. */
  private playerStatuses = new Map<StatusEffectType, { amount: number; turns: number }>();
  private shown = {
    playerHp: 0,
    playerBlock: 0,
    energy: 0,
    draw: 0,
    discard: 0,
  };

  /** One EnemyView per living-or-dead enemy, keyed by engine combatant id. */
  private enemyViews = new Map<string, EnemyView>();
  private heroSprite!: Phaser.GameObjects.Image;
  private playerHpBar!: Phaser.GameObjects.Graphics;
  private playerHpText!: Phaser.GameObjects.Text;
  private playerBlockText!: Phaser.GameObjects.Text;
  private playerArmorText!: Phaser.GameObjects.Text;
  private playerStatusText!: Phaser.GameObjects.Text;
  private announcementText!: Phaser.GameObjects.Text;
  private energyText!: Phaser.GameObjects.Text;
  private turnText!: Phaser.GameObjects.Text;
  private drawCountText!: Phaser.GameObjects.Text;
  private discardCountText!: Phaser.GameObjects.Text;
  private endTurnBg!: Phaser.GameObjects.Graphics;
  private endTurnZone!: Phaser.GameObjects.Zone;
  private endTurnPulse: Phaser.Tweens.Tween | null = null;
  private itemViews: { icon: Phaser.GameObjects.Image }[] = [];
  private itemTooltip: Phaser.GameObjects.Container | null = null;
  private pilePanel: Phaser.GameObjects.Container | null = null;
  private relicPanel: Phaser.GameObjects.Container | null = null;
  /** The rules-text tooltip for whichever card is currently hovered (hand or reward), if any (U11). */
  private activeTooltip: Phaser.GameObjects.Container | null = null;
  private outcomeShown = false;
  private keyC!: Phaser.Input.Keyboard.Key;
  private keyE!: Phaser.Input.Keyboard.Key;
  private keyR!: Phaser.Input.Keyboard.Key;

  constructor() {
    super('TurnBattle');
  }

  init(data: TurnBattleSceneData): void {
    if (data.mode === 'run') {
      this.mode = 'run';
      this.baseSeed = '';
      this.restartCount = 0;
      this.rng = data.rng;
      this.encounterKind = data.encounterKind;
      this.displays = displaysFromInstances(data.enemies);
      this.items = getRun().inventory.filter((item) => item.usableInCombat);
    } else {
      this.mode = 'slice';
      this.baseSeed = data.seed ?? String(Math.random());
      this.restartCount = data.restartCount ?? 0;
      // A comma-separated `enemy` param spawns a slice pack (e.g. `?enemy=slice_skeleton,slice_cultist`).
      const sliceIds = (data.enemyId ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
      const sliceDefs = (sliceIds.length ? sliceIds : [undefined]).map((id) => sliceEnemy(id));
      this.displays = sliceDefs.map((sliceDef, index) => ({
        id: sliceDefs.length === 1 ? sliceDef.id : `${sliceDef.id}#${index}`,
        name: sliceDef.name,
        texture: sliceDef.texture,
        hp: sliceDef.hp,
        maxHp: sliceDef.hp,
        armor: sliceDef.armor,
        boss: false,
        pattern: sliceDef.pattern,
      }));
      const seed = this.restartCount > 0 ? `${this.baseSeed}:${this.restartCount}` : this.baseSeed;
      this.rng = new PhaserGameRng(new Phaser.Math.RandomDataGenerator([seed]));
      this.items = buildSliceItems();
    }
    this.focusId = this.displays[0].id;
    this.beatActive = false;
    this.shownHand = [];
    this.handViews = new Map();
    this.committedUids = new Set();
    this.playerStatuses = new Map();
    this.enemyViews = new Map();
    this.itemViews = [];
    this.itemTooltip = null;
    this.pilePanel = null;
    this.activeTooltip = null;
    this.endTurnPulse = null;
    this.outcomeShown = false;
    this.layout = getTurnBattleLayout();
  }

  create(): void {
    this.scene.sleep('Hud');
    this.keyC = this.input.keyboard!.addKey('C');
    this.keyE = this.input.keyboard!.addKey('E');
    this.keyR = this.input.keyboard!.addKey('R');

    stopAmbience(this.game);
    playMusic(this, trackForEncounterKind(this.encounterKind));

    this.drawStaticChrome();
    this.createEnemies();
    this.createPlayerZone();
    this.createAnnouncement();
    this.createTurnCounter();
    this.createEnergyAndPiles();
    this.createEndTurnButton();
    this.createItemButtons();

    this.queue = new PresentationQueue<CombatEvent>({
      now: () => this.time.now,
      execute: (step) => this.runStep(step.event),
    });

    // Any click during the enemy beat accelerates and never acts (R11); once the
    // battle is decided, clicks fast-forward toward the outcome overlay (R18).
    this.input.on('pointerdown', () => {
      if ((this.beatActive || this.engineState.phase === 'decided') && !this.queue.idle) {
        this.queue.accelerate();
      }
    });

    const run = this.mode === 'run' ? getRun() : null;
    const deck = run ? [...run.cardCollection] : buildSliceDeck();
    const player = run
      ? { name: 'You', hp: run.hp, maxHp: run.maxHp, armor: run.armor }
      : slicePlayer();
    this.playerMaxHp = player.maxHp;
    this.playerArmor = player.armor;
    this.shown = {
      playerHp: player.hp,
      playerBlock: 0,
      energy: 0,
      draw: deck.length,
      discard: 0,
    };
    const setup = run ? relicBattleSetup(run.relicIds) : {};
    const result = createBattle(
      {
        deck,
        player,
        enemies: this.displays.map((display) => ({
          id: display.id,
          name: display.name,
          hp: display.hp,
          maxHp: display.maxHp,
          armor: display.armor,
          pattern: display.pattern,
        })),
        drawSize: setup.drawSize,
        startingEnergyBonus: setup.startingEnergyBonus,
        retainBlockCap: setup.retainBlockCap,
        poisonBonus: setup.poisonBonus,
        enemyKillDraw: setup.enemyKillDraw,
      },
      this.rng,
    );
    this.acceptResult(result);
    this.refreshAllBars();
    if (run?.hasRelic('swift_boots') && setup.drawSize) {
      this.combatPop(this.heroSprite, `Swift Boots: draw ${setup.drawSize}`, '#7fb2e8');
    }

    this.exposeDebugHandle();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.closePilePanel();
      this.closeRelicPanel();
      this.hideCardTooltip();
      this.hideItemTooltip();
      stopAllMusic(this.game);
      startAmbience(this.game);
    });
  }

  update(): void {
    this.queue.tick();
    if (Phaser.Input.Keyboard.JustDown(this.keyC)) this.togglePilePanel();
    if (Phaser.Input.Keyboard.JustDown(this.keyR)) this.toggleRelicPanel();
    if (Phaser.Input.Keyboard.JustDown(this.keyE)) this.pressEndTurn();
  }

  // ---------------------------------------------------------------- commands

  /** Common post-command bookkeeping: adopt the new truth, queue its replay, log it. */
  private acceptResult(result: TurnCommandResult): void {
    this.engineState = result.state;
    this.queue.enqueue(toSteps(result.events));
    this.refreshHandAffordability();
    this.refreshItemIcons();
  }

  private pressCard(uid: number): void {
    const view = this.handViews.get(uid);
    if (view) this.pressAck(view.container);
    if (this.beatActive && !this.queue.idle) {
      this.queue.accelerate();
      return;
    }
    if (this.engineState.phase === 'decided') {
      this.rejectCue('Battle decided');
      this.queue.accelerate();
      return;
    }
    if (this.committedUids.has(uid)) {
      // Already played; its travel just hasn't caught up yet. The press ack is the response.
      return;
    }
    const result = playCard(this.engineState, uid, this.rng, this.focusId);
    if (result.rejected === 'insufficient_energy') {
      if (view) this.costFlash(view);
      playSfx(this, 'reject');
      return;
    }
    if (result.rejected === 'player_stunned') {
      this.rejectCue('Stunned — card plays are skipped this turn');
      return;
    }
    if (result.rejected) {
      this.rejectCue('Not now');
      return;
    }
    this.committedUids.add(uid);
    if (view) {
      view.container.disableInteractive();
      view.container.setAlpha(1);
    }
    this.acceptResult(result);
  }

  private pressEndTurn(): void {
    this.pulseEndTurn(false);
    if (this.beatActive && !this.queue.idle) {
      this.queue.accelerate();
      return;
    }
    if (this.engineState.phase === 'decided') {
      this.rejectCue('Battle decided');
      this.queue.accelerate();
      return;
    }
    const result = endTurn(this.engineState, this.rng);
    if (result.rejected) {
      this.rejectCue('Battle decided');
      return;
    }
    this.beatActive = true;
    playSfx(this, 'end_turn');
    this.acceptResult(result);
  }

  private pressItem(item: InventoryItem, icon: Phaser.GameObjects.Image): void {
    this.pressAck(icon);
    if (this.beatActive && !this.queue.idle) {
      this.queue.accelerate();
      return;
    }
    if (this.engineState.phase === 'decided') {
      this.rejectCue('Battle decided');
      this.queue.accelerate();
      return;
    }
    const result = useItem(this.engineState, item, this.rng, this.focusId);
    if (result.rejected) {
      this.rejectCue('Battle decided');
      return;
    }
    if (this.mode === 'run') {
      getRun().removeItem(item.uid);
      this.game.events.emit('hud-update');
      this.items = getRun().inventory.filter((candidate) => candidate.usableInCombat);
    } else {
      this.items = this.items.filter((candidate) => candidate.uid !== item.uid);
    }
    this.acceptResult(result);
  }

  // ------------------------------------------------------------- executors

  private runStep(event: CombatEvent): void {
    switch (event.type) {
      case 'turnStarted':
        this.beatActive = false;
        this.turnText.setText(`TURN ${event.turn}`);
        break;
      case 'energyChanged':
        this.shown.energy = event.energy;
        this.energyText.setText(`${event.energy}/${event.max}`);
        this.energyText.setScale(1.25);
        this.tweens.add({ targets: this.energyText, scale: 1, duration: 160 });
        this.refreshHandAffordability();
        break;
      case 'cardDrawn':
        this.shown.draw = event.drawCount;
        this.shown.discard = event.discardCount;
        this.spawnDrawnCard(event.card);
        this.updatePileBadges();
        playSfx(this, 'card_draw', 0.35);
        break;
      case 'reshuffled':
        this.shown.draw = event.count;
        this.shown.discard = 0;
        this.updatePileBadges();
        this.announce('Discard pile shuffled into draw pile', '#8ecbff');
        playSfx(this, 'shuffle', 0.5);
        break;
      case 'intentTelegraphed': {
        const view = this.enemyViews.get(event.sourceId);
        if (view) this.setEnemyIntent(view, event.name, event.kind, event.magnitude, false);
        playSfx(this, 'boss_telegraph', 0.25);
        break;
      }
      case 'intentVoided': {
        const view = this.enemyViews.get(event.sourceId);
        if (view) {
          this.setEnemyIntent(
            view,
            event.reason === 'stun' ? 'STUNNED' : 'SMOKED',
            'unknown',
            0,
            true,
          );
        }
        break;
      }
      case 'cardPlayed':
        this.shown.energy = event.energyAfter;
        this.energyText.setText(`${event.energyAfter}/${this.currentEnergyMax()}`);
        this.travelToPlayZone(event.card);
        playSfx(this, 'card_play');
        break;
      case 'damageResolved':
        this.applyDamageVisual(event);
        break;
      case 'blockGained':
        this.setShownBlock(event.targetId, event.blockAfter);
        this.combatPop(this.spriteFor(event.targetId), `+${event.amount} block`, '#8ecbff');
        playSfx(this, 'block');
        break;
      case 'healed':
        this.setShownHp(event.targetId, event.hpAfter);
        if (event.amount > 0) {
          this.combatPop(this.spriteFor(event.targetId), `+${event.amount} HP`, '#5fe07a');
        }
        playSfx(this, 'heal');
        break;
      case 'statusApplied': {
        const map = this.statusMapFor(event.targetId);
        map.set(event.status, { amount: event.amount, turns: event.remainingTurns });
        this.renderStatusesFor(event.targetId);
        this.combatPop(this.spriteFor(event.targetId), event.status.toUpperCase(), '#c58cff');
        playSfx(this, 'trap', 0.3);
        break;
      }
      case 'statusTicked': {
        const map = this.statusMapFor(event.targetId);
        if (event.remainingTurns > 0)
          map.set(event.status, { amount: event.amount, turns: event.remainingTurns });
        else map.delete(event.status);
        this.renderStatusesFor(event.targetId);
        this.setShownHp(event.targetId, event.hpAfter);
        this.combatPop(
          this.spriteFor(event.targetId),
          `-${event.amount} ${event.status}`,
          '#c58cff',
        );
        this.flash(this.spriteFor(event.targetId));
        break;
      }
      case 'statusFaded': {
        const map = this.statusMapFor(event.targetId);
        const existing = map.get(event.status);
        if (event.remainingTurns > 0)
          map.set(event.status, { amount: existing?.amount ?? 0, turns: event.remainingTurns });
        else map.delete(event.status);
        this.renderStatusesFor(event.targetId);
        break;
      }
      case 'blockExpired':
        this.setShownBlock(event.targetId, 0);
        break;
      case 'stunned':
        this.playerStatuses.delete('stun');
        this.renderPlayerStatuses();
        this.announce('You are stunned — card plays are skipped', '#f1c40f');
        playSfx(this, 'reject', 0.4);
        break;
      case 'cardDiscarded':
        this.shown.discard = event.discardCount;
        this.travelToDiscard(event.card);
        this.updatePileBadges();
        break;
      case 'cardExhausted':
        this.burnCardInPlace(event.card);
        break;
      case 'handDiscarded':
        this.shown.discard = event.discardCount;
        this.sweepHandToDiscard();
        this.updatePileBadges();
        break;
      case 'itemUsed':
        this.announce(`Used ${event.itemName}`, '#5fe07a');
        break;
      case 'enemyBeatStarted': {
        this.beatActive = true;
        const view = this.enemyViews.get(event.sourceId);
        if (view) {
          this.tweens.add({
            targets: view.sprite,
            y: view.sprite.y + 14,
            duration: 130,
            yoyo: true,
            ease: 'Cubic.easeIn',
          });
        }
        break;
      }
      case 'enemyBeatFizzled': {
        this.beatActive = true;
        const view = this.enemyViews.get(event.sourceId);
        if (view) {
          this.combatPop(view.sprite, 'FIZZLE', '#b8b0c8');
          this.setEnemyIntent(view, '...', 'unknown', 0, true);
        }
        playSfx(this, 'trap', 0.35);
        break;
      }
      case 'noPlayableCards':
        this.pulseEndTurn(true);
        this.announce(
          event.reason === 'empty_hand'
            ? 'Hand empty — end your turn [E]'
            : event.reason === 'unaffordable'
              ? 'No playable cards — end your turn [E]'
              : 'Stunned — end your turn [E]',
          '#f1c40f',
        );
        break;
      case 'battleEnded':
        this.beatActive = false;
        this.showOutcome(event.outcome);
        break;
      default:
        break;
    }
  }

  // --------------------------------------------------------------- visuals

  private spriteFor(targetId: string): Phaser.GameObjects.Image {
    if (targetId === 'player') return this.heroSprite;
    return this.enemyViews.get(targetId)?.sprite ?? this.heroSprite;
  }

  private statusMapFor(targetId: string): Map<StatusEffectType, { amount: number; turns: number }> {
    if (targetId === 'player') return this.playerStatuses;
    return this.enemyViews.get(targetId)?.statuses ?? this.playerStatuses;
  }

  private renderStatusesFor(targetId: string): void {
    if (targetId === 'player') {
      this.renderPlayerStatuses();
      return;
    }
    const view = this.enemyViews.get(targetId);
    if (view) this.renderEnemyStatuses(view);
  }

  private setShownHp(targetId: string, hp: number): void {
    if (targetId === 'player') {
      this.shown.playerHp = hp;
      this.refreshPlayerBar();
      return;
    }
    const view = this.enemyViews.get(targetId);
    if (!view) return;
    view.shownHp = hp;
    this.refreshEnemyBar(view);
    if (hp <= 0) this.markEnemyDown(view);
  }

  private setShownBlock(targetId: string, block: number): void {
    if (targetId === 'player') {
      this.shown.playerBlock = block;
      this.refreshPlayerBar();
      return;
    }
    const view = this.enemyViews.get(targetId);
    if (!view) return;
    view.shownBlock = block;
    this.refreshEnemyBar(view);
  }

  // ------------------------------------------------------------- enemy views

  /** Move the player's attack focus to `id` (click-to-focus), if it is a living enemy. */
  private setFocus(id: string): void {
    const view = this.enemyViews.get(id);
    if (!view || view.shownHp <= 0) return;
    this.focusId = id;
    this.redrawFocusRings();
  }

  private onEnemyClicked(id: string): void {
    // A click during the enemy beat / after the battle is decided only accelerates (R11).
    if ((this.beatActive || this.engineState.phase === 'decided') && !this.queue.idle) return;
    this.setFocus(id);
  }

  /** When the current focus dies mid-pack, slide focus to the next living enemy. */
  private refocusToLiving(): void {
    if ((this.enemyViews.get(this.focusId)?.shownHp ?? 0) > 0) return;
    const next = this.displays.find((d) => (this.enemyViews.get(d.id)?.shownHp ?? 0) > 0);
    if (next) this.setFocus(next.id);
    this.redrawFocusRings();
  }

  /** A gold ring marks the focused enemy — only shown when there is a choice to make (a pack). */
  private redrawFocusRings(): void {
    const size = 84;
    for (const view of this.enemyViews.values()) {
      view.focusRing.clear();
      const focused =
        view.display.id === this.focusId && view.shownHp > 0 && this.enemyViews.size > 1;
      if (!focused) continue;
      view.focusRing.lineStyle(3, 0xf1c40f, 0.85);
      view.focusRing.strokeRoundedRect(
        view.anchorX - size / 2,
        view.spriteY - size / 2,
        size,
        size,
        8,
      );
    }
  }

  /** A downed pack member fades out where it stands and stops carrying an intent. */
  private markEnemyDown(view: EnemyView): void {
    if (view.sprite.getData('down')) return;
    view.sprite.setData('down', true);
    this.tweens.killTweensOf(view.sprite);
    this.tweens.add({
      targets: view.sprite,
      alpha: 0.12,
      angle: 12,
      scale: view.sprite.scale * 0.7,
      duration: 320,
      ease: 'Cubic.easeIn',
    });
    view.intentText.setText('');
    view.blockText.setText('');
    view.statusText.setText('');
    view.focusRing.clear();
    this.refocusToLiving();
  }

  /** Compact per-enemy telegraph: the number that matters, colored by kind. */
  private setEnemyIntent(
    view: EnemyView,
    name: string,
    kind: string,
    magnitude: number,
    voided: boolean,
  ): void {
    const label = voided
      ? name
      : kind === 'attack'
        ? `${magnitude} DMG`
        : kind === 'block'
          ? `BLOCK ${magnitude}`
          : kind === 'status'
            ? name.toUpperCase()
            : kind === 'heal'
              ? `HEAL ${magnitude}`
              : kind === 'buff'
                ? `+${magnitude} STR`
                : name;
    const color = voided
      ? '#b8b0c8'
      : kind === 'attack'
        ? '#ff6b5e'
        : kind === 'block'
          ? '#8ecbff'
          : kind === 'heal'
            ? '#5fe07a'
            : '#c58cff';
    view.intentText.setText(label).setColor(color);
    view.intentText.setScale(1.15);
    this.tweens.add({ targets: view.intentText, scale: 1, duration: 160 });
  }

  private formatStatuses(map: Map<StatusEffectType, { amount: number; turns: number }>): string {
    return (
      [...map.entries()]
        // Strength is a permanent stack (no timer) — show its amount; timed statuses show turns.
        .map(([type, v]) => (type === 'strength' ? `str +${v.amount}` : `${type} ${v.turns}`))
        .join('  ')
    );
  }

  private renderPlayerStatuses(): void {
    this.playerStatusText.setText(this.formatStatuses(this.playerStatuses));
  }

  private renderEnemyStatuses(view: EnemyView): void {
    view.statusText.setText(this.formatStatuses(view.statuses));
  }

  private spriteScale(count: number, boss: boolean): number {
    if (count >= 3) return 3.8;
    if (count === 2) return 4.6;
    return boss ? 5.5 : 6;
  }

  private applyDamageVisual(event: Extract<CombatEvent, { type: 'damageResolved' }>): void {
    this.setShownHp(event.targetId, event.hpAfter);
    this.setShownBlock(event.targetId, event.blockAfter);
    const sprite = this.spriteFor(event.targetId);
    if (event.blockAbsorbed > 0) {
      this.combatPop(sprite, `■ ${event.blockAbsorbed}`, '#8ecbff', -26);
    }
    if (event.amount > 0) {
      this.combatPop(sprite, `-${event.amount}`, '#ff5544');
      this.flash(sprite);
      if (event.targetId === 'player') {
        this.cameras.main.shake(110, 0.006);
        playSfx(this, 'hit_player');
      } else {
        playSfx(this, 'hit_enemy');
      }
    } else {
      this.combatPop(sprite, 'Blocked!', '#8ecbff');
      playSfx(this, 'block', 0.4);
    }
  }

  private combatPop(
    sprite: Phaser.GameObjects.Image,
    msg: string,
    color: string,
    yOffset = 0,
  ): void {
    const t = this.add
      .text(sprite.x + 40, sprite.y - 30 + yOffset, msg, {
        fontFamily: MONO,
        fontSize: '20px',
        fontStyle: 'bold',
        color,
        stroke: '#16121e',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(20);
    this.tweens.add({
      targets: t,
      y: t.y - 38,
      alpha: 0,
      duration: 800,
      ease: 'Cubic.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  private flash(img: Phaser.GameObjects.Image): void {
    img.setTintFill(0xffffff);
    this.time.delayedCall(110, () => img.clearTint());
  }

  /** Same-frame press acknowledgment (R7): the element visibly reacts before any rules run. */
  private pressAck(
    target: Phaser.GameObjects.Container | Phaser.GameObjects.Text | Phaser.GameObjects.Image,
  ): void {
    const base = target.scale;
    target.setScale(base * 0.93);
    this.tweens.add({ targets: target, scale: base, duration: 90 });
  }

  private rejectCue(message: string): void {
    this.announce(message, '#ff6b5e');
    playSfx(this, 'reject');
  }

  /** AE1: an unaffordable press answers with a cost flash on the card itself, instantly. */
  private costFlash(view: HandView): void {
    view.costText.setColor('#ff2222');
    view.costText.setScale(1.6);
    this.tweens.add({ targets: view.costText, scale: 1, duration: 200 });
    const x = view.container.x;
    this.tweens.add({
      targets: view.container,
      x: x + 6,
      duration: 40,
      yoyo: true,
      repeat: 2,
      onComplete: () => view.container.setX(x),
    });
    this.time.delayedCall(320, () => this.refreshHandAffordability());
  }

  private announce(message: string, color = '#d8d2e4'): void {
    this.announcementText.setText(message).setColor(color).setAlpha(1);
    this.tweens.killTweensOf(this.announcementText);
    this.tweens.add({
      targets: this.announcementText,
      alpha: 0,
      delay: 1400,
      duration: 400,
    });
  }

  // ------------------------------------------------------------- hand views

  private makeHandCardView(card: Card): HandView {
    const container = makeCardView(this, card, 0, 0, 1, false);
    const badge = this.add.graphics();
    badge.fillStyle(0x16121e, 1);
    badge.fillCircle(-CARD_W / 2 + 14, -CARD_H / 2 + 14, 13);
    badge.lineStyle(2, 0xcab98a, 1);
    badge.strokeCircle(-CARD_W / 2 + 14, -CARD_H / 2 + 14, 13);
    const costText = this.add
      .text(-CARD_W / 2 + 14, -CARD_H / 2 + 14, String(cardCost(card)), {
        fontFamily: MONO,
        fontSize: '15px',
        fontStyle: 'bold',
        color: '#f5edd8',
      })
      .setOrigin(0.5);
    container.add([badge, costText]);
    container.setScale(HAND_CARD_SCALE);
    container.setInteractive({ useHandCursor: true });
    container.on('pointerover', () => {
      if (!this.committedUids.has(card.uid) && !this.beatActive) {
        container.setDepth(15);
        container.setY(this.handY() - 16);
        this.showCardTooltip(card, container);
      }
    });
    container.on('pointerout', () => {
      container.setDepth(10);
      container.setY(this.handY());
      this.hideCardTooltip();
    });
    container.on('pointerdown', () => this.pressCard(card.uid));
    container.setDepth(10);
    return { card, container, costText };
  }

  private handY(): number {
    return this.layout.handArea.y + this.layout.handArea.h / 2;
  }

  // -------------------------------------------------------------- tooltip

  /**
   * Show the rules-text tooltip for `card`, anchored to `anchor`'s CURRENT
   * on-screen rect (read at call time, not baked in earlier — a card's exact
   * position/scale can shift between when its view was built and when it's
   * hovered). Shared by hand cards (`makeHandCardView`) and victory reward
   * cards (`runVictory`) — both call sites pass whatever container they're
   * hovering; this method makes no hand-specific assumptions (U11 / KTD7).
   */
  private showCardTooltip(card: Card, anchor: Phaser.GameObjects.Container): void {
    this.hideCardTooltip();
    const anchorRect: TurnBattleRect = {
      x: anchor.x - (CARD_W * anchor.scale) / 2,
      y: anchor.y - (CARD_H * anchor.scale) / 2,
      w: CARD_W * anchor.scale,
      h: CARD_H * anchor.scale,
    };
    const lineCount = cardRulesLines(card).length;
    const tooltipSize = { w: TOOLTIP_WIDTH, h: estimateTooltipHeight(lineCount) };
    const placement = computeTooltipPlacement(anchorRect, tooltipSize);
    this.activeTooltip = createCardTooltip(this, card, placement);
  }

  private hideCardTooltip(): void {
    this.activeTooltip?.destroy();
    this.activeTooltip = null;
  }

  private spawnDrawnCard(card: Card): void {
    const view = this.makeHandCardView(card);
    const drawBadge = this.layout.drawPile;
    view.container.setPosition(drawBadge.x + drawBadge.w / 2, drawBadge.y + drawBadge.h / 2);
    view.container.setScale(0.25);
    this.handViews.set(card.uid, view);
    this.shownHand.push(card);
    this.relayoutHand();
    this.refreshHandAffordability();
  }

  private relayoutHand(): void {
    const slots = handSlotPositions(this.shownHand.length);
    this.shownHand.forEach((card, index) => {
      const view = this.handViews.get(card.uid);
      if (!view) return;
      this.tweens.killTweensOf(view.container);
      this.tweens.add({
        targets: view.container,
        x: slots[index].x,
        y: slots[index].y,
        scale: HAND_CARD_SCALE,
        duration: 140,
        ease: 'Cubic.easeOut',
      });
    });
  }

  private travelToPlayZone(card: Card): void {
    const view = this.handViews.get(card.uid);
    this.shownHand = this.shownHand.filter((candidate) => candidate.uid !== card.uid);
    this.relayoutHand();
    if (!view) return;
    const zone = this.layout.playZone;
    this.tweens.killTweensOf(view.container);
    view.container.setDepth(16);
    this.tweens.add({
      targets: view.container,
      x: zone.x + zone.w / 2,
      y: zone.y + zone.h / 2,
      scale: HAND_CARD_SCALE,
      duration: 180,
      ease: 'Cubic.easeOut',
    });
  }

  private travelToDiscard(card: Card): void {
    const view = this.handViews.get(card.uid);
    if (!view) return;
    this.handViews.delete(card.uid);
    this.committedUids.delete(card.uid);
    this.shownHand = this.shownHand.filter((candidate) => candidate.uid !== card.uid);
    const badge = this.layout.discardPile;
    this.tweens.killTweensOf(view.container);
    this.tweens.add({
      targets: view.container,
      x: badge.x + badge.w / 2,
      y: badge.y + badge.h / 2,
      scale: 0.2,
      alpha: 0.6,
      duration: 160,
      ease: 'Cubic.easeIn',
      onComplete: () => view.container.destroy(),
    });
  }

  /**
   * Exhausted cards leave play like a discard but never travel to the discard
   * badge — there's no main-HUD exhaust pile, only the [C] inspector (R8). The
   * card instead burns out where it stands: a brief orange scorch flash under
   * it while it shrinks, rotates, and fades to nothing, reading as "gone for
   * the battle" rather than "filed into a pile".
   */
  private burnCardInPlace(card: Card): void {
    const view = this.handViews.get(card.uid);
    if (!view) return;
    this.handViews.delete(card.uid);
    this.committedUids.delete(card.uid);
    this.shownHand = this.shownHand.filter((candidate) => candidate.uid !== card.uid);
    this.tweens.killTweensOf(view.container);

    const scorch = this.add.graphics();
    scorch.fillStyle(0xff5522, 1);
    scorch.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 8);
    scorch.setAlpha(0);
    view.container.add(scorch);
    this.tweens.add({
      targets: scorch,
      alpha: 0.55,
      duration: 90,
      yoyo: true,
      ease: 'Cubic.easeOut',
    });

    this.tweens.add({
      targets: view.container,
      alpha: 0,
      scale: 0.15,
      angle: 24,
      duration: 260,
      ease: 'Quad.easeIn',
      onComplete: () => view.container.destroy(),
    });
  }

  private sweepHandToDiscard(): void {
    for (const card of [...this.shownHand]) this.travelToDiscard(card);
    this.shownHand = [];
  }

  /** Dim from engine truth (R7/AE6): unaffordable cards read as refusals before any press. */
  private refreshHandAffordability(): void {
    for (const [uid, view] of this.handViews) {
      if (this.committedUids.has(uid)) continue;
      const inHand = this.engineState.hand.some((card) => card.uid === uid);
      if (!inHand) continue;
      const affordable =
        this.engineState.phase === 'player' &&
        !this.engineState.playerStunned &&
        cardCost(view.card) <= this.engineState.energy;
      view.container.setAlpha(affordable ? 1 : 0.45);
      view.costText.setColor(affordable ? '#f5edd8' : '#ff6b5e');
    }
  }

  /** This turn's energy cap — `energyPerTurn` plus the turn-1-only relic bonus (mirrors
   * `startPlayerTurn`'s calc), so the HUD never shows current energy exceeding its own max. */
  private currentEnergyMax(): number {
    return (
      this.engineState.energyPerTurn +
      (this.engineState.turn === 1 ? this.engineState.startingEnergyBonus : 0)
    );
  }

  // ----------------------------------------------------------------- panels

  private drawStaticChrome(): void {
    const bg = this.add.graphics();
    bg.fillStyle(0x0b0a12, 0.94);
    bg.fillRect(0, 0, GAME_W, GAME_H);
    bg.lineStyle(3, 0xcab98a, 0.8);
    bg.strokeRoundedRect(12, 12, GAME_W - 24, GAME_H - 24, 10);
    bg.fillStyle(0x16121e, 0.5);
    const hand = this.layout.handArea;
    bg.fillRoundedRect(hand.x, hand.y, hand.w, hand.h, 8);
  }

  /** Build one EnemyView per foe, laid out in a row across the enemy band (multi-enemy). */
  private createEnemies(): void {
    const band = this.layout.enemyZone;
    const count = this.displays.length;
    const anchors = enemyAnchorsX(count);
    const barW = Math.min(band.w / count - 16, 180);
    this.displays.forEach((display, index) => {
      const cx = anchors[index];
      const spriteY = band.y + 112;
      this.add
        .text(cx, band.y + 4, display.name, {
          fontFamily: MONO,
          fontSize: display.boss ? '18px' : '14px',
          fontStyle: 'bold',
          color: display.boss ? '#ff5544' : '#f5edd8',
        })
        .setOrigin(0.5, 0);
      const focusRing = this.add.graphics();
      const hpBar = this.add.graphics();
      const hpText = this.add
        .text(cx, band.y + 30, '', { fontFamily: MONO, fontSize: '11px', color: '#f5edd8' })
        .setOrigin(0.5)
        .setDepth(1);
      const blockText = this.add
        .text(cx + barW / 2 + 4, band.y + 30, '', {
          fontFamily: MONO,
          fontSize: '11px',
          fontStyle: 'bold',
          color: '#8ecbff',
        })
        .setOrigin(0, 0.5);
      const sprite = this.add
        .image(cx, spriteY, display.texture)
        .setScale(this.spriteScale(count, display.boss))
        .setInteractive({ useHandCursor: true });
      sprite.on('pointerdown', () => this.onEnemyClicked(display.id));
      this.tweens.add({
        targets: sprite,
        y: spriteY - 6,
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      const statusText = this.add
        .text(cx, band.y + 176, '', { fontFamily: MONO, fontSize: '10px', color: '#c58cff' })
        .setOrigin(0.5);
      const intentText = this.add
        .text(cx, band.y + 200, '', {
          fontFamily: MONO,
          fontSize: '13px',
          fontStyle: 'bold',
          color: '#ff9944',
        })
        .setOrigin(0.5);
      const view: EnemyView = {
        display,
        sprite,
        hpBar,
        hpText,
        blockText,
        statusText,
        intentText,
        focusRing,
        anchorX: cx,
        spriteY,
        shownHp: display.hp,
        shownBlock: 0,
        statuses: new Map(),
      };
      this.enemyViews.set(display.id, view);
      this.refreshEnemyBar(view);
    });
    this.redrawFocusRings();
  }

  private createPlayerZone(): void {
    const zone = this.layout.playerZone;
    const cx = zone.x + 86;
    this.heroSprite = this.add.image(cx, zone.y + 52, 'hero_up_0').setScale(5);
    this.playerHpBar = this.add.graphics();
    this.playerHpText = this.add
      .text(cx, zone.y + 113, '', { fontFamily: MONO, fontSize: '12px', color: '#f5edd8' })
      .setOrigin(0.5)
      .setDepth(1);
    this.playerArmorText = this.add
      .text(zone.x + zone.w - 2, zone.y + 92, '', {
        fontFamily: MONO,
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#90d8e8',
      })
      .setOrigin(1, 0.5);
    this.playerBlockText = this.add
      .text(zone.x + zone.w - 2, zone.y + 106, '', {
        fontFamily: MONO,
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#8ecbff',
      })
      .setOrigin(1, 0.5);
    this.playerStatusText = this.add
      .text(zone.x + 6, zone.y + 122, '', { fontFamily: MONO, fontSize: '10px', color: '#c58cff' })
      .setOrigin(0, 0.5);
  }

  private createAnnouncement(): void {
    const region = this.layout.announcement;
    this.announcementText = this.add
      .text(region.x + region.w / 2, region.y + region.h / 2, '', {
        fontFamily: MONO,
        fontSize: '14px',
        fontStyle: 'bold',
        color: '#d8d2e4',
      })
      .setOrigin(0.5)
      .setDepth(25)
      .setAlpha(0);
  }

  /**
   * The battle log is gone (R-declutter): the turn model is transparent enough
   * that the play-by-play scroll no longer earned its column. Only the turn
   * counter it used to host survives, relocated to the top-left corner.
   */
  private createTurnCounter(): void {
    this.turnText = this.add.text(28, 286, 'TURN 1', {
      fontFamily: MONO,
      fontSize: '13px',
      fontStyle: 'bold',
      color: '#f1c40f',
    });
  }

  private createEnergyAndPiles(): void {
    const energy = this.layout.energyBadge;
    const ex = energy.x + energy.w / 2;
    const ey = energy.y + energy.h / 2;
    const g = this.add.graphics();
    g.fillStyle(0x2a241c, 1);
    g.fillCircle(ex, ey, 40);
    g.lineStyle(3, 0xf1c40f, 0.9);
    g.strokeCircle(ex, ey, 40);
    this.energyText = this.add
      .text(ex, ey - 4, '0/3', {
        fontFamily: MONO,
        fontSize: '22px',
        fontStyle: 'bold',
        color: '#f1c40f',
      })
      .setOrigin(0.5);
    this.add
      .text(ex, ey + 20, 'ENERGY', { fontFamily: MONO, fontSize: '9px', color: '#b8b0c8' })
      .setOrigin(0.5);

    this.drawCountText = this.makePileBadge(this.layout.drawPile, 'DRAW', 0x2980b9);
    this.discardCountText = this.makePileBadge(this.layout.discardPile, 'DISCARD', 0x8e44ad);
  }

  private makePileBadge(
    rect: TurnBattleRect,
    label: string,
    color: number,
  ): Phaser.GameObjects.Text {
    const g = this.add.graphics();
    g.fillStyle(0x16121e, 0.95);
    g.fillRoundedRect(rect.x, rect.y, rect.w, rect.h, 8);
    g.lineStyle(2, color, 0.9);
    g.strokeRoundedRect(rect.x, rect.y, rect.w, rect.h, 8);
    const count = this.add
      .text(rect.x + rect.w / 2, rect.y + rect.h / 2 - 8, '0', {
        fontFamily: MONO,
        fontSize: '22px',
        fontStyle: 'bold',
        color: '#f5edd8',
      })
      .setOrigin(0.5);
    this.add
      .text(rect.x + rect.w / 2, rect.y + rect.h - 14, `${label} [C]`, {
        fontFamily: MONO,
        fontSize: '8px',
        color: '#b8b0c8',
      })
      .setOrigin(0.5);
    const zone = this.add
      .zone(rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w, rect.h)
      .setInteractive({ useHandCursor: true });
    zone.on('pointerdown', () => this.togglePilePanel());
    return count;
  }

  private updatePileBadges(): void {
    this.drawCountText.setText(String(this.shown.draw));
    this.discardCountText.setText(String(this.shown.discard));
  }

  private createEndTurnButton(): void {
    const rect = this.layout.endTurnButton;
    this.endTurnBg = this.add.graphics();
    this.drawEndTurn(0xcab98a);
    const label = this.add
      .text(rect.x + rect.w / 2, rect.y + rect.h / 2, 'END\nTURN', {
        fontFamily: MONO,
        fontSize: '15px',
        fontStyle: 'bold',
        color: '#e8c070',
        align: 'center',
      })
      .setOrigin(0.5);
    this.add
      .text(rect.x + rect.w / 2, rect.y + rect.h + 10, '[E]', {
        fontFamily: MONO,
        fontSize: '10px',
        color: '#b8b0c8',
      })
      .setOrigin(0.5);
    this.endTurnZone = this.add
      .zone(rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w, rect.h)
      .setInteractive({ useHandCursor: true });
    this.endTurnZone.on('pointerdown', () => {
      this.pressAck(label);
      this.pressEndTurn();
    });
  }

  private drawEndTurn(strokeColor: number): void {
    const rect = this.layout.endTurnButton;
    this.endTurnBg.clear();
    this.endTurnBg.fillStyle(0x2a241c, 1);
    this.endTurnBg.fillRoundedRect(rect.x, rect.y, rect.w, rect.h, 8);
    this.endTurnBg.lineStyle(2, strokeColor, 1);
    this.endTurnBg.strokeRoundedRect(rect.x, rect.y, rect.w, rect.h, 8);
  }

  /** R22: when nothing is playable, the end-turn affordance itself lights up. */
  private pulseEndTurn(active: boolean): void {
    if (active) {
      if (this.endTurnPulse) return;
      this.drawEndTurn(0xf1c40f);
      this.endTurnPulse = this.tweens.add({
        targets: this.endTurnBg,
        alpha: 0.55,
        duration: 380,
        yoyo: true,
        repeat: -1,
      });
      return;
    }
    if (this.endTurnPulse) {
      this.endTurnPulse.stop();
      this.endTurnPulse = null;
    }
    this.endTurnBg.setAlpha(1);
    this.drawEndTurn(0xcab98a);
  }

  private createItemButtons(): void {
    const row = this.layout.itemRow;
    this.add
      .text(row.x + row.w / 2, row.y, 'ITEMS', {
        fontFamily: MONO,
        fontSize: '10px',
        fontStyle: 'bold',
        color: '#b8b0c8',
      })
      .setOrigin(0.5);
    this.refreshItemIcons();
  }

  /**
   * Free-action items as hover-only icons (R-declutter): the generated sprite
   * carries each item's identity, the tooltip carries its name + effect. Replaces
   * the old column of wrapped green text that crowded the right edge.
   */
  private refreshItemIcons(): void {
    for (const view of this.itemViews) view.icon.destroy();
    this.itemViews = [];
    this.hideItemTooltip();
    const row = this.layout.itemRow;
    const cx = row.x + row.w / 2;
    for (const [index, item] of this.items.entries()) {
      const icon = this.add
        .image(cx, row.y + 30 + index * 48, itemTexture(item))
        .setScale(2.4)
        .setInteractive({ useHandCursor: true });
      icon.on('pointerover', () => this.showItemTooltip(item, icon));
      icon.on('pointerout', () => this.hideItemTooltip());
      icon.on('pointerdown', () => this.pressItem(item, icon));
      this.itemViews.push({ icon });
    }
  }

  /** Name + effect panel for a hovered item, anchored just left of its icon. */
  private showItemTooltip(item: InventoryItem, icon: Phaser.GameObjects.Image): void {
    this.hideItemTooltip();
    const w = 150;
    const pad = 8;
    const name = this.add.text(pad, pad, item.name, {
      fontFamily: MONO,
      fontSize: '12px',
      fontStyle: 'bold',
      color: '#5fe07a',
    });
    const desc = this.add.text(pad, pad + name.height + 4, item.description, {
      fontFamily: MONO,
      fontSize: '10px',
      color: '#d8d2e4',
      wordWrap: { width: w - pad * 2, useAdvancedWrap: true },
    });
    const h = pad * 2 + name.height + 4 + desc.height;
    const bg = this.add.graphics();
    bg.fillStyle(0x111019, 0.96);
    bg.fillRoundedRect(0, 0, w, h, 8);
    bg.lineStyle(2, 0xcab98a, 0.85);
    bg.strokeRoundedRect(0, 0, w, h, 8);
    const x = icon.x - icon.displayWidth / 2 - 12 - w;
    const y = Phaser.Math.Clamp(icon.y - h / 2, 14, GAME_H - h - 14);
    this.itemTooltip = this.add.container(x, y, [bg, name, desc]).setDepth(ITEM_TOOLTIP_DEPTH);
  }

  private hideItemTooltip(): void {
    this.itemTooltip?.destroy();
    this.itemTooltip = null;
  }

  private drawBar(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    w: number,
    frac: number,
    color: number,
  ): void {
    g.clear();
    g.fillStyle(0x16121e, 1);
    g.fillRoundedRect(x, y, w, 14, 4);
    if (frac > 0) {
      g.fillStyle(color, 1);
      g.fillRoundedRect(x, y, Math.max(8, w * frac), 14, 4);
    }
    g.lineStyle(2, 0x3a3544, 1);
    g.strokeRoundedRect(x, y, w, 14, 4);
  }

  private refreshAllBars(): void {
    this.refreshPlayerBar();
    for (const view of this.enemyViews.values()) this.refreshEnemyBar(view);
  }

  private refreshEnemyBar(view: EnemyView): void {
    const band = this.layout.enemyZone;
    const barW = Math.min(band.w / this.displays.length - 16, 180);
    this.drawBar(
      view.hpBar,
      view.anchorX - barW / 2,
      band.y + 22,
      barW,
      view.shownHp / view.display.maxHp,
      0xe23b4e,
    );
    view.hpText.setText(`${Math.max(0, view.shownHp)} / ${view.display.maxHp}`);
    view.blockText.setText(view.shownBlock > 0 ? `■ ${view.shownBlock}` : '');
  }

  private refreshPlayerBar(): void {
    const playerZone = this.layout.playerZone;
    const maxHp = this.playerMaxHp || slicePlayer().maxHp;
    this.drawBar(
      this.playerHpBar,
      playerZone.x + 10,
      playerZone.y + 98,
      playerZone.w - 20,
      this.shown.playerHp / maxHp,
      0x5fe07a,
    );
    this.playerHpText.setText(`${Math.max(0, this.shown.playerHp)} / ${maxHp}`);
    this.playerBlockText.setText(this.shown.playerBlock > 0 ? `■ ${this.shown.playerBlock}` : '');
    this.playerArmorText.setText(this.playerArmor > 0 ? `◆ ${this.playerArmor}` : '');
  }

  private togglePilePanel(): void {
    if (this.pilePanel) {
      this.closePilePanel();
      return;
    }
    this.closeRelicPanel();
    this.pilePanel = createPileInspector(
      this,
      this.engineState.drawPile,
      this.engineState.discardPile,
      this.engineState.exhaustPile,
    );
  }

  private closePilePanel(): void {
    this.pilePanel?.destroy();
    this.pilePanel = null;
  }

  private toggleRelicPanel(): void {
    if (this.mode !== 'run') return;
    if (this.relicPanel) {
      this.closeRelicPanel();
      return;
    }
    this.closePilePanel();
    const run = getRun();
    this.relicPanel = createRelicPanel(
      this,
      'Your relics',
      GAME_W / 2,
      GAME_H / 2 - 12,
      run.relics,
    );
  }

  private closeRelicPanel(): void {
    this.relicPanel?.destroy();
    this.relicPanel = null;
  }

  // ---------------------------------------------------------------- outcome

  private showOutcome(outcome: 'victory' | 'defeat'): void {
    if (this.outcomeShown) return;
    this.outcomeShown = true;
    this.closePilePanel();
    this.closeRelicPanel();
    if (outcome === 'victory') {
      for (const view of this.enemyViews.values()) {
        this.tweens.add({
          targets: view.sprite,
          alpha: 0,
          angle: 12,
          scale: view.sprite.scale * 0.4,
          duration: 500,
          ease: 'Cubic.easeIn',
        });
      }
    }
    if (this.mode === 'run') {
      if (outcome === 'victory') this.runVictory();
      else this.runDefeat();
      return;
    }
    playSfx(this, outcome === 'victory' ? 'victory' : 'death');
    this.showSlicePanel(outcome);
  }

  /**
   * Run-mode victory (R25): gold and relic effects unchanged from the old flow;
   * the pick-1-of-3 deck reward replaces the take-an-enemy-card overlay; the
   * `battle-end` signal fires only AFTER the reward choice (preserved contract).
   */
  private runVictory(): void {
    const run = getRun();
    run.hp = this.engineState.player.hp;
    run.enemiesDefeated++;
    if (this.encounterKind === 'elite') run.elitesDefeated++;
    ensureRelicBehaviorsWired();
    const { heal } = emitBattleWon(run.relics.map((relic) => relic.id));
    if (heal > 0) {
      const before = run.hp;
      run.heal(heal);
      if (run.hp > before) {
        // Generic (not `${relic name} +N HP`): `heal` already sums every relic contributing to
        // RELIC_BATTLE_WON_HEAL, so a hardcoded relic-name label would misattribute the total the
        // moment a second post-victory-heal relic is owned alongside this one.
        this.combatPop(this.heroSprite, `+${heal} HP`, '#5fe07a');
      }
    }
    playSfx(this, 'victory');
    const gold = awardEnemyGold(run, this.rng, run.depth);
    const luckyLabel = relicGoldBonusLabel(run.relicIds);
    const eliteBonus = this.encounterKind === 'elite' ? awardEliteBonusGold(run, gold) : 0;
    const relicEliteGold = this.encounterKind === 'elite' ? awardRelicEliteGold(run) : 0;
    const totalGold = gold + eliteBonus + relicEliteGold;

    if (this.encounterKind === 'boss' && !run.atRelicCap) {
      const bossRelic = randomRelic(this.rng, new Set(run.relicIds), run.relicPool);
      if (bossRelic && run.addRelic(bossRelic)) {
        this.combatPop(this.heroSprite, `Boss relic: ${bossRelic.name}`, '#f1c40f');
      }
    }

    const relicOffers =
      this.encounterKind === 'elite' && !run.atRelicCap
        ? rollRelicOffers(this.rng, new Set(run.relicIds), run.relicPool, 3)
        : [];
    if (relicOffers.length > 0) {
      this.showRelicVictoryOverlay(relicOffers, totalGold, luckyLabel);
      return;
    }
    this.showCardVictoryOverlay(totalGold, luckyLabel);
  }

  private showRelicVictoryOverlay(offers: Relic[], totalGold: number, luckyLabel: string): void {
    const overlay = this.add.container(0, 0).setDepth(400);
    const g = this.add.graphics();
    g.fillStyle(0x0b0a12, 0.88);
    g.fillRect(0, 0, GAME_W, GAME_H);
    overlay.add(g);
    overlay.add(
      this.add
        .text(GAME_W / 2, 86, 'ELITE RELIC!', {
          fontFamily: MONO,
          fontSize: '36px',
          fontStyle: 'bold',
          color: '#f1c40f',
        })
        .setOrigin(0.5),
    );
    overlay.add(
      this.add
        .text(GAME_W / 2, 128, `+${totalGold} gold${luckyLabel}. Choose one relic:`, {
          fontFamily: MONO,
          fontSize: '16px',
          color: '#d8d2e4',
        })
        .setOrigin(0.5),
    );

    const spacing = Math.min(220, (GAME_W - 80) / Math.max(offers.length, 1));
    const startX = GAME_W / 2 - ((offers.length - 1) * spacing) / 2;
    for (const [index, relic] of offers.entries()) {
      const x = startX + index * spacing;
      const panel = this.add.container(x, 250);
      const bg = this.add.graphics();
      bg.fillStyle(0x111019, 0.96);
      bg.fillRoundedRect(-95, -70, 190, 170, 8);
      bg.lineStyle(2, relic.color, 0.9);
      bg.strokeRoundedRect(-95, -70, 190, 170, 8);
      panel.add(bg);
      panel.add(
        this.add
          .text(0, -48, relic.name, {
            fontFamily: MONO,
            fontSize: '15px',
            fontStyle: 'bold',
            color: '#f1c40f',
            align: 'center',
            wordWrap: { width: 170, useAdvancedWrap: true },
          })
          .setOrigin(0.5),
      );
      panel.add(
        this.add
          .text(0, 18, relic.description, {
            fontFamily: MONO,
            fontSize: '11px',
            color: '#d8d2e4',
            align: 'center',
            wordWrap: { width: 170, useAdvancedWrap: true },
          })
          .setOrigin(0.5),
      );
      panel.setSize(190, 170);
      panel.setInteractive(
        new Phaser.Geom.Rectangle(-95, -70, 190, 170),
        Phaser.Geom.Rectangle.Contains,
      );
      panel.on('pointerdown', () => {
        const run = getRun();
        run.addRelic(relic);
        this.game.events.emit('hud-update');
        overlay.destroy();
        this.showCardVictoryOverlay(totalGold, luckyLabel);
      });
      overlay.add(panel);
    }

    const skip = this.add
      .text(GAME_W / 2, 412, '[ Skip relic ]', {
        fontFamily: MONO,
        fontSize: '16px',
        color: '#b8b0c8',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        overlay.destroy();
        this.showCardVictoryOverlay(totalGold, luckyLabel);
      });
    overlay.add(skip);
  }

  private showCardVictoryOverlay(totalGold: number, luckyLabel: string): void {
    const run = getRun();
    const overlay = this.add.container(0, 0).setDepth(400);
    const g = this.add.graphics();
    g.fillStyle(0x0b0a12, 0.88);
    g.fillRect(0, 0, GAME_W, GAME_H);
    overlay.add(g);
    overlay.add(
      this.add
        .text(GAME_W / 2, 86, 'VICTORY!', {
          fontFamily: MONO,
          fontSize: '40px',
          fontStyle: 'bold',
          color: '#f1c40f',
        })
        .setOrigin(0.5),
    );
    overlay.add(
      this.add
        .text(GAME_W / 2, 132, `+${totalGold} gold${luckyLabel}. Add one card to your deck:`, {
          fontFamily: MONO,
          fontSize: '17px',
          color: '#d8d2e4',
        })
        .setOrigin(0.5),
    );

    const offers =
      this.encounterKind === 'elite'
        ? rollVictoryCardOffers(
            this.rng,
            run.depth,
            ELITE_CARD_OFFER_COUNT,
            ELITE_TIER_BIAS_DEPTH,
            run.archetypeId,
          )
        : rollVictoryCardOffers(this.rng, run.depth, undefined, undefined, run.archetypeId);
    const spacing = Math.min(CARD_W + 24, (GAME_W - 80) / Math.max(offers.length, 1));
    const startX = GAME_W / 2 - ((offers.length - 1) * spacing) / 2;
    for (const [index, card] of offers.entries()) {
      const view = makeCardView(this, card, startX + index * spacing, 258, 0.92, false);
      view.setDepth(401);
      view.setInteractive({ useHandCursor: true });
      view.on('pointerover', () => {
        view.setScale(1.0);
        this.showCardTooltip(card, view);
      });
      view.on('pointerout', () => {
        view.setScale(0.92);
        this.hideCardTooltip();
      });
      view.on('pointerdown', () => {
        run.addCard(card);
        this.game.events.emit('hud-update');
        this.endRunBattle(true);
      });
      overlay.add(view);
      const impact = previewRewardImpact({
        collection: run.cardCollection,
        change: { kind: 'add', card },
      });
      const preview = createRewardImpactText(
        this,
        startX + index * spacing,
        348,
        compactRewardImpactLabel(impact),
        CARD_W + 20,
      );
      preview.setDepth(401);
      overlay.add(preview);
    }

    const skip = this.add
      .text(GAME_W / 2, 412, '[ Take nothing ]', {
        fontFamily: MONO,
        fontSize: '16px',
        color: '#b8b0c8',
      })
      .setOrigin(0.5)
      .setDepth(401)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.endRunBattle(true));
    overlay.add(skip);
  }

  /** Preserved asymmetry: defeat routes straight to End and never emits `battle-end`. */
  private runDefeat(): void {
    const run = getRun();
    run.hp = 0;
    playSfx(this, 'death');
    this.cameras.main.fadeOut(700, 11, 10, 18);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.stop('Dungeon');
      this.scene.stop('Hud');
      this.scene.start('End', { victory: false });
    });
  }

  /** The victory return path: identical to the old scene's endBattle contract. */
  private endRunBattle(won: boolean): void {
    this.closePilePanel();
    this.scene.wake('Hud');
    this.scene.resume('Dungeon');
    this.game.events.emit('battle-end', won);
    this.game.events.emit('hud-update');
    this.scene.stop();
  }

  /** R24: the slice ends here, in-scene. No End route, no battle-end signal, no persistence. */
  private showSlicePanel(outcome: 'victory' | 'defeat'): void {
    const overlay = this.add.container(0, 0).setDepth(400);
    const g = this.add.graphics();
    g.fillStyle(0x0b0a12, 0.9);
    g.fillRect(0, 0, GAME_W, GAME_H);
    overlay.add(g);
    overlay.add(
      this.add
        .text(GAME_W / 2, 170, outcome === 'victory' ? 'VICTORY!' : 'DEFEAT', {
          fontFamily: MONO,
          fontSize: '44px',
          fontStyle: 'bold',
          color: outcome === 'victory' ? '#f1c40f' : '#ff5544',
        })
        .setOrigin(0.5),
    );
    overlay.add(
      this.add
        .text(GAME_W / 2, 218, 'Sandbox battle — nothing was saved.', {
          fontFamily: MONO,
          fontSize: '13px',
          color: '#b8b0c8',
        })
        .setOrigin(0.5),
    );
    // Restart reuses the same pack; strip the per-member `#index` back to slice def ids.
    const packParam = this.displays.map((d) => d.id.split('#')[0]).join(',');
    const other = nextSliceEnemy(this.displays[0].id.split('#')[0]);
    const options: { label: string; action: () => void }[] = [
      {
        label: '[ Fight again ]',
        action: () =>
          this.scene.restart({
            enemyId: packParam,
            seed: this.baseSeed,
            restartCount: this.restartCount + 1,
          }),
      },
      {
        label: `[ Other enemy: ${other.name} ]`,
        action: () =>
          this.scene.restart({
            enemyId: other.id,
            seed: this.baseSeed,
            restartCount: this.restartCount + 1,
          }),
      },
      { label: '[ Back to title ]', action: () => this.scene.start('Title') },
    ];
    for (const [index, option] of options.entries()) {
      const button = this.add
        .text(GAME_W / 2, 300 + index * 52, option.label, {
          fontFamily: MONO,
          fontSize: '18px',
          fontStyle: 'bold',
          color: '#e8c070',
          backgroundColor: '#2a241c',
          padding: { x: 12, y: 8 },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      button.on('pointerover', () => button.setColor('#f1c40f'));
      button.on('pointerout', () => button.setColor('#e8c070'));
      button.on('pointerdown', () => option.action());
      overlay.add(button);
    }
  }

  // ------------------------------------------------------------------ debug

  /** Console/automation handle, mirroring the `__game`/`__getRun` pattern in main.ts. */
  private exposeDebugHandle(): void {
    const debugWindow = window as unknown as { __slice?: SliceDebugHandle };
    debugWindow.__slice = {
      state: () => this.engineState,
      playCard: (uid: number) => this.pressCard(uid),
      endTurn: () => this.pressEndTurn(),
      useItem: (index: number) => {
        const item = this.items[index];
        const view = this.itemViews[index];
        if (item && view) this.pressItem(item, view.icon);
      },
      accelerate: () => this.queue.accelerate(),
      skipAll: () => this.queue.skipAll(),
    };
  }
}
