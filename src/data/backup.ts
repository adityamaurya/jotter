/* Manual backup files, in the same format as leave-calendar-data.json ("leave-calendar/v1"). */

import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { normalizeState, todayIso, type State } from '../rules';

export function backupJson(s: State, today = todayIso()): string {
  return JSON.stringify(
    { format: 'leave-calendar/v1', exportedAt: today, days: s.days, hol: s.hol, rec: s.rec, settings: s.settings, adjust: s.adjust },
    null,
    2,
  );
}

/** A Leave Calendar backup, or null if the text isn't one. */
export function parseBackup(text: string): State | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const isObj = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v);
  const ok = r.format === 'leave-calendar/v1' || (isObj(r.days) && (isObj(r.settings) || isObj(r.adjust) || isObj(r.hol)));
  return ok ? normalizeState(raw) : null;
}

/** Write the backup to a file and open the share sheet. */
export async function exportBackup(s: State): Promise<void> {
  const file = new File(Paths.cache, `leave-calendar-${todayIso()}.json`);
  if (file.exists) file.delete();
  file.create();
  await file.write(backupJson(s));
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Export backup' });
}

/** Let the user pick a backup file. null = cancelled. */
export async function pickBackup(): Promise<{ state: State } | { error: 'invalid' } | null> {
  const res = await DocumentPicker.getDocumentAsync({
    // Android file providers often label .json as octet-stream or text, so accept anything and check the content.
    type: Platform.OS === 'android' ? '*/*' : 'application/json',
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (res.canceled || !res.assets?.length) return null;
  try {
    const state = parseBackup(await new File(res.assets[0].uri).text());
    return state ? { state } : { error: 'invalid' };
  } catch {
    return { error: 'invalid' };
  }
}
