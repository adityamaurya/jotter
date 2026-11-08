/* Hybrid logical clock (HLC).
   Every change is stamped so that "newer" is well defined across devices, even when phone clocks disagree:
   a stamp is never older than any stamp this device has already seen. Stamps are fixed-width strings, so
   comparing two stamps is plain string comparison:
     9 base-36 digits of wall-clock milliseconds - 3 base-36 digits of a counter - the writer's node id. */

const MS_WIDTH = 9;
const COUNTER_WIDTH = 3;
const COUNTER_MAX = 36 ** COUNTER_WIDTH - 1;
const STAMP_RE = /^([0-9a-z]{9})-([0-9a-z]{3})-([0-9a-z]+)$/;

/** Older than every real stamp. */
export const ZERO_STAMP = `${'0'.repeat(MS_WIDTH)}-${'0'.repeat(COUNTER_WIDTH)}-0`;

export type Clock = {
  /** A new stamp, greater than every stamp produced or observed so far. */
  now(): string;
  /** Move the clock past a stamp seen elsewhere (from the database or another device). */
  observe(stamp: string): void;
};

export function parseStamp(stamp: string): { ms: number; counter: number } | null {
  const m = STAMP_RE.exec(stamp);
  return m ? { ms: parseInt(m[1], 36), counter: parseInt(m[2], 36) } : null;
}

export const isStamp = (s: unknown): s is string => typeof s === 'string' && STAMP_RE.test(s);

export function createClock(node: string, wall: () => number = Date.now): Clock {
  if (!/^[0-9a-z]+$/.test(node)) throw new Error('HLC node id must be lowercase base-36');
  let ms = 0;
  let counter = 0;
  return {
    now() {
      const physical = wall();
      if (physical > ms) {
        ms = physical;
        counter = 0;
      } else if (counter < COUNTER_MAX) {
        counter++;
      } else {
        ms++;
        counter = 0;
      }
      return `${ms.toString(36).padStart(MS_WIDTH, '0')}-${counter.toString(36).padStart(COUNTER_WIDTH, '0')}-${node}`;
    },
    observe(stamp) {
      const p = parseStamp(stamp);
      if (!p) return;
      if (p.ms > ms || (p.ms === ms && p.counter > counter)) {
        ms = p.ms;
        counter = p.counter;
      }
    },
  };
}

/** A random lowercase base-36 id. Not for security: only to tell writers and devices apart. */
export function randomId(length = 8): string {
  let s = '';
  for (let i = 0; i < length; i++) s += Math.floor(Math.random() * 36).toString(36);
  return s;
}
