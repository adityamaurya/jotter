import { useEffect, useMemo } from 'react';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { SvgXml } from 'react-native-svg';
import { useTheme } from '../theme';
import { mascotSvg, type MascotPose } from './mascot';

/** Pip, gently bobbing (still when Reduce Motion is on). */
export function Mascot({ pose, size, bob = true }: { pose: MascotPose; size: number; bob?: boolean }) {
  const { dark } = useTheme();
  const xml = useMemo(() => mascotSvg(pose, dark), [pose, dark]);
  const reduceMotion = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (!bob || reduceMotion) return;
    t.set(withRepeat(withTiming(1, { duration: 1700, easing: Easing.inOut(Easing.sin) }), -1, true));
    return () => cancelAnimation(t);
  }, [bob, reduceMotion, t]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -6 * t.value }] }));
  return (
    <Animated.View style={[{ width: size, height: size }, style]} accessible accessibilityRole="image" accessibilityLabel="Pip, the Leave Calendar mascot">
      <SvgXml xml={xml} width={size} height={size} />
    </Animated.View>
  );
}
