import Phaser from 'phaser';
import { GAME_W, ROOM_H, HUD_H, MAX_INVENTORY } from '../config';
import type { Relic } from '../data/relics';
import { formatHudChapterText, isBossRoom } from '../dungeon/rooms';
import { createRelicTooltip } from '../gfx/relicTooltip';
import { FONT_FAMILY, PALETTE, TEXT_COLOR, TYPE_COLOR, bodyStyle } from '../gfx/theme';
import { getRun } from '../state';

export class HudScene extends Phaser.Scene {
  /** Variable-count sections (card-type chips, relic chips) — rebuilt each redraw. */
  private variable!: Phaser.GameObjects.Container;
  private relicTooltip: Phaser.GameObjects.Container | null = null;

  // Fixed elements — created once in create(), updated in place in redraw().
  private hearts: Phaser.GameObjects.Image[] = [];
  private hpText!: Phaser.GameObjects.Text;
  private deckCountText!: Phaser.GameObjects.Text;
  private goldText!: Phaser.GameObjects.Text;
  private potionCountText!: Phaser.GameObjects.Text;
  private armorCountText!: Phaser.GameObjects.Text;
  private scoutText!: Phaser.GameObjects.Text;
  private roomText!: Phaser.GameObjects.Text;

  constructor() {
    super('Hud');
  }

