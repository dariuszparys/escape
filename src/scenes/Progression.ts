import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../config';
import { playSfx } from '../audio/sfx';
import {
  STARTER_CARD_VARIETY_UNLOCK_COST,
  buyStarterCardVarietyUnlock,
  buyStarterKitUnlock,
  formatArchetypeProgressionLine,
  formatArchetypeSelectionSummary,
  formatStarterCardProgressionSummary,
  formatStarterKitProgressionLine,
  setActiveArchetype,
  setActiveStarterKit,
} from '../game/progression';
import {
  clampScrollOffset,
  createProgressionPanelLayout,
  createScrollbarThumbLayout,
  type ProgressionPanelLayout,
} from '../game/progressionLayout';
import { STARTER_KITS, type StarterKitId } from '../data/starterKits';
import { ARCHETYPES } from '../data/archetypes';
import type { ArchetypeId } from '../data/cards';
import { getMeta, setMeta } from '../meta';

const TEXT_STYLE = {
  fontFamily: 'monospace',
  color: '#f5edd8',
};

const FOREGROUND_DEPTH = 10;

export class ProgressionScene extends Phaser.Scene {
  private dynamic!: Phaser.GameObjects.Container;
  private scrollContent?: Phaser.GameObjects.Container;
  private scrollbar?: Phaser.GameObjects.Graphics;
  private layout?: ProgressionPanelLayout;
  private scrollOffset = 0;
  private draggingScrollbar = false;

  constructor() {
    super('Progression');
  }

