/* The calendar State as a flat set of records, which is what we store and sync.

   Each record is one small fact with its own HLC stamp, so two devices editing different things never
   overwrite each other, and when they edit the same thing the newer edit wins (last-writer-wins):
     d/2026-11-25/leave  "apl"        one record per field of a day (leave, title, note)
     h/2026-11-14        {on, name}   a one-off holiday add / remove / rename
     r/<id>              {name, ...}  a holiday you added that repeats
     s/aplPerMonth       2            one record per setting
     a/sick/2026-11      {d, v}       a typed balance (checkpoint)
   A value of null means "not set" (for a day field) or "deleted" (a tombstone), so deletes sync too.

   Pure TypeScript with no React Native imports: the same code runs in the app and in Node tests. */

import type { State } from '../rules.ts';
import { LEAVE_KEYS, normalizeState } from '../rules.ts';

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
/** A stored record: its value and the stamp of the change that set it. */
export type Rec = { v: Json; s: string };
export type RecordMap = Map<string, Rec>;

const SETTING_KEYS = ['aplPerMonth', 'aplStart', 'sickPerYear', 'wfhPerMonth', 'weekStart', 'weeklyOff'] as const;
const DAY_FIELD_RE = /^d\/(\d{4}-\d{2}-\d{2})\/(leave|title|note)$/;
const ADJUST_RE = /^a\/(apl|sick|wfh)\/(\d{4}-\d{2})$/;

/** State -> key/value pairs for everything that is set. Values are rebuilt with a fixed key order. */
export function flatten(s: State): Map<string, Json> {
  const out = new Map<string, Json>();
  for (const iso of Object.keys(s.days)) {
    const d = s.days[iso];
    if (d.leave) out.set(`d/${iso}/leave`, d.leave);
    if (d.title) out.set(`d/${iso}/title`, d.title);
    if (d.note) out.set(`d/${iso}/note`, d.note);
  }
  for (const iso of Object.keys(s.hol)) {
    const h = s.hol[iso];
    out.set(`h/${iso}`, { on: h.on, name: h.name });
  }
  for (const id of Object.keys(s.rec)) {
    const r = s.rec[id];
    out.set(`r/${id}`, r.until == null ? { name: r.name, md: r.md, from: r.from } : { name: r.name, md: r.md, from: r.from, until: r.until });
  }
  for (const k of SETTING_KEYS) out.set(`s/${k}`, s.settings[k]);
  for (const t of LEAVE_KEYS) {
    for (const ym of Object.keys(s.adjust[t])) {
      const c = s.adjust[t][ym];
      out.set(`a/${t}/${ym}`, { d: c.d, v: c.v });
    }
  }
  return out;
}

/** Key/value pairs -> State. Everything goes through the rules engine's normalisers, so a bad record can't break the app. */
export function unflatten(values: Iterable<readonly [string, Json]>): State {
  const days: Record<string, Record<string, Json>> = {};
  const hol: Record<string, Json> = {};
  const rec: Record<string, Json> = {};
  const settings: Record<string, Json> = {};
  const adjust: Record<string, Record<string, Json>> = { apl: {}, sick: {}, wfh: {} };
  for (const [key, value] of values) {
    if (value === null) continue;
    switch (key[0]) {
      case 'd': {
        const m = DAY_FIELD_RE.exec(key);
        if (m) (days[m[1]] ??= {})[m[2]] = value;
        break;
      }
      case 'h':
        if (key[1] === '/') hol[key.slice(2)] = value;
        break;
      case 'r':
        if (key[1] === '/') rec[key.slice(2)] = value;
        break;
      case 's':
        if (key[1] === '/') settings[key.slice(2)] = value;
        break;
      case 'a': {
        const m = ADJUST_RE.exec(key);
        if (m) adjust[m[1]][m[2]] = value;
        break;
      }
    }
  }
  return normalizeState({ days, hol, rec, settings, adjust });
}

/** What changed between two flattened states. A key that disappeared becomes null (unset / tombstone). */
export function diff(prev: Map<string, Json>, next: Map<string, Json>): [string, Json][] {
  const out: [string, Json][] = [];
  for (const [k, v] of next) if (!sameJson(prev.get(k) ?? null, v)) out.push([k, v]);
  for (const k of prev.keys()) if (!next.has(k)) out.push([k, null]);
  return out;
}

export const sameJson = (a: Json, b: Json) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** Last-writer-wins: does record a beat record b? Ties (same stamp) fall back to the value so every device picks the same one. */
export function wins(a: Rec, b: Rec): boolean {
  if (a.s !== b.s) return a.s > b.s;
  return JSON.stringify(a.v) > JSON.stringify(b.v);
}

/** Merge b into a copy of a. Commutative, associative and idempotent, so devices converge in any order. */
export function mergeMaps(a: RecordMap, b: RecordMap): RecordMap {
  const out = new Map(a);
  for (const [k, r] of b) {
    const cur = out.get(k);
    if (!cur || wins(r, cur)) out.set(k, r);
  }
  return out;
}

export function valuesOf(records: RecordMap): [string, Json][] {
  const out: [string, Json][] = [];
  for (const [k, r] of records) out.push([k, r.v]);
  return out;
}
