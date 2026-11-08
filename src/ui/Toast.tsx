import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { T } from './T';

const ToastContext = createContext<(message: string, ms?: number) => void>(() => undefined);
export const useToast = () => useContext(ToastContext);

/** Bottom-centre toast: fades and slides up 16, hides after 3.4 s. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [message, setMessage] = useState('');
  const v = useSharedValue(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (m: string, ms = 3400) => {
      setMessage(m);
      v.set(withTiming(1, { duration: 200 }));
      AccessibilityInfo.announceForAccessibility(m);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        v.set(withTiming(0, { duration: 200 }));
      }, ms);
    },
    [v],
  );

  const style = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ translateY: (1 - v.value) * 16 }] }));

  return (
    <ToastContext.Provider value={show}>
      {children}
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 20 + insets.bottom, alignItems: 'center' }}>
        <Animated.View style={[{ maxWidth: Math.min(420, width - 32), backgroundColor: c.ink, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14 }, style]}>
          <T size={14} color={c.bg} center>
            {message}
          </T>
        </Animated.View>
      </View>
    </ToastContext.Provider>
  );
}
