import Phaser from 'phaser';
import { RewardImpactPreview } from '../game/rewardImpact';

interface RewardImpactTextOptions {
  color?: string;
  fontSize?: string;
  align?: 'left' | 'center';
  originX?: number;
  originY?: number;
}

export function createRewardImpactText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  width: number,
  options: RewardImpactTextOptions = {},
): Phaser.GameObjects.Text {
  return scene.add
    .text(x, y, label, {
      fontFamily: 'monospace',
      fontSize: options.fontSize ?? '9px',
      color: options.color ?? '#9fb7d0',
      align: options.align ?? 'center',
      fixedWidth: width,
      wordWrap: { width, useAdvancedWrap: true },
      lineSpacing: 2,
    })
    .setOrigin(options.originX ?? 0.5, options.originY ?? 0.5);
}

export function compactRewardImpactLabel(impact: RewardImpactPreview): string {
  if (impact.kind === 'collection_only') return 'Collection only\nHand unchanged';
  if (impact.kind === 'unchanged') return 'Hand unchanged';
  if (impact.kind === 'enters_hand') return 'Enters hand';
  if (impact.kind === 'replaces_card') {
    return `Enters hand\nReplaces ${impact.leaving?.name ?? 'a card'}`;
  }
  if (impact.kind === 'improves_role') return 'Improves hand';
  if (impact.kind === 'removes_hand_card') {
    return impact.entering ? `Opens slot\nAdds ${impact.entering.name}` : 'Leaves hand';
  }
  return impact.label;
}
