import { describe, expect, test } from 'vitest';
import { RunState, newRun } from '../state';
import { commitDelve, isAtGate, resolveBank, resolveDeath } from './delve';

describe('isAtGate', () => {
  test('is true at every stratum boundary and false elsewhere', () => {
    expect(isAtGate(10)).toBe(true);
    expect(isAtGate(20)).toBe(true);
    expect(isAtGate(30)).toBe(true);
    expect(isAtGate(9)).toBe(false);
    expect(isAtGate(11)).toBe(false);
    expect(isAtGate(19)).toBe(false);
  });
});

describe('commitDelve', () => {
  test('increments the stratum once and leaves depth climbing', () => {
    const run = new RunState('seed');
    run.depth = 10;

    commitDelve(run);

    expect(run.stratum).toBe(2);
    expect(run.depth).toBe(10); // depth climbs via room transitions, not the commit
  });

  test('committing twice reaches stratum 3', () => {
    const run = new RunState('seed');
    commitDelve(run);
    commitDelve(run);

    expect(run.stratum).toBe(3);
  });

  test('grants a full-HP gate-clear breather heal', () => {
    const run = new RunState('seed');
    run.hp = 5;

    commitDelve(run);
    expect(run.hp).toBe(run.maxHp);

    // A full-HP run is unchanged by the heal.
    const healthy = new RunState('seed');
    commitDelve(healthy);
    expect(healthy.hp).toBe(healthy.maxHp);
  });
});

describe('resolveBank / resolveDeath', () => {
  test('banking reports the current unbanked Gold and escaped: true', () => {
    const run = new RunState('seed');
    run.depth = 20;
    run.gold = 137;

    const result = resolveBank(run);

    expect(result).toEqual({ escaped: true, gold: 137, depth: 20, stratum: 2 });
    expect(run.escaped).toBe(true);
  });

  test('dying reports escaped: false, forfeits Gold, and reports the stratum reached', () => {
    const run = new RunState('seed');
    run.depth = 24;
    run.gold = 200;

    const result = resolveDeath(run);

    expect(result).toEqual({ escaped: false, gold: 0, depth: 24, stratum: 3 });
    expect(run.escaped).toBe(false);
  });

  // AE3: spending Gold between gates lowers the unbanked amount the bank resolution reports.
  test('AE3: spending Gold between gates lowers the banked amount', () => {
    const run = new RunState('seed');
    run.depth = 10;
    run.addGold(120);
    run.gold -= 40; // spent at a rest room mid-stratum

    expect(resolveBank(run).gold).toBe(80);
  });
});

describe('run lifecycle defaults', () => {
  test('a fresh run starts in stratum 1, not yet escaped', () => {
    const run = new RunState('seed');
    expect(run.stratum).toBe(1);
    expect(run.escaped).toBe(false);
  });

  test('newRun resets the stratum to 1', () => {
    const run = newRun('seed');
    run.stratum = 4;
    run.escaped = true;

    const fresh = newRun('seed');
    expect(fresh.stratum).toBe(1);
    expect(fresh.escaped).toBe(false);
  });
});
