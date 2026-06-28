import Phaser from 'phaser';
import { GAME_H, GAME_W, PUNCH_DAMAGE } from '../config';
import { Card, cardEffectAmount } from '../data/cards';
import { EnemyInstance } from '../data/enemies';
import { InventoryItem } from '../data/items';
import { CARD_H, CARD_W, makeCardBack, makeCardView } from '../gfx/cardview';
import { createBattlePlanningBoard } from '../gfx/battlePlanningBoard';
import { createDeckPanel } from '../gfx/deckPanel';
import { compactRewardImpactLabel, createRewardImpactText } from '../gfx/rewardImpactView';
import { BattlePlanPhase, buildBattlePlanState } from '../game/battlePlan';
import { BattleLayout, getBattleLayout } from '../game/battleLayout';
import { buildBattleRoundHistory } from '../game/battleLog';
import {
  ActiveStatusEffect,
  CombatAction,
  resolveRound,
} from '../game/combat';
import { EnemyIntentPlan, planEnemyIntent } from '../game/enemyIntent';
import { GameRng } from '../game/rng';
import { previewRewardImpact } from '../game/rewardImpact';
import { awardEnemyGold } from '../game/rewards';
import { playSfx } from '../audio/sfx';
import { getRun } from '../state';

type PlayerAction =
  | { kind: 'card'; card: Card }
  | { kind: 'item'; item: InventoryItem }
  | { kind: 'punch' };

export class BattleScene extends Phaser.Scene {
  private enemy!: EnemyInstance;
  private rng!: GameRng;
  private round = 1;
  private busy = false;
  private playerUsed = new Set<number>();
  private enemyUsed = new Set<number>();
  private enemyIntent: EnemyIntentPlan | null = null;
  private playerStatuses: ActiveStatusEffect[] = [];
  private enemyStatuses: ActiveStatusEffect[] = [];

  private handViews: Phaser.GameObjects.Container[] = [];
  private itemButtons: Phaser.GameObjects.Text[] = [];
  private enemyCardBacks: Phaser.GameObjects.Container[] = [];
  private enemySprite!: Phaser.GameObjects.Image;
  private heroSprite!: Phaser.GameObjects.Image;
  private enemyHpBar!: Phaser.GameObjects.Graphics;
  private playerHpBar!: Phaser.GameObjects.Graphics;
  private enemyHpText!: Phaser.GameObjects.Text;
  private playerHpText!: Phaser.GameObjects.Text;
  private logText!: Phaser.GameObjects.Text;
  private historyText!: Phaser.GameObjects.Text;
  private telegraphText!: Phaser.GameObjects.Text;
  private armorText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private relicText!: Phaser.GameObjects.Text;
  private historyLines: string[] = [];
  private battleLayout: BattleLayout = getBattleLayout();
  private planningBoard: Phaser.GameObjects.Container | null = null;
  private deckOverlay: Phaser.GameObjects.Container | null = null;
  private toggleDeckKey!: Phaser.Input.Keyboard.Key;

  constructor() {
    super('Battle');
  }

  init(data: { enemy: EnemyInstance; rng: GameRng }): void {
    this.enemy = data.enemy;
    this.rng = data.rng;
    this.round = 1;
    this.busy = false;
    this.playerUsed = new Set();
    this.enemyUsed = new Set();
    this.enemyIntent = null;
    this.playerStatuses = [];
    this.enemyStatuses = [];
    this.handViews = [];
    this.itemButtons = [];
    this.enemyCardBacks = [];
    this.historyLines = [];
    this.battleLayout = getBattleLayout();
    this.planningBoard = null;
    this.deckOverlay = null;
  }

