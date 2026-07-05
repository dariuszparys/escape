import Phaser from 'phaser';
import { GAME_W, ROOM_H, HUD_H, MAX_INVENTORY, STRATUM_SIZE } from '../config';
import type { Relic } from '../data/relics';
import { depthWithinStratum, isStratumBoundary, stratumForDepth } from '../game/strata';
import { createRelicTooltip } from '../gfx/relicTooltip';
import { FONT_FAMILY, PALETTE, TEXT_COLOR, TYPE_COLOR, bodyStyle } from '../gfx/theme';
import { getRun } from '../state';

export class HudScene extends Phaser.Scene {
  private dynamic!: Phaser.GameObjects.Container;
  private relicTooltip: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('Hud');
  }

  create(): void {
    const bg = this.add.graphics();
    bg.fillStyle(PALETTE.hudBg, 1);
    bg.fillRect(0, ROOM_H, GAME_W, HUD_H);
    bg.lineStyle(2, PALETTE.hudBorder, 1);
    bg.lineBetween(0, ROOM_H + 1, GAME_W, ROOM_H + 1);

    this.dynamic = this.add.container(0, 0);

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

  private redraw(): void {
    this.hideRelicTooltip();
    this.dynamic.removeAll(true);
    const run = getRun();
    const y0 = ROOM_H;

    // hearts: 10 hearts, 3 HP each
    for (let i = 0; i < 10; i++) {
      const full = run.hp >= (i + 1) * 3 - 1;
      const img = this.add.image(
        28 + (i % 5) * 26,
        y0 + 24 + Math.floor(i / 5) * 24,
        full ? 'heart' : 'heart_empty',
      );
      img.setScale(2.4);
      this.dynamic.add(img);
    }
    this.dynamic.add(
      this.add.text(
        28,
        y0 + 78,
        `HP ${Math.max(0, run.hp)}/${run.maxHp}`,
        bodyStyle('13px', TEXT_COLOR.body),
      ),
    );

    // deck summary (R14/U12): the whole collection IS the battle deck now.
    const cardX0 = 200;
    this.dynamic.add(
      this.add.text(cardX0, y0 + 10, `DECK ${run.cardCollection.length} cards`, {
        fontFamily: FONT_FAMILY,
        fontSize: '12px',
        fontStyle: 'bold',
        color: TEXT_COLOR.primary,
      }),
    );
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
      this.dynamic.add(g);
      this.dynamic.add(
        this.add
          .text(x + 28, y0 + 48, String(count), {
            fontFamily: FONT_FAMILY,
            fontSize: '20px',
            fontStyle: 'bold',
            color: TYPE_COLOR[type] ?? TEXT_COLOR.muted,
          })
          .setOrigin(0.5),
      );
      this.dynamic.add(
        this.add
          .text(x + 28, y0 + 70, type.toUpperCase(), bodyStyle('8px', TEXT_COLOR.muted))
          .setOrigin(0.5),
      );
    }
    this.dynamic.add(
      this.add.text(
        cardX0,
        y0 + 90,
        'Every card fights — [C] deck  [R] relics',
        bodyStyle('9px', TEXT_COLOR.faint),
      ),
    );

    // inventory + depth
    const invX = 545;
    this.dynamic.add(
      this.add.text(invX, y0 + 12, `GOLD ${run.gold}`, {
        fontFamily: FONT_FAMILY,
        fontSize: '12px',
        fontStyle: 'bold',
        color: TEXT_COLOR.gold,
      }),
    );
    this.dynamic.add(this.add.image(invX, y0 + 42, 'potion').setScale(2));
    this.dynamic.add(
      this.add
        .text(invX + 22, y0 + 42, `${run.inventory.length}/${MAX_INVENTORY}`, {
          fontFamily: FONT_FAMILY,
          fontSize: '15px',
          fontStyle: 'bold',
          color: TEXT_COLOR.primary,
        })
        .setOrigin(0, 0.5),
    );
    this.dynamic.add(this.add.image(invX, y0 + 74, 'armor').setScale(2));
    this.dynamic.add(
      this.add
        .text(invX + 22, y0 + 74, `x${run.armor}/${run.maxArmor}`, {
          fontFamily: FONT_FAMILY,
          fontSize: '15px',
          fontStyle: 'bold',
          color: TEXT_COLOR.primary,
        })
        .setOrigin(0, 0.5),
    );
    this.dynamic.add(
      this.add
        .text(
          invX,
          y0 + 94,
          run.scoutCharges > 0
            ? `SCOUT x${run.scoutCharges}  [P] potion  [C] cards  [R] relics  [M] mute`
            : '[P] drink potion  [C] cards  [R] relics  [M] mute',
          bodyStyle('9px', run.scoutCharges > 0 ? TEXT_COLOR.gold : TEXT_COLOR.faint),
        )
        .setOrigin(0, 0.5),
    );

    if (run.relics.length > 0) {
      this.dynamic.add(
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
          Phaser.Geom.Rectangle.Contains,
        );
        chip.on('pointerover', () => this.showRelicTooltip(relic, chipX, chipY));
        chip.on('pointerout', () => this.hideRelicTooltip());
        this.dynamic.add(chip);
      }
    }

    const atBoss = isStratumBoundary(run.depth);
    this.dynamic.add(
      this.add
        .text(GAME_W - 24, y0 + 28, `STRATUM ${stratumForDepth(run.depth)}`, {
          fontFamily: FONT_FAMILY,
          fontSize: '14px',
          fontStyle: 'bold',
          color: TEXT_COLOR.body,
        })
        .setOrigin(1, 0.5),
    );
    this.dynamic.add(
      this.add
        .text(GAME_W - 24, y0 + 50, `ROOM ${depthWithinStratum(run.depth)}/${STRATUM_SIZE}`, {
          fontFamily: FONT_FAMILY,
          fontSize: '17px',
          fontStyle: 'bold',
          color: atBoss ? TEXT_COLOR.danger : TEXT_COLOR.gold,
        })
        .setOrigin(1, 0.5),
    );
  }
}
