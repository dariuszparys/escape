import type { CampfirePurchaseState } from './campfirePurchases';

export type CampfireCurseId = 'blood_oath' | 'narrow_opening';

export type CampfireBargainId = 'blood_oath' | 'narrow_opening';

export interface CampfireBargainDef {
  id: CampfireBargainId;
  curseId: CampfireCurseId;
  name: string;
  emberGain: number;
  description: string;
}

export const CAMPFIRE_BARGAINS: CampfireBargainDef[] = [
  {
    id: 'blood_oath',
    curseId: 'blood_oath',
    name: 'Blood Oath',
    emberGain: 10,
    description: 'Gain 10 embers now. Next run starts with 6 less max HP.',
  },
  {
    id: 'narrow_opening',
    curseId: 'narrow_opening',
    name: 'Narrow Opening',
    emberGain: 8,
    description: 'Gain 8 embers now. Next run chooses one fewer opening card.',
  },
];

export type BargainCheck = { ok: true } | { ok: false; reason: string };

export type BargainResult =
  | { ok: true; state: CampfirePurchaseState }
  | { ok: false; reason: string; state: CampfirePurchaseState };

export function getCampfireBargain(id: CampfireBargainId): CampfireBargainDef {
  const bargain = CAMPFIRE_BARGAINS.find((candidate) => candidate.id === id);
  if (!bargain) throw new Error(`Unknown campfire bargain: ${id}`);
  return bargain;
}

export function canAcceptCampfireBargain(
  state: CampfirePurchaseState,
  bargainId: CampfireBargainId,
): BargainCheck {
  getCampfireBargain(bargainId);
  if ((state.pendingPrep.curseIds ?? []).length > 0) {
    return { ok: false, reason: 'Already cursed.' };
  }
  return { ok: true };
}

export function acceptCampfireBargain(
  state: CampfirePurchaseState,
  bargainId: CampfireBargainId,
): BargainResult {
  const check = canAcceptCampfireBargain(state, bargainId);
  if (!check.ok) return { ...check, state };

  const bargain = getCampfireBargain(bargainId);
  return {
    ok: true,
    state: {
      embers: state.embers + bargain.emberGain,
      pendingPrep: {
        itemIds: [...state.pendingPrep.itemIds],
        extraStartingChoice: state.pendingPrep.extraStartingChoice,
        scoutFlame: state.pendingPrep.scoutFlame,
        curseIds: [bargain.curseId],
      },
    },
  };
}

export function formatCampfireCurseSummary(curseIds: readonly CampfireCurseId[] = []): string {
  const curseId = curseIds[0];
  if (!curseId) return 'Curse: none';

  const bargain = CAMPFIRE_BARGAINS.find((candidate) => candidate.curseId === curseId);
  return `Curse: ${bargain?.name ?? curseId}`;
}
