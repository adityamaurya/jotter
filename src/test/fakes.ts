/* Test doubles: an in-memory database and an in-memory Google Drive app folder. Node only. */
import { createHash } from 'node:crypto';
import type { Persistence } from '../data/store.ts';
import type { Drive, DriveFile } from '../sync/drive.ts';
import { DriveError } from '../sync/drive.ts';

export function memoryPersistence(): Persistence & { rows: Map<string, [string, string]>; meta: Map<string, string>; failNext: number; saves: number } {
  const rows = new Map<string, [string, string]>();
  const meta = new Map<string, string>();
  const p = {
    rows,
    meta,
    failNext: 0,
    saves: 0,
    async load() {
      return { records: [...rows].map(([k, [v, s]]) => [k, v, s] as [string, string, string]), meta: [...meta] };
    },
    async save(recs: [string, string, string][], metaRows: [string, string | null][]) {
      if (p.failNext > 0) {
        p.failNext--;
        throw new Error('disk full');
      }
      p.saves++;
      for (const [k, v, s] of recs) rows.set(k, [v, s]);
      for (const [k, v] of metaRows) {
        if (v === null) meta.delete(k);
        else meta.set(k, v);
      }
    },
    async wipe(keep: string[]) {
      rows.clear();
      for (const k of [...meta.keys()]) if (!keep.includes(k)) meta.delete(k);
    },
  };
  return p;
}

type Stored = { id: string; name: string; body: string; modifiedTime: string };

/** A shared app folder. Each device gets its own Drive handle onto it; `offline` makes that handle fail. */
export function fakeDriveFolder() {
  const files = new Map<string, Stored>();
  let seq = 0;
  const calls: string[] = [];
  const md5 = (s: string) => createHash('md5').update(s, 'utf8').digest('hex');
  const meta = (f: Stored): DriveFile => ({ id: f.id, name: f.name, md5Checksum: md5(f.body), modifiedTime: f.modifiedTime, size: String(f.body.length) });

  function handle(device: string): Drive & { offline: boolean } {
    const h = {
      offline: false,
      check(op: string) {
        calls.push(`${device}:${op}`);
        if (h.offline) throw new TypeError('Network request failed');
      },
      async list(prefix: string) {
        h.check('list');
        return [...files.values()].filter(f => f.name.startsWith(prefix)).map(meta);
      },
      async download(id: string) {
        h.check('download');
        const f = files.get(id);
        if (!f) throw new DriveError(404, 'notFound', 'File not found');
        return f.body;
      },
      async create(name: string, body: string) {
        h.check('create');
        const f = { id: `f${++seq}`, name, body, modifiedTime: new Date(seq * 1000).toISOString() };
        files.set(f.id, f);
        return meta(f);
      },
      async update(id: string, body: string) {
        h.check('update');
        const f = files.get(id);
        if (!f) throw new DriveError(404, 'notFound', 'File not found');
        f.body = body;
        f.modifiedTime = new Date(++seq * 1000).toISOString();
        return meta(f);
      },
      async remove(id: string) {
        h.check('remove');
        files.delete(id);
      },
    };
    return h;
  }
  return { files, calls, handle };
}

/** A wall clock you can move by hand. */
export function manualClock(start = Date.UTC(2026, 10, 8, 9, 0, 0)) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms), set: (ms: number) => (t = ms) };
}
