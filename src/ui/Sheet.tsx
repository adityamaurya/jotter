/* The one sheet: a bottom sheet on phones, a right-side panel from 960 pt.
   Scrim fades in 280 ms (tap = Cancel); the sheet slides in 340 ms on cubic-bezier(.32,.72,0,1).
   Drag the grabber or header down > 90 pt (or flick it) to cancel; Android back also cancels.
   It rides above the keyboard (react-native-keyboard-controller, frame-synced on both platforms)
   and scrolls a focused input into view. Content swaps in place when the sheet changes (e.g. Settings ->
   a holiday's day sheet), without closing. */

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, View, useWindowDimensions, type ScrollViewInstance, type ViewInstance } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { useTheme } from '../theme';
import { TextButton } from './controls';
import { T } from './T';

export type SheetButton = { label: string; onPress: () => void; strong?: boolean };
export type SheetContent = {
  /** Changes when a different sheet is shown (resets the scroll position). */
  id: string;
  left?: SheetButton | null;
  title?: string;
  right?: SheetButton | null;
  body: ReactNode;
};

const EASE = Easing.bezier(0.32, 0.72, 0, 1);
const PANEL_W = 400;

type Reveal = (target: ViewInstance | null) => void;
const SheetScrollContext = createContext<Reveal>(() => undefined);
/** Inside a sheet: scroll a focused input into view once the keyboard is up. */
export const useRevealInSheet = () => useContext(SheetScrollContext);

