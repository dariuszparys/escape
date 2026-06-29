import Phaser from 'phaser';
import { GAME_W } from '../config';
import { playSfx } from '../audio/sfx';
import { loadDailyRecord, recordDailyAttempt, saveDailyRecord } from '../daily';
import { calculateEmberReward, EmberRewardBreakdown } from '../game/metaRewards';
import { loadRunChronicle, recordRunChronicleEntry, saveRunChronicle } from '../chronicle';
import { getMeta, setMeta } from '../meta';
import { getRun } from '../state';

export class EndScene extends Phaser.Scene {
  private victory = false;

  constructor() {
    super('End');
  }

  init(data: { victory: boolean }): void {
    this.victory = data.victory;
  }

  private awardEmbersOnce(): { awarded: boolean; reward: EmberRewardBreakdown } {
    const run = getRun();
    const meta = getMeta();
    const zeroReward: EmberRewardBreakdown = {
      depthMilestoneEmbers: 0,
      escapeEmbers: 0,
      convertedEmbers: 0,
      total: 0,
    };

    if (meta.lastAwardedRunId === run.runId) {
      return { awarded: false, reward: zeroReward };
    }

    const reward = calculateEmberReward({
      depth: run.depth,
      enemiesDefeated: run.enemiesDefeated,
      gold: run.gold,
      escaped: this.victory,
      convertGold: !run.isDaily,
    });

    setMeta({
      ...meta,
      embers: meta.embers + reward.total,
      lastAwardedRunId: run.runId,
    });

    return { awarded: true, reward };
  }

  create(): void {
    const run = getRun();
    const emberAward = this.awardEmbersOnce();
    const emberLine = emberAward.awarded
      ? this.formatEmberLine(emberAward.reward)
      : 'Embers already recovered.';
    if (emberAward.awarded) {
      this.recordChronicleEntry(emberAward.reward.total, emberAward.reward.convertedEmbers);
      this.recordDailyAttemptOnce();
    }
    const cx = GAME_W / 2;
    this.cameras.main.fadeIn(600, 11, 10, 18);

    if (this.victory) {
      playSfx(this, 'victory');
      this.add
        .text(cx, 150, 'YOU ESCAPED!', {
          fontFamily: 'monospace',
          fontSize: '54px',
          fontStyle: 'bold',
          color: '#f1c40f',
        })
        .setOrigin(0.5);
      const hero = this.add.image(cx, 270, 'hero_down_0').setScale(6);
      this.tweens.add({
        targets: hero,
        y: 258,
        duration: 600,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      this.add
        .text(
          cx,
          380,
          [
            'The dungeon falls silent behind you.',
            'Sunlight. Fresh air. Freedom.',
            '',
            `Escaped with ${run.hp}/${run.maxHp} HP and ${run.hand.length} cards.`,
            emberLine,
          ].join('\n'),
          {
            fontFamily: 'monospace',
            fontSize: '17px',
            color: '#d8d2e4',
            align: 'center',
            lineSpacing: 6,
          },
        )
        .setOrigin(0.5);
    } else {
      playSfx(this, 'death');
      this.add
        .text(cx, 170, 'YOU DIED', {
          fontFamily: 'monospace',
          fontSize: '54px',
          fontStyle: 'bold',
          color: '#ff5544',
        })
        .setOrigin(0.5);
      this.add.image(cx, 280, 'skeleton').setScale(6).setAlpha(0.8);
      this.add
        .text(
          cx,
          390,
          [`The dungeon claims another soul in room ${run.depth}.`, emberLine].join('\n'),
          {
            fontFamily: 'monospace',
            fontSize: '17px',
            color: '#b8b0c8',
            align: 'center',
            lineSpacing: 6,
          },
        )
        .setOrigin(0.5);
    }

    const retry = this.add
      .text(cx, 500, '[ SPACE: RETURN TO THE FIRE ]', {
        fontFamily: 'monospace',
        fontSize: '20px',
        fontStyle: 'bold',
        color: '#f5edd8',
      })
      .setOrigin(0.5);
    this.tweens.add({ targets: retry, alpha: 0.3, duration: 600, yoyo: true, repeat: -1 });

    const restart = () => {
      this.scene.start('Campfire');
    };
    this.input.keyboard?.once('keydown-SPACE', restart);
    this.input.once('pointerdown', restart);
  }

  private formatEmberLine(reward: EmberRewardBreakdown): string {
    if (reward.total === 0) {
      return 'No Embers recovered this run.';
    }
    const detail =
      reward.convertedEmbers > 0 ? ` (${reward.convertedEmbers} banked from Gold)` : '';
    return `Recovered ${reward.total} Ember${reward.total === 1 ? '' : 's'}${detail}.`;
  }

  private recordDailyAttemptOnce(): void {
    const run = getRun();
    if (!run.isDaily || !run.dailyKey) return;

    const record = loadDailyRecord();
    if (record.date === run.dailyKey) {
      saveDailyRecord(recordDailyAttempt(record, { depth: run.depth, escaped: this.victory }));
    }
  }

  private recordChronicleEntry(emberReward: number, convertedEmbers: number): void {
    const run = getRun();
    const chronicle = loadRunChronicle();

    saveRunChronicle(
      recordRunChronicleEntry(chronicle, {
        runId: run.runId,
        completedAt: new Date().toISOString(),
        seed: run.seed,
        dailyKey: run.isDaily ? run.dailyKey : null,
        escaped: this.victory,
        depth: run.depth,
        enemiesDefeated: run.enemiesDefeated,
        gold: run.gold,
        emberReward,
        convertedEmbers,
      }),
    );
  }
}
