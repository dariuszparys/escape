import Phaser from 'phaser';
import {
  Dir, DIR_VEC, PLAYER_SPEED, ROOM_COLS, ROOM_H, ROOM_ROWS, ROOM_W,
  TILE, TRAP_DAMAGE,
} from '../config';
import { Card, makeCard, CARD_DEFS } from '../data/cards';
import { EnemyInstance, spawnBoss, spawnEnemy } from '../data/enemies';
import { makeStartRoom, makeNextRoom, RoomData } from '../dungeon/rooms';
import { makeCardView } from '../gfx/cardview';
import { PhaserGameRng } from '../game/rng';
import { awardFloorPotion, rollChestReward } from '../game/rewards';
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
  potionAt: { x: number; y: number; img: Phaser.GameObjects.Image } | null;
  chest: { x: number; y: number; img: Phaser.GameObjects.Image; opened: boolean } | null;
  cardPicks: CardPickup[];
  enemy: EnemyInstance | null;
  enemySprite: Phaser.GameObjects.Image | null;
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
  private exitHatch: { x: number; y: number; img: Phaser.GameObjects.Image } | null = null;

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

    this.room = makeStartRoom();
    this.origin = { x: 0, y: 0 };
    this.built = this.buildRoom(this.room, this.origin);

    const spawn = this.cellXY(7, 7);
    this.player = this.physics.add.sprite(spawn.x, spawn.y, 'hero_down_0');
    this.player.setScale(3);
    this.player.body.setSize(10, 9).setOffset(3, 6);
    this.player.setDepth(10);
    this.attachWalls();

    const kb = this.input.keyboard!;
    this.keys = {
      up: kb.addKey('UP'), down: kb.addKey('DOWN'), left: kb.addKey('LEFT'), right: kb.addKey('RIGHT'),
      w: kb.addKey('W'), s: kb.addKey('S'), a: kb.addKey('A'), d: kb.addKey('D'),
      p: kb.addKey('P'),
    };

    this.cameras.main.setScroll(this.origin.x, this.origin.y);

    this.scene.launch('Hud');
    this.hud();

    this.game.events.off('battle-end');
    this.game.events.on('battle-end', (won: boolean) => this.onBattleEnd(won));
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
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

  private floatText(x: number, y: number, msg: string, color = '#f5edd8'): void {
    const t = this.add
      .text(x, y, msg, {
        fontFamily: 'monospace', fontSize: '16px', fontStyle: 'bold', color,
        stroke: '#16121e', strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(50);
    this.tweens.add({
      targets: t, y: y - 44, alpha: 0, duration: 1100, ease: 'Cubic.easeOut',
      onComplete: () => t.destroy(),
    });
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
          doors.push({ dir, rect: new Phaser.Geom.Rectangle(x - TILE / 2, y - TILE / 2, TILE, TILE) });
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
      objs, walls, doors,
      spikeRects: [],
      potionAt: null,
      chest: null,
      cardPicks: [],
      enemy: null,
      enemySprite: null,
    };

    const center = at(7, 5);

    switch (room.event) {
      case 'start': {
        const slash = makeCard(CARD_DEFS.find((c) => c.id === 'slash')!);
        const guard = makeCard(CARD_DEFS.find((c) => c.id === 'guard')!);
        for (const [i, card] of [slash, guard].entries()) {
          const pos = at(i === 0 ? 4 : 10, 4);
          const view = makeCardView(this, card, pos.x, pos.y, 0.62);
          view.setDepth(5);
          this.tweens.add({
            targets: view, y: pos.y - 8, duration: 800, yoyo: true, repeat: -1,
            ease: 'Sine.easeInOut', delay: i * 250,
          });
          objs.push(view);
          built.cardPicks.push({ card, view, x: pos.x, y: pos.y, taken: false });
        }
        break;
      }
      case 'potion': {
        const img = this.add.image(center.x, center.y, 'potion').setScale(3).setDepth(2);
        objs.push(img);
        built.potionAt = { x: center.x, y: center.y, img };
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
        built.enemy = spawnEnemy(this.gameRng, room.depth, Math.max(getRun().combatHand.length, 1));
        const img = this.add.image(center.x, center.y, built.enemy.def.texture).setScale(4).setDepth(5);
        this.tweens.add({ targets: img, y: center.y - 6, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        objs.push(img);
        built.enemySprite = img;
        break;
      }
      case 'boss': {
        built.enemy = spawnBoss(this.gameRng);
        const img = this.add.image(center.x, center.y - 10, built.enemy.def.texture).setScale(4.5).setDepth(5);
        this.tweens.add({ targets: img, y: center.y - 18, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        objs.push(img);
        built.enemySprite = img;
        break;
      }
    }

    return built;
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

  // ------------------------------------------------------------ transitions

  private startTransition(dir: Dir): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.player.setVelocity(0, 0);
    this.player.body.enable = false;

    const run = getRun();
    const nextDepth = run.depth + 1;
    const nextRoom = makeNextRoom(this.gameRng, nextDepth, dir);
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

    const anim = dir === 'N' ? 'walk_up' : dir === 'S' ? 'walk_down' : dir === 'E' ? 'walk_right' : 'walk_left';
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
        run.depth = nextDepth;
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
    if ((room.event === 'encounter' || room.event === 'boss') && !room.cleared && built.enemy) {
      // A fight starts the moment you step in.
      const s = built.enemySprite!;
      const mark = this.add
        .text(s.x, s.y - 60, '!', {
          fontFamily: 'monospace', fontSize: '40px', fontStyle: 'bold', color: '#ff5544',
          stroke: '#16121e', strokeThickness: 6,
        })
        .setOrigin(0.5)
        .setDepth(50);
      this.built.objs.push(mark);
      this.time.delayedCall(450, () => {
        mark.destroy();
        this.startBattle();
      });
    } else if (room.event === 'trap') {
      this.floatText(this.player.x, this.player.y - 50, 'Watch your step!', '#ff9944');
    }
  }

  private startBattle(): void {
    if (!this.built.enemy) return;
    this.battleActive = true;
    this.player.setVelocity(0, 0);
    this.scene.launch('Battle', { enemy: this.built.enemy, rng: this.gameRng });
    this.scene.pause();
  }

  private onBattleEnd(won: boolean): void {
    this.battleActive = false;
    if (!won) return; // Battle scene already routed to the game-over screen.
    this.room.cleared = true;
    const s = this.built.enemySprite;
    if (s) {
      this.tweens.add({
        targets: s, alpha: 0, scale: s.scale * 0.3, duration: 500, ease: 'Cubic.easeIn',
        onComplete: () => s.destroy(),
      });
      this.built.enemySprite = null;
    }
    if (this.room.event === 'boss') {
      getRun().bossDefeated = true;
      const c = this.cellXY(7, 5);
      const img = this.add.image(c.x, c.y, 'exit').setScale(3).setDepth(1).setAlpha(0);
      this.tweens.add({ targets: img, alpha: 1, duration: 700 });
      this.built.objs.push(img);
      this.exitHatch = { x: c.x, y: c.y, img };
      this.floatText(c.x, c.y - 60, 'The way out opens!', '#f1c40f');
    }
    this.hud();
  }

  // ------------------------------------------------------------ update loop

  update(time: number): void {
    if (this.transitioning || this.battleActive) return;
    const run = getRun();

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
      const anim = this.facing === 'N' ? 'walk_up' : this.facing === 'S' ? 'walk_down' : this.facing === 'E' ? 'walk_right' : 'walk_left';
      this.player.anims.play(anim, true);
    } else {
      this.player.anims.stop();
      const idle = this.facing === 'N' ? 'hero_up_0' : this.facing === 'S' ? 'hero_down_0' : this.facing === 'E' ? 'hero_right_0' : 'hero_left_0';
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
      } else if (!potion) {
        this.floatText(this.player.x, this.player.y - 50, 'No potions!', '#b8b0c8');
      }
    }

    const px = this.player.x;
    const py = this.player.y;

    // doors
    for (const door of this.built.doors) {
      if (!door.rect.contains(px, py)) continue;
      if (this.room.event === 'start' && run.cardCollection.length === 0) {
        if (time > this.lastHintAt + 900) {
          this.lastHintAt = time;
          this.floatText(px, py - 50, 'Choose a card first!', '#ff9944');
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
      this.floatText(pick.x, pick.y - 40, `Took ${pick.card.name}!`, '#f1c40f');
      for (const other of this.built.cardPicks) {
        other.taken = true;
        this.tweens.add({
          targets: other.view,
          alpha: 0,
          y: (other === pick ? '-=40' : '+=10'),
          duration: 350,
          onComplete: () => other.view.destroy(),
        });
      }
      this.hud();
    }

    // potion on the floor
    if (this.built.potionAt && Phaser.Math.Distance.Between(px, py, this.built.potionAt.x, this.built.potionAt.y) < 36) {
      this.built.potionAt.img.destroy();
      this.built.potionAt = null;
      const result = awardFloorPotion(run);
      const msg = result.kind === 'heal' ? `+${result.amount} HP` : `+${result.item.name}`;
      this.floatText(px, py - 50, msg, '#5fe07a');
      this.hud();
    }

    // chest
    const chest = this.built.chest;
    if (chest && !chest.opened && Phaser.Math.Distance.Between(px, py, chest.x, chest.y) < 64) {
      chest.opened = true;
      chest.img.setTexture('chest_open');
      this.openChest(chest.x, chest.y);
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
        if (run.hp <= 0) {
          this.scene.stop('Hud');
          this.scene.start('End', { victory: false });
          return;
        }
        break;
      }
    }

    // exit hatch
    if (this.exitHatch && Phaser.Math.Distance.Between(px, py, this.exitHatch.x, this.exitHatch.y) < 30) {
      this.scene.stop('Hud');
      this.scene.start('End', { victory: true });
    }
  }

  private openChest(x: number, y: number): void {
    const run = getRun();
    const result = rollChestReward(run, this.gameRng, run.depth);
    const message = result.kind === 'card' ? `Found card: ${result.cardName}!`
      : result.kind === 'item' ? `Found ${result.item.name}!`
        : result.kind === 'armor' ? '+1 Armor'
          : result.kind === 'gold' ? `+${result.amount} Gold`
            : `+${result.amount} HP`;
    this.floatText(x, y - 50, message, result.kind === 'gold' ? '#f1c40f' : '#5fe07a');
    this.hud();
  }
}