  create(): void {
    this.cameras.main.fadeIn(250, 11, 10, 18);
    this.drawRoom();
    this.dynamic = this.add.container(0, 0).setDepth(FOREGROUND_DEPTH);
    this.game.events.on('meta-update', this.redraw, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off('meta-update', this.redraw, this);
      this.input.off('wheel', this.handleWheel, this);
      this.input.off('pointermove', this.handlePointerMove, this);
      this.input.off('pointerup', this.stopScrollbarDrag, this);
      this.input.keyboard?.off('keydown', this.handleKeyDown, this);
    });
    this.input.keyboard?.once('keydown-ESC', () => this.scene.start('Campfire'));
    this.input.on('wheel', this.handleWheel, this);
    this.input.on('pointermove', this.handlePointerMove, this);
    this.input.on('pointerup', this.stopScrollbarDrag, this);
    this.input.keyboard?.on('keydown', this.handleKeyDown, this);
    this.redraw();
  }

  private drawRoom(): void {
    const bg = this.add.graphics();
    bg.fillStyle(0x0b0a12, 1);
    bg.fillRect(0, 0, GAME_W, GAME_H);

    for (let y = 0; y < GAME_H; y += 48) {
      for (let x = 0; x < GAME_W; x += 48) {
        const shade = (x / 48 + y / 48) % 2 === 0 ? 0x17151c : 0x121018;
        bg.fillStyle(shade, 0.66);
        bg.fillRect(x, y, 48, 48);
      }
    }

    bg.fillStyle(0x000000, 0.36);
    bg.fillRect(0, 0, GAME_W, 86);
    bg.fillRect(0, 548, GAME_W, GAME_H - 548);
  }

  private redraw(): void {
    this.dynamic.removeAll(true);
    this.scrollContent = undefined;
    this.scrollbar = undefined;
    const meta = getMeta();
    const layout = createProgressionPanelLayout(STARTER_KITS.length, ARCHETYPES.length);
    this.layout = layout;
    this.scrollOffset = clampScrollOffset(this.scrollOffset, layout.maxScrollOffset);

    this.addBackButton();
    this.dynamic.add(
      this.add
        .text(GAME_W / 2, 50, 'PROGRESSION', {
          ...TEXT_STYLE,
          fontSize: '34px',
          fontStyle: 'bold',
          color: '#f1c40f',
        })
        .setOrigin(0.5),
    );
    this.dynamic.add(
      this.add
        .text(GAME_W / 2, 94, 'Gold is for this run. Embers are for long-term progress.', {
          ...TEXT_STYLE,
          fontSize: '14px',
          color: '#b8b0c8',
        })
        .setOrigin(0.5),
    );

    const panel = this.add.graphics();
    panel.fillStyle(0x151018, 0.97);
    panel.fillRect(layout.panelX, layout.panelY, layout.panelW, layout.panelH);
    panel.lineStyle(2, 0xf1c40f, 0.66);
    panel.strokeRect(layout.panelX, layout.panelY, layout.panelW, layout.panelH);
    this.dynamic.add(panel);

    const maskShape = this.add.graphics();
    maskShape.fillStyle(0xffffff, 1);
    maskShape.fillRect(layout.viewportX, layout.viewportY, layout.viewportW, layout.viewportH);
    maskShape.setVisible(false);
    this.dynamic.add(maskShape);

    const content = this.add.container(layout.viewportX, layout.viewportY - this.scrollOffset);
    content.setMask(maskShape.createGeometryMask());
    this.dynamic.add(content);
    this.scrollContent = content;

    content.add(
      this.add.text(0, layout.archetypeHeadingY, 'ARCHETYPE', {
        ...TEXT_STYLE,
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#f1c40f',
      }),
    );
    content.add(
      this.add.text(0, layout.archetypeSummaryY, formatArchetypeSelectionSummary(meta), {
        ...TEXT_STYLE,
        fontSize: '12px',
        color: '#d8d2e4',
        fixedWidth: layout.contentW - 22,
        wordWrap: { width: layout.contentW - 22, useAdvancedWrap: true },
        lineSpacing: 5,
      }),
    );

    for (const [index, archetype] of ARCHETYPES.entries()) {
      this.addArchetypeRow(
        archetype.id,
        layout.archetypeRowsStartY + index * layout.archetypeRowH,
        content,
        layout,
      );
    }

    this.addClearArchetypeButton(content, layout);

    const archetypeDivider = this.add.graphics();
    archetypeDivider.lineStyle(1, 0x6f687c, 0.55);
    archetypeDivider.lineBetween(
      0,
      layout.archetypeDividerY,
      layout.contentW - 22,
      layout.archetypeDividerY,
    );
    content.add(archetypeDivider);

    content.add(
      this.add.text(0, layout.starterHeadingY, 'STARTER VARIETY', {
        ...TEXT_STYLE,
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#f1c40f',
      }),
    );
    content.add(
      this.add.text(0, layout.starterSummaryY, formatStarterCardProgressionSummary(meta), {
        ...TEXT_STYLE,
        fontSize: '12px',
        color: '#d8d2e4',
        fixedWidth: layout.kitTextW,
        wordWrap: { width: layout.kitTextW, useAdvancedWrap: true },
        lineSpacing: 5,
      }),
    );

    this.addUnlockButton(meta.progression.starterCardVarietyUnlocked, meta.embers, content, layout);

    const divider = this.add.graphics();
    divider.lineStyle(1, 0x6f687c, 0.55);
    divider.lineBetween(0, layout.dividerY, layout.contentW - 22, layout.dividerY);
    content.add(divider);

    content.add(
      this.add.text(0, layout.starterKitHeadingY, 'STARTER KITS', {
        ...TEXT_STYLE,
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#f1c40f',
      }),
    );

    for (const [index, kit] of STARTER_KITS.entries()) {
      this.addStarterKitRow(kit.id, layout.kitRowsStartY + index * layout.kitRowH, content, layout);
    }

    this.addClearKitButton(content, layout);
    this.addScrollbar(layout);
  }

  private addBackButton(): void {
    const button = this.add
      .text(92, 52, '[ BACK ]', {
        ...TEXT_STYLE,
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#f1c40f',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    button.on('pointerover', () => button.setColor('#ffe48a'));
    button.on('pointerout', () => button.setColor('#f1c40f'));
    button.on('pointerdown', () => this.scene.start('Campfire'));
    this.dynamic.add(button);
  }

  private addTextButton(
    x: number,
    y: number,
    label: string,
    enabled: boolean,
    onPointerDown: () => void,
    fontSize = '15px',
    container: Phaser.GameObjects.Container = this.dynamic,
    guardViewport = false,
  ): void {
    const button = this.add
      .text(x, y, label, {
        ...TEXT_STYLE,
        fontSize,
        fontStyle: 'bold',
        color: enabled ? '#f1c40f' : '#6f687c',
        backgroundColor: '#17151c',
        padding: { x: 10, y: 6 },
      })
      .setOrigin(0.5);

    if (enabled) {
      button.setInteractive({ useHandCursor: true });
      button.on('pointerover', () => button.setColor('#ffe48a'));
      button.on('pointerout', () => button.setColor('#f1c40f'));
      button.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (guardViewport && !this.isPointInsideViewport(pointer.x, pointer.y)) return;
        onPointerDown();
      });
    }

    container.add(button);
  }

  private addUnlockButton(
    unlocked: boolean,
    embers: number,
    container: Phaser.GameObjects.Container,
    layout: ProgressionPanelLayout,
  ): void {
    const affordable = embers >= STARTER_CARD_VARIETY_UNLOCK_COST;
    const enabled = !unlocked && affordable;
    const label = unlocked
      ? '[ UNLOCKED ]'
      : affordable
        ? `[ UNLOCK - ${STARTER_CARD_VARIETY_UNLOCK_COST} EMBERS ]`
        : `[ NEED ${STARTER_CARD_VARIETY_UNLOCK_COST} EMBERS ]`;

    this.addTextButton(
      layout.unlockButtonX,
      layout.unlockButtonY,
      label,
      enabled,
      () => this.buyStarterUnlock(),
      '15px',
      container,
      true,
    );
  }

  private addStarterKitRow(
    kitId: StarterKitId,
    y: number,
    container: Phaser.GameObjects.Container,
    layout: ProgressionPanelLayout,
  ): void {
    const meta = getMeta();
    const kit = STARTER_KITS.find((candidate) => candidate.id === kitId);
    if (!kit) return;

    const rowBg = this.add.graphics();
    rowBg.fillStyle(0x0f0d15, 0.68);
    rowBg.fillRect(0, y - 12, layout.contentW - 22, layout.kitRowH - 10);
    rowBg.lineStyle(1, 0x3f394d, 0.55);
    rowBg.strokeRect(0, y - 12, layout.contentW - 22, layout.kitRowH - 10);
    container.add(rowBg);

    container.add(
      this.add.text(14, y, formatStarterKitProgressionLine(meta, kitId), {
        ...TEXT_STYLE,
        fontSize: '12px',
        color: '#d8d2e4',
        fixedWidth: layout.kitTextW,
        wordWrap: { width: layout.kitTextW, useAdvancedWrap: true },
        lineSpacing: 4,
      }),
    );

    const unlocked = meta.progression.unlockedStarterKitIds.includes(kit.id);
    const active = meta.progression.activeStarterKitId === kit.id;
    const canBuy =
      meta.progression.starterCardVarietyUnlocked && !unlocked && meta.embers >= kit.cost;
    const label = active
      ? '[ ACTIVE ]'
      : unlocked
        ? '[ SELECT ]'
        : canBuy
          ? `[ BUY ${kit.cost} ]`
          : meta.progression.starterCardVarietyUnlocked
            ? `[ NEED ${kit.cost} ]`
            : '[ LOCKED ]';
    const enabled = unlocked ? !active : canBuy;
    const onPointerDown = unlocked
      ? () => this.selectStarterKit(kit.id)
      : () => this.buyStarterKit(kit.id);

    this.addTextButton(
      layout.kitButtonX,
      y + 24,
      label,
      enabled,
      onPointerDown,
      '14px',
      container,
      true,
    );
  }

  private addArchetypeRow(
    archetypeId: ArchetypeId,
    y: number,
    container: Phaser.GameObjects.Container,
    layout: ProgressionPanelLayout,
  ): void {
    const meta = getMeta();

    const rowBg = this.add.graphics();
    rowBg.fillStyle(0x0f0d15, 0.68);
    rowBg.fillRect(0, y - 12, layout.contentW - 22, layout.archetypeRowH - 12);
    rowBg.lineStyle(1, 0x3f394d, 0.55);
    rowBg.strokeRect(0, y - 12, layout.contentW - 22, layout.archetypeRowH - 12);
    container.add(rowBg);

    container.add(
      this.add.text(14, y, formatArchetypeProgressionLine(meta, archetypeId), {
        ...TEXT_STYLE,
        fontSize: '12px',
        color: '#d8d2e4',
        fixedWidth: layout.kitTextW,
        wordWrap: { width: layout.kitTextW, useAdvancedWrap: true },
        lineSpacing: 4,
      }),
    );

    const active = meta.progression.activeArchetypeId === archetypeId;
    this.addTextButton(
      layout.kitButtonX,
      y + 34,
      active ? '[ ACTIVE ]' : '[ SELECT ]',
      !active,
      () => this.selectArchetype(archetypeId),
      '14px',
      container,
      true,
    );
  }

  private addClearArchetypeButton(
    container: Phaser.GameObjects.Container,
    layout: ProgressionPanelLayout,
  ): void {
    const active = getMeta().progression.activeArchetypeId != null;
    this.addTextButton(
      layout.contentW / 2 - 11,
      layout.clearArchetypeButtonY,
      active ? '[ NO ARCHETYPE NEXT RUN ]' : '[ NO ARCHETYPE SELECTED ]',
      active,
      () => this.selectArchetype(null),
      '14px',
      container,
      true,
    );
  }

  private addClearKitButton(
    container: Phaser.GameObjects.Container,
    layout: ProgressionPanelLayout,
  ): void {
    const active = getMeta().progression.activeStarterKitId !== null;
    this.addTextButton(
      layout.contentW / 2 - 11,
      layout.clearKitButtonY,
      active ? '[ NO KIT NEXT RUN ]' : '[ NO KIT SELECTED ]',
      active,
      () => this.selectStarterKit(null),
      '14px',
      container,
      true,
    );
  }

  private addScrollbar(layout: ProgressionPanelLayout): void {
    const zone = this.add
      .zone(
        layout.scrollbarTrackX - 8,
        layout.scrollbarTrackY,
        layout.scrollbarTrackW + 16,
        layout.scrollbarTrackH,
      )
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.draggingScrollbar = true;
      this.scrollToScrollbarPointer(pointer.y);
    });
    this.dynamic.add(zone);

    this.scrollbar = this.add.graphics();
    this.dynamic.add(this.scrollbar);
    this.redrawScrollbar();
  }

  private redrawScrollbar(): void {
    if (!this.scrollbar || !this.layout) return;

    const layout = this.layout;
    const thumb = createScrollbarThumbLayout(layout, this.scrollOffset);
    this.scrollbar.clear();
    this.scrollbar.fillStyle(0x2b2534, 0.82);
    this.scrollbar.fillRect(
      layout.scrollbarTrackX,
      layout.scrollbarTrackY,
      layout.scrollbarTrackW,
      layout.scrollbarTrackH,
    );

    if (!thumb.visible) return;

    this.scrollbar.fillStyle(0xf1c40f, 0.85);
    this.scrollbar.fillRect(
      layout.scrollbarTrackX - 2,
      thumb.y,
      layout.scrollbarTrackW + 4,
      thumb.height,
    );
  }

  private handleWheel(
    pointer: Phaser.Input.Pointer,
    _currentlyOver: Phaser.GameObjects.GameObject[],
    _deltaX: number,
    deltaY: number,
  ): void {
    if (!this.isPointInsidePanel(pointer.x, pointer.y)) return;
    this.scrollBy(deltaY > 0 ? 46 : -46);
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.draggingScrollbar) return;
    this.scrollToScrollbarPointer(pointer.y);
  }

  private stopScrollbarDrag(): void {
    this.draggingScrollbar = false;
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'ArrowUp') this.scrollBy(-40);
    if (event.key === 'ArrowDown') this.scrollBy(40);
    if (event.key === 'PageUp') this.scrollBy(-180);
    if (event.key === 'PageDown') this.scrollBy(180);
  }

  private scrollBy(delta: number): void {
    if (!this.layout || !this.scrollContent) return;

    const next = clampScrollOffset(this.scrollOffset + delta, this.layout.maxScrollOffset);
    if (next === this.scrollOffset) return;

    this.scrollOffset = next;
    this.scrollContent.y = this.layout.viewportY - this.scrollOffset;
    this.redrawScrollbar();
  }

  private scrollToScrollbarPointer(pointerY: number): void {
    if (!this.layout) return;

    const thumb = createScrollbarThumbLayout(this.layout, this.scrollOffset);
    const movableH = this.layout.scrollbarTrackH - thumb.height;
    if (movableH <= 0) return;

    const ratio = (pointerY - this.layout.scrollbarTrackY - thumb.height / 2) / movableH;
    this.scrollBy(ratio * this.layout.maxScrollOffset - this.scrollOffset);
  }

  private isPointInsidePanel(x: number, y: number): boolean {
    const layout = this.layout;
    if (!layout) return false;

    return (
      x >= layout.panelX &&
      x <= layout.panelX + layout.panelW &&
      y >= layout.panelY &&
      y <= layout.panelY + layout.panelH
    );
  }

  private isPointInsideViewport(x: number, y: number): boolean {
    const layout = this.layout;
    if (!layout) return false;

    return (
      x >= layout.viewportX &&
      x <= layout.viewportX + layout.viewportW &&
      y >= layout.viewportY &&
      y <= layout.viewportY + layout.viewportH
    );
  }

  private buyStarterUnlock(): void {
    const meta = getMeta();
    const result = buyStarterCardVarietyUnlock(meta);
    if (!result.ok) return;

    const updated = setMeta({
      ...meta,
      embers: result.state.embers,
      progression: result.state.progression,
    });
    this.game.events.emit('meta-update', updated);
    playSfx(this, 'purchase');
    this.redraw();
  }

  private buyStarterKit(kitId: StarterKitId): void {
    const meta = getMeta();
    const result = buyStarterKitUnlock(meta, kitId);
    if (!result.ok) return;

    const updated = setMeta({
      ...meta,
      embers: result.state.embers,
      progression: result.state.progression,
    });
    this.game.events.emit('meta-update', updated);
    playSfx(this, 'purchase');
    this.redraw();
  }

  private selectStarterKit(kitId: StarterKitId | null): void {
    const meta = getMeta();
    const result = setActiveStarterKit(meta, kitId);
    if (!result.ok) return;

    const updated = setMeta({
      ...meta,
      embers: result.state.embers,
      progression: result.state.progression,
    });
    this.game.events.emit('meta-update', updated);
    playSfx(this, 'purchase');
    this.redraw();
  }

  private selectArchetype(archetypeId: ArchetypeId | null): void {
    const meta = getMeta();
    const result = setActiveArchetype(meta, archetypeId);
    if (!result.ok) return;

    const updated = setMeta({
      ...meta,
      embers: result.state.embers,
      progression: result.state.progression,
    });
    this.game.events.emit('meta-update', updated);
    playSfx(this, 'purchase');
    this.redraw();
  }
}
