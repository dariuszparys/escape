import Phaser from 'phaser';
import { BattlePlanState, BattleStatusLane, BattleStatusLaneEntry } from '../game/battlePlan';
import { BattleRect } from '../game/battleLayout';

function addText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  style: Phaser.Types.GameObjects.Text.TextStyle,
): Phaser.GameObjects.Text {
  return scene.add.text(x, y, text, {
    fontFamily: 'monospace',
    color: '#d8d2e4',
    ...style,
  });
}

function compactEntryText(entry: BattleStatusLaneEntry): string {
  const damage = entry.text.match(/for (\d+) damage/);
  const rounds = entry.text.match(/\((\d+) rounds? left\)/);
  const amount = entry.text.match(/by (\d+)/);

  if (entry.kind === 'armor') return `Armor -${amount?.[1] ?? '?'} / hit`;
  if (entry.kind === 'block') return `Block -${amount?.[1] ?? '?'} now`;
  if (entry.kind === 'stun') return entry.text.includes('expires') ? 'Stun skips next' : entry.text;
  if (entry.kind === 'poison' || entry.kind === 'burn') {
    const label = entry.kind === 'poison' ? 'Poison' : 'Burn';
    if (entry.text.includes('expires')) return `${label} ${damage?.[1] ?? '?'} expires`;
    return `${label} ${damage?.[1] ?? '?'} (${rounds?.[1] ?? '?'} left)`;
  }
  return entry.text;
}

function laneText(lane: BattleStatusLane): string {
  if (lane.entries.length === 0) return 'Clear';
  return lane.entries
    .slice(0, 3)
    .map(compactEntryText)
    .join('\n');
}

function timelineText(state: BattlePlanState): string {
  if (state.speedTimeline.length === 1) {
    const [entry] = state.speedTimeline;
    return `${entry.label}: ${entry.actionLabel} [spd ${entry.speed}]\nYou: pending`;
  }

  return state.speedTimeline
    .map((entry) => `${entry.rank}. ${entry.label}: ${entry.actionLabel} [${entry.speed}]`)
    .join('\n');
}

export function createBattlePlanningBoard(
  scene: Phaser.Scene,
  rect: BattleRect,
  state: BattlePlanState,
): Phaser.GameObjects.Container {
  const panel = scene.add.container(rect.x, rect.y).setDepth(6);
  const bg = scene.add.graphics();
  bg.fillStyle(0x111019, 0.9);
  bg.fillRoundedRect(0, 0, rect.w, rect.h, 6);
  bg.lineStyle(1, 0xcab98a, 0.85);
  bg.strokeRoundedRect(0, 0, rect.w, rect.h, 6);
  panel.add(bg);

  panel.add(
    addText(scene, 12, 10, state.phase === 'resolved' ? 'Resolved plan' : 'Planning board', {
      fontSize: '13px',
      fontStyle: 'bold',
      color: '#f1c40f',
    }),
  );

  panel.add(
    addText(scene, 12, 32, state.predictionLine, {
      fontSize: '10px',
      fontStyle: 'bold',
      fixedWidth: rect.w - 24,
      wordWrap: { width: rect.w - 24, useAdvancedWrap: true },
    }),
  );

  panel.add(
    addText(scene, 12, 70, timelineText(state), {
      fontSize: '10px',
      fixedWidth: rect.w - 24,
      lineSpacing: 3,
      wordWrap: { width: rect.w - 24, useAdvancedWrap: true },
    }),
  );

  const laneY = 118;
  const laneW = (rect.w - 30) / 2;
  for (const [index, lane] of state.statusLanes.entries()) {
    const x = 12 + index * (laneW + 6);
    const laneBg = scene.add.graphics();
    laneBg.fillStyle(0x1c1826, 0.9);
    laneBg.fillRoundedRect(x, laneY, laneW, 58, 5);
    laneBg.lineStyle(1, 0x3a3544, 1);
    laneBg.strokeRoundedRect(x, laneY, laneW, 58, 5);
    panel.add(laneBg);
    panel.add(
      addText(scene, x + 7, laneY + 5, lane.label, {
        fontSize: '9px',
        fontStyle: 'bold',
        color: lane.owner === 'player' ? '#5fe07a' : '#ff9944',
      }),
    );
    panel.add(
      addText(scene, x + 7, laneY + 20, laneText(lane), {
        fontSize: '8px',
        fixedWidth: laneW - 14,
        lineSpacing: 2,
        wordWrap: { width: laneW - 14, useAdvancedWrap: true },
      }),
    );
  }

  if (state.phase === 'resolved' && state.resolution.actual.length > 0) {
    const actual = state.resolution.actual[state.resolution.actual.length - 1];
    panel.add(
      addText(scene, 12, rect.h - 16, `Actual: ${actual}`, {
        fontSize: '8px',
        color: '#b8b0c8',
        fixedWidth: rect.w - 24,
      }),
    );
  }

  return panel;
}
