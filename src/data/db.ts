/* On-device database: SQLite (expo-sqlite), WAL journal, FULL sync, every batch in one transaction.
   Schema changes go through PRAGMA user_version migrations. If the file can't be opened or migrated
   (corruption), it is recreated empty; a signed-in user then gets everything back from Google Drive. */

import * as SQLite from 'expo-sqlite';
import type { Persistence } from './store';

const DB_NAME = 'leavecal.db';
const SCHEMA_VERSION = 1;

async function migrate(db: SQLite.SQLiteDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;
  if (version < 1) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS records (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, stamp TEXT NOT NULL) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL) WITHOUT ROWID;
      PRAGMA user_version = ${SCHEMA_VERSION};
    `);
  }
}

async function open(): Promise<SQLite.SQLiteDatabase> {
  let db: SQLite.SQLiteDatabase | null = null;
  try {
    db = await SQLite.openDatabaseAsync(DB_NAME);
    await migrate(db);
    await db.getFirstAsync('SELECT count(*) AS n FROM records');
    return db;
  } catch (err) {
    console.warn('[db] could not open the database, starting a new one', err);
    try {
      await db?.closeAsync();
    } catch {
      /* already closed */
    }
    await SQLite.deleteDatabaseAsync(DB_NAME).catch(() => undefined);
    db = await SQLite.openDatabaseAsync(DB_NAME);
    await migrate(db);
    return db;
  }
}

export async function openPersistence(): Promise<Persistence> {
  const db = await open();
  return {
    async load() {
      const records = await db.getAllAsync<{ key: string; value: string; stamp: string }>('SELECT key, value, stamp FROM records');
      const meta = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM meta');
      return {
        records: records.map(r => [r.key, r.value, r.stamp] as [string, string, string]),
        meta: meta.map(m => [m.key, m.value] as [string, string]),
      };
    },
    async save(records, meta) {
      await db.withTransactionAsync(async () => {
        if (records.length) {
          const upsert = await db.prepareAsync(
            'INSERT INTO records (key, value, stamp) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, stamp = excluded.stamp',
          );
          try {
            for (const [k, v, s] of records) await upsert.executeAsync(k, v, s);
          } finally {
            await upsert.finalizeAsync();
          }
        }
        for (const [k, v] of meta) {
          if (v === null) await db.runAsync('DELETE FROM meta WHERE key = ?', k);
          else await db.runAsync('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', k, v);
        }
      });
    },
    async wipe(keepMeta) {
      await db.withTransactionAsync(async () => {
        await db.runAsync('DELETE FROM records');
        if (keepMeta.length) await db.runAsync(`DELETE FROM meta WHERE key NOT IN (${keepMeta.map(() => '?').join(', ')})`, ...keepMeta);
        else await db.runAsync('DELETE FROM meta');
      });
    },
  };
}
