/* Settings sheet: leave rules, calendar, office holidays, holiday list, saving. Changes apply immediately. */

import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { getStore, type Appearance } from '../core';
import { MAPPED_UNTIL, MON3, STEP_LIMITS, fmtShort, holidayListEmpty, holidaysInYear, ymKey, type Settings, type State } from '../rules';
import { useTheme } from '../theme';
import { DayCircle } from '../ui/Circle';
import { IconButton, Segmented, Stepper, Switch } from '../ui/controls';
import { Cell, Foot, Group, GroupLabel } from '../ui/group';
import { ChevronRight } from '../ui/icons';
import { T } from '../ui/T';
import { SavingGroup } from './Saving';

export function SettingsBody({
  state, appearance, onAppearance, hy, onYear, onHoliday, onPickStart,
}: {
  state: State; appearance: Appearance; onAppearance: (a: Appearance) => void; hy: number; onYear: (y: number) => void;
  onHoliday: (iso: string) => void; onPickStart: () => void;
}) {
  const { c } = useTheme();
  const st = state.settings;
  const set = (patch: Partial<Settings>) => getStore().commit({ ...state, settings: { ...st, ...patch } });
  const [sy, sm] = st.aplStart.split('-').map(Number);
  const holidays = holidaysInYear(state, hy);

  return (
    <View>
      <GroupLabel first>Leave rules</GroupLabel>
      <Group>
        <Cell>
          <T style={{ flex: 1 }}>APL per month</T>
          <Stepper value={st.aplPerMonth} min={0} max={STEP_LIMITS.aplPerMonth} onChange={v => set({ aplPerMonth: v })} label="APL per month" />
        </Cell>
        <Cell>
          <T style={{ flex: 1 }}>APL credits start</T>
          <Pressable
            onPress={onPickStart}
            accessibilityRole="button"
            accessibilityLabel={`APL credits start, ${MON3[sm - 1]} ${sy}`}
            style={({ pressed }) => ({ backgroundColor: pressed ? c.fill2 : c.fill, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 8 })}
          >
            <T size={15} tabular>{`${MON3[sm - 1]} ${sy}`}</T>
          </Pressable>
        </Cell>
        <Cell>
          <T style={{ flex: 1 }}>Sick leaves per year</T>
          <Stepper value={st.sickPerYear} min={0} max={STEP_LIMITS.sickPerYear} onChange={v => set({ sickPerYear: v })} label="Sick leaves per year" />
        </Cell>
        <Cell>
          <T style={{ flex: 1 }}>WFH days per month</T>
          <Stepper value={st.wfhPerMonth} min={0} max={STEP_LIMITS.wfhPerMonth} onChange={v => set({ wfhPerMonth: v })} label="WFH days per month" />
        </Cell>
      </Group>
      <Foot>All-purpose leaves carry forward. Sick leaves lapse on 31 Dec, work-from-home days at the end of each month. To correct a balance, tap it on the main screen.</Foot>

      <GroupLabel>Calendar</GroupLabel>
      <Group>
        <Cell>
          <T style={{ flex: 1 }}>Week starts on</T>
          <Segmented<0 | 1> label="Week starts on" options={[[1, 'Mon'], [0, 'Sun']]} value={st.weekStart} onChange={v => set({ weekStart: v })} />
        </Cell>
        <Cell>
          <T style={{ flex: 1 }}>Appearance</T>
          <Segmented<Appearance> label="Appearance" options={[['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']]} value={appearance} onChange={onAppearance} />
        </Cell>
      </Group>

      <GroupLabel>Office holidays</GroupLabel>
      <Group>
        <Cell>
          <DayCircle size={20} office ring />
          <T style={{ flex: 1 }}>Every Saturday and Sunday</T>
          <Switch value={st.weeklyOff} onChange={v => set({ weeklyOff: v })} label="Every Saturday and Sunday" />
        </Cell>
      </Group>

      <GroupLabel
        right={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <IconButton kind="sm" dir="left" label="Previous year" onPress={() => onYear(hy - 1)} />
            <T size={15} tabular center style={{ minWidth: 40 }}>
              {hy}
            </T>
            <IconButton kind="sm" dir="right" label="Next year" onPress={() => onYear(hy + 1)} />
          </View>
        }
      >
        Holiday list
      </GroupLabel>
      <Group>
        {holidays.length ? (
          holidays.map(h => (
            <Cell key={h.iso} onPress={() => onHoliday(h.iso)} label={`${fmtShort(h.iso)}, ${h.name}`}>
              <DayCircle size={20} office={h.office} ring />
              <T size={15} color={c.ink2} tabular style={{ width: 96 }}>
                {fmtShort(h.iso)}
              </T>
              <T size={16} numberOfLines={1} style={{ flex: 1 }}>
                {h.name}
              </T>
              <ChevronRight size={14} color={c.ink3} />
            </Cell>
          ))
        ) : (
          <Cell>
            <T color={c.ink2}>{holidayListEmpty(hy)}</T>
          </Cell>
        )}
      </Group>
      <Foot>{`Office holidays show a ring with a grey fill and repeat every year; festival dates are mapped to each year up to ${MAPPED_UNTIL}. Holidays you add show just the ring. To add, rename or remove one, tap that date on the calendar.`}</Foot>

      <SavingGroup />
    </View>
  );
}

/** "APL credits start": a year switcher and a 3×4 grid of months. Stores YYYY-MM. */
export function MonthPickerBody({ value, onPick }: { value: string; onPick: (ym: string) => void }) {
  const { c } = useTheme();
  const [y0, m0] = value.split('-').map(Number);
  const [year, setYear] = useState(y0);
  const rows = [0, 1, 2].map(r => [0, 1, 2, 3].map(i => r * 4 + i));
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8, marginBottom: 12 }}>
        <IconButton kind="sm" dir="left" label="Previous year" onPress={() => setYear(year - 1)} />
        <T size={17} weight="600" tabular center style={{ minWidth: 56 }}>
          {year}
        </T>
        <IconButton kind="sm" dir="right" label="Next year" onPress={() => setYear(year + 1)} />
      </View>
      <Group style={{ padding: 8, gap: 4 }}>
        {rows.map((row, r) => (
          <View key={r} style={{ flexDirection: 'row', gap: 4 }}>
            {row.map(m => {
              const on = year === y0 && m === m0 - 1;
              return (
                <Pressable
                  key={m}
                  onPress={() => onPick(ymKey(year, m))}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${MON3[m]} ${year}`}
                  style={({ pressed }) => ({ flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 10, backgroundColor: on ? c.accent : pressed ? c.fill : 'transparent' })}
                >
                  <T size={15} weight={on ? '600' : undefined} color={on ? '#FFFFFF' : c.ink}>
                    {MON3[m]}
                  </T>
                </Pressable>
              );
            })}
          </View>
        ))}
      </Group>
    </View>
  );
}
