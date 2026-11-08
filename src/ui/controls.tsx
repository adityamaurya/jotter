/* Buttons and controls, drawn the same on iOS and Android (custom switch on both, as in the web app). */

import * as Haptics from 'expo-haptics';
import { useEffect, useState, type ReactNode } from 'react';
import { Platform, Pressable, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTheme } from '../theme';
import { ChevronLeft, ChevronRight, Minus, Plus } from './icons';
import { T } from './T';

/** Light selection haptic (choosing a leave / holiday option, ± steppers). */
export function tick() {
  if (Platform.OS === 'web') return;
  Haptics.selectionAsync().catch(() => undefined);
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Pressable that scales to 0.97 while pressed (150 ms), like the web's :active. */
export function PressScale({ style, children, scaleTo = 0.97, ...rest }: Omit<PressableProps, 'style' | 'children'> & { style?: StyleProp<ViewStyle>; children: ReactNode; scaleTo?: number }) {
  const s = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <AnimatedPressable
      {...rest}
      onPressIn={e => {
        s.set(withTiming(scaleTo, { duration: 150 }));
        rest.onPressIn?.(e);
      }}
      onPressOut={e => {
        s.set(withTiming(1, { duration: 150 }));
        rest.onPressOut?.(e);
      }}
      style={[style, anim]}
    >
      {children}
    </AnimatedPressable>
  );
}

/** Round icon button. 'fill' = 36 round grey, 'plain' = 36 no background (accent icon 22), 'sm' = 28 round grey. */
export function IconButton({ kind = 'fill', dir, icon, onPress, label }: { kind?: 'fill' | 'plain' | 'sm'; dir?: 'left' | 'right'; icon?: (color: string, size: number) => ReactNode; onPress: () => void; label: string }) {
  const { c } = useTheme();
  const size = kind === 'sm' ? 28 : 36;
  const iconSize = kind === 'plain' ? 22 : kind === 'sm' ? 14 : 18;
  const color = kind === 'plain' ? c.accent : c.ink;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={kind === 'sm' ? 8 : 4}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: kind === 'plain' ? (pressed ? c.fill : 'transparent') : pressed ? c.fill2 : c.fill,
      })}
    >
      {icon ? icon(color, iconSize) : dir === 'left' ? <ChevronLeft size={iconSize} color={color} /> : <ChevronRight size={iconSize} color={color} />}
    </Pressable>
  );
}

/** Text button (17 pt accent). */
export function TextButton({ label, onPress, strong, danger, size = 17, disabled, hidden }: { label: string; onPress: () => void; strong?: boolean; danger?: boolean; size?: number; disabled?: boolean; hidden?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || hidden}
      accessibilityRole="button"
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
      hitSlop={8}
      style={({ pressed }) => ({ paddingVertical: 6, paddingHorizontal: 6, borderRadius: 8, opacity: hidden ? 0 : pressed ? 0.5 : disabled ? 0.4 : 1 })}
    >
      <T size={size} weight={strong ? '600' : undefined} color={danger ? c.danger : c.accent} numberOfLines={1}>
        {label}
      </T>
    </Pressable>
  );
}

/** iOS-style switch on both platforms: 51×31 track, 27 thumb, 200 ms. */
export function Switch({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  const { c } = useTheme();
  const p = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    p.set(withTiming(value ? 1 : 0, { duration: 200 }));
  }, [value, p]);
  const off = c.fill2;
  const on = c.on;
  const track = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(p.value, [0, 1], [off, on]) }));
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: p.value * 20 }] }));
  return (
    <Pressable onPress={() => onChange(!value)} accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: value }} hitSlop={6}>
      <Animated.View style={[{ width: 51, height: 31, borderRadius: 15.5 }, track]}>
        <Animated.View
          style={[
            { position: 'absolute', top: 2, left: 2, width: 27, height: 27, borderRadius: 13.5, backgroundColor: '#FFFFFF', boxShadow: '0px 2px 6px rgba(0,0,0,0.22)' },
            thumb,
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}

/** Segmented control. Segments share the width of the widest one, like the web's inline-grid. */
export function Segmented<V extends string | number>({ options, value, onChange, label }: { options: [V, string][]; value: V; onChange: (v: V) => void; label: string }) {
  const { c } = useTheme();
  const [w, setW] = useState(0);
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', backgroundColor: c.fill, borderRadius: 9, padding: 2, gap: 2 }}>
      {options.map(([v, text]) => {
        const on = v === value;
        return (
          <Pressable
            key={String(v)}
            onPress={() => onChange(v)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, checked: on }}
            onLayout={e => {
              const width = Math.ceil(e.nativeEvent.layout.width);
              setW(prev => (width > prev ? width : prev));
            }}
            style={{
              minWidth: w || undefined,
              alignItems: 'center',
              paddingVertical: 6,
              paddingHorizontal: 12,
              borderRadius: 7,
              backgroundColor: on ? c.segOn : 'transparent',
              boxShadow: on ? '0px 1px 3px rgba(0,0,0,0.14)' : undefined,
            }}
          >
            <T size={13} weight={on ? '600' : '500'}>
              {text}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

/** − value + stepper (Settings). */
export function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (v: number) => void; label: string }) {
  const { c } = useTheme();
  const btn = (d: number) => (
    <Pressable
      onPress={() => {
        const next = Math.min(max, Math.max(min, value + d));
        if (next !== value) {
          tick();
          onChange(next);
        }
      }}
      accessibilityRole="button"
      accessibilityLabel={d < 0 ? `Fewer: ${label}` : `More: ${label}`}
      hitSlop={4}
      style={({ pressed }) => ({ width: 34, height: 32, borderRadius: 8, backgroundColor: pressed ? c.fill2 : c.fill, alignItems: 'center', justifyContent: 'center' })}
    >
      {d < 0 ? <Minus size={14} color={c.ink} /> : <Plus size={14} color={c.ink} />}
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }} accessibilityValue={{ now: value, min, max }}>
      {btn(-1)}
      <T weight="600" tabular center style={{ minWidth: 34 }}>
        {value}
      </T>
      {btn(1)}
    </View>
  );
}
