import type { RunState } from '../state';
import { shouldAwardProgressionRewards } from './scenarioRules';

export function shouldResolveProgressionRewards(
  run: Pick<RunState, 'scenarioId' | 'isDaily'>,
): boolean {
  if (run.isDaily) return true;
  return shouldAwardProgressionRewards(run.scenarioId);
}