export function Sheet({ content, onDismiss, wide, lift, compact }: { content: SheetContent | null; onDismiss: () => void; wide: boolean; lift?: ReactNode; compact?: boolean }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const panel = wide && !compact;
  const open = !!content;

  const [shown, setShown] = useState<SheetContent | null>(content);
  const [mounted, setMounted] = useState(open);
  const progress = useSharedValue(0);
  const scrim = useSharedValue(0);
  const drag = useSharedValue(0);
  const sheetH = useSharedValue(H);
  const { height: kb } = useReanimatedKeyboardAnimation(); // 0 .. -keyboardHeight

  const dismissRef = useRef(onDismiss);
  useLayoutEffect(() => {
    dismissRef.current = onDismiss;
  });
  const dismiss = useCallback(() => dismissRef.current(), []);

  // Keep the last content on screen while the sheet animates out; drop it once it's gone.
  if (content && content !== shown) setShown(content);
  if (open && !mounted) setMounted(true);
  if (!open && !mounted && shown) setShown(null);

  useEffect(() => {
    if (!mounted) return;
    const d = reduceMotion ? 0 : 1;
    if (open) {
      drag.set(0);
      progress.set(withTiming(1, { duration: 340 * d, easing: EASE }));
      scrim.set(withTiming(1, { duration: 280 * d }));
    } else {
      scrim.set(withTiming(0, { duration: 280 * d }));
      progress.set(
        withTiming(0, { duration: 340 * d, easing: EASE }, finished => {
          if (!finished) return;
          sheetH.set(H); // the next sheet starts fully off-screen, whatever its height
          scheduleOnRN(setMounted, false);
        }),
      );
    }
  }, [open, mounted, reduceMotion, drag, progress, scrim, sheetH, H]);

  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      dismiss();
      return true;
    });
    return () => sub.remove();
  }, [open, dismiss]);

  // Scroll a focused field into view.
  const scrollRef = useRef<ScrollViewInstance>(null);
  const innerRef = useRef<ViewInstance>(null);
  const viewH = useRef(0);
  const scrollY = useRef(0);
  const reveal = useCallback<Reveal>(target => {
    setTimeout(() => {
      const inner = innerRef.current;
      if (!target || !inner) return;
      target.measureLayout(inner, (_x, y, _w, h) => {
        const top = scrollY.current;
        const bottom = top + viewH.current;
        if (y + h + 16 > bottom) scrollRef.current?.scrollTo({ y: y + h + 16 - viewH.current, animated: true });
        else if (y - 16 < top) scrollRef.current?.scrollTo({ y: Math.max(0, y - 16), animated: true });
      });
    }, 320);
  }, []);
  const lastId = useRef<string | null>(null);
  useEffect(() => {
    if (shown && shown.id !== lastId.current) {
      lastId.current = shown.id;
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }
  }, [shown]);

  const pan = usePanGesture({
    enabled: !panel,
    activeOffsetY: 8,
    onUpdate: e => {
      'worklet';
      drag.set(Math.max(0, e.translationY));
    },
    onDeactivate: e => {
      'worklet';
      const dy = drag.get();
      if (dy > 90 || (e.velocityY > 1000 && dy > 12)) scheduleOnRN(dismiss);
      else drag.set(withSpring(0, { damping: 28, stiffness: 320 }));
    },
  });

  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrim.value * (panel ? 0.35 : 1) }));
  const sheetW = Math.min(W, 640);
  const sheetStyle = useAnimatedStyle(() => {
    if (panel) {
      return { bottom: 16 - kb.value, transform: [{ translateX: (1 - progress.value) * (PANEL_W + 32) }] };
    }
    return {
      maxHeight: H * 0.92 + kb.value,
      transform: [{ translateY: (1 - progress.value) * (sheetH.value + 40) + drag.value + kb.value }],
    };
  });

  if (!mounted || !shown) return null;

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: panel ? 12 : 4, paddingBottom: 4, paddingHorizontal: 8 }}>
      <View style={{ flex: 1, alignItems: 'flex-start' }}>
        {shown.left ? <TextButton label={shown.left.label} onPress={shown.left.onPress} strong={shown.left.strong} /> : <TextButton label=" " onPress={() => undefined} hidden />}
      </View>
      <T size={17} weight="600" numberOfLines={1} accessibilityRole="header" style={{ flexShrink: 1 }}>
        {shown.title ?? ''}
      </T>
      <View style={{ flex: 1, alignItems: 'flex-end' }}>
        {shown.right ? <TextButton label={shown.right.label} onPress={shown.right.onPress} strong={shown.right.strong} /> : <TextButton label=" " onPress={() => undefined} hidden />}
      </View>
    </View>
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? 'box-none' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }, scrimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} accessibilityRole="button" accessibilityLabel="Close" />
      </Animated.View>
      {lift}
      <Animated.View
        accessibilityViewIsModal
        onLayout={e => {
          sheetH.set(e.nativeEvent.layout.height);
        }}
        style={[
          panel
            ? { position: 'absolute', top: 16 + insets.top, right: 16 + insets.right, width: PANEL_W, borderRadius: 18 }
            : {
                position: 'absolute',
                bottom: 0,
                left: (W - sheetW) / 2,
                width: sheetW,
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
                paddingBottom: insets.bottom,
              },
          { backgroundColor: c.sheet, boxShadow: c.shadow },
          sheetStyle,
        ]}
      >
        {panel ? (
          header
        ) : (
          <GestureDetector gesture={pan}>
            <View collapsable={false}>
              <View style={{ alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginTop: 6, backgroundColor: c.fill2 }} />
              {header}
            </View>
          </GestureDetector>
        )}
        <SheetScrollContext.Provider value={reveal}>
          <ScrollView
            ref={scrollRef}
            style={{ flexGrow: panel ? 1 : 0, flexShrink: 1 }}
            contentContainerStyle={{ paddingTop: 2, paddingHorizontal: 16, paddingBottom: 22 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            onLayout={e => {
              viewH.current = e.nativeEvent.layout.height;
            }}
            onScroll={e => {
              scrollY.current = e.nativeEvent.contentOffset.y;
            }}
            scrollEventThrottle={32}
          >
            <View ref={innerRef} collapsable={false}>
              {shown.body}
            </View>
          </ScrollView>
        </SheetScrollContext.Provider>
      </Animated.View>
    </View>
  );
}
