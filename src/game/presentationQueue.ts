/**
 * A pure, frame-driven scheduler for combat's presentation layer. The rules engine resolves a
 * turn instantly and hands back an ordered event list; this queue replays those events at
 * presentation pace so the stage shows one step at a time. It owns no timers, no wall clock, and
 * no randomness — every notion of "now" comes through the injected `now` clock, which keeps the
 * whole thing deterministic and testable. Input is never gated on the queue: the caller ticks it
 * each frame and is free to accelerate or skip it at any moment.
 *
 * Generic over the event payload so the scheduler stays fully decoupled from the combat event
 * union it happens to be replaying.
 */

/** One visual step: an opaque event payload plus how long its presentation holds the stage, in ms. */
export interface PresentationStep<TEvent = unknown> {
  event: TEvent;
  duration: number;
}

/** Injected collaborators. The queue reads time and reports progress only through these. */
export interface PresentationQueueOptions<TEvent = unknown> {
  /** Injected clock returning the current time in ms. Never read Date.now directly. */
  now: () => number;
  /** Fired exactly once per step, at the moment the step starts. */
  execute: (step: PresentationStep<TEvent>) => void;
  /** Fired exactly once each time the queue transitions from playing to drained. */
  onIdle?: () => void;
}

/**
 * FIFO presentation scheduler. A step `execute`s the instant it starts and then occupies the stage
 * for `duration` ms of injected-clock time before the next step may begin. Pending durations
 * accumulate from the running step's scheduled end (not from the observed `now`), so a `tick` that
 * arrives late — or after `accelerate` — can catch up across several steps in a single call without
 * drift. The queue is "playing" while a step is in flight and "idle" once every step has drained.
 */
export class PresentationQueue<TEvent = unknown> {
  private readonly now: () => number;
  private readonly execute: (step: PresentationStep<TEvent>) => void;
  private readonly onIdle?: () => void;

  /** Steps not yet started, in FIFO order. Stored as private copies so callers' step objects and
   * durations are never mutated by `accelerate`. */
  private pending: PresentationStep<TEvent>[] = [];
  /** The in-flight step, or `null` when idle. `current === null` is exactly the idle condition. */
  private current: PresentationStep<TEvent> | null = null;
  /** Injected-clock time at which `current`'s hold ends; only meaningful while `current !== null`. */
  private currentEndTime = 0;

  constructor(options: PresentationQueueOptions<TEvent>) {
    this.now = options.now;
    this.execute = options.execute;
    this.onIdle = options.onIdle;
  }

  /** True when no step is in flight and nothing is pending. */
  get idle(): boolean {
    return this.current === null && this.pending.length === 0;
  }

  /**
   * Append steps. If the queue is idle, the first appended step starts (and `execute`s)
   * synchronously inside this call, based on the current clock. Appending while playing only grows
   * the pending queue and never disturbs the in-flight step.
   */
  enqueue(steps: readonly PresentationStep<TEvent>[]): void {
    for (const step of steps) {
      this.pending.push({ event: step.event, duration: step.duration });
    }
    if (this.current === null) {
      const next = this.pending.shift();
      if (next === undefined) return;
      this.current = next;
      this.currentEndTime = this.now() + next.duration;
      this.execute(next);
    }
  }

  /**
   * Advance past every step whose hold has elapsed per the injected clock, `execute`ing each newly
   * started step in FIFO order. A single call may cross multiple steps — including zero-duration
   * steps — when enough clock time (or a small enough `accelerate` cap) allows. Fires `onIdle` once
   * if this call drains the last step. Intended to be called once per frame; a no-op while idle.
   */
  tick(): void {
    if (this.current === null) return;
    const time = this.now();
    while (this.current !== null && time >= this.currentEndTime) {
      const next = this.pending.shift();
      if (next === undefined) {
        this.current = null;
        break;
      }
      this.currentEndTime += next.duration;
      this.current = next;
      this.execute(next);
    }
    if (this.current === null) this.onIdle?.();
  }

  /**
   * Compress playback: clamp the in-flight step's end time to `now + capMs` when that is sooner, and
   * clamp every pending step's duration to at most `capMs`. A subsequent `tick` then drains the tail
   * quickly. No `execute` fires here; only future timing shrinks.
   */
  accelerate(capMs = 60): void {
    if (this.current !== null) {
      const cappedEnd = this.now() + capMs;
      if (cappedEnd < this.currentEndTime) this.currentEndTime = cappedEnd;
    }
    for (const step of this.pending) {
      if (step.duration > capMs) step.duration = capMs;
    }
  }

  /**
   * Synchronously `execute` every remaining pending step in order and drain to idle, firing `onIdle`
   * once. The in-flight step already executed when it started and is not re-run. A no-op (with no
   * `onIdle`) when already idle.
   */
  skipAll(): void {
    if (this.current === null) return;
    for (const step of this.pending) this.execute(step);
    this.pending = [];
    this.current = null;
    this.onIdle?.();
  }
}