  create(): void {
    const run = getRun();
    const cx = GAME_W / 2;
    this.toggleDeckKey = this.input.keyboard!.addKey('C');

    this.scene.sleep('Hud');

    const bg = this.add.graphics();
    bg.fillStyle(0x0b0a12, 0.92);
    bg.fillRect(0, 0, GAME_W, GAME_H);
    bg.lineStyle(3, 0xcab98a, 0.8);
    bg.strokeRoundedRect(12, 12, GAME_W - 24, GAME_H - 24, 10);

    const isBoss = this.enemy.def.boss;
    this.enemySprite = this.add
      .image(cx, isBoss ? 158 : 150, this.enemy.def.texture)
      .setScale(isBoss ? 5.5 : 6);
    this.tweens.add({
      targets: this.enemySprite,
      y: this.enemySprite.y - 8,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.add
      .text(cx, 42, this.enemy.def.name, {
        fontFamily: 'monospace',
        fontSize: isBoss ? '28px' : '22px',
        fontStyle: 'bold',
        color: isBoss ? '#ff5544' : '#f5edd8',
      })
      .setOrigin(0.5);
    this.enemyHpBar = this.add.graphics();
    this.enemyHpText = this.add
      .text(cx, 68, '', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#f5edd8',
      })
      .setOrigin(0.5);

    this.heroSprite = this.add.image(110, 408, 'hero_up_0').setScale(5);
    this.playerHpBar = this.add.graphics();
    this.playerHpText = this.add
      .text(110, 472, '', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#f5edd8',
      })
      .setOrigin(0.5);
    this.armorText = this.add
      .text(110, 350, run.armor > 0 ? `Armor +${run.armor}` : '', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#aab2bd',
      })
      .setOrigin(0.5);
    this.relicText = this.add.text(110, 365, '', {
      fontFamily: 'monospace',
      fontSize: '9px',
      color: '#b8b0c8',
      fixedWidth: 180,
    });
    this.statusText = this.add
      .text(cx, 306, '', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#b8b0c8',
        align: 'center',
      })
      .setOrigin(0.5);

    const history = this.battleLayout.historyPanel;
    const historyBg = this.add.graphics();
    historyBg.fillStyle(0x16121e, 0.82);
    historyBg.fillRoundedRect(history.x, history.y, history.w, history.h, 6);
    historyBg.lineStyle(1, 0x3a3544, 1);
    historyBg.strokeRoundedRect(history.x, history.y, history.w, history.h, 6);
    this.add.text(history.x + 12, history.y + 10, 'Battle log', {
      fontFamily: 'monospace',
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#f1c40f',
    });
    this.historyText = this.add.text(history.x + 12, history.y + 34, 'Battle history appears here.', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#d8d2e4',
      fixedWidth: history.w - 24,
      lineSpacing: 3,
      wordWrap: { width: history.w - 24, useAdvancedWrap: true },
    });

    this.logText = this.add
      .text(cx, 352, 'Choose a card, item, or punch. [C] deck', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#d8d2e4',
        align: 'center',
      })
      .setOrigin(0.5);
    this.telegraphText = this.add
      .text(cx, 214, '', {
        fontFamily: 'monospace',
        fontSize: '14px',
        fontStyle: 'bold',
        color: '#ff9944',
        align: 'center',
      })
      .setOrigin(0.5);

    this.add
      .text(615, 345, `Punch\n(${PUNCH_DAMAGE} dmg)`, {
        fontFamily: 'monospace',
        fontSize: '14px',
        fontStyle: 'bold',
        color: '#e8c070',
        backgroundColor: '#2a241c',
        padding: { x: 10, y: 8 },
        align: 'center',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => {
        if (!this.busy && !this.deckOverlay) {
          this.renderPlanningBoard({ actor: 'player', kind: 'punch' });
        }
      })
      .on('pointerout', () => !this.busy && !this.deckOverlay && this.renderPlanningBoard())
      .on('pointerdown', () => {
        if (!this.busy && !this.deckOverlay) this.playRound({ kind: 'punch' });
      });

    this.redrawBars();
    this.renderEnemyCards();
    this.renderHand();
    this.renderItems();
    this.commitEnemyIntent();
    this.renderPlanningBoard();
    this.updateTelegraph();
    this.updateStatusText();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.closeDeckOverlay());
  }

  private redrawBars(): void {
    const run = getRun();
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
    bar(this.enemyHpBar, GAME_W / 2 - 110, 78, 220, this.enemy.hp / this.enemy.maxHp, 0xe23b4e);
    this.enemyHpText
      .setY(85)
      .setText(`${Math.max(0, this.enemy.hp)} / ${this.enemy.maxHp}`)
      .setDepth(1);
    bar(this.playerHpBar, 40, 452, 140, run.hp / run.maxHp, 0x5fe07a);
    this.playerHpText
      .setY(459)
      .setText(`${Math.max(0, run.hp)} / ${run.maxHp}`)
      .setDepth(1);
    this.armorText.setText(run.armor > 0 ? `Armor +${run.armor}` : '');

    if (run.relics.length > 0) {
      this.relicText.setText(run.relics.map((relic) => relic.name).join(' / '));
    } else {
      this.relicText.setText('');
    }
  }

  private renderEnemyCards(): void {
    for (const v of this.enemyCardBacks) v.destroy();
    this.enemyCardBacks = [];
    const n = this.enemy.cards.length;
    const startX = GAME_W - 40 - (n - 1) * 26;
    for (const [i, card] of this.enemy.cards.entries()) {
      const back = makeCardBack(this, startX + i * 26, 90, 0.34);
      if (this.enemyUsed.has(card.uid)) back.setAlpha(0.25);
      this.enemyCardBacks.push(back);
    }
  }

  private renderHand(): void {
    for (const v of this.handViews) v.destroy();
    this.handViews = [];
    const run = getRun();
    const n = run.combatHand.length;
    const spacing = Math.min(CARD_W + 12, (GAME_W - 120) / Math.max(n, 1));
    const startX = GAME_W / 2 - ((n - 1) * spacing) / 2;
    const y = GAME_H - CARD_H / 2 - 24;
    for (const [i, card] of run.combatHand.entries()) {
      const view = makeCardView(this, card, startX + i * spacing, y);
      const used = this.playerUsed.has(card.uid);
      if (used) {
        view.setAlpha(0.3);
      } else {
        view.setInteractive({ useHandCursor: true });
        view.on('pointerover', () => {
          if (!this.busy && !this.deckOverlay) {
            view.setY(y - 16);
            this.renderPlanningBoard({ actor: 'player', kind: 'card', card });
          }
        });
        view.on('pointerout', () => {
          view.setY(y);
          if (!this.busy && !this.deckOverlay) this.renderPlanningBoard();
        });
        view.on('pointerdown', () => {
          if (!this.busy && !this.deckOverlay) this.playRound({ kind: 'card', card });
        });
      }
      this.handViews.push(view);
    }
  }

  private renderItems(): void {
    for (const button of this.itemButtons) button.destroy();
    this.itemButtons = [];
    const items = getRun().inventory.filter((item) => item.usableInCombat);
    for (const [i, item] of items.entries()) {
      const button = this.add
        .text(615, 410 + i * 42, `${item.name}\n${item.description}`, {
          fontFamily: 'monospace',
          fontSize: '10px',
          fontStyle: 'bold',
          color: '#5fe07a',
          backgroundColor: '#1c2a1e',
          padding: { x: 8, y: 5 },
          align: 'center',
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on('pointerover', () => {
          if (!this.busy && !this.deckOverlay) {
            this.renderPlanningBoard({ actor: 'player', kind: 'item', item });
          }
        })
        .on('pointerout', () => !this.busy && !this.deckOverlay && this.renderPlanningBoard())
        .on('pointerdown', () => {
          if (!this.busy && !this.deckOverlay) this.playRound({ kind: 'item', item });
        });
      this.itemButtons.push(button);
    }
  }

  private toggleDeckOverlay(): void {
    if (this.deckOverlay) {
      this.closeDeckOverlay();
      return;
    }

    const run = getRun();
    this.deckOverlay = createDeckPanel(
      this,
      'Deck order',
      GAME_W / 2,
      GAME_H / 2 - 8,
      run.cardCollection,
      run.combatHand,
    );
  }

  private closeDeckOverlay(): void {
    this.deckOverlay?.destroy();
    this.deckOverlay = null;
  }

  private setPrompt(text: string): void {
    this.logText.setText(text);
  }

  private appendHistory(lines: string[]): void {
    this.historyLines.push(...lines.filter((line) => line.length > 0));
    this.historyLines = this.historyLines.slice(-14);
    this.historyText.setText(this.historyLines.join('\n'));
  }

  private updateTelegraph(): void {
    const intent = this.enemyIntent;
    this.telegraphText.setText('');
    if (intent?.summary.telegraph) {
      playSfx(this, 'boss_telegraph');
    }
  }

  private updateStatusText(): void {
    const format = (label: string, statuses: ActiveStatusEffect[]) =>
      statuses.length === 0
        ? `${label}: none`
        : `${label}: ${statuses.map((status) => `${status.type} ${status.remainingTurns}`).join(', ')}`;
    this.statusText.setText(
      `${format('You', this.playerStatuses)}\n${format('Enemy', this.enemyStatuses)}`,
    );
  }

  private toCombatAction(action: PlayerAction): CombatAction {
    if (action.kind === 'card') return { actor: 'player', kind: 'card', card: action.card };
    if (action.kind === 'item') return { actor: 'player', kind: 'item', item: action.item };
    return { actor: 'player', kind: 'punch' };
  }

  private commitEnemyIntent(): EnemyIntentPlan {
    this.enemyIntent = planEnemyIntent({
      enemy: this.enemy,
      round: this.round,
      usedCardUids: this.enemyUsed,
      rng: this.rng,
    });
    return this.enemyIntent;
  }

  private currentEnemyIntent(): EnemyIntentPlan {
    return this.enemyIntent ?? this.commitEnemyIntent();
  }

  private renderPlanningBoard(
    playerAction?: CombatAction,
    phase: BattlePlanPhase = 'planning',
    resolvedLog: readonly string[] = [],
    intent: EnemyIntentPlan | null = this.enemyIntent,
  ): void {
    this.planningBoard?.destroy();
    this.planningBoard = null;
    if (!intent) return;

    const run = getRun();
    const state = buildBattlePlanState({
      phase,
      enemyName: this.enemy.def.name,
      enemyIntent: intent.summary,
      enemyAction: intent.action,
      playerAction,
      player: {
        label: 'You',
        armor: run.armor,
        statuses: this.playerStatuses,
      },
      enemy: {
        label: this.enemy.def.name,
        armor: this.enemy.armor,
        statuses: this.enemyStatuses,
      },
      resolvedLog,
    });
    this.planningBoard = createBattlePlanningBoard(
      this,
      this.battleLayout.planningBoard,
      state,
    );
  }

  update(): void {
    if (Phaser.Input.Keyboard.JustDown(this.toggleDeckKey)) {
      this.toggleDeckOverlay();
    }
  }

  private playRound(action: PlayerAction): void {
    this.busy = true;
    this.closeDeckOverlay();
    const run = getRun();
    const playerAction = this.toCombatAction(action);

    const isBlockAction =
      (action.kind === 'card' && cardEffectAmount(action.card, 'block') > 0) ||
      (action.kind === 'item' && action.item.kind === 'shield');
    const isHealAction =
      (action.kind === 'card' && cardEffectAmount(action.card, 'heal') > 0) ||
      (action.kind === 'item' && action.item.kind === 'heal');
    if (isBlockAction) playSfx(this, 'block');
    else if (isHealAction) playSfx(this, 'heal');
    else playSfx(this, 'card_play');

    const playerStunned = this.playerStatuses.some((status) => status.type === 'stun');
    if (!playerStunned) {
      if (action.kind === 'card') {
        this.playerUsed.add(action.card.uid);
        if (run.combatHand.every((card) => this.playerUsed.has(card.uid))) {
          this.playerUsed.clear();
          this.time.delayedCall(1700, () => this.setPrompt('Your cards refresh!'));
        }
      } else if (action.kind === 'item') {
        run.removeItem(action.item.uid);
      }
    }

    const enemyTurn = this.currentEnemyIntent();
    this.enemyUsed = new Set(enemyTurn.usedCardUids);
    this.enemyIntent = null;
    this.renderPlanningBoard(playerAction, 'planning', [], enemyTurn);
    this.setPrompt('Resolving round...');

    const resolved = resolveRound({
      player: {
        id: 'player',
        name: 'Player',
        hp: run.hp,
        maxHp: run.maxHp,
        armor: run.armor,
        statuses: this.playerStatuses,
      },
      enemy: {
        id: this.enemy.def.id,
        name: this.enemy.def.name,
        hp: this.enemy.hp,
        maxHp: this.enemy.maxHp,
        armor: this.enemy.armor,
        statuses: this.enemyStatuses,
      },
      playerAction,
      enemyAction: enemyTurn.action,
    });

    const enemyHpChange = resolved.enemyHpChange;
    const playerHpChange = resolved.playerHpChange;

    run.hp = resolved.player.hp;
    this.enemy.hp = resolved.enemy.hp;
    this.enemy.armor = resolved.enemy.armor;
    this.playerStatuses = resolved.player.statuses;
    this.enemyStatuses = resolved.enemy.statuses;

    this.renderHand();
    this.renderEnemyCards();
    this.renderItems();
    this.telegraphText.setText('');
    this.renderPlanningBoard(playerAction, 'resolved', resolved.log, enemyTurn);
    this.appendHistory(
      buildBattleRoundHistory({
        round: this.round,
        playerAction,
        enemyAction: enemyTurn.action,
        resolvedLog: resolved.log,
        playerHpChange,
        enemyHpChange,
        enemyName: this.enemy.def.name,
      }),
    );

    this.time.delayedCall(900, () => {
      if (enemyHpChange.damage > 0) {
        this.combatPop(
          this.enemySprite.x + 40,
          this.enemySprite.y - 30,
          `-${enemyHpChange.damage}`,
          '#ff5544',
        );
        this.flash(this.enemySprite);
        playSfx(this, 'hit_enemy');
      }
      if (enemyHpChange.heal > 0) {
        this.combatPop(
          this.enemySprite.x + 40,
          this.enemySprite.y - 30,
          `+${enemyHpChange.heal} HP`,
          '#5fe07a',
        );
      }
      if (playerHpChange.damage > 0) {
        this.combatPop(
          this.heroSprite.x + 36,
          this.heroSprite.y - 30,
          `-${playerHpChange.damage}`,
          '#ff5544',
        );
        this.flash(this.heroSprite);
        this.cameras.main.shake(120, 0.006);
        playSfx(this, 'hit_player');
      }
      if (playerHpChange.heal > 0) {
        this.combatPop(
          this.heroSprite.x + 36,
          this.heroSprite.y - 30,
          `+${playerHpChange.heal} HP`,
          '#5fe07a',
        );
      }
      this.redrawBars();
      this.updateStatusText();
      this.game.events.emit('hud-update');
    });

    this.time.delayedCall(2300, () => {
      if (this.enemy.hp <= 0) {
        this.victory();
        return;
      }
      if (run.hp <= 0) {
        this.defeat();
        return;
      }
      this.round++;
      this.busy = false;
      this.renderHand();
      this.renderEnemyCards();
      this.renderItems();
      this.commitEnemyIntent();
      this.renderPlanningBoard();
      this.updateTelegraph();
      this.updateStatusText();
      this.setPrompt('Choose a card, item, or punch. [C] deck');
    });
  }

  private combatPop(x: number, y: number, msg: string, color: string): void {
    const t = this.add
      .text(x, y, msg, {
        fontFamily: 'monospace',
        fontSize: '22px',
        fontStyle: 'bold',
        color,
        stroke: '#16121e',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(20);
    this.tweens.add({
      targets: t,
      y: y - 40,
      alpha: 0,
      duration: 900,
      ease: 'Cubic.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  private flash(img: Phaser.GameObjects.Image): void {
    img.setTintFill(0xffffff);
    this.time.delayedCall(120, () => img.clearTint());
  }

  private victory(): void {
    const run = getRun();
    this.closeDeckOverlay();
    run.enemiesDefeated++;
    if (run.hasRelic('vampiric_blade')) {
      const before = run.hp;
      run.heal(2);
      if (run.hp > before) {
        this.combatPop(this.heroSprite.x + 40, this.heroSprite.y - 30, '+2 HP', '#5fe07a');
      }
    }
    playSfx(this, 'victory');
    const gold = awardEnemyGold(run, this.rng, run.depth);
    this.tweens.add({
      targets: this.enemySprite,
      alpha: 0,
      angle: 12,
      scale: this.enemySprite.scale * 0.4,
      duration: 600,
      ease: 'Cubic.easeIn',
    });
    this.logText.setText('');
    this.telegraphText.setText('');

    const overlay = this.add.container(0, 0).setDepth(30);
    const g = this.add.graphics();
    g.fillStyle(0x0b0a12, 0.88);
    g.fillRect(0, 0, GAME_W, GAME_H);
    overlay.add(g);
    overlay.add(
      this.add
        .text(GAME_W / 2, 86, 'VICTORY!', {
          fontFamily: 'monospace',
          fontSize: '40px',
          fontStyle: 'bold',
          color: '#f1c40f',
        })
        .setOrigin(0.5),
    );
    overlay.add(
      this.add
        .text(GAME_W / 2, 132, `+${gold} gold. Take one enemy card:`, {
          fontFamily: 'monospace',
          fontSize: '17px',
          color: '#d8d2e4',
        })
        .setOrigin(0.5),
    );

    const n = this.enemy.cards.length;
    const spacing = Math.min(CARD_W + 10, (GAME_W - 80) / Math.max(n, 1));
    const startX = GAME_W / 2 - ((n - 1) * spacing) / 2;
    for (const [i, card] of this.enemy.cards.entries()) {
      const view = makeCardView(this, card, startX + i * spacing, 250, 0.92);
      const impact = previewRewardImpact({
        collection: run.cardCollection,
        combatHand: run.combatHand,
        handLimit: run.handLimit,
        change: { kind: 'add', card },
      });
      view.setDepth(31);
      view.setInteractive({ useHandCursor: true });
      view.on('pointerover', () => view.setScale(1.0));
      view.on('pointerout', () => view.setScale(0.92));
      view.on('pointerdown', () => this.takeCard(card));
      overlay.add(view);
      const preview = createRewardImpactText(
        this,
        startX + i * spacing,
        328,
        compactRewardImpactLabel(impact),
        CARD_W + 18,
      );
      preview.setDepth(31);
      overlay.add(preview);
    }

    const skip = this.add
      .text(GAME_W / 2, 402, '[ Take nothing ]', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#b8b0c8',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.endBattle(true));
    skip.setDepth(31);
    overlay.add(skip);
  }

  private takeCard(card: Card): void {
    getRun().addCard(card);
    this.game.events.emit('hud-update');
    this.endBattle(true);
  }

  private endBattle(won: boolean): void {
    this.closeDeckOverlay();
    this.scene.wake('Hud');
    this.scene.resume('Dungeon');
    this.game.events.emit('battle-end', won);
    this.game.events.emit('hud-update');
    this.scene.stop();
  }

  private defeat(): void {
    this.closeDeckOverlay();
    playSfx(this, 'death');
    this.cameras.main.fadeOut(700, 11, 10, 18);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.stop('Dungeon');
      this.scene.stop('Hud');
      this.scene.start('End', { victory: false });
    });
  }
}
