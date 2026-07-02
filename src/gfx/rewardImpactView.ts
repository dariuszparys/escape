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
  const pct = `${Math.round(impact.drawOdds * 100)}%`;
  if (impact.kind === 'grows_deck') {
    return `Deck ${impact.deckBefore} \u2192 ${impact.deckAfter}\n~${pct} per opening hand`;
  }
  if (impact.kind === 'improves_card') return 'Improves in place\nDeck size unchanged';
  if (impact.kind === 'thins_deck') {
    return `Deck ${impact.deckBefore} \u2192 ${impact.deckAfter}\nDraws run stronger`;
  }
  return 'Deck unchanged';
}
