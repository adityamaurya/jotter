/* The main screen. Phone (< 700): one scrolling column. >= 700: labels in the grid. >= 960: sidebar
   (balance + month list) beside a large grid, and sheets become a right-side panel. */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState, View, type ViewInstance } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getStore, useCalendar, useSyncStatus, type Appearance } from '../core';
import {
  LEAVES, MONTHS, applyAdjust, balances, clamp, dayHasData, fmtShort, initDayDraft, partsOf, previewDays, saveDay, tileCaptions, todayIso,
  type DayDraft, type LeaveType,
} from '../rules';
import { useLayout, useTheme } from '../theme';
import { IconButton, TextButton } from '../ui/controls';
import { Sliders } from '../ui/icons';
import { Sheet, type SheetContent } from '../ui/Sheet';
import { T } from '../ui/T';
import { useToast } from '../ui/Toast';
import { BalanceSection } from './Balance';
import { BalanceBody, type AdjustDraft } from './BalanceSheet';
import { DayDetailsBody, DayEditBody } from './DaySheet';
import { Legend, MonthGrid, WeekdayHeader } from './MonthGrid';
import { MonthList, StatusLine } from './MonthList';
import { MonthPickerBody, SettingsBody } from './SettingsSheet';

type SheetState =
  | { kind: 'day'; iso: string; mode: 'view' | 'edit'; draft: DayDraft | null }
  | { kind: 'adjust'; draft: AdjustDraft }
  | { kind: 'settings'; hy: number };

