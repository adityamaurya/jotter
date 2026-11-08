/* The file each device keeps in the user's Google Drive app folder.

   One file per device ("replica"), written only by that device. Every device reads all of them and merges
   them into its own records. Google Drive's v3 API has no conditional (If-Match) writes, so a single shared
   file could lose an update when two devices save at the same moment; with one writer per file that
   can't happen. Each file holds the device's full merged copy, so any one of them is a complete backup. */

import { isStamp } from '../data/hlc.ts';
import type { Json, RecordMap } from '../data/records.ts';

export const REPLICA_PREFIX = 'lc-replica-';
export const FORMAT = 'leave-calendar/replica';
/** Bump only for changes old app versions can't read. Old versions skip newer files and ask to update. */
export const FORMAT_VERSION = 1;

export const replicaFileName = (replicaId: string) => `${REPLICA_PREFIX}${replicaId}.json`;

type ReplicaDoc = {
  format: string;
  v: number;
  replica: string;
  writtenAt: string;
  /** key -> [stamp, value] */
  records: Record<string, [string, Json]>;
};

export function encodeReplica(replicaId: string, records: RecordMap, writtenAt: Date): string {
  const out: Record<string, [string, Json]> = {};
  for (const key of [...records.keys()].sort()) {
    const r = records.get(key)!;
    out[key] = [r.s, r.v];
  }
  const doc: ReplicaDoc = { format: FORMAT, v: FORMAT_VERSION, replica: replicaId, writtenAt: writtenAt.toISOString(), records: out };
  return JSON.stringify(doc);
}

export type DecodedReplica =
  | { ok: true; replica: string; records: RecordMap }
  | { ok: false; reason: 'invalid' | 'newer' };

export function decodeReplica(text: string): DecodedReplica {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (!doc || typeof doc !== 'object') return { ok: false, reason: 'invalid' };
  const d = doc as Partial<ReplicaDoc>;
  if (d.format !== FORMAT || typeof d.v !== 'number') return { ok: false, reason: 'invalid' };
  if (d.v > FORMAT_VERSION) return { ok: false, reason: 'newer' };
  if (!d.records || typeof d.records !== 'object') return { ok: false, reason: 'invalid' };
  const records: RecordMap = new Map();
  for (const key of Object.keys(d.records)) {
    const entry = (d.records as Record<string, unknown>)[key];
    if (!Array.isArray(entry) || entry.length !== 2 || !isStamp(entry[0])) continue;
    records.set(key, { s: entry[0], v: entry[1] as Json });
  }
  return { ok: true, replica: typeof d.replica === 'string' ? d.replica : '', records };
}
