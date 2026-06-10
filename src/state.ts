import { MAX_ARMOR, MAX_HAND, PLAYER_MAX_HP } from './config';
import { Card } from './data/cards';

/** Mutable state of the current run, shared across scenes. */
export class RunState {
  hp = PLAYER_MAX_HP;
  maxHp = PLAYER_MAX_HP;
  hand: Card[] = [];
  potions = 0;
  armor = 0; // each point = 1 flat damage reduction in battle
  depth = 1;
  bossDefeated = false;

  get handFull(): boolean {
    return this.hand.length >= MAX_HAND;
  }

  addCard(card: Card): boolean {
    if (this.handFull) return false;
    this.hand.push(card);
    return true;
  }

  heal(amount: number): void {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  addArmor(): boolean {
    if (this.armor >= MAX_ARMOR) return false;
    this.armor++;
    return true;
  }
}

let current = new RunState();

export function getRun(): RunState {
  return current;
}

export function newRun(): RunState {
  current = new RunState();
  return current;
}