  create(): void {
    const bg = this.add.graphics();
    bg.fillStyle(PALETTE.hudBg, 1);
    bg.fillRect(0, ROOM_H, GAME_W, HUD_H);
    bg.lineStyle(2, PALETTE.hudBorder, 1);
    bg.lineBetween(0, ROOM_H + 1, GAME_W, ROOM_H + 1);

    const y0 = ROOM_H;
    const cardX0 = 200;
    const invX = 545;

    // hearts: 10 hearts, 3 HP each
    this.hearts = [];
    for (let i = 0; i < 10; i++) {
      const img = this.add.image(
        28 + (i % 5) * 26,
        y0 + 24 + Math.floor(i / 5) * 24,
        'heart_empty',
      );
      img.setScale(2.4);
      this.hearts.push(img);
    }
    this.hpText = this.add.text(28, y0 + 78, '', bodyStyle('13px', TEXT_COLOR.body));

    // deck summary (R14/U12): the whole collection IS the battle deck now.
    this.deckCountText = this.add.text(cardX0, y0 + 10, '', {
      fontFamily: FONT_FAMILY,
      fontSize: '12px',
      fontStyle: 'bold',
      color: TEXT_COLOR.primary,
    });
    this.add.text(
      cardX0,
      y0 + 90,
      'Every card fights — [C] deck  [R] relics',
      bodyStyle('9px', TEXT_COLOR.faint),
    );

    // inventory + depth
    this.goldText = this.add.text(invX, y0 + 12, '', {
      fontFamily: FONT_FAMILY,
      fontSize: '12px',
      fontStyle: 'bold',
      color: TEXT_COLOR.gold,
    });
    this.add.image(invX, y0 + 42, 'potion').setScale(2);
    this.potionCountText = this.add
      .text(invX + 22, y0 + 42, '', {
        fontFamily: FONT_FAMILY,
        fontSize: '15px',
        fontStyle: 'bold',
        color: TEXT_COLOR.primary,
      })
      .setOrigin(0, 0.5);
    this.add.image(invX, y0 + 74, 'armor').setScale(2);
    this.armorCountText = this.add
      .text(invX + 22, y0 + 74, '', {
        fontFamily: FONT_FAMILY,
        fontSize: '15px',
        fontStyle: 'bold',
        color: TEXT_COLOR.primary,
      })
      .setOrigin(0, 0.5);
    this.scoutText = this.add
      .text(invX, y0 + 94, '', bodyStyle('9px', TEXT_COLOR.faint))
      .setOrigin(0, 0.5);

    this.roomText = this.add
      .text(GAME_W - 24, y0 + 28, '', {
        fontFamily: FONT_FAMILY,
        fontSize: '15px',
        fontStyle: 'bold',
        color: TEXT_COLOR.gold,
        align: 'right',
      })
      .setOrigin(1, 0);

    this.variable = this.add.container(0, 0);

    this.game.events.on('hud-update', this.redraw, this);
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off('hud-update', this.redraw, this);
      this.hideRelicTooltip();
    });
    this.redraw();
  }

  private hideRelicTooltip(): void {
    this.relicTooltip?.destroy();
    this.relicTooltip = null;
  }

  private showRelicTooltip(relic: Relic, anchorX: number, anchorY: number): void {
    this.hideRelicTooltip();
    this.relicTooltip = createRelicTooltip(this, relic, anchorX, anchorY - 8);
  }

  private redraw = (): void => {
    this.hideRelicTooltip();
    const run = getRun();
    const y0 = ROOM_H;
    const cardX0 = 200;

    // hearts: 10 hearts, 3 HP each
    for (let i = 0; i < 10; i++) {
      const full = run.hp >= (i + 1) * 3 - 1;
      this.hearts[i].setTexture(full ? 'heart' : 'heart_empty');
    }
    this.hpText.setText(`HP ${Math.max(0, run.hp)}/${run.maxHp}`);

    this.deckCountText.setText(`DECK ${run.cardCollection.length} cards`);

    this.goldText.setText(`GOLD ${run.gold}`);
    this.potionCountText.setText(`${run.inventory.length}/${MAX_INVENTORY}`);
    this.armorCountText.setText(`x${run.armor}/${run.maxArmor}`);
    this.scoutText
      .setText(
        run.scoutCharges > 0
          ? `SCOUT x${run.scoutCharges}  [P] potion  [C] cards  [R] relics  [M] mute`
          : '[P] drink potion  [C] cards  [R] relics  [M] mute',
      )
      .setColor(run.scoutCharges > 0 ? TEXT_COLOR.gold : TEXT_COLOR.faint);

    const atBoss = isBossRoom(run.depth);
    this.roomText
      .setText(formatHudChapterText(run.depth))
      .setColor(atBoss ? TEXT_COLOR.danger : TEXT_COLOR.gold);

    // Variable-count sections: card-type chips and relic chips. Their counts
    // change run-to-run, so rebuild only these (~10 objects) instead of the
    // whole HUD (~30 objects).
    this.variable.removeAll(true);

    const typeCounts = new Map<string, number>();
    for (const card of run.cardCollection) {
      typeCounts.set(card.type, (typeCounts.get(card.type) ?? 0) + 1);
    }
    const types = [...typeCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    for (const [i, [type, count]] of types.entries()) {
      const x = cardX0 + i * 62;
      const g = this.add.graphics();
      g.fillStyle(PALETTE.chipBg, 1);
      g.fillRoundedRect(x, y0 + 30, 56, 52, 5);
      g.lineStyle(
        1,
        Phaser.Display.Color.HexStringToColor(TYPE_COLOR[type] ?? TEXT_COLOR.muted).color,
        1,
      );
      g.strokeRoundedRect(x, y0 + 30, 56, 52, 5);
      this.variable.add(g);
      this.variable.add(
        this.add
          .text(x + 28, y0 + 48, String(count), {
            fontFamily: FONT_FAMILY,
            fontSize: '20px',
            fontStyle: 'bold',
            color: TYPE_COLOR[type] ?? TEXT_COLOR.muted,
          })
          .setOrigin(0.5),
      );
      this.variable.add(
        this.add
          .text(x + 28, y0 + 70, type.toUpperCase(), bodyStyle('8px', TEXT_COLOR.muted))
          .setOrigin(0.5),
      );
    }

    if (run.relics.length > 0) {
      this.variable.add(
        this.add.text(cardX0, y0 + 101, 'RELICS', bodyStyle('8px', TEXT_COLOR.faint)),
      );
      for (const [index, relic] of run.relics.slice(0, 6).entries()) {
        const chipX = cardX0 + index * 34;
        const chipY = y0 + 118;
        const chip = this.add.container(chipX, chipY);
        const g = this.add.graphics();
        g.fillStyle(relic.color, 1);
        g.fillRoundedRect(0, 0, 28, 16, 4);
        chip.add(g);
        const label = relic.name
          .split(' ')
          .map((part) => part[0])
          .join('')
          .slice(0, 2)
          .toUpperCase();
        chip.add(
          this.add
            .text(14, 8, label, {
              fontFamily: FONT_FAMILY,
              fontSize: '8px',
              fontStyle: 'bold',
              color: TEXT_COLOR.ink,
            })
            .setOrigin(0.5),
        );
        chip.setSize(28, 16);
        chip.setInteractive(
          new Phaser.Geom.Rectangle(0, 0, 28, 16),
          (hitArea: Phaser.Geom.Rectangle, x: number, y: number) =>
            Phaser.Geom.Rectangle.Contains(hitArea, x, y),
        );
        chip.on('pointerover', () => this.showRelicTooltip(relic, chipX, chipY));
        chip.on('pointerout', () => this.hideRelicTooltip());
        this.variable.add(chip);
      }
    }
  };
}
