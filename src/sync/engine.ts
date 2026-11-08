/* One sync pass between this device and the user's Google Drive app folder.

     1. List the replica files (one per device).
     2. Download only the files whose checksum changed since we last merged them, and merge them in.
     3. Upload our own file if we have changes it doesn't (or it doesn't exist yet).

   Merging is per-record last-writer-wins with HLC stamps, which is commutative, associative and idempotent:
   devices can sync in any order, any number of times, offline for weeks, and still end up identical.
   A typical pass with nothing new is a single small "list" request. */

import type { Store } from '../data/store.ts';
import type { RecordMap } from '../data/records.ts';
import { wins } from '../data/records.ts';
import type { Drive, DriveFile } from './drive.ts';
import { DriveError } from './drive.ts';
import { REPLICA_PREFIX, decodeReplica, encodeReplica, replicaFileName } from './replica.ts';

export type SyncMeta = {
  /** Our own replica file in Drive, once created. */
  fileId?: string;
  /** fileId -> md5 of the version we last merged (or uploaded). */
  seen: Record<string, string>;
};

export type SyncOutcome = { uploaded: boolean; downloaded: number; files: number; newerFormat: boolean };

/** Does `local` hold anything the file doesn't (a missing record or a newer one)? */
function fileIsBehind(file: RecordMap, local: RecordMap): boolean {
  for (const [k, r] of local) {
    const f = file.get(k);
    if (!f || wins(r, f)) return true;
  }
  return false;
}

export async function syncOnce(store: Store, drive: Drive, now: () => Date = () => new Date()): Promise<SyncOutcome> {
  const replicaId = store.getMeta('replica');
  if (!replicaId) throw new Error('Store has no replica id');
  const myName = replicaFileName(replicaId);
  const saved = store.getMetaJson<SyncMeta>('sync');
  const meta: SyncMeta = { fileId: saved?.fileId, seen: { ...(saved?.seen ?? {}) } };

  const files = await drive.list(REPLICA_PREFIX);
  const mine: DriveFile | undefined = files.find(f => f.id === meta.fileId) ?? files.find(f => f.name === myName);

  let downloaded = 0;
  let newerFormat = false;
  let mineBehind = false;
  for (const f of files) {
    if (f.md5Checksum && meta.seen[f.id] === f.md5Checksum) continue; // unchanged since we merged it
    const doc = decodeReplica(await drive.download(f.id));
    downloaded++;
    if (!doc.ok) {
      if (doc.reason === 'newer') newerFormat = true; // written by a newer app version: leave it alone, re-check next time
      else if (f.md5Checksum) meta.seen[f.id] = f.md5Checksum; // unreadable: skip it until it changes
      continue;
    }
    store.applyRemote(doc.records);
    if (f === mine) mineBehind = fileIsBehind(doc.records, store.snapshot().records);
    if (f.md5Checksum) meta.seen[f.id] = f.md5Checksum;
  }
  const present = new Set(files.map(f => f.id));
  for (const id of Object.keys(meta.seen)) if (!present.has(id)) delete meta.seen[id];

  let uploaded = false;
  const snap = store.snapshot();
  const needUpload = mine ? snap.dirty || mineBehind : snap.records.size > 0;
  if (needUpload) {
    const body = encodeReplica(replicaId, snap.records, now());
    let file: DriveFile;
    if (mine) {
      try {
        file = await drive.update(mine.id, body);
      } catch (e) {
        if (!(e instanceof DriveError && e.status === 404)) throw e;
        file = await drive.create(myName, body); // deleted since we listed it
      }
    } else {
      file = await drive.create(myName, body);
    }
    meta.fileId = file.id;
    if (file.md5Checksum) meta.seen[file.id] = file.md5Checksum;
    store.markUploaded(snap.version);
    uploaded = true;
  } else if (mine) {
    meta.fileId = mine.id;
  }

  store.setMetaJson('sync', meta);
  store.setMeta('sync.at', String(now().getTime()));
  return { uploaded, downloaded, files: files.length, newerFormat };
}

/** Delete every replica file in the app folder (the "Delete backup" action). */
export async function deleteAllReplicas(drive: Drive): Promise<number> {
  const files = await drive.list(REPLICA_PREFIX);
  for (const f of files) await drive.remove(f.id);
  return files.length;
}
