import Phaser from 'phaser';
import { GAME_W } from '../config';
import { playSfx } from '../audio/sfx';
import { loadDailyRecordForKey, recordDailyAttempt, saveDailyRecord } from '../daily';
import { loadRunChronicle, recordRunChronicleEntry, saveRunChronicle } from '../chronicle';
import { getMeta, setMeta } from '../meta';
import { getProfile, levelForXp, setProfile } from '../profile';
import { getRun } from '../state';
import { formatRelicSummary, relicDef } from '../data/relics';
import {
  applyContractCompletions,
  applyContractDiscoveries,
  evaluateNewContracts,
} from '../game/contracts';
import { CONTRACT_DEFS, contractDef } from '../data/contracts';
import { awardRunXpOnce, type RunXpAwardResult } from '../game/runCompletion';
import { clearRunSnapshot } from '../game/runSnapshot';

export class EndScene extends Phaser.Scene {
  private victory = false;

  constructor() {
    super('End');
  }

  init(data: { victory: boolean }): void {
    this.victory = data.victory;
  }

  private awardXpOnce(): RunXpAwardResult {
    const run = getRun();
    const result = awardRunXpOnce(getProfile(), run, this.victory);
    if (result.handled) {
      setProfile(result.profile);
      this.game.events.emit('profile-update', result.profile);
    }
    return result;
  }

  private awardContractsOnce() {
    const run = getRun();
    const meta = getMeta();
    const completions = evaluateNewContracts(meta.progression, {
      escaped: this.victory,
      depth: run.depth,
      relicCount: run.relics.length,
      elitesDefeated: run.elitesDefeated,
      enemiesDefeated: run.enemiesDefeated,
    });
    if (completions.length === 0) return [];
    setMeta(applyContractCompletions(meta, completions));
    setProfile(applyContractDiscoveries(getProfile(), completions));
    this.game.events.emit('meta-update');
    this.game.events.emit('profile-update', getProfile());
    return completions;
  }

  create(): void {
    clearRunSnapshot();
    const run = getRun();
    const xpAward = this.awardXpOnce();
    const contractAward = this.awardContractsOnce();
    const xpLine = this.formatXpLine(xpAward);
    const levelLine = this.formatLevelLine(xpAward);
    const bestRoomLine = `Personal best: room ${xpAward.profile.personalBestRoom}.`;
    const contractLine =
      contractAward.length > 0
        ? contractAward
            .map(
              (completion) =>
                `Contract: ${contractDef(completion.contractId).name}${completion.unlockedRelicId ? `, discovered ${relicDef(completion.unlockedRelicId).name}` : ''}`,
            )
            .join('\n')
        : '';
    const completedContractCount = getMeta().progression.completedContractIds?.length ?? 0;
    const contractProgressLine = `Contracts: ${completedContractCount}/${CONTRACT_DEFS.length} complete`;
    const relicLine =
      run.relics.length > 0
        ? `Relics collected:\n${formatRelicSummary(run.relics)}`
        : 'No relics collected this run.';
    if (xpAward.handled) {
      this.recordChronicleEntry();
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
            xpLine,
            levelLine,
            bestRoomLine,
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
            xpLine,
            levelLine,
            bestRoomLine,
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

  private formatXpLine(award: RunXpAwardResult): string {
    if (!award.handled) return 'XP already recorded for this run.';
    const parts = [`${award.reward.roomsXp} room`, `${award.reward.bossXp} boss`];
    if (award.reward.escapeXp > 0) parts.push(`${award.reward.escapeXp} escape`);
    return `Earned ${award.reward.total} XP (${parts.join(' + ')}).`;
  }

  private formatLevelLine(award: RunXpAwardResult): string {
    const level = levelForXp(award.profile.xp);
    if (!award.handled) return `Level ${level} - ${award.profile.xp} lifetime XP.`;
    if (award.levelsGained.length === 0) {
      return `Level ${award.nextLevel} - ${award.profile.xp} lifetime XP.`;
    }
    return `Level ${award.previousLevel} -> ${award.nextLevel}: reached ${award.levelsGained.join(', ')}.`;
  }

  private recordDailyAttemptOnce(): void {
    const run = getRun();
    if (!run.isDaily || !run.dailyKey) return;

    const record = loadDailyRecordForKey(run.dailyKey);
    saveDailyRecord(recordDailyAttempt(record, { depth: run.depth, escaped: this.victory }));
  }

  private recordChronicleEntry(): void {
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
      }),
    );
  }
}
