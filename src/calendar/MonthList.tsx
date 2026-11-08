/* "IN NOVEMBER" list of the month's leaves, titles and holidays, and the saving status line. */

import { Pressable, View } from 'react-native';
import { MONTHS, agendaEmpty, agendaRows, type State } from '../rules';
import type { SyncStatus } from '../sync/controller';
import { useTheme } from '../theme';
import { DayCircle } from '../ui/Circle';
import { T } from '../ui/T';

export function MonthList({ state, y, m, onDay }: { state: State; y: number; m: number; onDay: (iso: string) => void }) {
  const { c } = useTheme();
  const rows = agendaRows(state, y, m);
  return (
    <View>
      <T size={13} weight="500" color={c.ink2} upper em={0.04} style={{ marginBottom: 8 }} accessibilityRole="header">
        {`In ${MONTHS[m]}`}
      </T>
      {rows.length ? (
        rows.map(r => (
          <Pressable
            key={r.iso}
            onPress={() => onDay(r.iso)}
            accessibilityRole="button"
            accessibilityLabel={`${r.title}, ${r.sub}`}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingVertical: 9,
              paddingHorizontal: 4,
              borderBottomWidth: 1,
              borderBottomColor: c.sep,
              backgroundColor: pressed ? c.fill : 'transparent',
            })}
          >
            <DayCircle size={34} fontSize={15} label={r.day} leave={r.leave} office={r.office} ring={r.holiday} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <T size={16} weight="500" numberOfLines={1}>
                {r.title}
              </T>
              <T size={13} color={c.ink2} numberOfLines={1}>
                {r.sub}
              </T>
            </View>
          </Pressable>
        ))
      ) : (
        <T size={14} lh={1.45} color={c.ink2} style={{ paddingVertical: 4, paddingHorizontal: 2 }}>
          {agendaEmpty(m)}
        </T>
      )}
    </View>
  );
}

export function statusText(s: SyncStatus): { text: string; cloud: boolean } {
  switch (s.state) {
    case 'off':
      return { text: 'Saved on this device', cloud: false };
    case 'syncing':
      return { text: 'Syncing…', cloud: true };
    case 'synced':
      return { text: 'Synced to your Google account', cloud: true };
    case 'update':
      return { text: 'Synced · update the app to see changes from your other devices', cloud: true };
    case 'offline':
      return { text: 'Saved on this device · will sync when you’re online', cloud: false };
    case 'signin':
      return { text: 'Saved on this device · sign in again to sync', cloud: false };
    case 'permission':
      return { text: 'Saved on this device · allow Google Drive access to sync', cloud: false };
    case 'full':
      return { text: 'Saved on this device · your Google storage is full', cloud: false };
    default:
      return { text: 'Saved on this device · sync will retry', cloud: false };
  }
}

export function StatusLine({ status }: { status: SyncStatus }) {
  const { c } = useTheme();
  const { text, cloud } = statusText(status);
  return (
    <View style={{ marginTop: 14, marginHorizontal: 2, flexDirection: 'row', alignItems: 'center', gap: 7 }} accessible accessibilityLabel={text}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: cloud ? c.on : c.ink3 }} />
      <T size={12} color={c.ink2} style={{ flexShrink: 1 }}>
        {text}
      </T>
    </View>
  );
}
