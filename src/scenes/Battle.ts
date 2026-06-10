import Phaser from 'phaser';
import { GAME_H, GAME_W, POTION_HEAL, PUNCH_DAMAGE } from '../config';
import { Card } from '../data/cards';
import { EnemyInstance } from '../data/enemies';
import { CARD_H, CARD_W, makeCardBack, makeCardView } from '../gfx/cardview';
import { getRun } from '../state';

type PlayerAction = { kind: 'card'; card: Card } | { kind: 'potion' } | { kind: 'punch' };

interface Resolved {
  atk: number;
  block: number;
  heal: number;
  label: string;
  ignoresBlock?: boolean;
}

export class BattleScene extends Phaser.Scene {
  private enemy!: EnemyInstance;
  private round = 1;
  private busy = false;
  private playerUsed = new Set<number>();
  private enemyUsed = new Set<number>();

  private handViews: Phaser.GameObjects.Container[] = [];
  private enemyCardBacks: Phaser.GameObjects.Container[] = [];
  private enemySprite!: Phaser.GameObjects.Image;
  private heroSprite!: Phaser.GameObjects.Image;
  private enemyHpBar!: Phaser.GameObjects.Graphics;
  private playerHpBar!: Phaser.GameObjects.Graphics;
  private enemyHpText!: Phaser.GameObjects.Text;
  private playerHpText!: Phaser.GameObjects.Text;
  private logText!: Phaser.GameObjects.Text;
  private telegraphText!: Phaser.GameObjects.Text;
  private potionBtn!: Phaser.GameObjects.Text;
  private armorText!: Phaser.GameObjects.Text;

  constructor() {
    super('Battle');
  }

  init(data: { enemy: EnemyInstance }): void {
    this.enemy = data.enemy;
    this.round = 1;
    this.busy = false;
    this.playerUsed = new Set();
    this.enemyUsed = new Set();
    this.handViews = [];
    this.enemyCardBacks = [];
  }

