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
import { compactRewardImpactLabel, createRewardImpactText } from '../gfx/rewardImpactView';
import { CombatEvent, emitBattleWon } from '../game/combatEvents';
import { IntentPattern } from '../game/intentPatterns';
import { PresentationQueue, PresentationStep } from '../game/presentationQueue';
import { ensureRelicBehaviorsWired } from '../game/relicBehaviors';
import { previewRewardImpact } from '../game/rewardImpact';
import {
  awardEliteBonusGold,
  awardEnemyGold,
  ELITE_CARD_OFFER_COUNT,
  ELITE_TIER_BIAS_DEPTH,
  rollVictoryCardOffers,
} from '../game/rewards';
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

/** The Dungeon's launch payload (R14): the same run inputs the old scene consumed. */
export interface RunBattleSceneData {
  mode: 'run';
  enemy: EnemyInstance;
  rng: GameRng;
  /** Which room type spawned this battle (U7); read by later units for rewards/music (U8/U10). */
  encounterKind: 'normal' | 'elite' | 'boss';
}

type TurnBattleSceneData = SliceSceneData | RunBattleSceneData;

/** What the scene needs to draw and script an enemy, mode-independent. */
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

interface SliceDebugHandle {
  state: () => TurnBattleState;
  playCard: (uid: number) => void;
  endTurn: () => void;
  useItem: (index: number) => void;
  accelerate: () => void;
  skipAll: () => void;
}

