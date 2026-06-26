import { describe, expect, test } from 'vitest';
import { makeNextRoom, rollRoomEvent } from './rooms';
import { SequenceRng } from '../game/test-rng';

describe('room generation', () => {
  test('rooms 2 through 8 use the MVP event thresholds without empty rooms', () => {
    expect(rollRoomEvent(new SequenceRng([0.34]), 5)).toBe('encounter');
    expect(rollRoomEvent(new SequenceRng([0.35]), 5)).toBe('chest');
    expect(rollRoomEvent(new SequenceRng([0.64]), 5)).toBe('chest');
    expect(rollRoomEvent(new SequenceRng([0.65]), 5)).toBe('potion');
    expect(rollRoomEvent(new SequenceRng([0.89]), 5)).toBe('potion');
    expect(rollRoomEvent(new SequenceRng([0.9]), 5)).toBe('trap');
  });

  test('room 9 is biased toward rewards before the boss', () => {
    expect(rollRoomEvent(new SequenceRng([0.24]), 9)).toBe('encounter');
    expect(rollRoomEvent(new SequenceRng([0.25]), 9)).toBe('chest');
    expect(rollRoomEvent(new SequenceRng([0.64]), 9)).toBe('chest');
    expect(rollRoomEvent(new SequenceRng([0.65]), 9)).toBe('potion');
    expect(rollRoomEvent(new SequenceRng([0.95]), 9)).toBe('trap');
  });

  test('room 10 always becomes the boss room', () => {
    const room = makeNextRoom(new SequenceRng([0]), 10, 'N');

    expect(room.event).toBe('boss');
    expect(room.openDoors).toEqual([]);
    expect(room.blockedDoor).toBe('S');
  });
});
