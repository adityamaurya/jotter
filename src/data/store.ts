/* The app's single source of truth on the device.

   - Holds every record (see records.ts) in memory and the State derived from them.
   - commit(next) turns a new State into stamped record changes, so the UI keeps using rules.ts as-is.
   - Writes are batched (150 ms) into one database transaction; flushNow() is called when the app goes
     to the background. A failed write is retried with the next batch, nothing is dropped.
   - applyRemote() merges records from another device (last-writer-wins per record).

   Persistence is injected (SQLite in the app, an in-memory fake in tests), so this file has no
   React Native imports and runs under Node. */

import type { State } from '../rules.ts';
import { emptyState } from '../rules.ts';
import type { Clock } from './hlc.ts';
import { createClock, isStamp, randomId } from './hlc.ts';
import type { Json, Rec, RecordMap } from './records.ts';
import { diff, flatten, unflatten, wins } from './records.ts';

/** Rows are [key, value as JSON text, stamp]. Meta rows with a null value are deleted. */
export type Persistence = {
  load(): Promise<{ records: [string, string, string][]; meta: [string, string][] }>;
  save(records: [string, string, string][], meta: [string, string | null][]): Promise<void>;
  wipe(keepMeta: string[]): Promise<void>;
};

export type StoreSnapshot = { records: RecordMap; dirty: boolean; version: number };

const FLUSH_MS = 150;

export class Store {
  private records: RecordMap = new Map();
  private flat = new Map<string, Json>();
  private state: State = emptyState();
  private meta = new Map<string, string>();
  private pendingRecords = new Set<string>();
  private pendingMeta = new Map<string, string | null>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private writing: Promise<void> = Promise.resolve();
  private listeners = new Set<() => void>();
  private changeListeners = new Set<() => void>();
  private clock: Clock;
  private persistence: Persistence;
  /** Bumped on every change to the records. */
  version = 0;
  /** True while this device holds changes it hasn't uploaded yet. Persisted with the records. */
  dirty = false;
  lastWriteError: unknown = null;

  constructor(persistence: Persistence, clock?: Clock) {
    this.persistence = persistence;
    this.clock = clock ?? createClock(randomId(6));
  }

  async init(): Promise<void> {
    const { records, meta } = await this.persistence.load();
    for (const [key, valueText, stamp] of records) {
      if (!isStamp(stamp)) continue;
      let v: Json;
      try {
        v = JSON.parse(valueText) as Json;
      } catch {
        continue;
      }
      this.records.set(key, { v, s: stamp });
      this.clock.observe(stamp);
    }
    for (const [k, v] of meta) this.meta.set(k, v);
    this.dirty = this.meta.get('sync.dirty') === '1';
    if (!this.meta.get('replica')) this.setMeta('replica', randomId(10));
    this.derive();
  }

  /* ---------- Reading ---------- */
  getState = (): State => this.state;
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  /** Called after any change to the calendar data (local or remote), e.g. to schedule a sync. */
  onDataChange(fn: () => void): () => void {
    this.changeListeners.add(fn);
    return () => this.changeListeners.delete(fn);
  }
  snapshot(): StoreSnapshot {
    return { records: this.records, dirty: this.dirty, version: this.version };
  }
  hasData(): boolean {
    for (const r of this.records.values()) if (r.v !== null) return true;
    return false;
  }

  /* ---------- Writing ---------- */
  /** Save a new State (from rules.ts). Only the records that actually changed get new stamps. */
  commit(next: State): boolean {
    const changes = diff(this.flat, flatten(next));
    if (!changes.length) return false;
    for (const [k, v] of changes) {
      this.records.set(k, { v, s: this.clock.now() });
      this.pendingRecords.add(k);
    }
    this.changed();
    return true;
  }

  /** Merge records from another device. Returns true if anything here changed. */
  applyRemote(remote: RecordMap): boolean {
    let changed = false;
    for (const [k, r] of remote) {
      this.clock.observe(r.s);
      const cur = this.records.get(k);
      if (!cur || wins(r, cur)) {
        this.records.set(k, r);
        this.pendingRecords.add(k);
        changed = true;
      }
    }
    if (changed) this.changed();
    return changed;
  }

  /** The upload that read snapshot `version` succeeded: clear dirty unless something changed meanwhile. */
  markUploaded(version: number): void {
    if (this.version !== version || !this.dirty) return;
    this.dirty = false;
    this.setMeta('sync.dirty', '0');
  }

  getMeta(key: string): string | undefined {
    return this.meta.get(key);
  }
  setMeta(key: string, value: string | null): void {
    if (value === null) this.meta.delete(key);
    else this.meta.set(key, value);
    this.pendingMeta.set(key, value);
    this.schedule();
  }
  getMetaJson<T>(key: string): T | null {
    const v = this.meta.get(key);
    if (!v) return null;
    try {
      return JSON.parse(v) as T;
    } catch {
      return null;
    }
  }
  setMetaJson(key: string, value: unknown): void {
    this.setMeta(key, value == null ? null : JSON.stringify(value));
  }

  /** Write everything pending now (also returns once earlier writes have finished). */
  flushNow(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.pendingRecords.size && !this.pendingMeta.size) return this.writing;
    const keys = [...this.pendingRecords];
    const metaRows = [...this.pendingMeta];
    this.pendingRecords.clear();
    this.pendingMeta.clear();
    const rows: [string, string, string][] = [];
    for (const k of keys) {
      const r = this.records.get(k);
      if (r) rows.push([k, JSON.stringify(r.v), r.s]);
    }
    this.writing = this.writing
      .then(() => this.persistence.save(rows, metaRows))
      .then(() => {
        this.lastWriteError = null;
      })
      .catch((err: unknown) => {
        // Keep the data: queue it again so the next batch retries it.
        this.lastWriteError = err;
        for (const k of keys) this.pendingRecords.add(k);
        for (const [k, v] of metaRows) if (!this.pendingMeta.has(k)) this.pendingMeta.set(k, v);
        this.schedule(2000);
      });
    return this.writing;
  }

  /** Remove the calendar from this device (sign out). Meta keys listed in keepMeta survive. */
  async wipe(keepMeta: string[]): Promise<void> {
    await this.flushNow();
    this.pendingRecords.clear();
    this.pendingMeta.clear();
    this.records = new Map();
    for (const k of [...this.meta.keys()]) if (!keepMeta.includes(k)) this.meta.delete(k);
    this.dirty = false;
    this.version++;
    this.derive();
    this.writing = this.writing.then(() => this.persistence.wipe(keepMeta));
    await this.writing;
    this.emit();
  }

  /* ---------- Internals ---------- */
  private changed() {
    this.version++;
    if (!this.dirty) {
      this.dirty = true;
      this.pendingMeta.set('sync.dirty', '1');
      this.meta.set('sync.dirty', '1');
    }
    this.derive();
    this.schedule();
    this.emit();
    for (const fn of this.changeListeners) fn();
  }

  private derive() {
    const values: [string, Json][] = [];
    for (const [k, r] of this.records) if (r.v !== null) values.push([k, r.v]);
    this.state = unflatten(values);
    this.flat = flatten(this.state);
  }

  private schedule(ms = FLUSH_MS) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flushNow();
    }, ms);
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }
}

export type { Rec, RecordMap };