const MONO = 'monospace';

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
  private display!: EnemyDisplay;
  private playerMaxHp = 0;
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
  private shownStatuses: Record<
    'player' | 'enemy',
    Map<StatusEffectType, { amount: number; turns: number }>
  > = {
    player: new Map(),
    enemy: new Map(),
  };
  private shown = {
    playerHp: 0,
    playerBlock: 0,
    enemyHp: 0,
    enemyBlock: 0,
    energy: 0,
    draw: 0,
    discard: 0,
  };

  private enemySprite!: Phaser.GameObjects.Image;
  private heroSprite!: Phaser.GameObjects.Image;
  private enemyHpBar!: Phaser.GameObjects.Graphics;
  private playerHpBar!: Phaser.GameObjects.Graphics;
  private enemyHpText!: Phaser.GameObjects.Text;
  private playerHpText!: Phaser.GameObjects.Text;
  private playerBlockText!: Phaser.GameObjects.Text;
  private enemyBlockText!: Phaser.GameObjects.Text;
  private playerStatusText!: Phaser.GameObjects.Text;
  private enemyStatusText!: Phaser.GameObjects.Text;
  private intentTitle!: Phaser.GameObjects.Text;
  private intentLine!: Phaser.GameObjects.Text;
  private announcementText!: Phaser.GameObjects.Text;
  private energyText!: Phaser.GameObjects.Text;
  private turnText!: Phaser.GameObjects.Text;
  private drawCountText!: Phaser.GameObjects.Text;
  private discardCountText!: Phaser.GameObjects.Text;
  private endTurnBg!: Phaser.GameObjects.Graphics;
  private endTurnZone!: Phaser.GameObjects.Zone;
  private endTurnPulse: Phaser.Tweens.Tween | null = null;
  private logText!: Phaser.GameObjects.Text;
  private logLines: string[] = [];
  private itemButtons: Phaser.GameObjects.Text[] = [];
  private pilePanel: Phaser.GameObjects.Container | null = null;
  /** The rules-text tooltip for whichever card is currently hovered (hand or reward), if any (U11). */
  private activeTooltip: Phaser.GameObjects.Container | null = null;
  private outcomeShown = false;
  private keyC!: Phaser.Input.Keyboard.Key;
  private keyE!: Phaser.Input.Keyboard.Key;

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
      const def = data.enemy.def;
      this.display = {
        id: def.id,
        name: def.name,
        texture: def.texture,
        hp: data.enemy.hp,
        maxHp: data.enemy.maxHp,
        armor: data.enemy.armor,
        boss: def.boss,
        pattern: data.enemy.pattern,
      };
      this.items = getRun().inventory.filter((item) => item.usableInCombat);
    } else {
      this.mode = 'slice';
      this.baseSeed = data.seed ?? String(Math.random());
      this.restartCount = data.restartCount ?? 0;
      const sliceDef = sliceEnemy(data.enemyId);
      this.display = {
        id: sliceDef.id,
        name: sliceDef.name,
        texture: sliceDef.texture,
        hp: sliceDef.hp,
        maxHp: sliceDef.hp,
        armor: sliceDef.armor,
        boss: false,
        pattern: sliceDef.pattern,
      };
      const seed = this.restartCount > 0 ? `${this.baseSeed}:${this.restartCount}` : this.baseSeed;
      this.rng = new PhaserGameRng(new Phaser.Math.RandomDataGenerator([seed]));
      this.items = buildSliceItems();
    }
    this.beatActive = false;
    this.shownHand = [];
    this.handViews = new Map();
    this.committedUids = new Set();
    this.shownStatuses = { player: new Map(), enemy: new Map() };
    this.logLines = [];
    this.itemButtons = [];
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

    stopAmbience(this.game);
    playMusic(this, trackForEncounterKind(this.encounterKind));

    this.drawStaticChrome();
    this.createEnemyZone();
    this.createPlayerZone();
    this.createIntentPanel();
    this.createAnnouncement();
    this.createLogPanel();
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
    this.shown = {
      playerHp: player.hp,
      playerBlock: 0,
      enemyHp: this.display.hp,
      enemyBlock: 0,
      energy: 0,
      draw: deck.length,
      discard: 0,
    };
    const result = createBattle(
      {
        deck,
        player,
        enemy: {
          id: this.display.id,
          name: this.display.name,
          hp: this.display.hp,
          maxHp: this.display.maxHp,
          armor: this.display.armor,
        },
        pattern: this.display.pattern,
        // swift_boots re-specified for the deck model (U12): +1 draw each turn.
        drawSize: run?.hasRelic('swift_boots') ? 6 : undefined,
      },
      this.rng,
    );
    this.acceptResult(result);
    this.refreshAllBars();

    this.exposeDebugHandle();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.closePilePanel();
      this.hideCardTooltip();
      stopAllMusic(this.game);
      startAmbience(this.game);
    });
  }

  update(): void {
    this.queue.tick();
    if (Phaser.Input.Keyboard.JustDown(this.keyC)) this.togglePilePanel();
    if (Phaser.Input.Keyboard.JustDown(this.keyE)) this.pressEndTurn();
  }

  // ---------------------------------------------------------------- commands

  /** Common post-command bookkeeping: adopt the new truth, queue its replay, log it. */
  private acceptResult(result: TurnCommandResult): void {
    this.engineState = result.state;
    this.appendLog(result.log);
    this.queue.enqueue(toSteps(result.events));
    this.refreshHandAffordability();
    this.refreshItemButtons();
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
    const result = playCard(this.engineState, uid, this.rng);
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

  private pressItem(item: InventoryItem, button: Phaser.GameObjects.Text): void {
    this.pressAck(button);
    if (this.beatActive && !this.queue.idle) {
      this.queue.accelerate();
      return;
    }
    if (this.engineState.phase === 'decided') {
      this.rejectCue('Battle decided');
      this.queue.accelerate();
      return;
    }
    const result = useItem(this.engineState, item, this.rng);
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
      case 'intentTelegraphed':
        this.setIntent(event.name, `${event.telegraph}`, event.kind, event.magnitude, false);
        playSfx(this, 'boss_telegraph', 0.25);
        break;
      case 'intentVoided':
        this.setIntent(
          event.reason === 'stun' ? 'STUNNED' : 'SMOKED',
          event.reason === 'stun' ? 'the intent is lost' : 'it cannot see you',
          'unknown',
          0,
          true,
        );
        break;
      case 'cardPlayed':
        this.shown.energy = event.energyAfter;
        this.energyText.setText(`${event.energyAfter}/${this.engineState.energyPerTurn}`);
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
      case 'statusApplied':
        this.shownStatuses[this.sideFor(event.targetId)].set(event.status, {
          amount: event.amount,
          turns: event.remainingTurns,
        });
        this.renderStatuses();
        this.combatPop(this.spriteFor(event.targetId), event.status.toUpperCase(), '#c58cff');
        playSfx(this, 'trap', 0.3);
        break;
      case 'statusTicked': {
        const side = this.sideFor(event.targetId);
        if (event.remainingTurns > 0)
          this.shownStatuses[side].set(event.status, {
            amount: event.amount,
            turns: event.remainingTurns,
          });
        else this.shownStatuses[side].delete(event.status);
        this.renderStatuses();
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
        const side = this.sideFor(event.targetId);
        const existing = this.shownStatuses[side].get(event.status);
        if (event.remainingTurns > 0)
          this.shownStatuses[side].set(event.status, {
            amount: existing?.amount ?? 0,
            turns: event.remainingTurns,
          });
        else this.shownStatuses[side].delete(event.status);
        this.renderStatuses();
        break;
      }
      case 'blockExpired':
        this.setShownBlock(event.targetId, 0);
        break;
      case 'stunned':
        this.shownStatuses.player.delete('stun');
        this.renderStatuses();
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
      case 'enemyBeatStarted':
        this.beatActive = true;
        this.tweens.add({
          targets: this.enemySprite,
          y: this.enemySprite.y + 14,
          duration: 130,
          yoyo: true,
          ease: 'Cubic.easeIn',
        });
        break;
      case 'enemyBeatFizzled':
        this.beatActive = true;
        this.combatPop(this.enemySprite, 'FIZZLE', '#b8b0c8');
        this.setIntent('...', 'the moment passes', 'unknown', 0, false);
        playSfx(this, 'trap', 0.35);
        break;
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
    return targetId === 'player' ? this.heroSprite : this.enemySprite;
  }

  private sideFor(targetId: string): 'player' | 'enemy' {
    return targetId === 'player' ? 'player' : 'enemy';
  }

  private setShownHp(targetId: string, hp: number): void {
    if (targetId === 'player') this.shown.playerHp = hp;
    else this.shown.enemyHp = hp;
    this.refreshAllBars();
  }

  private setShownBlock(targetId: string, block: number): void {
    if (targetId === 'player') this.shown.playerBlock = block;
    else this.shown.enemyBlock = block;
    this.refreshAllBars();
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
  private pressAck(target: Phaser.GameObjects.Container | Phaser.GameObjects.Text): void {
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

  private appendLog(lines: string[]): void {
    this.logLines.push(...lines.filter((line) => line.length > 0));
    this.logLines = this.logLines.slice(-13);
    this.logText.setText(this.logLines.join('\n'));
  }

  // ------------------------------------------------------------- hand views

  private makeHandCardView(card: Card): HandView {
    const container = makeCardView(this, card, 0, 0);
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

  private createEnemyZone(): void {
    const zone = this.layout.enemyZone;
    const cx = zone.x + zone.w / 2;
    this.add
      .text(cx, zone.y + 12, this.display.name, {
        fontFamily: MONO,
        fontSize: this.display.boss ? '24px' : '22px',
        fontStyle: 'bold',
        color: this.display.boss ? '#ff5544' : '#f5edd8',
      })
      .setOrigin(0.5);
    this.enemySprite = this.add
      .image(cx, zone.y + 110, this.display.texture)
      .setScale(this.display.boss ? 5.5 : 6);
    this.tweens.add({
      targets: this.enemySprite,
      y: this.enemySprite.y - 8,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.enemyHpBar = this.add.graphics();
    this.enemyHpText = this.add
      .text(cx, zone.y + 38, '', { fontFamily: MONO, fontSize: '12px', color: '#f5edd8' })
      .setOrigin(0.5)
      .setDepth(1);
    this.enemyBlockText = this.add
      .text(zone.x + zone.w - 4, zone.y + 30, '', {
        fontFamily: MONO,
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#8ecbff',
      })
      .setOrigin(1, 0.5);
    this.enemyStatusText = this.add
      .text(cx, zone.y + zone.h - 8, '', { fontFamily: MONO, fontSize: '10px', color: '#c58cff' })
      .setOrigin(0.5);
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

  private createIntentPanel(): void {
    const panel = this.layout.intentPanel;
    const g = this.add.graphics();
    g.fillStyle(0x16121e, 0.85);
    g.fillRoundedRect(panel.x, panel.y, panel.w, panel.h, 6);
    g.lineStyle(1, 0x3a3544, 1);
    g.strokeRoundedRect(panel.x, panel.y, panel.w, panel.h, 6);
    this.intentTitle = this.add
      .text(panel.x + panel.w / 2, panel.y + 13, 'The enemy stirs...', {
        fontFamily: MONO,
        fontSize: '14px',
        fontStyle: 'bold',
        color: '#ff9944',
      })
      .setOrigin(0.5);
    this.intentLine = this.add
      .text(panel.x + panel.w / 2, panel.y + 32, '', {
        fontFamily: MONO,
        fontSize: '10px',
        color: '#b8b0c8',
      })
      .setOrigin(0.5);
  }

  private setIntent(
    name: string,
    telegraph: string,
    kind: string,
    magnitude: number,
    voided: boolean,
  ): void {
    const label =
      kind === 'attack'
        ? `${name} — ${magnitude} damage incoming`
        : kind === 'block'
          ? `${name} — braces for ${magnitude}`
          : kind === 'status'
            ? `${name} — affliction incoming`
            : kind === 'heal'
              ? `${name} — recovers ${magnitude}`
              : name;
    this.intentTitle.setText(label).setColor(voided ? '#b8b0c8' : '#ff9944');
    this.intentLine.setText(telegraph);
    this.intentTitle.setScale(1.12);
    this.tweens.add({ targets: this.intentTitle, scale: 1, duration: 180 });
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

  private createLogPanel(): void {
    const panel = this.layout.logPanel;
    const g = this.add.graphics();
    g.fillStyle(0x16121e, 0.7);
    g.fillRoundedRect(panel.x, panel.y, panel.w, panel.h, 6);
    g.lineStyle(1, 0x3a3544, 1);
    g.strokeRoundedRect(panel.x, panel.y, panel.w, panel.h, 6);
    this.turnText = this.add.text(panel.x + 10, panel.y + 8, 'TURN 1', {
      fontFamily: MONO,
      fontSize: '12px',
      fontStyle: 'bold',
      color: '#f1c40f',
    });
    this.logText = this.add.text(panel.x + 10, panel.y + 26, '', {
      fontFamily: MONO,
      fontSize: '9px',
      color: '#b8b0c8',
      lineSpacing: 2,
      wordWrap: { width: panel.w - 20, useAdvancedWrap: true },
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
    this.refreshItemButtons();
  }

  private refreshItemButtons(): void {
    for (const button of this.itemButtons) button.destroy();
    this.itemButtons = [];
    const row = this.layout.itemRow;
    for (const [index, item] of this.items.entries()) {
      const button = this.add
        .text(row.x + row.w / 2, row.y + 20 + index * 38, `${item.name}\n${item.description}`, {
          fontFamily: MONO,
          fontSize: '9px',
          fontStyle: 'bold',
          color: '#5fe07a',
          backgroundColor: '#1c2a1e',
          padding: { x: 6, y: 4 },
          align: 'center',
          wordWrap: { width: row.w - 16, useAdvancedWrap: true },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      button.on('pointerdown', () => this.pressItem(item, button));
      this.itemButtons.push(button);
    }
  }

  private refreshAllBars(): void {
    const bar = (
      g: Phaser.GameObjects.Graphics,
      x: number,
      y: number,
      w: number,
      frac: number,
      color: number,
    ) => {
      g.clear();
      g.fillStyle(0x16121e, 1);
      g.fillRoundedRect(x, y, w, 14, 4);
      if (frac > 0) {
        g.fillStyle(color, 1);
        g.fillRoundedRect(x, y, Math.max(8, w * frac), 14, 4);
      }
      g.lineStyle(2, 0x3a3544, 1);
      g.strokeRoundedRect(x, y, w, 14, 4);
    };
    const enemyZone = this.layout.enemyZone;
    bar(
      this.enemyHpBar,
      enemyZone.x + 10,
      enemyZone.y + 30,
      enemyZone.w - 20,
      this.shown.enemyHp / this.display.maxHp,
      0xe23b4e,
    );
    this.enemyHpText
      .setText(`${Math.max(0, this.shown.enemyHp)} / ${this.display.maxHp}`)
      .setY(enemyZone.y + 38);
    this.enemyBlockText.setText(this.shown.enemyBlock > 0 ? `■ ${this.shown.enemyBlock}` : '');

    const playerZone = this.layout.playerZone;
    const maxHp = this.playerMaxHp || slicePlayer().maxHp;
    bar(
      this.playerHpBar,
      playerZone.x + 10,
      playerZone.y + 98,
      playerZone.w - 20,
      this.shown.playerHp / maxHp,
      0x5fe07a,
    );
    this.playerHpText.setText(`${Math.max(0, this.shown.playerHp)} / ${maxHp}`);
    this.playerBlockText.setText(this.shown.playerBlock > 0 ? `■ ${this.shown.playerBlock}` : '');
  }

  private renderStatuses(): void {
    const format = (map: Map<StatusEffectType, { amount: number; turns: number }>): string =>
      [...map.entries()]
        // Strength is a permanent stack (no timer) — show its amount; timed statuses show turns.
        .map(([type, v]) => (type === 'strength' ? `str +${v.amount}` : `${type} ${v.turns}`))
        .join('  ');
    this.playerStatusText.setText(format(this.shownStatuses.player));
    this.enemyStatusText.setText(format(this.shownStatuses.enemy));
  }

  private togglePilePanel(): void {
    if (this.pilePanel) {
      this.closePilePanel();
      return;
    }
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

  // ---------------------------------------------------------------- outcome

  private showOutcome(outcome: 'victory' | 'defeat'): void {
    if (this.outcomeShown) return;
    this.outcomeShown = true;
    this.closePilePanel();
    if (outcome === 'victory') {
      this.tweens.add({
        targets: this.enemySprite,
        alpha: 0,
        angle: 12,
        scale: this.enemySprite.scale * 0.4,
        duration: 500,
        ease: 'Cubic.easeIn',
      });
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
    ensureRelicBehaviorsWired();
    const { heal } = emitBattleWon(run.relics.map((relic) => relic.id));
    if (heal > 0) {
      const before = run.hp;
      run.heal(heal);
      if (run.hp > before) this.combatPop(this.heroSprite, `+${heal} HP`, '#5fe07a');
    }
    playSfx(this, 'victory');
    const gold = awardEnemyGold(run, this.rng, run.depth);
    const eliteBonus = this.encounterKind === 'elite' ? awardEliteBonusGold(run, gold) : 0;
    const totalGold = gold + eliteBonus;

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
        .text(GAME_W / 2, 132, `+${totalGold} gold. Add one card to your deck:`, {
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
      const view = makeCardView(this, card, startX + index * spacing, 258, 0.92);
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
    const other = nextSliceEnemy(this.display.id);
    const options: { label: string; action: () => void }[] = [
      {
        label: '[ Fight again ]',
        action: () =>
          this.scene.restart({
            enemyId: this.display.id,
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
        const button = this.itemButtons[index];
        if (item && button) this.pressItem(item, button);
      },
      accelerate: () => this.queue.accelerate(),
      skipAll: () => this.queue.skipAll(),
    };
  }
}
