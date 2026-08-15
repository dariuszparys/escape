import Phaser from 'phaser';
import {
  Dir,
  DIR_VEC,
  GAME_H,
  PLAYER_SPEED,
  ROOM_COLS,
  ROOM_H,
  ROOM_ROWS,
  ROOM_W,
  RUN_LENGTH,
  TILE,
  VISION_RADIUS,
} from '../config';
import { Card, makeCard, CARD_DEFS } from '../data/cards';
import { EnemyInstance, spawnScenarioEncounter } from '../data/enemies';
import { InventoryItem, makeItem, randomItemIdForDepth } from '../data/items';
import type { Relic } from '../data/relics';
import { ARCHETYPES } from '../data/archetypes';
import {
  chooseForcedEliteDoor,
  decadeForDepth,
  makeStartRoom,
  makeNextRoom,
  RoomData,
  ROOM_EVENT_LABEL,
} from '../dungeon/rooms';
import { trapCenterAt, trapContactRectFromCenter, type SpikeTrap } from '../dungeon/traps';
import { makeCardView } from '../gfx/cardview';
import { createDeckPanel } from '../gfx/deckPanel';
import { createPanel } from '../gfx/panel';
import { createRelicPanel } from '../gfx/relicPanel';
import { createRelicRevealPanel } from '../gfx/relicRevealPanel';
import { createRewardImpactText } from '../gfx/rewardImpactView';
import { PALETTE, TEXT_COLOR } from '../gfx/theme';
import { PhaserGameRng } from '../game/rng';
import { relicChestGoldBonusLabel } from '../game/relicRegistry';
import { playSfx } from '../audio/sfx';
import { awardPotionItem, rollChestReward } from '../game/rewards';
import { previewRewardImpact } from '../game/rewardImpact';
import { startingCardIdsForRun } from '../game/startingCards';
import { upgradeCard } from '../game/cardUpgrade';
import {
  canUseRestAction,
  payRestAction,
  restActionCost,
  restActionTargets,
  type RestActionMode,
} from '../game/restEconomy';
import { applyTrapDamage } from '../game/hazards';
import { applyPoisonedRoomEntryDamage } from '../game/scenarioRules';
import { getRun, setRun } from '../state';
import { loadRunSnapshot, saveRunSnapshot } from '../game/runSnapshot';
import type { RunBattleSceneData } from './TurnBattle';

const DOOR_CELL: Record<Dir, { col: number; row: number }> = {
  N: { col: 7, row: 0 },
  S: { col: 7, row: ROOM_ROWS - 1 },
  W: { col: 0, row: 5 },
  E: { col: ROOM_COLS - 1, row: 5 },
};

const ENTRY_CELL: Record<Dir, { col: number; row: number }> = {
  // Cell the player lands on after travelling in a direction (just inside the new room).
  N: { col: 7, row: ROOM_ROWS - 2 },
  S: { col: 7, row: 1 },
  E: { col: 1, row: 5 },
  W: { col: ROOM_COLS - 2, row: 5 },
};

/** Pull door labels into the room so they sit on the walkable side of the frame. */
const DOOR_INTEL_INSET: Record<Dir, { dx: number; dy: number }> = {
  N: { dx: 0, dy: 28 },
  S: { dx: 0, dy: -28 },
  W: { dx: 34, dy: 0 },
  E: { dx: -34, dy: 0 },
};

/** Rows per page in the rest room's card picker. */
const REST_PICKER_PAGE_SIZE = 7;

const ROOM_EVENT_INTEL_COLOR: Record<keyof typeof ROOM_EVENT_LABEL, string> = {
  start: TEXT_COLOR.muted,
  encounter: TEXT_COLOR.primary,
  chest: TEXT_COLOR.gold,
  potion: TEXT_COLOR.success,
  rest: TEXT_COLOR.muted,
  trap: TEXT_COLOR.warn,
  boss: TEXT_COLOR.danger,
  elite: TEXT_COLOR.gold,
};

interface CardPickup {
  card: Card;
  view: Phaser.GameObjects.Container;
  x: number;
  y: number;
  taken: boolean;
}

interface TrapActor {
  descriptor: SpikeTrap;
  sprite: Phaser.GameObjects.Image;
  rect: Phaser.Geom.Rectangle;
  startedAtMs: number;
}

interface BuiltRoom {
  objs: Phaser.GameObjects.GameObject[];
  walls: Phaser.Physics.Arcade.StaticGroup;
  doors: { dir: Dir; rect: Phaser.Geom.Rectangle }[];
  traps: TrapActor[];
  potionAt: { x: number; y: number; img: Phaser.GameObjects.Image; item: InventoryItem } | null;
  chest: { x: number; y: number; img: Phaser.GameObjects.Image; opened: boolean } | null;
  restAt: { x: number; y: number; img: Phaser.GameObjects.Image; opened: boolean } | null;
  cardPicks: CardPickup[];
  /** The room's representative enemy (the pack leader): the entry cue anchor and victory fade target. */
  enemy: EnemyInstance | null;
  /** The full pack fought in this room's battle (multi-enemy); a solo fight is one element. */
  enemyPack: EnemyInstance[] | null;
  enemySprite: Phaser.GameObjects.Image | null;
}

interface NextRoomOption {
  room: RoomData;
  rngState: string;
}

