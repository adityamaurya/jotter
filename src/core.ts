/* App-wide singletons (the store and the sync controller) and the hooks the UI reads them through. */

import { useSyncExternalStore } from 'react';
import type { State } from './rules';
import { openPersistence } from './data/db';
import { Store } from './data/store';
import { googleAuth, type Account } from './sync/auth';
import { SyncController, type SyncStatus } from './sync/controller';

export type Mode = 'google' | 'local';
export type Appearance = 'auto' | 'light' | 'dark';
/** Meta that belongs to this device, not to the calendar: kept when signing out. */
export const DEVICE_META = ['replica', 'onboarded', 'appearance'];

let store: Store | null = null;
let sync: SyncController | null = null;

export async function boot(): Promise<void> {
  if (store) return;
  const persistence = await openPersistence();
  const s = new Store(persistence);
  await s.init();
  store = s;
  sync = new SyncController(s);
  const account = s.getMetaJson<Account>('account');
  if (getMode() === 'google' && account) {
    const c = sync;
    c.prepare(account);
    // Restore the Google session in the background (never block the calendar on the network), then sync.
    // Offline at launch is fine: syncing retries with backoff.
    void googleAuth.restore().then(r => {
      if (r.status === 'signed-out') c.pause('signin');
      else c.start(account);
    });
  }
}

export function getStore(): Store {
  if (!store) throw new Error('boot() has not finished');
  return store;
}
export function getSync(): SyncController {
  if (!sync) throw new Error('boot() has not finished');
  return sync;
}

export function getMode(): Mode | null {
  const m = getStore().getMeta('mode');
  return m === 'google' || m === 'local' ? m : null;
}
export function getAppearance(): Appearance {
  const a = getStore().getMeta('appearance');
  return a === 'light' || a === 'dark' ? a : 'auto';
}

/** Use the calendar on this device only. */
export function chooseLocal() {
  const s = getStore();
  s.setMeta('onboarded', '1');
  s.setMeta('mode', 'local');
}

/** Bind this device's calendar to a Google account and start syncing (local data is merged in). */
export function connectGoogle(account: Account) {
  const s = getStore();
  s.setMeta('onboarded', '1');
  s.setMeta('mode', 'google');
  s.setMetaJson('account', account);
  getSync().start(account);
}

/** The Google account whose calendar is on this device, if any. */
export function boundAccount(): Account | null {
  return getStore().getMetaJson<Account>('account');
}

/** Sign out: stop syncing and remove the calendar from this device (it stays in Google Drive). */
export async function signOut(opts: { revoke?: boolean } = {}) {
  getSync().stop();
  if (opts.revoke) await googleAuth.revoke();
  else await googleAuth.signOut();
  await getStore().wipe(DEVICE_META);
}

export const useCalendar = (): State => {
  const s = getStore();
  return useSyncExternalStore(s.subscribe, s.getState, s.getState);
};
export const useSyncStatus = (): SyncStatus => {
  const c = getSync();
  return useSyncExternalStore(c.subscribe, c.getStatus, c.getStatus);
};