  create(): void {
    const run = getRun();
    const cx = GAME_W / 2;

    this.scene.sleep('Hud'); // battle has its own status UI and needs the full screen

    const bg = this.add.graphics();
    bg.fillStyle(0x0b0a12, 0.92);
    bg.fillRect(0, 0, GAME_W, GAME_H);
    bg.lineStyle(3, 0xcab98a, 0.8);
    bg.strokeRoundedRect(12, 12, GAME_W - 24, GAME_H - 24, 10);

    // enemy
    const isBoss = this.enemy.def.boss;
    this.enemySprite = this.add.image(cx, isBoss ? 158 : 150, this.enemy.def.texture).setScale(isBoss ? 5.5 : 6);
    this.tweens.add({
      targets: this.enemySprite, y: this.enemySprite.y - 8,
      duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
    this.add
      .text(cx, 42, this.enemy.def.name, {
        fontFamily: 'monospace', fontSize: isBoss ? '28px' : '22px', fontStyle: 'bold',
        color: isBoss ? '#ff5544' : '#f5edd8',
      })
      .setOrigin(0.5);
    this.enemyHpBar = this.add.graphics();
    this.enemyHpText = this.add.text(cx, 68, '', {
      fontFamily: 'monospace', fontSize: '13px', color: '#f5edd8',
    }).setOrigin(0.5);

    // hero
    this.heroSprite = this.add.image(110, 408, 'hero_up_0').setScale(5);
    this.playerHpBar = this.add.graphics();
    this.playerHpText = this.add.text(110, 472, '', {
      fontFamily: 'monospace', fontSize: '13px', color: '#f5edd8',
    }).setOrigin(0.5);
    this.armorText = this.add.text(110, 350, run.armor > 0 ? `Armor +${run.armor}` : '', {
      fontFamily: 'monospace', fontSize: '12px', color: '#aab2bd',
    }).setOrigin(0.5);

    // center texts
    this.logText = this.add
      .text(cx, 330, 'Choose a card to play!', {
        fontFamily: 'monospace', fontSize: '15px', color: '#d8d2e4', align: 'center',
      })
      .setOrigin(0.5);
    this.telegraphText = this.add
      .text(cx, 250, '', {
        fontFamily: 'monospace', fontSize: '15px', fontStyle: 'bold', color: '#ff9944',
        align: 'center',
      })
      .setOrigin(0.5);

    // innate punch: weak, but you can always deal damage
    this.add
      .text(615, 350, `Punch\n(${PUNCH_DAMAGE} dmg)`, {
        fontFamily: 'monospace', fontSize: '14px', fontStyle: 'bold', color: '#e8c070',
        backgroundColor: '#2a241c', padding: { x: 10, y: 8 }, align: 'center',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        if (!this.busy) this.playRound({ kind: 'punch' });
      });

    // potion button
    this.potionBtn = this.add
      .text(615, 430, '', {
        fontFamily: 'monospace', fontSize: '14px', fontStyle: 'bold', color: '#5fe07a',
        backgroundColor: '#1c2a1e', padding: { x: 10, y: 8 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        if (!this.busy && getRun().potions > 0) this.playRound({ kind: 'potion' });
      });

    this.redrawBars();
    this.renderEnemyCards();
    this.renderHand();
    this.updatePotionBtn();
    this.updateTelegraph();
  }

  // ------------------------------------------------------------ UI

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
    const n = run.hand.length;
    const spacing = Math.min(CARD_W + 12, (GAME_W - 120) / Math.max(n, 1));
    const startX = GAME_W / 2 - ((n - 1) * spacing) / 2;
    const y = GAME_H - CARD_H / 2 - 24;
    for (const [i, card] of run.hand.entries()) {
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

  private updatePotionBtn(): void {
    const run = getRun();
    this.potionBtn.setText(`Potion x${run.potions}\n(+${POTION_HEAL} HP)`);
    this.potionBtn.setAlpha(run.potions > 0 ? 1 : 0.35);
  }

  private isSpecialRound(round: number): boolean {
    return !!this.enemy.def.special && round % 3 === 0;
  }

  private updateTelegraph(): void {
    if (this.isSpecialRound(this.round)) {
      const sp = this.enemy.def.special!;
      this.telegraphText.setText(`⚠ ${sp.telegraph}\n${sp.name}: ${sp.damage} dmg${sp.ignoresBlock ? ' (ignores block!)' : ''}${sp.selfHeal ? `, heals ${sp.selfHeal}` : ''}`);
    } else {
      this.telegraphText.setText('');
    }
  }

  // ------------------------------------------------------------ combat

  private resolveAction(action: PlayerAction): Resolved {
    if (action.kind === 'potion') {
      return { atk: 0, block: 0, heal: POTION_HEAL, label: 'a Potion' };
    }
    if (action.kind === 'punch') {
      return { atk: PUNCH_DAMAGE, block: 0, heal: 0, label: 'Punch' };
    }
    const c = action.card;
    return {
      atk: c.type === 'attack' ? c.value : c.type === 'drain' ? c.value : 0,
      block: c.type === 'block' ? c.value : 0,
      heal: c.type === 'heal' ? c.value : c.type === 'drain' ? c.value : 0,
      label: `${c.name}`,
    };
  }

  private pickEnemyCard(): Card {
    const avail = this.enemy.cards.filter((c) => !this.enemyUsed.has(c.uid));
    const pool = avail.length > 0 ? avail : this.enemy.cards;
    if (avail.length === 0) {
      this.enemyUsed.clear();
    }
    const lowHp = this.enemy.hp / this.enemy.maxHp < 0.35;
    const weighted: { card: Card; w: number }[] = pool.map((card) => {
      let w = 3;
      if (card.type === 'block') w = 1.5;
      if (card.type === 'heal') w = lowHp ? 6 : 0.8;
      if (card.type === 'drain') w = lowHp ? 5 : 3;
      return { card, w };
    });
    const total = weighted.reduce((s, e) => s + e.w, 0);
    let r = Math.random() * total;
    for (const e of weighted) {
      if ((r -= e.w) < 0) return e.card;
    }
    return weighted[weighted.length - 1].card;
  }

  private playRound(action: PlayerAction): void {
    this.busy = true;
    const run = getRun();
    const cx = GAME_W / 2;

    // player side
    const p = this.resolveAction(action);
    if (action.kind === 'card') {
      this.playerUsed.add(action.card.uid);
      if (run.hand.every((c) => this.playerUsed.has(c.uid))) {
        this.playerUsed.clear();
        this.time.delayedCall(1500, () => this.logText.setText('Your cards refresh!'));
      }
    } else if (action.kind === 'potion') {
      run.potions--;
    }

    // enemy side
    let e: Resolved;
    let enemyCardPlayed: Card | null = null;
    if (this.isSpecialRound(this.round)) {
      const sp = this.enemy.def.special!;
      e = { atk: sp.damage, block: 0, heal: sp.selfHeal, label: sp.name, ignoresBlock: sp.ignoresBlock };
    } else {
      enemyCardPlayed = this.pickEnemyCard();
      this.enemyUsed.add(enemyCardPlayed.uid);
      if (this.enemy.cards.every((c) => this.enemyUsed.has(c.uid))) this.enemyUsed.clear();
      const c = enemyCardPlayed;
      e = {
        atk: c.type === 'attack' || c.type === 'drain' ? c.value : 0,
        block: c.type === 'block' ? c.value : 0,
        heal: c.type === 'heal' ? c.value : c.type === 'drain' ? c.value : 0,
        label: c.name,
      };
    }

    const playerBlock = p.block + run.armor;
    const dmgToEnemy = Math.max(0, p.atk - e.block);
    const dmgToPlayer = Math.max(0, e.atk - (e.ignoresBlock ? 0 : playerBlock));

    // reveal animation
    const shown: Phaser.GameObjects.Container[] = [];
    if (action.kind === 'card') {
      shown.push(makeCardView(this, action.card, cx - 100, 250, 0.8));
    }
    if (enemyCardPlayed) {
      const back = makeCardBack(this, cx + 100, 250, 0.8);
      shown.push(back);
      this.time.delayedCall(350, () => {
        back.destroy();
        shown.push(makeCardView(this, enemyCardPlayed!, cx + 100, 250, 0.8));
      });
    }
    this.renderHand();
    this.renderEnemyCards();
    this.updatePotionBtn();
    this.telegraphText.setText('');

    this.logText.setText(`You play ${p.label}.  ${this.enemy.def.name} uses ${e.label}!`);

    this.time.delayedCall(700, () => {
      // apply effects
      this.enemy.hp -= dmgToEnemy;
      run.hp -= dmgToPlayer;
      if (run.hp > 0) run.hp = Math.min(run.maxHp, run.hp + p.heal);
      if (this.enemy.hp > 0) this.enemy.hp = Math.min(this.enemy.maxHp, this.enemy.hp + e.heal);

      if (dmgToEnemy > 0) {
        this.damagePop(this.enemySprite.x + 40, this.enemySprite.y - 30, `-${dmgToEnemy}`, '#ff5544');
        this.flash(this.enemySprite);
      } else if (p.atk > 0) {
        this.damagePop(this.enemySprite.x + 40, this.enemySprite.y - 30, 'Blocked!', '#7fb2e8');
      }
      if (dmgToPlayer > 0) {
        this.damagePop(this.heroSprite.x + 36, this.heroSprite.y - 30, `-${dmgToPlayer}`, '#ff5544');
        this.flash(this.heroSprite);
        this.cameras.main.shake(120, 0.006);
      } else if (e.atk > 0) {
        this.damagePop(this.heroSprite.x + 36, this.heroSprite.y - 30, 'Blocked!', '#7fb2e8');
      }
      if (p.heal > 0) this.damagePop(this.heroSprite.x - 36, this.heroSprite.y - 40, `+${p.heal}`, '#5fe07a');
      if (e.heal > 0) this.damagePop(this.enemySprite.x - 40, this.enemySprite.y - 40, `+${e.heal}`, '#5fe07a');

      this.redrawBars();
      this.game.events.emit('hud-update');
    });

    this.time.delayedCall(1500, () => {
      for (const s of shown) s.destroy();
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
      this.updatePotionBtn();
      this.updateTelegraph();
      this.logText.setText('Choose a card to play!');
    });
  }

  private damagePop(x: number, y: number, msg: string, color: string): void {
    const t = this.add
      .text(x, y, msg, {
        fontFamily: 'monospace', fontSize: '22px', fontStyle: 'bold', color,
        stroke: '#16121e', strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(20);
    this.tweens.add({ targets: t, y: y - 40, alpha: 0, duration: 900, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  private flash(img: Phaser.GameObjects.Image): void {
    img.setTintFill(0xffffff);
    this.time.delayedCall(120, () => img.clearTint());
  }

  // ------------------------------------------------------------ outcome

  private victory(): void {
    const run = getRun();
    this.tweens.add({
      targets: this.enemySprite, alpha: 0, angle: 12, scale: this.enemySprite.scale * 0.4,
      duration: 600, ease: 'Cubic.easeIn',
    });
    this.logText.setText('');
    this.telegraphText.setText('');

    const overlay = this.add.container(0, 0).setDepth(30);
    const g = this.add.graphics();
    g.fillStyle(0x0b0a12, 0.88);
    g.fillRect(0, 0, GAME_W, GAME_H);
    overlay.add(g);
    overlay.add(
      this.add.text(GAME_W / 2, 90, 'VICTORY!', {
        fontFamily: 'monospace', fontSize: '40px', fontStyle: 'bold', color: '#f1c40f',
      }).setOrigin(0.5),
    );
    overlay.add(
      this.add.text(GAME_W / 2, 140, 'Take one of the enemy\'s cards:', {
        fontFamily: 'monospace', fontSize: '17px', color: '#d8d2e4',
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
      view.on('pointerdown', () => this.takeCard(card, overlay));
      overlay.add(view);
    }

    const skip = this.add
      .text(GAME_W / 2, 380, '[ Take nothing ]', {
        fontFamily: 'monospace', fontSize: '16px', color: '#b8b0c8',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.endBattle(true));
    skip.setDepth(31);
    overlay.add(skip);

    if (run.handFull) {
      overlay.add(
        this.add.text(GAME_W / 2, 340, 'Your hand is full (5) — taking a card will replace one of yours.', {
          fontFamily: 'monospace', fontSize: '13px', color: '#ff9944',
        }).setOrigin(0.5),
      );
    }
  }

  private takeCard(card: Card, overlay: Phaser.GameObjects.Container): void {
    const run = getRun();
    if (!run.handFull) {
      run.addCard(card);
      this.game.events.emit('hud-update');
      this.endBattle(true);
      return;
    }
    // hand full: pick one of yours to discard
    overlay.destroy();
    const overlay2 = this.add.container(0, 0).setDepth(30);
    const g = this.add.graphics();
    g.fillStyle(0x0b0a12, 0.92);
    g.fillRect(0, 0, GAME_W, GAME_H);
    overlay2.add(g);
    overlay2.add(
      this.add.text(GAME_W / 2, 110, `Replace which card with ${card.name}?`, {
        fontFamily: 'monospace', fontSize: '18px', fontStyle: 'bold', color: '#f5edd8',
      }).setOrigin(0.5),
    );
    const n = run.hand.length;
    const spacing = Math.min(CARD_W + 10, (GAME_W - 80) / n);
    const startX = GAME_W / 2 - ((n - 1) * spacing) / 2;
    for (const [i, mine] of run.hand.entries()) {
      const view = makeCardView(this, mine, startX + i * spacing, 260, 0.92);
      view.setDepth(31);
      view.setInteractive({ useHandCursor: true });
      view.on('pointerover', () => view.setScale(1.0));
      view.on('pointerout', () => view.setScale(0.92));
      view.on('pointerdown', () => {
        run.hand.splice(i, 1, card);
        this.game.events.emit('hud-update');
        this.endBattle(true);
      });
      overlay2.add(view);
    }
    const skip = this.add
      .text(GAME_W / 2, 400, '[ Keep my hand ]', {
        fontFamily: 'monospace', fontSize: '16px', color: '#b8b0c8',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.endBattle(true));
    skip.setDepth(31);
    overlay2.add(skip);
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
