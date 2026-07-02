import { describe, expect, test } from 'vitest';
import { PresentationQueue, type PresentationStep } from './presentationQueue';

/** Build a step whose event is a readable label so execution order is easy to assert. */
function step(label: string, duration: number): PresentationStep<string> {
  return { event: label, duration };
}

/** A queue wired to a mutable fake clock, recording executed labels and idle firings. */
function harness() {
  let clock = 0;
  const executed: string[] = [];
  let idleCount = 0;
  const queue = new PresentationQueue<string>({
    now: () => clock,
    execute: (s) => executed.push(s.event),
    onIdle: () => {
      idleCount += 1;
    },
  });
  return {
    queue,
    executed,
    advance: (to: number) => {
      clock = to;
    },
    idleCount: () => idleCount,
  };
}

describe('presentation queue', () => {
  test('runs steps in FIFO order, one hold at a time, off the injected clock', () => {
    const h = harness();

    h.queue.enqueue([step('a', 100), step('b', 100), step('c', 100)]);
    // Enqueue on an idle queue starts the first step synchronously.
    expect(h.executed).toEqual(['a']);
    expect(h.queue.idle).toBe(false);

    // Before 'a' has held its full duration, tick does nothing.
    h.advance(99);
    h.queue.tick();
    expect(h.executed).toEqual(['a']);

    h.advance(100);
    h.queue.tick();
    expect(h.executed).toEqual(['a', 'b']);

    h.advance(200);
    h.queue.tick();
    expect(h.executed).toEqual(['a', 'b', 'c']);
    expect(h.queue.idle).toBe(false);

    h.advance(300);
    h.queue.tick();
    expect(h.executed).toEqual(['a', 'b', 'c']);
    expect(h.queue.idle).toBe(true);
    expect(h.idleCount()).toBe(1);
  });

  test('a late tick advances multiple steps in a single call', () => {
    const h = harness();

    h.queue.enqueue([step('a', 100), step('b', 100), step('c', 100)]);
    expect(h.executed).toEqual(['a']);

    // Jump far enough that every remaining hold has already elapsed.
    h.advance(1000);
    h.queue.tick();
    expect(h.executed).toEqual(['a', 'b', 'c']);
    expect(h.queue.idle).toBe(true);
    expect(h.idleCount()).toBe(1);
  });

  test('enqueue while playing appends without disturbing the current step', () => {
    const h = harness();

    h.queue.enqueue([step('a', 100)]);
    expect(h.executed).toEqual(['a']);

    // Appending mid-flight must not re-run or displace 'a'.
    h.advance(50);
    h.queue.enqueue([step('b', 100)]);
    expect(h.executed).toEqual(['a']);
    expect(h.queue.idle).toBe(false);

    // 'a' still ends at its original 100ms boundary, unaffected by the append.
    h.advance(100);
    h.queue.tick();
    expect(h.executed).toEqual(['a', 'b']);

    h.advance(200);
    h.queue.tick();
    expect(h.executed).toEqual(['a', 'b']);
    expect(h.queue.idle).toBe(true);
    expect(h.idleCount()).toBe(1);
  });

  test('accelerate compresses the in-flight and pending durations', () => {
    const h = harness();

    h.queue.enqueue([step('a', 1000), step('b', 1000), step('c', 1000)]);
    expect(h.executed).toEqual(['a']);

    // Clamp everything to 10ms per step, then step through the compressed schedule.
    h.queue.accelerate(10);

    h.advance(10);
    h.queue.tick();
    expect(h.executed).toEqual(['a', 'b']);

    h.advance(20);
    h.queue.tick();
    expect(h.executed).toEqual(['a', 'b', 'c']);
    expect(h.queue.idle).toBe(false);

    h.advance(30);
    h.queue.tick();
    expect(h.queue.idle).toBe(true);
    expect(h.idleCount()).toBe(1);
  });

  test('accelerate does not mutate the caller-supplied step objects', () => {
    const h = harness();
    const steps = [step('a', 1000), step('b', 1000)];

    h.queue.enqueue(steps);
    h.queue.accelerate(10);

    expect(steps[0].duration).toBe(1000);
    expect(steps[1].duration).toBe(1000);
  });

  test('skipAll drains every remaining step synchronously to idle', () => {
    const h = harness();

    h.queue.enqueue([step('a', 100), step('b', 100), step('c', 100)]);
    expect(h.executed).toEqual(['a']);

    // The in-flight 'a' already ran; skipAll runs only the pending 'b' and 'c'.
    h.queue.skipAll();
    expect(h.executed).toEqual(['a', 'b', 'c']);
    expect(h.queue.idle).toBe(true);
    expect(h.idleCount()).toBe(1);
  });

  test('skipAll on an idle queue is a no-op and does not fire onIdle', () => {
    const h = harness();

    h.queue.skipAll();
    expect(h.executed).toEqual([]);
    expect(h.idleCount()).toBe(0);
    expect(h.queue.idle).toBe(true);
  });

  test('onIdle fires once per drain and refires after a second enqueue + drain', () => {
    const h = harness();

    h.queue.enqueue([step('a', 100)]);
    h.advance(100);
    h.queue.tick();
    expect(h.queue.idle).toBe(true);
    expect(h.idleCount()).toBe(1);

    // Extra ticks while idle must not re-fire onIdle.
    h.queue.tick();
    h.queue.tick();
    expect(h.idleCount()).toBe(1);

    // A fresh enqueue restarts playback; the next drain fires onIdle again.
    h.queue.enqueue([step('b', 100)]);
    expect(h.executed).toEqual(['a', 'b']);
    h.advance(200);
    h.queue.tick();
    expect(h.queue.idle).toBe(true);
    expect(h.idleCount()).toBe(2);
  });

  test('zero-duration steps all advance on a single tick', () => {
    const h = harness();

    h.queue.enqueue([step('a', 0), step('b', 0), step('c', 0)]);
    // The first is started by enqueue; the rest are still pending until a tick.
    expect(h.executed).toEqual(['a']);
    expect(h.queue.idle).toBe(false);

    h.queue.tick();
    expect(h.executed).toEqual(['a', 'b', 'c']);
    expect(h.queue.idle).toBe(true);
    expect(h.idleCount()).toBe(1);
  });
});
