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
  TILE,
  TRAP_DAMAGE,
  VISION_RADIUS,
} from '../config';
import { Card, makeCard, CARD_DEFS } from '../data/cards';
import { EnemyInstance, spawnBoss, spawnEnemy } from '../data/enemies';
import { InventoryItem, makeItem, randomItemIdForDepth } from '../data/items';
import { STARTER_KITS } from '../data/starterKits';
import { makeStartRoom, makeNextRoom, RoomData, type RoomEvent } from '../dungeon/rooms';
import { makeCardView } from '../gfx/cardview';
import { createDeckPanel } from '../gfx/deckPanel';
import { createRewardImpactText } from '../gfx/rewardImpactView';
import { PhaserGameRng } from '../game/rng';
import { playSfx } from '../audio/sfx';
import { awardPotionItem, rollChestReward } from '../game/rewards';
import { previewRewardImpact } from '../game/rewardImpact';
import { startingCardIdsForRun } from '../game/startingCards';
import { upgradeCard } from '../game/cardUpgrade';
import {
  canUseRestAction,
  payRestAction,
  restActionCost,
  type RestActionMode,
} from '../game/restEconomy';
import { commitDelve, resolveBank } from '../game/delve';
import { calculateEmberReward } from '../game/metaRewards';
import { stratumForDepth } from '../game/strata';
import { getRun } from '../state';

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

const ROOM_EVENT_LABEL: Record<RoomEvent, string> = {
  start: 'camp',
  encounter: 'enemy',
  chest: 'chest',
  potion: 'potion',
  rest: 'rest',
  trap: 'trap',
  boss: 'boss',
};

interface CardPickup {
  card: Card;
  view: Phaser.GameObjects.Container;
  x: number;
  y: number;
  taken: boolean;
}

