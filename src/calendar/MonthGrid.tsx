/* Weekday header + month grid. Swipe left/right changes month; the grid slides in 16 pt from the direction
   of travel (opacity .35 -> 1, 240 ms ease-out). */

import { memo, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { cellModel, isoOf, monthLayout, weekdayHeader, type State } from '../rules';
import { leaveInk, useTheme } from '../theme';
import { DayCircle } from '../ui/Circle';
import { T } from '../ui/T';

type CellModel = ReturnType<typeof cellModel>;

const DayCell = memo(function DayCell({ model, selected, labels, onPress }: { model: CellModel; selected: boolean; labels: boolean; onPress: (iso: string) => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={() => onPress(model.iso)}
      accessibilityRole="button"
      accessibilityLabel={model.a11yLabel}
      accessibilityState={{ selected }}
      style={{
        flex: 1,
        minWidth: 0,
        borderTopWidth: 1,
        borderTopColor: c.sep,
        paddingTop: labels ? 6 : 5,
        paddingBottom: labels ? 6 : 4,
        paddingHorizontal: labels ? 4 : 0,
        alignItems: labels ? 'stretch' : 'center',
        gap: labels ? 4 : 3,
      }}
    >
      {selected ? <View style={{ position: 'absolute', top: 3, bottom: 3, left: 2, right: 2, borderRadius: 12, backgroundColor: c.fill }} /> : null}
      <DayCircle
        size={36}
        fontSize={18}
        label={model.day}
        leave={model.leave}
        office={model.office}
        ring={model.holiday}
        today={model.today}
        weekend={model.weekend}
        style={labels ? { alignSelf: 'center' } : undefined}
      />
      {labels ? (
        model.labels.map((l, i) => (
          <T
            key={i}
            size={11.5}
            lh={1.25}
            numberOfLines={1}
            center
            weight={l.kind === 'holiday' ? '600' : undefined}
            color={l.kind === 'holiday' ? c.ink : l.kind === 'leave' && l.leave ? leaveInk(c, l.leave) : c.ink2}
            style={{ paddingHorizontal: 2 }}
          >
            {l.text}
          </T>
        ))
      ) : (
        <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: model.hasNote ? c.ink3 : 'transparent' }} />
      )}
    </Pressable>
  );
});

export function WeekdayHeader({ weekStart, labels, wide }: { weekStart: 0 | 1; labels: boolean; wide: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', paddingTop: wide ? 4 : 10, paddingBottom: 6 }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {weekdayHeader(weekStart).map((w, i) => (
        <T key={i} size={12} weight="600" color={w.weekend ? c.ink3 : c.ink2} center style={{ flex: 1 }}>
          {labels ? w.short : w.letter}
        </T>
      ))}
    </View>
  );
}

export function MonthGrid({
  state, y, m, today, selected, labels, rowMin, onDay, onSwipe, navKey, dir,
}: {
  state: State; y: number; m: number; today: string; selected: string | null; labels: boolean; rowMin: number;
  onDay: (iso: string) => void; onSwipe: (delta: 1 | -1) => void; navKey: number; dir: number;
}) {
  const { c } = useTheme();
  const reduceMotion = useReducedMotion();
  const weeks = useMemo(() => {
    const { lead, days, trail } = monthLayout(state, y, m);
    const cells: (CellModel | null)[] = [];
    for (let i = 0; i < lead; i++) cells.push(null);
    for (let d = 1; d <= days; d++) cells.push(cellModel(state, isoOf(y, m, d), today));
    for (let i = 0; i < trail; i++) cells.push(null);
    const rows: (CellModel | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [state, y, m, today]);

  // Month change animation.
  const tx = useSharedValue(0);
  const op = useSharedValue(1);
  useEffect(() => {
    if (!dir || reduceMotion) return;
    const ease = Easing.bezier(0, 0, 0.58, 1);
    tx.set(dir > 0 ? 16 : -16);
    op.set(0.35);
    tx.set(withTiming(0, { duration: 240, easing: ease }));
    op.set(withTiming(1, { duration: 240, easing: ease }));
  }, [navKey, dir, reduceMotion, tx, op]);
  const anim = useAnimatedStyle(() => ({ opacity: op.value, transform: [{ translateX: tx.value }] }));

  // Swipe: |dx| > 50, |dx| > 1.4·|dy|, under 700 ms. It doesn't count as a tap.
  const started = useRef(0);
  const swipe = usePanGesture({
    runOnJS: true,
    activeOffsetX: [-14, 14],
    failOffsetY: [-14, 14],
    onBegin: () => {
      started.current = Date.now();
    },
    onDeactivate: e => {
      const dx = e.translationX;
      const dy = e.translationY;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4 && Date.now() - started.current < 700) onSwipe(dx < 0 ? 1 : -1);
    },
  });

  return (
    <GestureDetector gesture={swipe}>
      <Animated.View style={anim} collapsable={false}>
        {weeks.map((row, r) => (
          <View key={r} style={{ flexDirection: 'row', minHeight: rowMin }}>
            {row.map((cell, i) =>
              cell ? (
                <DayCell key={cell.iso} model={cell} selected={selected === cell.iso} labels={labels} onPress={onDay} />
              ) : (
                <View key={`b${i}`} style={{ flex: 1, borderTopWidth: 1, borderTopColor: c.sep }} />
              ),
            )}
          </View>
        ))}
      </Animated.View>
    </GestureDetector>
  );
}

export function Legend() {
  const { c } = useTheme();
  const item = (sw: ReactNode, text: string) => (
    <View key={text} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {sw}
      <T size={12} color={c.ink2}>
        {text}
      </T>
    </View>
  );
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: c.sep, paddingTop: 12, paddingHorizontal: 2, flexDirection: 'row', flexWrap: 'wrap', rowGap: 8, columnGap: 14 }} accessibilityLabel="Legend">
      {item(<DayCircle size={14} leave="apl" />, 'All-purpose')}
      {item(<DayCircle size={14} leave="sick" />, 'Sick')}
      {item(<DayCircle size={14} leave="wfh" />, 'Work from home')}
      {item(<DayCircle size={14} office ring ringWidth={1.25} />, 'Office holiday')}
      {item(<DayCircle size={14} ring ringWidth={1.25} />, 'Added by you')}
      {item(<View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: c.ink3 }} />, 'Has a title')}
    </View>
  );
}
