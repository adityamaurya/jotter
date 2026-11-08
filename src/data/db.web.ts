/* Web preview only (`npx expo start --web`): keeps the same records in localStorage.
   The iOS and Android apps use SQLite (db.ts). */

import type { Persistence } from './store';

const KEY = 'leavecal:db';
type Saved = { records: Record<string, [string, string]>; meta: Record<string, string> };

function read(): Saved {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null') as Saved | null;
    if (v && typeof v === 'object' && v.records && v.meta) return v;
  } catch {
    /* unavailable or corrupt */
  }
  return { records: {}, meta: {} };
}
function write(s: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage full or blocked: keep running in memory */
  }
}

export async function openPersistence(): Promise<Persistence> {
  return {
    async load() {
      const s = read();
      return {
        records: Object.entries(s.records).map(([k, [v, st]]) => [k, v, st] as [string, string, string]),
        meta: Object.entries(s.meta),
      };
    },
    async save(records, meta) {
      const s = read();
      for (const [k, v, st] of records) s.records[k] = [v, st];
      for (const [k, v] of meta) {
        if (v === null) delete s.meta[k];
        else s.meta[k] = v;
      }
      write(s);
    },
    async wipe(keepMeta) {
      const s = read();
      const meta: Record<string, string> = {};
      for (const k of keepMeta) if (k in s.meta) meta[k] = s.meta[k];
      write({ records: {}, meta });
    },
  };
}