const newId = () => 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function CalendarScreen({ appearance, onAppearance }: { appearance: Appearance; onAppearance: (a: Appearance) => void }) {
  const state = useCalendar();
  const status = useSyncStatus();
  const { c } = useTheme();
  const L = useLayout();
  const insets = useSafeAreaInsets();
  const toast = useToast();

  const [today, setToday] = useState(todayIso);
  const [view, setView] = useState(() => {
    const p = partsOf(todayIso());
    return { y: p.y, m: p.m };
  });
  const [nav, setNav] = useState({ key: 0, dir: 0 });
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [picker, setPicker] = useState(false);
  const sheetRef = useRef(sheet);
  useLayoutEffect(() => {
    sheetRef.current = sheet;
  });

  // Re-read "today" when the app comes back to the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active') setToday(todayIso());
    });
    return () => sub.remove();
  }, []);

  const go = useCallback((delta: number) => {
    setView(v => {
      let m = v.m + delta;
      let y = v.y;
      while (m < 0) { m += 12; y--; }
      while (m > 11) { m -= 12; y++; }
      return { y, m };
    });
    setNav(n => ({ key: n.key + 1, dir: delta }));
  }, []);
  const goToday = () => {
    const t = todayIso();
    const p = partsOf(t);
    const target = p.y * 12 + p.m;
    const cur = view.y * 12 + view.m;
    setToday(t);
    setView({ y: p.y, m: p.m });
    setNav(n => ({ key: n.key + 1, dir: target === cur ? 0 : target > cur ? 1 : -1 }));
  };

  /* ---------- Sheets ---------- */
  const close = useCallback(() => setSheet(null), []);
  const openDay = useCallback((iso: string) => {
    const s = getStore().getState();
    const has = dayHasData(s, iso);
    setSheet({ kind: 'day', iso, mode: has ? 'view' : 'edit', draft: has ? null : initDayDraft(s, iso) });
  }, []);
  const openAdjust = (type: LeaveType) => {
    const b = balances(state, view.y, view.m);
    if (!b) {
      toast('Balances start from April 2026, the month you joined.');
      return;
    }
    setSheet({ kind: 'adjust', draft: { type, y: view.y, m: view.m, v: b[type].value, v0: b[type].value, reset: false } });
  };
  const openSettings = () => setSheet({ kind: 'settings', hy: Math.max(view.y, 2026) });

  const saveDayAndClose = useCallback(() => {
    const s = sheetRef.current;
    if (s?.kind !== 'day' || !s.draft) return;
    const store = getStore();
    store.commit(saveDay(store.getState(), s.iso, s.draft, newId));
    setSheet(null);
  }, []);
  const saveAdjustAndClose = useCallback(() => {
    const s = sheetRef.current;
    if (s?.kind !== 'adjust') return;
    const store = getStore();
    store.commit(applyAdjust(store.getState(), s.draft, todayIso()));
    setSheet(null);
  }, []);

  // A day whose data disappeared (e.g. removed on another device) can't be shown in view mode.
  if (sheet?.kind === 'day' && sheet.mode === 'view' && !dayHasData(state, sheet.iso)) {
    setSheet({ ...sheet, mode: 'edit', draft: initDayDraft(state, sheet.iso) });
  }

  let content: SheetContent | null = null;
  if (sheet?.kind === 'day') {
    const s = sheet;
    content =
      s.mode === 'view' || !s.draft
        ? {
            id: `day-${s.iso}`,
            left: { label: 'Close', onPress: close },
            title: '',
            right: { label: 'Edit', onPress: () => setSheet({ ...s, mode: 'edit', draft: initDayDraft(state, s.iso) }) },
            body: <DayDetailsBody state={state} iso={s.iso} />,
          }
        : {
            id: `day-${s.iso}`,
            left: { label: 'Cancel', onPress: close },
            title: fmtShort(s.iso),
            right: { label: 'Done', strong: true, onPress: saveDayAndClose },
            body: <DayEditBody state={state} iso={s.iso} draft={s.draft} onDraft={d => setSheet({ ...s, draft: d })} onDone={saveDayAndClose} />,
          };
  } else if (sheet?.kind === 'adjust') {
    const s = sheet;
    content = {
      id: `adjust-${s.draft.type}`,
      left: { label: 'Cancel', onPress: close },
      title: LEAVES[s.draft.type].name,
      right: { label: 'Done', strong: true, onPress: saveAdjustAndClose },
      body: <BalanceBody state={state} draft={s.draft} onDraft={d => setSheet({ ...s, draft: d })} onDone={saveAdjustAndClose} />,
    };
  } else if (sheet?.kind === 'settings') {
    const s = sheet;
    content = {
      id: 'settings',
      left: null,
      title: 'Settings',
      right: { label: 'Done', strong: true, onPress: close },
      body: (
        <SettingsBody
          state={state}
          appearance={appearance}
          onAppearance={onAppearance}
          hy={s.hy}
          onYear={hy => setSheet({ ...s, hy })}
          onHoliday={iso => {
            const p = partsOf(iso);
            setView({ y: p.y, m: p.m });
            setNav(n => ({ key: n.key + 1, dir: 0 }));
            openDay(iso);
          }}
          onPickStart={() => setPicker(true)}
        />
      ),
    };
  }
  const pickerContent: SheetContent | null =
    picker && sheet?.kind === 'settings'
      ? {
          id: 'apl-start',
          left: { label: 'Cancel', onPress: () => setPicker(false) },
          title: 'APL credits start',
          right: null,
          body: (
            <MonthPickerBody
              value={state.settings.aplStart}
              onPick={ym => {
                getStore().commit({ ...state, settings: { ...state.settings, aplStart: ym } });
                setPicker(false);
              }}
            />
          ),
        }
      : null;

  /* ---------- Balances (with the live preview while editing a day) ---------- */
  const saved = balances(state, view.y, view.m);
  const editing = sheet?.kind === 'day' && sheet.mode === 'edit' && sheet.draft ? sheet : null;
  const shown = editing ? balances(state, view.y, view.m, { days: previewDays(state, editing.iso, editing.draft!.leave) }) : saved;
  const captions = tileCaptions(state, view.y, view.m);
  const balanceProps = { y: view.y, m: view.m, shown, saved, captions, wide: L.wide };

  // The balance block is drawn again above the scrim while a day sheet is open.
  const rootRef = useRef<ViewInstance>(null);
  const balanceRef = useRef<ViewInstance>(null);
  const [lift, setLift] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const dayOpen = sheet?.kind === 'day';
  const dayIso = sheet?.kind === 'day' ? sheet.iso : null;
  useEffect(() => {
    if (!dayOpen) return;
    const root = rootRef.current;
    const bal = balanceRef.current;
    if (!root || !bal) return;
    root.measureInWindow((rx, ry) => {
      bal.measureInWindow((x, y, w, h) => setLift({ x: x - rx, y: y - ry, w, h }));
    });
  }, [dayOpen, dayIso, L.width, L.height]);
  const liftNode =
    dayOpen && lift ? (
      <View pointerEvents="none" style={{ position: 'absolute', left: lift.x - 10, top: lift.y - 10, width: lift.w + 20, padding: 10, borderRadius: 26, backgroundColor: c.bg }}>
        <BalanceSection {...balanceProps} />
      </View>
    ) : null;

  /* ---------- Layout ---------- */
  const selected = sheet?.kind === 'day' ? sheet.iso : null;
  const rowMin = L.wide ? 100 : L.labels ? 88 : 56;
  const titleSize = L.wide ? 32 : clamp(L.width * 0.076, 25, 32);
  const monthTitle = (
    <T size={titleSize} lh={1.1} weight="700" em={-0.025} numberOfLines={1} style={{ flexShrink: 1 }} accessibilityRole="header">
      {MONTHS[view.m]}{' '}
      <T size={titleSize} lh={1.1} weight="400" em={-0.025} color={c.ink2}>
        {view.y}
      </T>
    </T>
  );
  const settingsButton = <IconButton kind="plain" label="Settings" icon={(col, s) => <Sliders size={s} color={col} />} onPress={openSettings} />;
  const cal = (
    <View>
      <WeekdayHeader weekStart={state.settings.weekStart} labels={L.labels} wide={L.wide} />
      <MonthGrid state={state} y={view.y} m={view.m} today={today} selected={selected} labels={L.labels} rowMin={rowMin} onDay={openDay} onSwipe={go} navKey={nav.key} dir={nav.dir} />
      <Legend />
    </View>
  );
  const agenda = (
    <View style={{ paddingTop: L.wide ? 12 : 8 }}>
      <MonthList state={state} y={view.y} m={view.m} onDay={openDay} />
      <StatusLine status={status} />
    </View>
  );
  const balance = (
    <View ref={balanceRef} collapsable={false}>
      <BalanceSection {...balanceProps} onTile={openAdjust} />
    </View>
  );

  const pad = {
    paddingTop: Math.max(L.wide ? 28 : 10, insets.top),
    paddingBottom: Math.max(L.wide ? 40 : 28, insets.bottom),
    paddingLeft: Math.max(L.wide ? 32 : 16, insets.left),
    paddingRight: Math.max(L.wide ? 32 : 16, insets.right),
  };

  return (
    <View ref={rootRef} collapsable={false} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ alignItems: 'center' }} showsVerticalScrollIndicator={false}>
        {L.wide ? (
          <View style={[{ width: '100%', maxWidth: 1180, rowGap: 14 }, pad]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 40 }}>
              <T size={17} weight="700" em={-0.01} style={{ width: 300 }}>
                Leave Calendar
              </T>
              <View style={{ flex: 1, minWidth: 0 }}>{monthTitle}</View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <IconButton dir="left" label="Previous month" onPress={() => go(-1)} />
                <TextButton label="Today" onPress={goToday} />
                <IconButton dir="right" label="Next month" onPress={() => go(1)} />
                {settingsButton}
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 40 }}>
              <View style={{ width: 300, rowGap: 14 }}>
                {balance}
                {agenda}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>{cal}</View>
            </View>
          </View>
        ) : (
          <View style={[{ width: '100%', maxWidth: 1180, rowGap: 12 }, pad]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 36 }}>
              <TextButton label="Today" onPress={goToday} />
              {settingsButton}
            </View>
            {balance}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 8 }}>
              <View style={{ flex: 1, minWidth: 0 }}>{monthTitle}</View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <IconButton dir="left" label="Previous month" onPress={() => go(-1)} />
                <IconButton dir="right" label="Next month" onPress={() => go(1)} />
              </View>
            </View>
            {cal}
            {agenda}
          </View>
        )}
      </ScrollView>
      <Sheet content={content} onDismiss={close} wide={L.wide} lift={liftNode} />
      <Sheet content={pickerContent} onDismiss={() => setPicker(false)} wide={L.wide} compact />
    </View>
  );
}
