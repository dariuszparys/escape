import Phaser from 'phaser';
import { GAME_W } from '../config';
import { playSfx } from '../audio/sfx';
import { loadDailyRecord, recordDailyAttempt, saveDailyRecord } from '../daily';
import { calculateEmberReward, EmberRewardBreakdown } from '../game/metaRewards';
import { loadRunChronicle, recordRunChronicleEntry, saveRunChronicle } from '../chronicle';
import { getMeta, setMeta } from '../meta';
import { getRun } from '../state';
import { formatRelicSummary, relicDef } from '../data/relics';
import { applyContractCompletions, evaluateNewContracts } from '../game/contracts';
import { CONTRACT_DEFS, contractDef } from '../data/contracts';
import { shouldResolveProgressionRewards } from '../game/runCompletion';

export class EndScene extends Phaser.Scene {
  private victory = false;

  constructor() {
    super('End');
  }

  init(data: { victory: boolean }): void {
    this.victory = data.victory;
  }

  private awardEmbersOnce(): {
    handled: boolean;
    reward: EmberRewardBreakdown;
    progressionSuppressed: boolean;
  } {
    const run = getRun();
    const meta = getMeta();
    const zeroReward: EmberRewardBreakdown = {
      depthMilestoneEmbers: 0,
      escapeEmbers: 0,
      convertedEmbers: 0,
      total: 0,
    };

    if (meta.lastAwardedRunId === run.runId) {
      return { handled: false, reward: zeroReward, progressionSuppressed: false };
    }

    if (!shouldResolveProgressionRewards(run)) {
      setMeta({
        ...meta,
        lastAwardedRunId: run.runId,
      });
      return { handled: true, reward: zeroReward, progressionSuppressed: true };
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

    return { handled: true, reward, progressionSuppressed: false };
  }

  private awardContractsOnce() {
    const run = getRun();
    if (!shouldResolveProgressionRewards(run)) return [];

    const meta = getMeta();
    const completions = evaluateNewContracts(meta.progression, {
      escaped: this.victory,
      depth: run.depth,
      relicCount: run.relics.length,
      elitesDefeated: run.elitesDefeated,
      enemiesDefeated: run.enemiesDefeated,
      stratum: run.stratum,
    });
    if (completions.length === 0) return [];
    setMeta(applyContractCompletions(meta, completions));
    this.game.events.emit('meta-update');
    return completions;
  }

  create(): void {
    const run = getRun();
    const emberAward = this.awardEmbersOnce();
    const contractAward = this.awardContractsOnce();
    const emberLine = !emberAward.handled
      ? 'Embers already recovered.'
      : emberAward.progressionSuppressed
        ? 'Escape the Dungeon grants no progression rewards.'
        : this.formatEmberLine(emberAward.reward);
    const contractLine =
      contractAward.length > 0
        ? contractAward
            .map(
              (completion) =>
                `Contract: ${contractDef(completion.contractId).name} (+${completion.emberReward} Embers${completion.unlockedRelicId ? `, unlocked ${relicDef(completion.unlockedRelicId).name}` : ''})`,
            )
            .join('\n')
        : '';
    const completedContractCount = getMeta().progression.completedContractIds?.length ?? 0;
    const contractProgressLine = `Contracts: ${completedContractCount}/${CONTRACT_DEFS.length} complete`;
    const relicLine =
      run.relics.length > 0
        ? `Relics collected:\n${formatRelicSummary(run.relics)}`
        : 'No relics collected this run.';
    if (emberAward.handled) {
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
            `Escaped with ${run.hp}/${run.maxHp} HP and ${run.cardCollection.length} cards.`,
            emberLine,
            contractLine,
            contractProgressLine,
            relicLine,
          ]
            .filter(Boolean)
            .join('\n'),
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
          [
            `The dungeon claims another soul in room ${run.depth}.`,
            emberLine,
            contractLine,
            contractProgressLine,
            relicLine,
          ]
            .filter(Boolean)
            .join('\n'),
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