interface BuiltRoom {
  objs: Phaser.GameObjects.GameObject[];
  walls: Phaser.Physics.Arcade.StaticGroup;
  doors: { dir: Dir; rect: Phaser.Geom.Rectangle }[];
  spikeRects: Phaser.Geom.Rectangle[];
  potionAt: { x: number; y: number; img: Phaser.GameObjects.Image; item: InventoryItem } | null;
  chest: { x: number; y: number; img: Phaser.GameObjects.Image; opened: boolean } | null;
  restAt: { x: number; y: number; img: Phaser.GameObjects.Image; opened: boolean } | null;
  cardPicks: CardPickup[];
  enemy: EnemyInstance | null;
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
  private invulnUntil = 0;
  private lastHintAt = 0;
  private nextRoomOptions: Partial<Record<Dir, NextRoomOption>> = {};
  private exitHatch: { x: number; y: number; img: Phaser.GameObjects.Image } | null = null;
  private scoutRevealText: Phaser.GameObjects.Text | null = null;
  private itemSwapPrompt: Phaser.GameObjects.Container | null = null;
  private itemSwapKeyHandlers: { event: string; handler: (event: KeyboardEvent) => void }[] = [];
  private ignoredPotionUid: number | null = null;
  private deckOverlay: Phaser.GameObjects.Container | null = null;
  private visionGraphics: Phaser.GameObjects.Graphics | null = null;
  private restActionPanel: Phaser.GameObjects.Container | null = null;
  private restCardPanel: Phaser.GameObjects.Container | null = null;
  private gatePanel: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('Dungeon');
  }

  create(): void {
    const run = getRun();
    this.rng = new Phaser.Math.RandomDataGenerator([run.seed]);
    this.gameRng = new PhaserGameRng(this.rng);
    this.transitioning = false;
    this.battleActive = false;
    this.exitHatch = null;
    this.scoutRevealText = null;

    this.room = makeStartRoom();
    this.origin = { x: 0, y: 0 };
    this.built = this.buildRoom(this.room, this.origin);
    this.primeNextRoomOptions();

    const spawn = this.cellXY(7, 7);
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
    };

    this.cameras.main.setScroll(this.origin.x, this.origin.y);

    this.scene.launch('Hud');
    this.hud();
    this.tryRevealScoutOptions();

    this.game.events.off('battle-end');
    this.game.events.on('battle-end', (won: boolean) => this.onBattleEnd(won));
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.closeDeckOverlay();
      this.closeItemSwapPrompt();
      this.disableDarknessOverlay();
      this.closeRestActionPanel();
      this.closeRestCardPanel();
      this.closeGatePanel();
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
        if (this.scoutRevealText === t) this.scoutRevealText = null;
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

  private clearScoutRevealText(): void {
    if (!this.scoutRevealText) return;
    this.tweens.killTweensOf(this.scoutRevealText);
    this.scoutRevealText.destroy();
    this.scoutRevealText = null;
  }

  private toggleDeckOverlay(): void {
    if (this.deckOverlay) {
      this.closeDeckOverlay();
      return;
    }

    this.closeItemSwapPrompt();
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

    const nextDepth = this.room.depth + 1;
    for (const dir of this.room.openDoors) {
      const rng = new Phaser.Math.RandomDataGenerator([this.branchSeed(dir)]);
      const option = makeNextRoom(new PhaserGameRng(rng), nextDepth, dir);
      this.nextRoomOptions[dir] = { room: option, rngState: rng.state() };
    }
  }

  private tryRevealScoutOptions(): void {
    const run = getRun();
    if (run.scoutCharges <= 0 || this.room.openDoors.length === 0 || this.scoutRevealText) return;

    const lines = this.room.openDoors.map((dir) => {
      const option = this.nextRoomOptions[dir];
      const label = option ? ROOM_EVENT_LABEL[option.room.event] : 'unknown';
      return `${dir}: ${label}`;
    });

    this.scoutRevealText = this.add
      .text(this.origin.x + ROOM_W / 2, this.origin.y + 42, `Scout Flame\n${lines.join('   ')}`, {
        fontFamily: 'monospace',
        fontSize: '15px',
        fontStyle: 'bold',
        color: '#f1c40f',
        align: 'center',
        stroke: '#16121e',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(60);
    this.built.objs.push(this.scoutRevealText);

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
      spikeRects: [],
      potionAt: null,
      chest: null,
      restAt: null,
      cardPicks: [],
      enemy: null,
      enemySprite: null,
    };

    const center = at(7, 5);

    switch (room.event) {
      case 'start': {
        const run = getRun();
        if (run.starterKitId) {
          const kit = STARTER_KITS.find((candidate) => candidate.id === run.starterKitId);
          const signature = kit
            ? CARD_DEFS.find((candidate) => candidate.id === kit.signatureCardId)
            : null;
          const kitText = kit && signature ? `${kit.name}: ${signature.name} starts in deck` : '';
          if (kitText) {
            const label = this.add
              .text(origin.x + ROOM_W / 2, origin.y + 92, kitText, {
                fontFamily: 'monospace',
                fontSize: '14px',
                fontStyle: 'bold',
                color: '#f1c40f',
                align: 'center',
                stroke: '#16121e',
                strokeThickness: 4,
              })
              .setOrigin(0.5)
              .setDepth(6);
            objs.push(label);
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
          const p = at(s.col, s.row);
          const img = this.add.image(p.x, p.y, 'spikes').setScale(3).setDepth(1);
          objs.push(img);
          built.spikeRects.push(new Phaser.Geom.Rectangle(p.x - 18, p.y - 6, 36, 22));
        }
        break;
      }
      case 'encounter': {
        built.enemy = spawnEnemy(this.gameRng, room.depth);
        this.createEnemyActor(built, origin, false, built.enemy);
        break;
      }
      case 'boss': {
        built.enemy = spawnBoss(this.gameRng, room.depth);
        this.createEnemyActor(built, origin, true, built.enemy);
        break;
      }
    }

    return built;
  }

  /**
   * The enemy in an uncleared encounter/boss room is a static sprite (KTD3): the
   * entry-cue anchor and the victory fade-out target. Boss centered, normal at the
   * same central cell; the old intent marker, contact ring, and per-frame position
   * sync are gone with the threat phase.
   */
  private createEnemyActor(
    built: BuiltRoom,
    origin: { x: number; y: number },
    isBoss: boolean,
    enemy: EnemyInstance,
  ): void {
    const x = origin.x + 7 * TILE + TILE / 2;
    const y = origin.y + 5 * TILE + TILE / 2;
    const sprite = this.add
      .image(x, y, enemy.def.texture)
      .setScale(isBoss ? 4.5 : 4)
      .setDepth(5);
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
    this.disableDarknessOverlay();
    this.player.setVelocity(0, 0);
    this.player.body.enable = false;
    this.clearScoutRevealText();
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
        this.onRoomEntered();
      },
    });
  }

  private onRoomEntered(): void {
    const { room, built } = this;
    playSfx(this, 'step');
    if (
      (room.event === 'encounter' || room.event === 'boss') &&
      !room.cleared &&
      built.enemySprite
    ) {
      this.triggerEncounter(built.enemySprite);
    } else if (room.event === 'trap') {
      this.enableDarknessOverlay();
      this.floatText(this.player.x, this.player.y - 50, 'Watch your step!', '#ff9944');
      this.tryRevealScoutOptions();
    } else {
      this.tryRevealScoutOptions();
    }
  }

  /**
   * Entry is commitment (R1/R4). Lock input the instant the room is entered
   * (KTD1) so the whole cue window blocks movement, doors, item use, and
   * overlays via the update-loop guard, then play the relocated contact cue
   * (KTD2) and fade into the card battle after ~450ms. Phaser scene timers and
   * tweens run independently of the update guard, so the locked cue still fires.
   * The pre-battle scout reveal is skipped for these rooms (KTD4) — onBattleEnd
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
    this.scene.launch('TurnBattle', {
      mode: 'run',
      enemy: this.built.enemy,
      rng: this.gameRng,
    });
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
    }
    if (this.room.event === 'boss') {
      getRun().bossDefeated = true;
      const c = this.cellXY(7, 5);
      const img = this.add.image(c.x, c.y, 'exit').setScale(3).setDepth(1).setAlpha(0);
      this.tweens.add({ targets: img, alpha: 1, duration: 700 });
      this.built.objs.push(img);
      this.exitHatch = { x: c.x, y: c.y, img };
      this.floatText(c.x, c.y - 60, 'The way out opens!', '#f1c40f');
    } else {
      this.tryRevealScoutOptions();
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
    const run = getRun();
    if (Phaser.Input.Keyboard.JustDown(this.keys.c)) {
      this.toggleDeckOverlay();
      return;
    }
    if (this.deckOverlay) {
      this.player.setVelocity(0, 0);
      return;
    }
    if (this.itemSwapPrompt) {
      this.player.setVelocity(0, 0);
      return;
    }
    if (this.restActionPanel || this.restCardPanel || this.gatePanel) {
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
      for (const rect of this.built.spikeRects) {
        if (!rect.contains(px, py + 12)) continue;
        this.invulnUntil = time + 900;
        run.hp -= TRAP_DAMAGE;
        this.floatText(px, py - 50, `-${TRAP_DAMAGE}`, '#ff5544');
        this.cameras.main.shake(150, 0.008);
        this.player.setTint(0xff5544);
        this.time.delayedCall(250, () => this.player.clearTint());
        this.hud();
        playSfx(this, 'trap');
        if (run.hp <= 0) {
          this.scene.stop('Hud');
          this.scene.start('End', { victory: false });
          return;
        }
        break;
      }
    }

    // exit hatch — beating the stratum boss opens the gate decision (bank or delve).
    if (
      this.exitHatch &&
      Phaser.Math.Distance.Between(px, py, this.exitHatch.x, this.exitHatch.y) < 30
    ) {
      this.openGateDecision();
    }
  }

  private openChest(x: number, y: number): void {
    const run = getRun();
    const result = rollChestReward(run, this.gameRng, run.depth);
    const message =
      result.kind === 'card'
        ? `Found card: ${result.cardName}!`
        : result.kind === 'item'
          ? `Found ${result.item.name}!`
          : result.kind === 'armor'
            ? '+1 Armor'
            : result.kind === 'gold'
              ? `+${result.amount} Gold`
              : result.kind === 'heal'
                ? `+${result.amount} HP`
                : result.kind === 'relic'
                  ? `Relic: ${result.relicName}`
                  : `${result.item.name} dropped!`;
    if (result.kind === 'inventory_full') {
      this.spawnFloorPotion(x, y + TILE, result.item);
    }
    this.floatText(x, y - 50, message, result.kind === 'gold' ? '#f1c40f' : '#5fe07a');
    if (result.kind === 'card') {
      this.floatImpactText(x, y - 78, result.impactLabel);
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
    const panel = this.add.container(cx, cy).setDepth(260);
    this.restActionPanel = panel;

    const w = 330;
    const h = 222;
    const bg = this.add.graphics();
    bg.fillStyle(0x111019, 0.98);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 8);
    bg.lineStyle(2, 0xf1c40f, 0.85);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
    panel.add(bg);

    panel.add(
      this.add
        .text(0, -h / 2 + 26, 'Rest Room', {
          fontFamily: 'monospace',
          fontSize: '24px',
          fontStyle: 'bold',
          color: '#f1c40f',
        })
        .setOrigin(0.5),
    );
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
    };

    addChoice('UPGRADE A CARD', -30, 'upgrade');
    addChoice('REMOVE A CARD', 14, 'remove');

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

  private openRestCardPicker(mode: RestActionMode): void {
    if (!this.restActionPanel) return;
    const run = getRun();

    this.closeRestActionPanel();
    // Deck model (U12): every card fights, so list the collection reading-sorted.
    const entries = [...run.cardCollection].sort(
      (a, b) => b.tier - a.tier || a.name.localeCompare(b.name) || a.uid - b.uid,
    );
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

    const visibleEntries = entries.slice(0, 7);
    for (const [index, card] of visibleEntries.entries()) {
      const y = -h / 2 + 82 + index * 38;
      const row = `${String(index + 1).padStart(2, ' ')}. T${card.tier} ${card.name.padEnd(16, ' ')}`;
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

    if (entries.length > visibleEntries.length) {
      panel.add(
        this.add
          .text(0, h / 2 - 50, `+${entries.length - visibleEntries.length} more cards`, {
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#6a6478',
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

  // ------------------------------------------------------------ stratum gate

  private closeGatePanel(): void {
    this.gatePanel?.destroy();
    this.gatePanel = null;
  }

  /** Present the bank-or-delve choice after a stratum boss falls (R1, R2). */
  private openGateDecision(): void {
    if (this.gatePanel || this.transitioning) return;
    const run = getRun();
    this.player.setVelocity(0, 0);
    this.player.anims.stop();

    const stratum = stratumForDepth(run.depth);
    const reward = calculateEmberReward({
      depth: run.depth,
      enemiesDefeated: run.enemiesDefeated,
      gold: run.gold,
      escaped: true,
      convertGold: !run.isDaily,
    });
    const bankLine = run.isDaily
      ? `Bank: end the delve at depth ${run.depth} (no Ember conversion in Daily)`
      : `Bank: convert ${run.gold} Gold → ${reward.convertedEmbers} Ember${
          reward.convertedEmbers === 1 ? '' : 's'
        } (+${reward.escapeEmbers} escape)`;

    const cx = this.origin.x + ROOM_W / 2;
    const cy = this.origin.y + ROOM_H / 2;
    const panel = this.add.container(cx, cy).setDepth(300);
    this.gatePanel = panel;

    const w = 420;
    const h = 252;
    const bg = this.add.graphics();
    bg.fillStyle(0x111019, 0.98);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 8);
    bg.lineStyle(2, 0xf1c40f, 0.85);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
    panel.add(bg);

    panel.add(
      this.add
        .text(0, -h / 2 + 28, `STRATUM ${stratum} CLEARED`, {
          fontFamily: 'monospace',
          fontSize: '22px',
          fontStyle: 'bold',
          color: '#f1c40f',
        })
        .setOrigin(0.5),
    );
    panel.add(
      this.add
        .text(0, -h / 2 + 60, 'Cash out a winner, or descend into a deadlier stratum?', {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#b8b0c8',
          align: 'center',
          fixedWidth: w - 40,
          wordWrap: { width: w - 40, useAdvancedWrap: true },
        })
        .setOrigin(0.5),
    );

    const bank = this.add
      .text(0, -14, '[ BANK & ESCAPE ]', {
        fontFamily: 'monospace',
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#5fe07a',
        backgroundColor: '#1c2a1c',
        padding: { x: 14, y: 9 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    bank.on('pointerover', () => bank.setColor('#9bf5ad'));
    bank.on('pointerout', () => bank.setColor('#5fe07a'));
    bank.on('pointerdown', () => this.bankAndEscape());
    panel.add(bank);

    panel.add(
      this.add
        .text(0, 22, bankLine, {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#8e889a',
          align: 'center',
          fixedWidth: w - 40,
          wordWrap: { width: w - 40, useAdvancedWrap: true },
        })
        .setOrigin(0.5),
    );

    const delve = this.add
      .text(0, 62, `[ DELVE → STRATUM ${stratum + 1} ]`, {
        fontFamily: 'monospace',
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#ff7a55',
        backgroundColor: '#2a1c1c',
        padding: { x: 14, y: 9 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    delve.on('pointerover', () => delve.setColor('#ff9b80'));
    delve.on('pointerout', () => delve.setColor('#ff7a55'));
    delve.on('pointerdown', () => this.startDelveTransition());
    panel.add(delve);

    panel.add(
      this.add
        .text(0, 98, 'Delving forfeits all unbanked Gold if you fall.', {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#6a6478',
          align: 'center',
        })
        .setOrigin(0.5),
    );
  }

  /** Bank terminus: cash out the run as a win and route to End (R6, KTD2). */
  private bankAndEscape(): void {
    const run = getRun();
    resolveBank(run);
    this.closeGatePanel();
    playSfx(this, 'victory');
    this.scene.stop('Hud');
    this.scene.start('End', { victory: true });
  }

  /**
   * Delve terminus: advance into the next stratum. The boss room is sealed, so we
   * fade out, rebuild the next stratum's first room at a canonical origin seeded
   * from run.seed + stratum index (independent of the prior path), then fade in —
   * keeping Daily strata reproducible across players (KTD1, delve-determinism risk).
   */
  private startDelveTransition(): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.closeGatePanel();
    this.closeDeckOverlay();
    this.disableDarknessOverlay();
    this.player.setVelocity(0, 0);
    this.player.body.enable = false;
    this.exitHatch = null;
    playSfx(this, 'door');

    const run = getRun();
    commitDelve(run);
    run.bossDefeated = false;
    const nextDepth = run.depth + 1;
    const delveSeed = [run.seed, 'stratum', run.stratum].join(':');
    this.rng = new Phaser.Math.RandomDataGenerator([delveSeed]);
    this.gameRng = new PhaserGameRng(this.rng);

    const dir: Dir = 'S';
    this.cameras.main.fadeOut(420, 11, 10, 18);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      const newOrigin = { x: 0, y: 0 };
      const nextRoom = makeNextRoom(this.gameRng, nextDepth, dir);

      this.wallCollider?.destroy();
      this.wallCollider = null;
      this.destroyBuilt(this.built);
      this.origin = newOrigin;
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
      this.onRoomEntered();
    });
  }
}