export class DungeonScene extends Phaser.Scene {
  private rng!: Phaser.Math.RandomDataGenerator;
  private gameRng!: PhaserGameRng;
  private room!: RoomData;
  private origin = { x: 0, y: 0 };
  private built!: BuiltRoom;
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private wallCollider: Phaser.Physics.Arcade.Collider | null = null;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private facing: Dir = 'S';
  private transitioning = false;
  private battleActive = false;
  private roomBuildRngState = '';
  private invulnUntil = 0;
  private lastHintAt = 0;
  private nextRoomOptions: Partial<Record<Dir, NextRoomOption>> = {};
  private exitHatch: { x: number; y: number; img: Phaser.GameObjects.Image } | null = null;
  private doorIntelLabels: Phaser.GameObjects.Text[] = [];
  private itemSwapPrompt: Phaser.GameObjects.Container | null = null;
  private itemSwapKeyHandlers: { event: string; handler: (event: KeyboardEvent) => void }[] = [];
  private ignoredPotionUid: number | null = null;
  private deckOverlay: Phaser.GameObjects.Container | null = null;
  private relicOverlay: Phaser.GameObjects.Container | null = null;
  private relicRevealPanel: Phaser.GameObjects.Container | null = null;
  private chestCardPanel: Phaser.GameObjects.Container | null = null;
  private relicRevealDismiss: (() => void) | null = null;
  private visionGraphics: Phaser.GameObjects.Graphics | null = null;
  private restActionPanel: Phaser.GameObjects.Container | null = null;
  private restCardPanel: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('Dungeon');
  }

  create(): void {
    const snapshot = loadRunSnapshot();
    const run = snapshot ? setRun(snapshot.run) : getRun();
    this.rng = new Phaser.Math.RandomDataGenerator([run.seed]);
    this.gameRng = new PhaserGameRng(this.rng);
    this.transitioning = false;
    this.battleActive = false;
    this.exitHatch = null;
    this.doorIntelLabels = [];

    let spawn: { x: number; y: number };
    if (snapshot) {
      this.room = snapshot.room;
      this.origin = snapshot.origin;
      this.facing = snapshot.facing;
      this.roomBuildRngState = snapshot.roomBuildRngState;
      this.rng.state(snapshot.roomBuildRngState);
      this.built = this.buildRoom(this.room, this.origin);
      this.rng.state(snapshot.rngState);
      this.nextRoomOptions = snapshot.nextRoomOptions;
      spawn = snapshot.player;
    } else {
      this.room = makeStartRoom();
      this.origin = { x: 0, y: 0 };
      this.roomBuildRngState = this.rng.state();
      this.built = this.buildRoom(this.room, this.origin);
      this.primeNextRoomOptions();
      spawn = this.cellXY(7, 7);
    }

    this.player = this.physics.add.sprite(spawn.x, spawn.y, 'hero_down_0');
    this.player.setScale(3);
    this.player.body.setSize(10, 9).setOffset(3, 6);
    this.player.setDepth(10);
    this.attachWalls();

    const kb = this.input.keyboard!;
    this.keys = {
      up: kb.addKey('UP'),
      down: kb.addKey('DOWN'),
      left: kb.addKey('LEFT'),
      right: kb.addKey('RIGHT'),
      w: kb.addKey('W'),
      s: kb.addKey('S'),
      a: kb.addKey('A'),
      d: kb.addKey('D'),
      p: kb.addKey('P'),
      c: kb.addKey('C'),
      r: kb.addKey('R'),
    };

    this.cameras.main.setScroll(this.origin.x, this.origin.y);

    this.scene.launch('Hud');
    this.hud();
    this.saveCurrentSnapshot();
    if (snapshot && this.room.event !== 'start') {
      this.onRoomEntered();
    } else {
      this.showDoorIntel();
    }

    this.game.events.off('battle-end');
    this.game.events.on('battle-end', (won: boolean) => this.onBattleEnd(won));
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.closeDeckOverlay();
      this.closeRelicOverlay();
      this.closeRelicRevealPanel();
      this.closeItemSwapPrompt();
      this.disableDarknessOverlay();
      this.closeRestActionPanel();
      this.closeRestCardPanel();
      this.game.events.off('battle-end');
    });
  }

  // ------------------------------------------------------------ helpers

  private cellXY(col: number, row: number): { x: number; y: number } {
    return {
      x: this.origin.x + col * TILE + TILE / 2,
      y: this.origin.y + row * TILE + TILE / 2,
    };
  }

  private hud(): void {
    this.game.events.emit('hud-update');
  }

  private saveCurrentSnapshot(): void {
    saveRunSnapshot({
      version: 1,
      run: getRun(),
      room: this.room,
      origin: this.origin,
      player: { x: this.player.x, y: this.player.y },
      facing: this.facing,
      rngState: this.rng.state(),
      roomBuildRngState: this.roomBuildRngState,
      nextRoomOptions: this.nextRoomOptions,
    });
  }

  private floatText(x: number, y: number, msg: string, color = '#f5edd8'): Phaser.GameObjects.Text {
    const t = this.add
      .text(x, y, msg, {
        fontFamily: 'monospace',
        fontSize: '16px',
        fontStyle: 'bold',
        color,
        stroke: '#16121e',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(50);
    this.tweens.add({
      targets: t,
      y: y - 44,
      alpha: 0,
      duration: 1100,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        t.destroy();
      },
    });
    return t;
  }

  private floatImpactText(x: number, y: number, msg: string): Phaser.GameObjects.Text {
    const t = this.add
      .text(x, y, msg, {
        fontFamily: 'monospace',
        fontSize: '10px',
        fontStyle: 'bold',
        color: '#9fb7d0',
        stroke: '#16121e',
        strokeThickness: 3,
        fixedWidth: 300,
        align: 'center',
        wordWrap: { width: 300, useAdvancedWrap: true },
      })
      .setOrigin(0.5)
      .setDepth(50);
    this.tweens.add({
      targets: t,
      y: y - 34,
      alpha: 0,
      duration: 2400,
      ease: 'Cubic.easeOut',
      onComplete: () => t.destroy(),
    });
    return t;
  }

  private clearDoorIntel(): void {
    for (const label of this.doorIntelLabels) {
      this.tweens.killTweensOf(label);
      label.destroy();
    }
    this.doorIntelLabels = [];
  }

  private toggleDeckOverlay(): void {
    if (this.deckOverlay) {
      this.closeDeckOverlay();
      return;
    }

    this.closeItemSwapPrompt();
    this.closeRelicOverlay();
    const run = getRun();
    this.deckOverlay = createDeckPanel(
      this,
      'Your deck',
      this.origin.x + ROOM_W / 2,
      this.origin.y + GAME_H / 2 - 12,
      run.cardCollection,
    );
  }

  private closeDeckOverlay(): void {
    this.deckOverlay?.destroy();
    this.deckOverlay = null;
  }

  private toggleRelicOverlay(): void {
    if (this.relicOverlay) {
      this.closeRelicOverlay();
      return;
    }
    this.closeItemSwapPrompt();
    this.closeRelicRevealPanel();
    this.closeDeckOverlay();
    const run = getRun();
    this.relicOverlay = createRelicPanel(
      this,
      'Your relics',
      this.origin.x + ROOM_W / 2,
      this.origin.y + GAME_H / 2 - 12,
      run.relics,
    );
  }

  private closeRelicOverlay(): void {
    this.relicOverlay?.destroy();
    this.relicOverlay = null;
  }

  private closeRelicRevealPanel(): void {
    if (this.relicRevealDismiss) {
      this.input.keyboard?.off('keydown-ENTER', this.relicRevealDismiss);
      this.relicRevealDismiss = null;
    }
    this.relicRevealPanel?.destroy();
    this.relicRevealPanel = null;
  }

  private showRelicRevealPanel(relic: Relic): void {
    this.closeRelicRevealPanel();
    this.transitioning = true;
    this.player.setVelocity(0, 0);
    const cx = this.origin.x + ROOM_W / 2;
    const cy = this.origin.y + ROOM_H / 2;
    const dismiss = (): void => {
      this.closeRelicRevealPanel();
      this.transitioning = false;
      this.hud();
    };
    this.relicRevealDismiss = dismiss;
    this.relicRevealPanel = createRelicRevealPanel(this, relic, cx, cy, dismiss);
    this.input.keyboard?.once('keydown-ENTER', dismiss);
  }

  /**
   * Offer a chest card as take-or-leave. Taking a card is a trade-off under the
   * full-collection deck model, so the panel shows the card itself plus the deck-impact
   * preview and makes declining a first-class option, not a hidden one.
   */
  private showChestCardOffer(card: Card, impactLabel: string): void {
    this.closeChestCardPanel();
    this.transitioning = true;
    this.player.setVelocity(0, 0);
    this.player.anims.stop();

    const cx = this.origin.x + ROOM_W / 2;
    const cy = this.origin.y + ROOM_H / 2;
    const w = 360;
    const h = 300;
    const panel = createPanel(this, cx, cy, {
      width: w,
      height: h,
      title: 'Chest: card found',
      borderColor: PALETTE.gold,
      bgAlpha: 0.98,
      depth: 320,
      titleOffsetY: 24,
    });
    this.chestCardPanel = panel;

    panel.add(makeCardView(this, card, 0, -46, 0.9, false));
    panel.add(
      createRewardImpactText(this, 0, 40, impactLabel, w - 40, {
        align: 'center',
        originX: 0.5,
        originY: 0,
        fontSize: '10px',
      }),
    );

    const close = (): void => {
      this.closeChestCardPanel();
      this.transitioning = false;
      this.hud();
    };

    const button = (
      label: string,
      x: number,
      color: string,
      onPick: () => void,
    ): Phaser.GameObjects.Text => {
      const text = this.add
        .text(x, h / 2 - 46, label, {
          fontFamily: 'monospace',
          fontSize: '13px',
          fontStyle: 'bold',
          color,
          backgroundColor: '#221f1e',
          padding: { x: 12, y: 8 },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      text.on('pointerover', () => text.setColor('#ffe48a'));
      text.on('pointerout', () => text.setColor(color));
      text.on('pointerdown', onPick);
      return text;
    };

    panel.add(
      button('[ TAKE ]', -78, '#5fe07a', () => {
        getRun().addCard(card);
        this.floatText(this.player.x, this.player.y - 42, `${card.name} taken`, '#5fe07a');
        close();
      }),
    );
    panel.add(
      button('[ LEAVE IT ]', 82, '#b8b0c8', () => {
        this.floatText(this.player.x, this.player.y - 42, `${card.name} left behind`, '#6a6478');
        close();
      }),
    );
  }

  private closeChestCardPanel(): void {
    this.chestCardPanel?.destroy();
    this.chestCardPanel = null;
  }

  private closeRestActionPanel(): void {
    this.restActionPanel?.destroy();
    this.restActionPanel = null;
  }

  private closeRestCardPanel(): void {
    this.restCardPanel?.destroy();
    this.restCardPanel = null;
  }

  private enableDarknessOverlay(): void {
    if (this.visionGraphics) return;
    this.visionGraphics = this.make.graphics(undefined, false);
    this.visionGraphics.fillStyle(0xffffff, 1);
    this.visionGraphics.fillCircle(this.player.x, this.player.y, VISION_RADIUS);
    const mask = this.visionGraphics.createGeometryMask();
    this.cameras.main.setMask(mask, false);
  }

  private disableDarknessOverlay(): void {
    if (!this.visionGraphics) return;
    this.cameras.main.clearMask(true);
    this.visionGraphics.destroy();
    this.visionGraphics = null;
  }

  private branchSeed(dir: Dir): string {
    const run = getRun();
    return [run.seed, this.room.depth, this.origin.x, this.origin.y, dir].join(':');
  }

  private primeNextRoomOptions(): void {
    this.nextRoomOptions = {};
    if (this.room.openDoors.length === 0) return;

    const run = getRun();
    const nextDepth = this.room.depth + 1;
    // KTD3: one elite offered per decade. The door-pick RNG is seeded from
    // (run.seed, nextDepth) alone — not origin/path — so Scout reveals and
    // Daily runs see the same door choice. This assumes primeNextRoomOptions
    // runs exactly once per distinct this.room (true today: create() only
    // follows a fresh newRun(), and both transition methods reassign
    // this.room before the single call here, guarded by this.transitioning).
    // A second prime of the same room would see eliteOfferedForDecade
    // already set and silently drop that decade's elite — don't add a
    // re-prime path without also making this write idempotent.
    const eliteRng = new PhaserGameRng(
      new Phaser.Math.RandomDataGenerator([run.seed, 'elite-door', String(nextDepth)]),
    );
    const eliteDoor = chooseForcedEliteDoor(
      eliteRng,
      nextDepth,
      this.room.openDoors,
      run.eliteOfferedForDecade,
    );

    for (const dir of this.room.openDoors) {
      const rng = new Phaser.Math.RandomDataGenerator([this.branchSeed(dir)]);
      const option = makeNextRoom(new PhaserGameRng(rng), nextDepth, dir, dir === eliteDoor);
      this.nextRoomOptions[dir] = { room: option, rngState: rng.state() };
    }
    if (eliteDoor !== null) {
      run.eliteOfferedForDecade = decadeForDepth(nextDepth);
    }
  }

  private showDoorIntel(): void {
    const run = getRun();
    if (
      run.scoutCharges <= 0 ||
      this.room.openDoors.length === 0 ||
      this.doorIntelLabels.length > 0
    )
      return;

    for (const dir of this.room.openDoors) {
      const option = this.nextRoomOptions[dir];
      const event = option?.room.event;
      const cell = DOOR_CELL[dir];
      const inset = DOOR_INTEL_INSET[dir];
      const label = this.add
        .text(
          this.origin.x + cell.col * TILE + TILE / 2 + inset.dx,
          this.origin.y + cell.row * TILE + TILE / 2 + inset.dy,
          event ? ROOM_EVENT_LABEL[event] : '?',
          {
            fontFamily: 'monospace',
            fontSize: '13px',
            fontStyle: 'bold',
            color: event ? ROOM_EVENT_INTEL_COLOR[event] : TEXT_COLOR.faint,
            stroke: '#16121e',
            strokeThickness: 4,
          },
        )
        .setOrigin(0.5)
        .setDepth(60);
      this.doorIntelLabels.push(label);
    }

    run.scoutCharges--;
    this.hud();
  }

  // ------------------------------------------------------------ room construction

  private buildRoom(room: RoomData, origin: { x: number; y: number }): BuiltRoom {
    const objs: Phaser.GameObjects.GameObject[] = [];
    const walls = this.physics.add.staticGroup();
    const doors: BuiltRoom['doors'] = [];
    const at = (col: number, row: number) => ({
      x: origin.x + col * TILE + TILE / 2,
      y: origin.y + row * TILE + TILE / 2,
    });

    const doorCells = new Map<string, Dir>();
    for (const dir of ['N', 'E', 'S', 'W'] as Dir[]) {
      const c = DOOR_CELL[dir];
      doorCells.set(`${c.col},${c.row}`, dir);
    }

    for (let row = 0; row < ROOM_ROWS; row++) {
      for (let col = 0; col < ROOM_COLS; col++) {
        const { x, y } = at(col, row);
        const border = row === 0 || row === ROOM_ROWS - 1 || col === 0 || col === ROOM_COLS - 1;
        if (!border) {
          const key = (col * 31 + row * 17) % 5 === 0 ? 'floor_b' : 'floor_a';
          objs.push(this.add.image(x, y, key).setScale(3).setDepth(0));
          continue;
        }
        const dir = doorCells.get(`${col},${row}`);
        if (dir && room.openDoors.includes(dir)) {
          objs.push(this.add.image(x, y, 'door_open').setScale(3).setDepth(0));
          doors.push({
            dir,
            rect: new Phaser.Geom.Rectangle(x - TILE / 2, y - TILE / 2, TILE, TILE),
          });
          continue;
        }
        if (dir && room.blockedDoor === dir) {
          const img = walls.create(x, y, 'door_blocked') as Phaser.Physics.Arcade.Image;
          img.setScale(3).refreshBody();
          objs.push(img);
          continue;
        }
        const img = walls.create(x, y, 'wall') as Phaser.Physics.Arcade.Image;
        img.setScale(3).refreshBody();
        objs.push(img);
      }
    }

    const built: BuiltRoom = {
      objs,
      walls,
      doors,
      traps: [],
      potionAt: null,
      chest: null,
      restAt: null,
      cardPicks: [],
      enemy: null,
      enemyPack: null,
      enemySprite: null,
    };

    const center = at(7, 5);

    switch (room.event) {
      case 'start': {
        const run = getRun();
        if (run.archetypeId) {
          const archetype = ARCHETYPES.find((candidate) => candidate.id === run.archetypeId);
          if (archetype) {
            const banner = this.add
              .text(
                origin.x + ROOM_W / 2,
                origin.y + 70,
                `${archetype.name} — ${archetype.tagline}`,
                {
                  fontFamily: 'monospace',
                  fontSize: '15px',
                  fontStyle: 'bold',
                  color: '#ffd76a',
                  align: 'center',
                  stroke: '#16121e',
                  strokeThickness: 4,
                },
              )
              .setOrigin(0.5)
              .setDepth(6);
            objs.push(banner);
          }
        }
        const cardIds = startingCardIdsForRun(run);
        const cols = cardIds.length === 4 ? [2, 5, 9, 12] : [3, 7, 11];

        for (const [i, cardId] of cardIds.entries()) {
          const def = CARD_DEFS.find((candidate) => candidate.id === cardId);
          if (!def) throw new Error(`Unknown starting card: ${cardId}`);
          const card = makeCard(def);
          const pos = at(cols[i], 4);
          const view = makeCardView(this, card, pos.x, pos.y, 0.62);
          view.setDepth(5);
          this.tweens.add({
            targets: view,
            y: pos.y - 8,
            duration: 800,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
            delay: i * 250,
          });
          objs.push(view);
          built.cardPicks.push({ card, view, x: pos.x, y: pos.y, taken: false });
        }
        break;
      }
      case 'potion': {
        this.spawnFloorPotion(
          center.x,
          center.y,
          makeItem(randomItemIdForDepth(room.depth)),
          built,
        );
        break;
      }
      case 'chest': {
        const img = walls.create(center.x, center.y, 'chest_closed') as Phaser.Physics.Arcade.Image;
        img.setScale(3).refreshBody();
        img.setDepth(2);
        objs.push(img);
        built.chest = { x: center.x, y: center.y, img, opened: false };
        break;
      }
      case 'rest': {
        const img = this.add
          .image(center.x, center.y, 'floor_b')
          .setScale(3)
          .setTint(0x6f5c32)
          .setDepth(2);
        objs.push(img);
        built.restAt = { x: center.x, y: center.y, img, opened: false };
        break;
      }
      case 'trap': {
        for (const s of room.spikes) {
          const center = trapCenterAt(s, 0);
          const rect = trapContactRectFromCenter(center);
          const img = this.add
            .image(origin.x + center.x, origin.y + center.y, 'spikes')
            .setScale(3)
            .setDepth(1);
          objs.push(img);
          built.traps.push({
            descriptor: s,
            sprite: img,
            rect: new Phaser.Geom.Rectangle(
              origin.x + rect.x,
              origin.y + rect.y,
              rect.width,
              rect.height,
            ),
            startedAtMs: this.time.now,
          });
        }
        break;
      }
      case 'encounter': {
        built.enemyPack = spawnScenarioEncounter(
          this.gameRng,
          room.depth,
          'normal',
          getRun().scenarioId,
        );
        built.enemy = built.enemyPack[0];
        this.createEnemyActor(built, origin, 'normal', built.enemy);
        break;
      }
      case 'elite': {
        built.enemyPack = spawnScenarioEncounter(
          this.gameRng,
          room.depth,
          'elite',
          getRun().scenarioId,
        );
        built.enemy = built.enemyPack[0];
        this.createEnemyActor(built, origin, 'elite', built.enemy);
        break;
      }
      case 'boss': {
        built.enemyPack = spawnScenarioEncounter(
          this.gameRng,
          room.depth,
          'boss',
          getRun().scenarioId,
        );
        built.enemy = built.enemyPack[0];
        this.createEnemyActor(built, origin, 'boss', built.enemy);
        break;
      }
      default: {
        const _exhaustive: never = room.event;
        throw new Error(`buildRoom: unhandled room event ${String(_exhaustive)}`);
      }
    }

    return built;
  }

  /**
   * The enemy in an uncleared encounter/elite/boss room is a static sprite (KTD3):
   * the entry-cue anchor and the victory fade-out target. Boss centered, normal at
   * the same central cell; the old intent marker, contact ring, and per-frame
   * position sync are gone with the threat phase. Elites reuse normal-tier textures
   * (see `ELITES` in `data/enemies.ts`), so scale alone can't distinguish an elite
   * from a same-texture normal enemy — a gold/amber tint carries that read instead.
   */
  private createEnemyActor(
    built: BuiltRoom,
    origin: { x: number; y: number },
    kind: 'normal' | 'elite' | 'boss',
    enemy: EnemyInstance,
  ): void {
    const x = origin.x + 7 * TILE + TILE / 2;
    const y = origin.y + 5 * TILE + TILE / 2;
    const scale = kind === 'boss' ? 4.5 : kind === 'elite' ? 4.2 : 4;
    const sprite = this.add.image(x, y, enemy.def.texture).setScale(scale).setDepth(5);
    if (kind === 'elite') sprite.setTint(0xd4af37);
    built.objs.push(sprite);
    built.enemySprite = sprite;
  }

  private attachWalls(): void {
    this.wallCollider?.destroy();
    this.wallCollider = this.physics.add.collider(this.player, this.built.walls);
  }

  private destroyBuilt(b: BuiltRoom): void {
    for (const o of b.objs) o.destroy();
    b.walls.clear(true, true);
    b.walls.destroy();
  }

  private syncTrapActors(time: number): void {
    for (const trap of this.built.traps) {
      const elapsedMs = Math.max(0, time - trap.startedAtMs);
      const center = trapCenterAt(trap.descriptor, elapsedMs);
      const rect = trapContactRectFromCenter(center);
      trap.sprite.setPosition(this.origin.x + center.x, this.origin.y + center.y);
      trap.rect.setTo(this.origin.x + rect.x, this.origin.y + rect.y, rect.width, rect.height);
    }
  }

  private spawnFloorPotion(
    x: number,
    y: number,
    item: InventoryItem,
    built: BuiltRoom = this.built,
  ): void {
    if (built.potionAt) built.potionAt.img.destroy();
    const img = this.add.image(x, y, 'potion').setScale(3).setDepth(2);
    built.objs.push(img);
    built.potionAt = { x, y, img, item };
  }

  private clearFloorPotion(): void {
    if (!this.built.potionAt) return;
    this.built.potionAt.img.destroy();
    this.built.potionAt = null;
    this.ignoredPotionUid = null;
  }

  private closeItemSwapPrompt(): void {
    for (const { event, handler } of this.itemSwapKeyHandlers) {
      this.input.keyboard?.off(event, handler);
    }
    this.itemSwapKeyHandlers = [];
    this.itemSwapPrompt?.destroy();
    this.itemSwapPrompt = null;
  }

  private onSwapKey(event: string, handler: (event: KeyboardEvent) => void): void {
    this.input.keyboard?.on(event, handler);
    this.itemSwapKeyHandlers.push({ event, handler });
  }

  private leaveItemSwapPrompt(item: InventoryItem): void {
    this.ignoredPotionUid = item.uid;
    this.closeItemSwapPrompt();
  }

  private showItemSwapPrompt(item: InventoryItem, x: number, y: number): void {
    if (this.itemSwapPrompt) return;

    this.player.setVelocity(0, 0);
    this.player.anims.stop();
    const run = getRun();
    const inventory = [...run.inventory];
    const cx = this.origin.x + ROOM_W / 2;
    const cy = this.origin.y + ROOM_H / 2;
    const prompt = this.add.container(cx, cy).setDepth(200);
    this.itemSwapPrompt = prompt;

    const bg = this.add.graphics();
    bg.fillStyle(0x111019, 0.96);
    bg.fillRoundedRect(-224, -136, 448, 272, 6);
    bg.lineStyle(2, 0xf1c40f, 0.85);
    bg.strokeRoundedRect(-224, -136, 448, 272, 6);
    prompt.add(bg);

    prompt.add(
      this.add
        .text(0, -106, 'Inventory full', {
          fontFamily: 'monospace',
          fontSize: '22px',
          fontStyle: 'bold',
          color: '#f1c40f',
        })
        .setOrigin(0.5),
    );
    prompt.add(
      this.add
        .text(0, -76, `Replace one item with ${item.name}?`, {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#f5edd8',
          fixedWidth: 380,
          align: 'center',
          wordWrap: { width: 380, useAdvancedWrap: true },
        })
        .setOrigin(0.5),
    );

    const replaceWith = (held: InventoryItem): void => {
      if (!run.replaceItem(held.uid, item)) return;
      this.clearFloorPotion();
      this.closeItemSwapPrompt();
      this.floatText(x, y - 50, `Dropped ${held.name}`, '#f1c40f');
      this.floatText(x, y - 76, `Took ${item.name}`, '#5fe07a');
      this.hud();
    };

    for (const [index, held] of inventory.entries()) {
      const button = this.add
        .text(0, -34 + index * 42, `[${index + 1}] Drop ${held.name}`, {
          fontFamily: 'monospace',
          fontSize: '14px',
          fontStyle: 'bold',
          color: '#f5edd8',
          backgroundColor: '#221f1e',
          padding: { x: 12, y: 7 },
          fixedWidth: 336,
          align: 'center',
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      button.on('pointerover', () => button.setColor('#ffe48a'));
      button.on('pointerout', () => button.setColor('#f5edd8'));
      button.on('pointerdown', () => replaceWith(held));
      prompt.add(button);
    }

    this.onSwapKey('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        this.leaveItemSwapPrompt(item);
        return;
      }
      const index = Number(event.key) - 1;
      const held = inventory[index];
      if (held) replaceWith(held);
    });

    const cancel = this.add
      .text(0, 100, '[ESC] Leave potion', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#b8b0c8',
        backgroundColor: '#17151c',
        padding: { x: 12, y: 6 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    cancel.on('pointerover', () => cancel.setColor('#f5edd8'));
    cancel.on('pointerout', () => cancel.setColor('#b8b0c8'));
    cancel.on('pointerdown', () => this.leaveItemSwapPrompt(item));
    prompt.add(cancel);
  }

  // ------------------------------------------------------------ transitions

  private startTransition(dir: Dir): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.closeDeckOverlay();
    this.closeRelicOverlay();
    this.closeRelicRevealPanel();
    this.disableDarknessOverlay();
    this.player.setVelocity(0, 0);
    this.player.body.enable = false;
    this.clearDoorIntel();
    playSfx(this, 'door');

    const run = getRun();
    const nextDepth = run.depth + 1;
    const nextRoomOption = this.nextRoomOptions[dir];
    const nextRoom = nextRoomOption?.room ?? makeNextRoom(this.gameRng, nextDepth, dir);
    const vec = DIR_VEC[dir];
    const newOrigin = {
      x: this.origin.x + vec.x * ROOM_W,
      y: this.origin.y + vec.y * ROOM_H,
    };
    const oldBuilt = this.built;
    const oldOrigin = this.origin;
    this.origin = newOrigin;
    const nextRoomBuildRngState = this.rng.state();
    const nextBuilt = this.buildRoom(nextRoom, newOrigin);
    this.origin = oldOrigin; // restored until the pan lands

    const entry = ENTRY_CELL[dir];
    const target = {
      x: newOrigin.x + entry.col * TILE + TILE / 2,
      y: newOrigin.y + entry.row * TILE + TILE / 2,
    };

    const anim =
      dir === 'N'
        ? 'walk_up'
        : dir === 'S'
          ? 'walk_down'
          : dir === 'E'
            ? 'walk_right'
            : 'walk_left';
    this.player.anims.play(anim, true);
    this.facing = dir;

    this.tweens.add({
      targets: this.player,
      x: target.x,
      y: target.y,
      duration: 700,
      ease: 'Sine.easeInOut',
    });
    this.tweens.add({
      targets: this.cameras.main,
      scrollX: newOrigin.x,
      scrollY: newOrigin.y,
      duration: 700,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        this.wallCollider?.destroy();
        this.wallCollider = null;
        this.destroyBuilt(oldBuilt);
        this.built = nextBuilt;
        this.attachWalls();
        this.room = nextRoom;
        this.origin = newOrigin;
        this.roomBuildRngState = nextRoomBuildRngState;
        if (nextRoomOption) {
          this.rng.state(nextRoomOption.rngState);
        }
        run.depth = nextDepth;
        this.primeNextRoomOptions();
        this.player.anims.stop();
        this.player.body.enable = true;
        this.player.body.reset(target.x, target.y);
        this.transitioning = false;
        this.hud();
        this.saveCurrentSnapshot();
        this.onRoomEntered();
      },
    });
  }

  private onRoomEntered(): void {
    const { room, built } = this;
    const run = getRun();
    const beforeHp = run.hp;
    run.onRoomEntered();
    if (run.hp > beforeHp) {
      this.floatText(this.player.x, this.player.y - 50, "Wanderer's Flask +1 HP", '#5fe07a');
    }
    const poison = applyPoisonedRoomEntryDamage(run, this.gameRng);
    if (poison.applied) {
      this.floatText(this.player.x, this.player.y - 78, `Poison -${poison.amount} HP`, '#9b59b6');
      this.hud();
      if (poison.died) {
        this.player.setVelocity(0, 0);
        this.battleActive = true;
        playSfx(this, 'hit_player');
        this.time.delayedCall(450, () => this.scene.start('End', { victory: false }));
        return;
      }
    } else if (run.hp !== beforeHp) {
      this.hud();
    }
    playSfx(this, 'step');
    if (
      (room.event === 'encounter' || room.event === 'boss' || room.event === 'elite') &&
      !room.cleared &&
      built.enemySprite
    ) {
      this.triggerEncounter(built.enemySprite);
    } else if (room.event === 'trap') {
      this.enableDarknessOverlay();
      this.floatText(this.player.x, this.player.y - 50, 'Watch your step!', '#ff9944');
      this.showDoorIntel();
    } else {
      this.showDoorIntel();
    }
  }

  /**
   * Entry is commitment (R1/R4). Lock input the instant the room is entered
   * (KTD1) so the whole cue window blocks movement, doors, item use, and
   * overlays via the update-loop guard, then play the relocated contact cue
   * (KTD2) and fade into the card battle after ~450ms. Phaser scene timers and
   * tweens run independently of the update guard, so the locked cue still fires.
   * The pre-battle door labels are skipped for these rooms (KTD4) — onBattleEnd
   * reveals post-victory instead.
   */
  private triggerEncounter(sprite: Phaser.GameObjects.Image): void {
    this.battleActive = true;
    this.player.setVelocity(0, 0);
    this.player.anims.stop();
    this.floatText(sprite.x, sprite.y - 58, '!', '#ff5544');
    this.cameras.main.shake(120, 0.006);
    playSfx(this, 'hit_player');
    this.time.delayedCall(450, () => this.startBattle());
  }

  private startBattle(): void {
    if (!this.built.enemy) return;
    this.closeDeckOverlay();
    this.closeItemSwapPrompt();
    this.battleActive = true;
    this.player.setVelocity(0, 0);
    // Only 'encounter' | 'elite' | 'boss' rooms ever reach startBattle — onRoomEntered's
    // fight-trigger condition gates it — so this narrowing is exhaustive in practice.
    const data: RunBattleSceneData = {
      mode: 'run',
      enemies: this.built.enemyPack ?? [this.built.enemy],
      rng: this.gameRng,
      encounterKind:
        this.room.event === 'boss' ? 'boss' : this.room.event === 'elite' ? 'elite' : 'normal',
    };
    this.scene.launch('TurnBattle', data);
    this.scene.pause();
  }

  private onBattleEnd(won: boolean): void {
    this.battleActive = false;
    if (!won) return; // Battle scene already routed to the game-over screen.
    this.room.cleared = true;
    const sprite = this.built.enemySprite;
    if (sprite) {
      this.tweens.add({
        targets: sprite,
        alpha: 0,
        duration: 500,
        ease: 'Cubic.easeIn',
        onComplete: () => sprite.destroy(),
      });
      this.built.enemySprite = null;
      this.built.enemy = null;
      this.built.enemyPack = null;
    }
    if (this.room.event === 'boss') {
      const run = getRun();
      run.bossDefeated = true;
      const finalBoss = run.depth >= RUN_LENGTH;
      const c = this.cellXY(7, 5);
      const img = this.add.image(c.x, c.y, 'exit').setScale(3).setDepth(1).setAlpha(0);
      this.tweens.add({ targets: img, alpha: 1, duration: 700 });
      this.built.objs.push(img);
      this.exitHatch = { x: c.x, y: c.y, img };
      this.floatText(
        c.x,
        c.y - 60,
        finalBoss ? 'The way out opens!' : 'The way deeper opens!',
        '#f1c40f',
      );
    } else {
      // A cleared 'elite' room falls here too (it's not 'boss'), so it clears exactly
      // like a normal encounter — no exit hatch, just the post-victory door labels.
      // Elite-specific rewards are U8's concern (TurnBattle.ts's runVictory), not this.
      this.showDoorIntel();
    }
    this.hud();
  }

  // ------------------------------------------------------------ update loop

  update(time: number): void {
    if (this.transitioning || this.battleActive) return;
    if (this.visionGraphics) {
      this.visionGraphics.clear();
      this.visionGraphics.fillStyle(0xffffff, 1);
      this.visionGraphics.fillCircle(this.player.x, this.player.y, VISION_RADIUS);
    }
    this.syncTrapActors(time);
    const run = getRun();
    if (Phaser.Input.Keyboard.JustDown(this.keys.c)) {
      this.toggleDeckOverlay();
      return;
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.r)) {
      this.toggleRelicOverlay();
      return;
    }
    if (this.deckOverlay || this.relicOverlay || this.relicRevealPanel) {
      this.player.setVelocity(0, 0);
      return;
    }
    if (this.itemSwapPrompt) {
      this.player.setVelocity(0, 0);
      return;
    }
    if (this.restActionPanel || this.restCardPanel) {
      this.player.setVelocity(0, 0);
      return;
    }

    // movement
    const left = this.keys.left.isDown || this.keys.a.isDown;
    const right = this.keys.right.isDown || this.keys.d.isDown;
    const up = this.keys.up.isDown || this.keys.w.isDown;
    const down = this.keys.down.isDown || this.keys.s.isDown;
    let vx = (right ? 1 : 0) - (left ? 1 : 0);
    let vy = (down ? 1 : 0) - (up ? 1 : 0);
    if (vx !== 0 && vy !== 0) {
      vx *= Math.SQRT1_2;
      vy *= Math.SQRT1_2;
    }
    this.player.setVelocity(vx * PLAYER_SPEED, vy * PLAYER_SPEED);

    if (vx !== 0 || vy !== 0) {
      if (Math.abs(vx) >= Math.abs(vy)) this.facing = vx > 0 ? 'E' : 'W';
      else this.facing = vy > 0 ? 'S' : 'N';
      const anim =
        this.facing === 'N'
          ? 'walk_up'
          : this.facing === 'S'
            ? 'walk_down'
            : this.facing === 'E'
              ? 'walk_right'
              : 'walk_left';
      this.player.anims.play(anim, true);
    } else {
      this.player.anims.stop();
      const idle =
        this.facing === 'N'
          ? 'hero_up_0'
          : this.facing === 'S'
            ? 'hero_down_0'
            : this.facing === 'E'
              ? 'hero_right_0'
              : 'hero_left_0';
      this.player.setTexture(idle);
    }

    // drink a potion
    if (Phaser.Input.Keyboard.JustDown(this.keys.p)) {
      const potion = run.firstUsablePotion();
      if (potion && run.hp < run.maxHp) {
        run.removeItem(potion.uid);
        run.heal(potion.amount);
        this.floatText(this.player.x, this.player.y - 50, `+${potion.amount} HP`, '#5fe07a');
        this.hud();
      } else if (potion) {
        this.floatText(this.player.x, this.player.y - 50, 'Already at full HP', '#b8b0c8');
      } else {
        this.floatText(this.player.x, this.player.y - 50, 'No potions!', '#b8b0c8');
      }
    }

    const px = this.player.x;
    const py = this.player.y;

    // doors
    for (const door of this.built.doors) {
      if (!door.rect.contains(px, py)) continue;
      if (this.room.event === 'start' && run.startingCardsTaken < run.startingCardPicks) {
        if (time > this.lastHintAt + 900) {
          this.lastHintAt = time;
          const remaining = run.startingCardPicks - run.startingCardsTaken;
          this.floatText(
            px,
            py - 50,
            `Choose ${remaining} more card${remaining === 1 ? '' : 's'}!`,
            '#ff9944',
          );
        }
        const c = this.cellXY(7, 5);
        const away = new Phaser.Math.Vector2(c.x - px, c.y - py).normalize().scale(60);
        this.player.setPosition(px + away.x * 0.4, py + away.y * 0.4);
        continue;
      }
      this.startTransition(door.dir);
      return;
    }

    // starting card choice
    for (const pick of this.built.cardPicks) {
      if (pick.taken) continue;
      if (Phaser.Math.Distance.Between(px, py, pick.x, pick.y) > 46) continue;
      pick.taken = true;
      run.addCard(pick.card);
      run.startingCardsTaken++;
      this.floatText(pick.x, pick.y - 40, `Took ${pick.card.name}!`, '#f1c40f');
      this.tweens.add({
        targets: pick.view,
        alpha: 0,
        y: '-=40',
        duration: 350,
        onComplete: () => pick.view.destroy(),
      });
      const remaining = Math.max(0, run.startingCardPicks - run.startingCardsTaken);
      if (remaining === 0) {
        for (const other of this.built.cardPicks) {
          if (other.taken) continue;
          other.taken = true;
          this.tweens.add({
            targets: other.view,
            alpha: 0,
            y: '+=10',
            duration: 350,
            onComplete: () => other.view.destroy(),
          });
        }
      } else {
        this.floatText(pick.x, pick.y - 72, `Choose ${remaining} more`, '#5fe07a');
      }
      this.hud();
    }

    // potion on the floor
    if (this.built.potionAt) {
      const potion = this.built.potionAt;
      const distance = Phaser.Math.Distance.Between(px, py, potion.x, potion.y);
      if (this.ignoredPotionUid === potion.item.uid && distance >= 48) {
        this.ignoredPotionUid = null;
      }
      if (this.ignoredPotionUid !== potion.item.uid && distance < 36) {
        const result = awardPotionItem(run, potion.item);
        if (result.kind === 'inventory_full') {
          this.showItemSwapPrompt(result.item, potion.x, potion.y);
        } else {
          this.clearFloorPotion();
          const msg = result.kind === 'heal' ? `+${result.amount} HP` : `+${result.item.name}`;
          this.floatText(px, py - 50, msg, '#5fe07a');
          this.hud();
          playSfx(this, 'heal');
        }
      }
    }

    // chest
    const chest = this.built.chest;
    if (chest && !chest.opened && Phaser.Math.Distance.Between(px, py, chest.x, chest.y) < 64) {
      chest.opened = true;
      chest.img.setTexture('chest_open');
      playSfx(this, 'chest');
      this.openChest(chest.x, chest.y);
    }

    const restAt = this.built.restAt;
    if (restAt && !restAt.opened && Phaser.Math.Distance.Between(px, py, restAt.x, restAt.y) < 64) {
      restAt.opened = true;
      this.openRestChoices();
    }

    // spikes
    if (time > this.invulnUntil) {
      for (const actor of this.built.traps) {
        if (!actor.rect.contains(px, py + 12)) continue;
        this.invulnUntil = time + 900;
        const trap = applyTrapDamage(run);
        this.floatText(px, py - 50, `-${trap.amount}`, '#ff5544');
        this.cameras.main.shake(150, 0.008);
        this.player.setTint(0xff5544);
        this.time.delayedCall(250, () => this.player.clearTint());
        this.hud();
        playSfx(this, 'trap');
        if (trap.died) {
          this.scene.stop('Hud');
          this.scene.start('End', { victory: false });
          return;
        }
        break;
      }
    }

    // exit hatch — beating a boss opens the way forward. The room-100 boss is the
    // escape (R1); every earlier boss just descends into the next room (R3).
    if (
      this.exitHatch &&
      Phaser.Math.Distance.Between(px, py, this.exitHatch.x, this.exitHatch.y) < 30
    ) {
      if (getRun().depth >= RUN_LENGTH) this.escapeRun();
      else this.startDescentTransition();
    }
  }

  private openChest(x: number, y: number): void {
    const run = getRun();
    const result = rollChestReward(run, this.gameRng, run.depth);
    const goldSuffix = relicChestGoldBonusLabel(run.relicIds);

    if (result.kind === 'relic') {
      this.floatText(x, y - 50, `Relic: ${result.relic.name}`, '#5fe07a');
      this.showRelicRevealPanel(result.relic);
      return;
    }

    // A card is the one chest reward with a real downside: the whole collection reshuffles
    // into the Draw Pile every battle, so taking one thins every future draw. Offer it
    // instead of banking it. The other outcomes (gold, HP, armor, relics) are pure upside,
    // so prompting for those would be friction with no decision behind it.
    if (result.kind === 'card') {
      this.showChestCardOffer(result.card, result.impactLabel);
      return;
    }

    // Everything reaching here is pure upside, so it still banks straight away.
    const message =
      result.kind === 'item'
        ? `Found ${result.item.name}!`
        : result.kind === 'armor'
          ? '+1 Armor'
          : result.kind === 'gold'
            ? `+${result.amount} Gold${goldSuffix}`
            : result.kind === 'heal'
              ? `+${result.amount} HP`
              : result.kind === 'relic_exhausted'
                ? `Relic pool exhausted — +${result.amount} Gold${goldSuffix}`
                : `${result.item.name} dropped!`;
    if (result.kind === 'inventory_full') {
      this.spawnFloorPotion(x, y + TILE, result.item);
    }
    this.floatText(
      x,
      y - 50,
      message,
      result.kind === 'gold' || result.kind === 'relic_exhausted' ? '#f1c40f' : '#5fe07a',
    );
    if (result.kind === 'relic_exhausted') {
      this.floatImpactText(x, y - 78, 'No new relics available');
    }
    this.hud();
  }

  private openRestChoices(): void {
    if (this.restActionPanel || this.restCardPanel) return;
    const run = getRun();
    if (run.cardCollection.length === 0) return;

    this.closeDeckOverlay();
    this.closeItemSwapPrompt();
    this.transitioning = true;
    this.player.setVelocity(0, 0);
    this.player.anims.stop();

    const cx = this.origin.x + ROOM_W / 2;
    const cy = this.origin.y + ROOM_H / 2;
    const w = 330;
    const h = 236;
    const panel = createPanel(this, cx, cy, {
      width: w,
      height: h,
      title: 'Rest Room',
      borderColor: PALETTE.gold,
      bgAlpha: 0.98,
      depth: 260,
      titleOffsetY: 26,
    });
    this.restActionPanel = panel;

    panel.add(
      this.add
        .text(0, -h / 2 + 56, `Gold: ${run.gold} | Choose one paid rest action:`, {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#b8b0c8',
          align: 'center',
        })
        .setOrigin(0.5),
    );

    const addChoice = (label: string, y: number, mode: RestActionMode): void => {
      const check = canUseRestAction(run, mode);
      const enabled = check.ok;
      const button = this.add
        .text(0, y, `[ ${label} - ${restActionCost(mode)} GOLD ]`, {
          fontFamily: 'monospace',
          fontSize: '14px',
          fontStyle: 'bold',
          color: enabled ? '#f5edd8' : '#6f687c',
          backgroundColor: enabled ? '#221f1e' : '#17151c',
          padding: { x: 12, y: 8 },
        })
        .setOrigin(0.5);

      if (enabled) {
        button.setInteractive({ useHandCursor: true });
        button.on('pointerover', () => button.setColor('#ffe48a'));
        button.on('pointerout', () => button.setColor('#f5edd8'));
        button.on('pointerdown', () => this.openRestCardPicker(mode));
      }
      panel.add(button);

      // A greyed-out action must say why. "Every card is fully upgraded" and "Not enough
      // Gold" call for completely different responses from the player.
      if (!enabled) {
        panel.add(
          this.add
            .text(0, y + 20, check.reason, {
              fontFamily: 'monospace',
              fontSize: '9px',
              color: '#8d8598',
            })
            .setOrigin(0.5),
        );
      }
    };

    addChoice('UPGRADE A CARD', -36, 'upgrade');
    addChoice('REMOVE A CARD', 18, 'remove');

    const leave = this.add
      .text(0, 62, '[ LEAVE ]', {
        fontFamily: 'monospace',
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#b8b0c8',
        backgroundColor: '#221f1e',
        padding: { x: 10, y: 6 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    leave.on('pointerover', () => leave.setColor('#ffe48a'));
    leave.on('pointerout', () => leave.setColor('#b8b0c8'));
    leave.on('pointerdown', () => this.leaveRestRoom());
    panel.add(leave);

    panel.add(
      this.add
        .text(0, h / 2 - 20, 'Gold is spent only when the action succeeds.', {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#6a6478',
        })
        .setOrigin(0.5),
    );
  }

  private openRestCardPicker(mode: RestActionMode, page = 0): void {
    const run = getRun();

    this.closeRestActionPanel();
    this.closeRestCardPanel();
    // Deck model (U12): every card fights, so list the collection reading-sorted.
    // Upgrade mode excludes cards an upgrade cannot change — those at MAX_CARD_UPGRADES and
    // the few whose only effects are un-upgradable — so the picker never offers a paid no-op.
    // Removal deliberately keeps ALL of them: a maxed card is still worth cutting.
    const entries = restActionTargets(run.cardCollection, mode).sort(
      (a, b) => b.tier - a.tier || a.name.localeCompare(b.name) || a.uid - b.uid,
    );
    const pageCount = Math.max(1, Math.ceil(entries.length / REST_PICKER_PAGE_SIZE));
    const currentPage = Math.min(Math.max(page, 0), pageCount - 1);
    const cx = this.origin.x + ROOM_W / 2;
    const cy = this.origin.y + ROOM_H / 2;
    const w = 520;
    const h = 420;

    const panel = this.add.container(cx, cy).setDepth(320);
    this.restCardPanel = panel;

    const bg = this.add.graphics();
    bg.fillStyle(0x111019, 0.98);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 8);
    bg.lineStyle(2, 0xcab98a, 0.85);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
    panel.add(bg);

    panel.add(
      this.add
        .text(0, -h / 2 + 24, mode === 'upgrade' ? 'Upgrade a card' : 'Remove a card', {
          fontFamily: 'monospace',
          fontSize: '20px',
          fontStyle: 'bold',
          color: '#f1c40f',
        })
        .setOrigin(0.5),
    );
    panel.add(
      this.add
        .text(0, -h / 2 + 50, `${restActionCost(mode)} Gold. Pick one card to continue.`, {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#b8b0c8',
          align: 'center',
        })
        .setOrigin(0.5),
    );

    const pageStart = currentPage * REST_PICKER_PAGE_SIZE;
    const visibleEntries = entries.slice(pageStart, pageStart + REST_PICKER_PAGE_SIZE);

    if (entries.length === 0) {
      panel.add(
        this.add
          .text(0, -10, 'Every card is already fully upgraded.\nRemoval is still available.', {
            fontFamily: 'monospace',
            fontSize: '12px',
            color: '#b8b0c8',
            align: 'center',
          })
          .setOrigin(0.5),
      );
    }

    for (const [index, card] of visibleEntries.entries()) {
      const y = -h / 2 + 82 + index * 38;
      const number = pageStart + index + 1;
      const row = `${String(number).padStart(2, ' ')}. T${card.tier} ${card.name.padEnd(16, ' ')}`;
      const impact = previewRewardImpact({
        collection: run.cardCollection,
        change:
          mode === 'upgrade'
            ? { kind: 'upgrade', cardUid: card.uid }
            : { kind: 'remove', cardUid: card.uid },
      });
      const button = this.add
        .text(-w / 2 + 18, y, row, {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#f5edd8',
          padding: { x: 6, y: 4 },
          fixedWidth: 464,
        })
        .setOrigin(0, 0.5)
        .setInteractive({ useHandCursor: true });

      button.on('pointerover', () => button.setColor('#ffe48a'));
      button.on('pointerout', () => button.setColor('#f5edd8'));
      button.on('pointerdown', () => this.applyRestCardChoice(mode, card));
      panel.add(button);
      panel.add(
        createRewardImpactText(this, -w / 2 + 42, y + 11, impact.label, 430, {
          align: 'left',
          originX: 0,
          originY: 0,
          fontSize: '9px',
        }),
      );
    }

    panel.add(
      this.add
        .text(0, h / 2 - 30, '[ BACK ]', {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#b8b0c8',
          backgroundColor: '#221f1e',
          padding: { x: 10, y: 6 },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          this.closeRestCardPanel();
          this.openRestChoices();
        }),
    );

    // Paging, not truncation: the old picker showed the first 7 and printed "+N more
    // cards", which left the rest of a grown collection unreachable — you could not upgrade
    // or remove a card you could see listed nowhere.
    if (pageCount > 1) {
      const pager = (label: string, x: number, targetPage: number, enabled: boolean): void => {
        const text = this.add
          .text(x, h / 2 - 56, label, {
            fontFamily: 'monospace',
            fontSize: '11px',
            fontStyle: 'bold',
            color: enabled ? '#f5edd8' : '#4a4556',
            backgroundColor: enabled ? '#221f1e' : '#17151c',
            padding: { x: 8, y: 5 },
          })
          .setOrigin(0.5);
        if (enabled) {
          text.setInteractive({ useHandCursor: true });
          text.on('pointerover', () => text.setColor('#ffe48a'));
          text.on('pointerout', () => text.setColor('#f5edd8'));
          text.on('pointerdown', () => this.openRestCardPicker(mode, targetPage));
        }
        panel.add(text);
      };

      pager('[ PREV ]', -170, currentPage - 1, currentPage > 0);
      pager('[ NEXT ]', 170, currentPage + 1, currentPage < pageCount - 1);
      panel.add(
        this.add
          .text(0, h / 2 - 56, `Page ${currentPage + 1}/${pageCount}  ·  ${entries.length} cards`, {
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#b8b0c8',
          })
          .setOrigin(0.5),
      );
    }
  }

  private applyRestCardChoice(mode: RestActionMode, card: Card): void {
    const run = getRun();
    const payment = payRestAction(run, mode);
    if (!payment.ok) {
      this.floatText(this.player.x, this.player.y - 42, payment.reason, '#ff9944');
      this.closeRestCardPanel();
      this.openRestChoices();
      return;
    }

    if (mode === 'upgrade') {
      const name = card.name.endsWith('+') ? card.name : `${card.name}+`;
      upgradeCard(card);
      this.floatText(this.player.x, this.player.y - 42, `${name} upgraded`, '#5fe07a');
    } else {
      const ok = run.removeCard(card.uid);
      if (!ok) {
        run.gold += payment.cost;
        this.floatText(this.player.x, this.player.y - 42, 'Cannot remove last card', '#ff9944');
        this.closeRestCardPanel();
        this.openRestChoices();
        return;
      }
      const name = card.name;
      this.floatText(this.player.x, this.player.y - 42, `${name} removed`, '#f1c40f');
    }

    this.closeRestCardPanel();
    this.room.cleared = true;
    this.transitioning = false;
    this.hud();
  }

  private leaveRestRoom(): void {
    this.closeRestActionPanel();
    this.closeRestCardPanel();
    this.room.cleared = true;
    this.transitioning = false;
    this.floatText(this.player.x, this.player.y - 42, 'Left the rest room', '#b8b0c8');
  }

  // ------------------------------------------------------------ boss aftermath

  /** Escape terminus: the room-100 boss has fallen. End the run a victory (R1). */
  private escapeRun(): void {
    if (this.transitioning) return;
    this.transitioning = true;
    getRun().escaped = true;
    this.exitHatch = null;
    playSfx(this, 'victory');
    this.scene.stop('Hud');
    this.scene.start('End', { victory: true });
  }

  /**
   * Descend past a non-final boss (R3). The boss room is sealed, so we fade out,
   * rebuild the next decade's first room at a canonical origin seeded from
   * run.seed + depth (independent of the prior path), then fade in — keeping Daily
   * runs reproducible across players (KTD1). No banking, no gate, no breather heal:
   * the run flows straight on toward room 100.
   */
  private startDescentTransition(): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.closeDeckOverlay();
    this.disableDarknessOverlay();
    this.player.setVelocity(0, 0);
    this.player.body.enable = false;
    this.exitHatch = null;
    playSfx(this, 'door');

    const run = getRun();
    run.bossDefeated = false;
    const nextDepth = run.depth + 1;
    const descentSeed = [run.seed, 'descent', String(nextDepth)].join(':');
    this.rng = new Phaser.Math.RandomDataGenerator([descentSeed]);
    this.gameRng = new PhaserGameRng(this.rng);
    const descentBuildRngState = this.rng.state();

    const dir: Dir = 'S';
    this.cameras.main.fadeOut(420, 11, 10, 18);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      const newOrigin = { x: 0, y: 0 };
      const nextRoom = makeNextRoom(this.gameRng, nextDepth, dir);

      this.wallCollider?.destroy();
      this.wallCollider = null;
      this.destroyBuilt(this.built);
      this.origin = newOrigin;
      this.roomBuildRngState = descentBuildRngState;
      this.built = this.buildRoom(nextRoom, newOrigin);
      this.room = nextRoom;
      this.attachWalls();
      run.depth = nextDepth;

      const entry = ENTRY_CELL[dir];
      const target = {
        x: newOrigin.x + entry.col * TILE + TILE / 2,
        y: newOrigin.y + entry.row * TILE + TILE / 2,
      };
      this.player.body.reset(target.x, target.y);
      this.player.body.enable = true;
      this.player.setTexture('hero_down_0');
      this.facing = 'S';
      this.cameras.main.setScroll(newOrigin.x, newOrigin.y);

      this.primeNextRoomOptions();
      this.cameras.main.fadeIn(420, 11, 10, 18);
      this.transitioning = false;
      this.hud();
      this.saveCurrentSnapshot();
      this.onRoomEntered();
    });
  }
}
