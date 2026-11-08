/* Three onboarding pages, swipeable, then the sign-in screen. */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BackHandler, View, useWindowDimensions } from 'react-native';
import Animated, { Extrapolation, interpolate, interpolateColor, useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, leaveColor } from '../theme';
import { DayCircle } from '../ui/Circle';
import { TextButton } from '../ui/controls';
import { T } from '../ui/T';
import { PrimaryButton } from './Buttons';
import { Mascot } from './Mascot';
import type { MascotPose } from './mascot';

type Page = { pose: MascotPose; title: string; body: string; art?: 'days' | 'tiles' };
const PAGES: Page[] = [
  {
    pose: 'wave',
    art: 'days',
    title: 'Every day off, at a glance',
    body: 'Log all-purpose leave, sick days and work from home on one calendar. Office holidays and weekends are already marked.',
  },
  {
    pose: 'point',
    art: 'tiles',
    title: 'Balances that add up',
    body: 'Credits, carry-over and lapses are worked out for you, month by month. Tap a balance to match your HR portal.',
  },
  {
    pose: 'cloud',
    title: 'Safe in your Google account',
    body: 'Your calendar backs up to your own Google Drive and syncs across your phones. Switch phones and pick up where you left off.',
  },
];

function DaysArt() {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 10, backgroundColor: c.sheet, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 16 }}>
      <DayCircle size={38} fontSize={17} label={12} leave="apl" />
      <DayCircle size={38} fontSize={17} label={13} leave="sick" />
      <DayCircle size={38} fontSize={17} label={14} office ring />
      <DayCircle size={38} fontSize={17} label={15} leave="wfh" />
      <DayCircle size={38} fontSize={17} label={16} ring />
    </View>
  );
}

function TilesArt() {
  const { c } = useTheme();
  const tile = (k: 'apl' | 'sick' | 'wfh', label: string, n: string, cap: string) => (
    <View key={k} style={{ width: 92, borderRadius: 14, backgroundColor: c.fill, paddingTop: 10, paddingBottom: 9, paddingHorizontal: 10, gap: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: leaveColor(c, k) }} />
        <T size={12} weight="600" color={c.ink2}>
          {label}
        </T>
      </View>
      <T size={26} weight="600" em={-0.02} lh={1.15} tabular>
        {n}
      </T>
      <T size={11} color={c.ink2} numberOfLines={1}>
        {cap}
      </T>
    </View>
  );
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {tile('apl', 'APL', '11', '+2 / month')}
      {tile('sick', 'Sick', '11', 'of 15 / year')}
      {tile('wfh', 'WFH', '2', 'of 2 / month')}
    </View>
  );
}

function PageView({ page, index, x, width, artSize }: { page: Page; index: number; x: SharedValue<number>; width: number; artSize: number }) {
  const { c } = useTheme();
  const parallax = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(x.value, [(index - 1) * width, index * width, (index + 1) * width], [width * 0.25, 0, -width * 0.25], Extrapolation.CLAMP) }],
  }));
  return (
    <View style={{ width, flex: 1, paddingHorizontal: 24, alignItems: 'center' }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18 }}>
        <Animated.View style={parallax}>
          <Mascot pose={page.pose} size={artSize} />
        </Animated.View>
        {page.art === 'days' ? <DaysArt /> : page.art === 'tiles' ? <TilesArt /> : null}
      </View>
      <View style={{ maxWidth: 420, alignItems: 'center', gap: 10, paddingBottom: 8 }}>
        <T size={28} weight="700" em={-0.02} lh={1.15} center accessibilityRole="header">
          {page.title}
        </T>
        <T size={17} lh={1.4} color={c.ink2} center>
          {page.body}
        </T>
      </View>
    </View>
  );
}

function Dot({ i, x, width }: { i: number; x: SharedValue<number>; width: number }) {
  const { c } = useTheme();
  const on = c.accent;
  const off = c.fill2;
  const style = useAnimatedStyle(() => {
    const d = Math.min(1, Math.abs(x.value / width - i));
    return { width: 7 + 13 * (1 - d), backgroundColor: interpolateColor(d, [0, 1], [on, off]) };
  });
  return <Animated.View style={[{ height: 7, borderRadius: 3.5 }, style]} />;
}

export function Onboarding({ onDone }: { onDone: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const ref = useAnimatedRef<Animated.ScrollView>();
  const x = useSharedValue(0);
  const [page, setPage] = useState(0);
  const pageRef = useRef(0);
  useLayoutEffect(() => {
    pageRef.current = page;
  });
  const onScroll = useAnimatedScrollHandler(e => {
    x.set(e.contentOffset.x);
  });
  const goTo = (i: number) => {
    ref.current?.scrollTo({ x: i * width, animated: true });
    setPage(i);
  };
  const last = PAGES.length - 1;

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (pageRef.current === 0) return false;
      goTo(pageRef.current - 1);
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width]);

  const artSize = Math.min(width * 0.52, height * 0.28, 260);
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 12, flexDirection: 'row', justifyContent: 'flex-end', minHeight: insets.top + 48 }}>
        {page < last ? <TextButton label="Skip" onPress={onDone} /> : null}
      </View>
      <Animated.ScrollView
        ref={ref}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={e => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
        style={{ flex: 1 }}
      >
        {PAGES.map((p, i) => (
          <PageView key={i} page={p} index={i} x={x} width={width} artSize={artSize} />
        ))}
      </Animated.ScrollView>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 7, paddingVertical: 20 }} accessibilityLabel={`Page ${page + 1} of ${PAGES.length}`}>
        {PAGES.map((_, i) => (
          <Dot key={i} i={i} x={x} width={width} />
        ))}
      </View>
      <View style={{ paddingHorizontal: 24, paddingBottom: Math.max(24, insets.bottom + 12), alignItems: 'center' }}>
        <View style={{ width: '100%', maxWidth: 420 }}>
          <PrimaryButton label={page < last ? 'Next' : 'Get started'} onPress={() => (page < last ? goTo(page + 1) : onDone())} />
        </View>
      </View>
    </View>
  );
}
