import Phaser from 'phaser';
import { GAME_H, GAME_W, PUNCH_DAMAGE } from '../config';
import { Card, cardEffectAmount } from '../data/cards';
import { EnemyInstance } from '../data/enemies';
import { InventoryItem } from '../data/items';
import { CARD_H, CARD_W, makeCardBack, makeCardView } from '../gfx/cardview';
import { ActiveStatusEffect, CombatAction, resolveRound } from '../game/combat';
import { hpChange } from '../game/combatFeedback';
import { GameRng } from '../game/rng';
import { awardEnemyGold } from '../game/rewards';
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
  private telegraphText!: Phaser.GameObjects.Text;
  private armorText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;

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
    this.playerStatuses = [];
    this.enemyStatuses = [];
    this.handViews = [];
    this.itemButtons = [];
    this.enemyCardBacks = [];
  }

  create(): void {
    const run = getRun();
    const cx = GAME_W / 2;

    this.scene.sleep('Hud');

    const bg = this.add.graphics();
    bg.fillStyle(0x0b0a12, 0.92);
    bg.fillRect(0, 0, GAME_W, GAME_H);
    bg.lineStyle(3, 0xcab98a, 0.8);
    bg.strokeRoundedRect(12, 12, GAME_W - 24, GAME_H - 24, 10);

    const isBoss = this.enemy.def.boss;
    this.enemySprite = this.add.image(cx, isBoss ? 158 : 150, this.enemy.def.texture).setScale(isBoss ? 5.5 : 6);
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
    this.enemyHpText = this.add.text(cx, 68, '', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#f5edd8',
    }).setOrigin(0.5);

    this.heroSprite = this.add.image(110, 408, 'hero_up_0').setScale(5);
    this.playerHpBar = this.add.graphics();
    this.playerHpText = this.add.text(110, 472, '', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#f5edd8',
    }).setOrigin(0.5);
    this.armorText = this.add.text(110, 350, run.armor > 0 ? `Armor +${run.armor}` : '', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#aab2bd',
    }).setOrigin(0.5);
    this.statusText = this.add.text(cx, 285, '', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#b8b0c8',
      align: 'center',
    }).setOrigin(0.5);

    this.logText = this.add
      .text(cx, 330, 'Choose a card, item, or punch.', {
        fontFamily: 'monospace',
        fontSize: '15px',
        color: '#d8d2e4',
        align: 'center',
      })
      .setOrigin(0.5);
    this.telegraphText = this.add
      .text(cx, 240, '', {
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
      .on('pointerdown', () => {
        if (!this.busy) this.playRound({ kind: 'punch' });
      });

    this.redrawBars();
    this.renderEnemyCards();
    this.renderHand();
    this.renderItems();
    this.updateTelegraph();
    this.updateStatusText();
  }

  private redrawBars(): void {
    const run = getRun();
    const bar = (g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, frac: number, color: number) => {
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
    this.enemyHpText.setY(85).setText(`${Math.max(0, this.enemy.hp)} / ${this.enemy.maxHp}`).setDepth(1);
    bar(this.playerHpBar, 40, 452, 140, run.hp / run.maxHp, 0x5fe07a);
    this.playerHpText.setY(459).setText(`${Math.max(0, run.hp)} / ${run.maxHp}`).setDepth(1);
    this.armorText.setText(run.armor > 0 ? `Armor +${run.armor}` : '');
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
        view.on('pointerover', () => !this.busy && view.setY(y - 16));
        view.on('pointerout', () => view.setY(y));
        view.on('pointerdown', () => {
          if (!this.busy) this.playRound({ kind: 'card', card });
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
        .on('pointerdown', () => {
          if (!this.busy) this.playRound({ kind: 'item', item });
        });
      this.itemButtons.push(button);
    }
  }

  private isSpecialRound(round: number): boolean {
    const special = this.enemy.def.special;
    return !!special && round % special.interval === 0;
  }

  private updateTelegraph(): void {
    const special = this.enemy.def.special;
    if (special && this.isSpecialRound(this.round)) {
      this.telegraphText.setText(`${special.telegraph}\n${special.name}`);
    } else {
      this.telegraphText.setText('');
    }
  }

  private updateStatusText(): void {
    const format = (label: string, statuses: ActiveStatusEffect[]) =>
      statuses.length === 0 ? `${label}: none`
        : `${label}: ${statuses.map((status) => `${status.type} ${status.remainingTurns}`).join(', ')}`;
    this.statusText.setText(`${format('You', this.playerStatuses)}\n${format('Enemy', this.enemyStatuses)}`);
  }

  private pickEnemyCard(): Card {
    const avail = this.enemy.cards.filter((c) => !this.enemyUsed.has(c.uid));
    const pool = avail.length > 0 ? avail : this.enemy.cards;
    if (avail.length === 0) this.enemyUsed.clear();

    const lowHp = this.enemy.hp / this.enemy.maxHp < 0.35;
    const weighted = pool.map((card) => {
      let w = 3;
      if (cardEffectAmount(card, 'block') > 0) w = 1.5;
      if (cardEffectAmount(card, 'heal') > 0) w = lowHp ? 6 : 0.8;
      if (card.effects.some((effect) => effect.kind === 'status')) w = 4;
      return { card, w };
    });
    const total = weighted.reduce((sum, entry) => sum + entry.w, 0);
    let r = this.rng.frac() * total;
    for (const entry of weighted) {
      if ((r -= entry.w) < 0) return entry.card;
    }
    return weighted[weighted.length - 1].card;
  }

  private toCombatAction(action: PlayerAction): CombatAction {
    if (action.kind === 'card') return { actor: 'player', kind: 'card', card: action.card };
    if (action.kind === 'item') return { actor: 'player', kind: 'item', item: action.item };
    return { actor: 'player', kind: 'punch' };
  }

  private enemyAction(): { action: CombatAction; card: Card | null } {
    const special = this.enemy.def.special;
    if (special && this.isSpecialRound(this.round)) {
      return {
        card: null,
        action: { actor: 'enemy', kind: 'special', name: special.name, speed: special.speed, effects: special.effects },
      };
    }

    const card = this.pickEnemyCard();
    this.enemyUsed.add(card.uid);
    if (this.enemy.cards.every((candidate) => this.enemyUsed.has(candidate.uid))) this.enemyUsed.clear();
    return { card, action: { actor: 'enemy', kind: 'card', card } };
  }

  private playRound(action: PlayerAction): void {
    this.busy = true;
    const run = getRun();
    const cx = GAME_W / 2;

    if (action.kind === 'card') {
      this.playerUsed.add(action.card.uid);
      if (run.combatHand.every((card) => this.playerUsed.has(card.uid))) {
        this.playerUsed.clear();
        this.time.delayedCall(1200, () => this.logText.setText('Your cards refresh!'));
      }
    } else if (action.kind === 'item') {
      run.removeItem(action.item.uid);
    }

    const beforePlayerHp = run.hp;
    const beforeEnemyHp = this.enemy.hp;
    const enemyTurn = this.enemyAction();
    const shown: Phaser.GameObjects.Container[] = [];
    if (action.kind === 'card') shown.push(makeCardView(this, action.card, cx - 100, 250, 0.8));
    if (enemyTurn.card) {
      const back = makeCardBack(this, cx + 100, 250, 0.8);
      shown.push(back);
      this.time.delayedCall(250, () => {
        back.destroy();
        shown.push(makeCardView(this, enemyTurn.card!, cx + 100, 250, 0.8));
      });
    }

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
      playerAction: this.toCombatAction(action),
      enemyAction: enemyTurn.action,
    });

    run.hp = resolved.player.hp;
    this.enemy.hp = resolved.enemy.hp;
    this.enemy.armor = resolved.enemy.armor;
    this.playerStatuses = resolved.player.statuses;
    this.enemyStatuses = resolved.enemy.statuses;

    this.renderHand();
    this.renderEnemyCards();
    this.renderItems();
    this.telegraphText.setText('');
    this.logText.setText(resolved.log.join('\n'));

    this.time.delayedCall(700, () => {
      const enemyHpChange = hpChange(beforeEnemyHp, this.enemy.hp);
      const playerHpChange = hpChange(beforePlayerHp, run.hp);
      if (enemyHpChange.damage > 0) {
        this.combatPop(this.enemySprite.x + 40, this.enemySprite.y - 30, `-${enemyHpChange.damage}`, '#ff5544');
        this.flash(this.enemySprite);
      }
      if (enemyHpChange.heal > 0) {
        this.combatPop(this.enemySprite.x + 40, this.enemySprite.y - 30, `+${enemyHpChange.heal} HP`, '#5fe07a');
      }
      if (playerHpChange.damage > 0) {
        this.combatPop(this.heroSprite.x + 36, this.heroSprite.y - 30, `-${playerHpChange.damage}`, '#ff5544');
        this.flash(this.heroSprite);
        this.cameras.main.shake(120, 0.006);
      }
      if (playerHpChange.heal > 0) {
        this.combatPop(this.heroSprite.x + 36, this.heroSprite.y - 30, `+${playerHpChange.heal} HP`, '#5fe07a');
      }
      this.redrawBars();
      this.updateStatusText();
      this.game.events.emit('hud-update');
    });

    this.time.delayedCall(1500, () => {
      for (const view of shown) view.destroy();
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
      this.updateTelegraph();
      this.updateStatusText();
      this.logText.setText('Choose a card, item, or punch.');
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
    this.tweens.add({ targets: t, y: y - 40, alpha: 0, duration: 900, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  private flash(img: Phaser.GameObjects.Image): void {
    img.setTintFill(0xffffff);
    this.time.delayedCall(120, () => img.clearTint());
  }

  private victory(): void {
    const run = getRun();
    run.enemiesDefeated++;
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
      this.add.text(GAME_W / 2, 86, 'VICTORY!', {
        fontFamily: 'monospace',
        fontSize: '40px',
        fontStyle: 'bold',
        color: '#f1c40f',
      }).setOrigin(0.5),
    );
    overlay.add(
      this.add.text(GAME_W / 2, 132, `+${gold} gold. Take one enemy card:`, {
        fontFamily: 'monospace',
        fontSize: '17px',
        color: '#d8d2e4',
      }).setOrigin(0.5),
    );

    const n = this.enemy.cards.length;
    const spacing = Math.min(CARD_W + 10, (GAME_W - 80) / Math.max(n, 1));
    const startX = GAME_W / 2 - ((n - 1) * spacing) / 2;
    for (const [i, card] of this.enemy.cards.entries()) {
      const view = makeCardView(this, card, startX + i * spacing, 250, 0.92);
      view.setDepth(31);
      view.setInteractive({ useHandCursor: true });
      view.on('pointerover', () => view.setScale(1.0));
      view.on('pointerout', () => view.setScale(0.92));
      view.on('pointerdown', () => this.takeCard(card));
      overlay.add(view);
    }

    const skip = this.add
      .text(GAME_W / 2, 380, '[ Take nothing ]', {
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
    this.scene.wake('Hud');
    this.scene.resume('Dungeon');
    this.game.events.emit('battle-end', won);
    this.game.events.emit('hud-update');
    this.scene.stop();
  }

  private defeat(): void {
    this.cameras.main.fadeOut(700, 11, 10, 18);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.stop('Dungeon');
      this.scene.stop('Hud');
      this.scene.start('End', { victory: false });
    });
  }
}
