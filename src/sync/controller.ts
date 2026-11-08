/* When to sync, and what to tell the user about it.

   Triggers: right after sign-in, ~1.5 s after any change (so a burst of edits is one upload), when the app
   comes back to the foreground, and every 5 minutes while it's open. Only one sync runs at a time; a
   request during a sync runs again right after. Failures retry with backoff (5 s up to 5 min), so going
   offline and back needs nothing from the user. */

import { AppState, type AppStateStatus } from 'react-native';
import type { Store } from '../data/store';
import { googleAuth, AuthError, type Account } from './auth';
import { DriveError, createDrive, type Drive } from './drive';
import { deleteAllReplicas, syncOnce } from './engine';

export type SyncState =
  | 'off' // not signed in: saved on this device only
  | 'syncing'
  | 'synced'
  | 'offline' // couldn't reach Google; retrying
  | 'error' // something else went wrong; retrying
  | 'signin' // the Google session expired or was removed: sign in again
  | 'permission' // Drive access was not granted
  | 'full' // the user's Google storage is full
  | 'update'; // another device runs a newer app version

export type SyncStatus = { state: SyncState; account: Account | null; lastSyncAt: number | null };

const CHANGE_DELAY = 1500;
const FOREGROUND_MIN_GAP = 15_000;
const INTERVAL = 5 * 60_000;
const BACKOFF = [5_000, 15_000, 45_000, 120_000, 300_000];

export function classify(err: unknown): SyncState {
  if (err instanceof AuthError) return err.code === 'signin' ? 'signin' : 'error';
  if (err instanceof DriveError) {
    if (err.status === 401) return 'signin';
    if (err.status === 403 && err.reason === 'storageQuotaExceeded') return 'full';
    if (err.status === 403 && /insufficient|scope|permission_denied|forbidden/i.test(err.reason)) return 'permission';
    if (err.status === 429 || err.status >= 500 || /rateLimit/i.test(err.reason)) return 'offline';
    return 'error';
  }
  if (err instanceof TypeError) return 'offline'; // fetch network failure
  return 'error';
}
const retries = (s: SyncState) => s === 'offline' || s === 'error';

export class SyncController {
  private store: Store;
  private drive: Drive;
  private status: SyncStatus = { state: 'off', account: null, lastSyncAt: null };
  private listeners = new Set<() => void>();
  private enabled = false;
  private running: Promise<void> | null = null;
  private again = false;
  private failures = 0;
  private lastRunAt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private appState: { remove(): void } | null = null;

  constructor(store: Store) {
    this.store = store;
    this.drive = createDrive(opts => googleAuth.getAccessToken(opts));
    const at = Number(store.getMeta('sync.at'));
    this.status = { ...this.status, lastSyncAt: Number.isFinite(at) && at > 0 ? at : null };
    store.onDataChange(() => this.request('change'));
  }

  /* ---------- React binding ---------- */
  getStatus = (): SyncStatus => this.status;
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  private set(patch: Partial<SyncStatus>) {
    this.status = { ...this.status, ...patch };
    for (const fn of this.listeners) fn();
  }

  /* ---------- Lifecycle ---------- */
  /** Show the account as syncing while its session is restored at launch. */
  prepare(account: Account) {
    this.set({ account, state: 'syncing' });
  }

  start(account: Account) {
    this.enabled = true;
    this.failures = 0;
    this.set({ account, state: this.status.state === 'off' ? 'syncing' : this.status.state });
    this.appState?.remove();
    this.appState = AppState.addEventListener('change', this.onAppState);
    if (this.interval) clearInterval(this.interval);
    this.interval = setInterval(() => this.request('interval'), INTERVAL);
    this.request('now');
  }

  /** Keep the account but stop syncing (e.g. the Google session needs signing in again). */
  pause(state: SyncState) {
    this.enabled = false;
    this.clearTimers();
    this.set({ state });
  }

  stop() {
    this.enabled = false;
    this.clearTimers();
    this.appState?.remove();
    this.appState = null;
    this.set({ state: 'off', account: null, lastSyncAt: null });
  }

  /** Run a sync now and wait for it (up to timeoutMs). Resolves true if it finished without error. */
  async syncNow(timeoutMs = 15_000): Promise<boolean> {
    if (!this.enabled) return false;
    const done = this.runOnce().then(() => this.status.state === 'synced' || this.status.state === 'update');
    const timeout = new Promise<boolean>(resolve => setTimeout(() => resolve(false), timeoutMs));
    return Promise.race([done, timeout]);
  }

  /** Upload pending changes before signing out. Resolves true if everything is in Google Drive. */
  async finalSync(timeoutMs = 10_000): Promise<boolean> {
    if (!this.enabled) return !this.store.dirty;
    await this.syncNow(timeoutMs);
    return !this.store.dirty;
  }

  async deleteBackup(): Promise<void> {
    await deleteAllReplicas(this.drive);
  }

  request(kind: 'change' | 'now' | 'foreground' | 'interval') {
    if (!this.enabled) return;
    if (kind === 'foreground' && Date.now() - this.lastRunAt < FOREGROUND_MIN_GAP) return;
    this.schedule(kind === 'change' ? CHANGE_DELAY : 0);
  }

  /* ---------- Internals ---------- */
  private onAppState = (s: AppStateStatus) => {
    if (s === 'active') this.request('foreground');
    else if (s === 'background') {
      void this.store.flushNow();
      if (this.store.dirty) this.schedule(0); // best effort before the OS suspends us
    }
  };

  private schedule(ms: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.runOnce();
    }, ms);
  }

  private clearTimers() {
    if (this.timer) clearTimeout(this.timer);
    if (this.interval) clearInterval(this.interval);
    this.timer = null;
    this.interval = null;
  }

  private runOnce(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = this.run().finally(() => {
      this.running = null;
      if (this.again && this.enabled) {
        this.again = false;
        this.schedule(300);
      }
    });
    return this.running;
  }

  private async run() {
    if (!this.enabled) return;
    this.lastRunAt = Date.now();
    if (this.status.state !== 'synced') this.set({ state: 'syncing' });
    try {
      const out = await syncOnce(this.store, this.drive);
      this.failures = 0;
      this.set({ state: out.newerFormat ? 'update' : 'synced', lastSyncAt: Date.now() });
    } catch (err) {
      const state = classify(err);
      if (__DEV__) console.warn('[sync] failed:', state, err);
      this.set({ state });
      if (retries(state) && this.enabled) {
        this.schedule(BACKOFF[Math.min(this.failures, BACKOFF.length - 1)]);
        this.failures++;
      }
    } finally {
      await this.store.flushNow();
    }
  }
}
