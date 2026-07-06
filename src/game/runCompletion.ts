import type { RunState } from '../state';
import { BOSS_ROOM_INTERVAL, RUN_LENGTH } from '../config';
import {
  addProfileXp,
  levelForXp,
  markProfileRunAwarded,
  updatePersonalBestRoom,
  xpForRun,
  type ProfileState,
  type RunXpBreakdown,
} from '../profile';

export function shouldResolveProgressionRewards(
  run: Pick<RunState, 'scenarioId' | 'isDaily'>,
): boolean {
  void run;
  return true;
}

export interface RunXpAwardResult {
  handled: boolean;
  profile: ProfileState;
  reward: RunXpBreakdown;
  previousLevel: number;
  nextLevel: number;
  levelsGained: number[];
}

const ZERO_XP_REWARD: RunXpBreakdown = {
  roomsXp: 0,
  bossXp: 0,
  escapeXp: 0,
  total: 0,
};

export function bossesKilledForRun(
  run: Pick<RunState, 'depth' | 'bossDefeated' | 'escaped'>,
  escaped = run.escaped,
): number {
  const depth = Math.min(RUN_LENGTH, Math.max(0, Math.floor(run.depth)));
  const completedBeforeCurrentRoom = Math.floor(Math.max(0, depth - 1) / BOSS_ROOM_INTERVAL);
  const currentRoomBossKilled =
    depth > 0 && depth % BOSS_ROOM_INTERVAL === 0 && (run.bossDefeated || escaped);
  return completedBeforeCurrentRoom + (currentRoomBossKilled ? 1 : 0);
}

function crossedLevels(previousLevel: number, nextLevel: number): number[] {
  const levels: number[] = [];
  for (let level = previousLevel + 1; level <= nextLevel; level++) levels.push(level);
  return levels;
}

export function awardRunXpOnce(
  profile: ProfileState,
  run: Pick<RunState, 'depth' | 'bossDefeated' | 'escaped' | 'runId'>,
  escaped: boolean,
): RunXpAwardResult {
  const previousLevel = levelForXp(profile.xp);

  if (profile.lastAwardedRunId === run.runId) {
    return {
      handled: false,
      profile,
      reward: ZERO_XP_REWARD,
      previousLevel,
      nextLevel: previousLevel,
      levelsGained: [],
    };
  }

  const reward = xpForRun(run.depth, bossesKilledForRun(run, escaped), escaped);
  const withXp = addProfileXp(profile, reward.total);
  const withBest = updatePersonalBestRoom(withXp, run.depth);
  const nextProfile = markProfileRunAwarded(withBest, run.runId);
  const nextLevel = levelForXp(nextProfile.xp);

  return {
    handled: true,
    profile: nextProfile,
    reward,
    previousLevel,
    nextLevel,
    levelsGained: crossedLevels(previousLevel, nextLevel),
  };
}
