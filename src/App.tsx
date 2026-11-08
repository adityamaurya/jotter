/* Root: providers, theme, boot (open the database), then onboarding -> sign in -> calendar. */

import { NavigationBar } from 'expo-navigation-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Appearance, AppState, Dimensions, Platform, StyleSheet, View, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CalendarScreen } from './calendar/CalendarScreen';
import { AppNavContext } from './calendar/Saving';
import { boot, getAppearance, getMode, getStore, type Appearance as Look } from './core';
import { Onboarding } from './onboarding/Onboarding';
import { SignIn } from './onboarding/SignIn';
import { DARK, LIGHT, ThemeContext } from './theme';
import { TextButton } from './ui/controls';
import { T } from './ui/T';
import { ToastProvider } from './ui/Toast';

SplashScreen.preventAutoHideAsync().catch(() => undefined);
SplashScreen.setOptions({ duration: 250, fade: true });

// Phones are portrait only; tablets (shortest side >= 600 pt) rotate.
if (Platform.OS !== 'web') {
  const { width, height } = Dimensions.get('screen');
  if (Math.min(width, height) < 600) ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined);
}

type Phase = 'boot' | 'error' | 'onboarding' | 'signin' | 'app';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <Root />
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Root() {
  const system = useColorScheme();
  const [phase, setPhase] = useState<Phase>('boot');
  const [appearance, setAppearance] = useState<Look>('auto');
  const [error, setError] = useState('');
  const [fromOnboarding, setFromOnboarding] = useState(false);

  const start = useCallback(() => {
    boot()
      .then(() => {
        setAppearance(getAppearance());
        const s = getStore();
        setPhase(!s.getMeta('onboarded') ? 'onboarding' : getMode() ? 'app' : 'signin');
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
        setPhase('error');
        SplashScreen.hide();
      });
  }, []);
  useEffect(start, [start]);

  // The appearance choice also drives native UI (alerts, keyboards).
  useEffect(() => {
    if (Platform.OS === 'web') return;
    try {
      Appearance.setColorScheme(appearance === 'auto' ? 'unspecified' : appearance);
    } catch {
      /* older runtimes */
    }
  }, [appearance]);
  const dark = appearance === 'dark' || (appearance === 'auto' && system === 'dark');
  const theme = useMemo(() => ({ dark, c: dark ? DARK : LIGHT }), [dark]);
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.c.bg).catch(() => undefined);
  }, [theme]);

  // Save anything pending as soon as the app leaves the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => {
      if (s !== 'active' && phase !== 'boot' && phase !== 'error') void getStore().flushNow();
    });
    return () => sub.remove();
  }, [phase]);

  const nav = useMemo(() => ({ toSignIn: () => setPhase('signin') }), []);
  const onAppearance = (a: Look) => {
    setAppearance(a);
    getStore().setMeta('appearance', a === 'auto' ? null : a);
  };

  if (phase === 'boot') return null; // the native splash screen stays up

  return (
    <ThemeContext.Provider value={theme}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      {Platform.OS === 'android' ? <NavigationBar style={dark ? 'light' : 'dark'} /> : null}
      <AppNavContext.Provider value={nav}>
        <ToastProvider>
          <View style={{ flex: 1, backgroundColor: theme.c.bg }} onLayout={() => SplashScreen.hide()}>
            {phase === 'onboarding' ? (
              <Animated.View key="onboarding" exiting={FadeOut.duration(200)} style={StyleSheet.absoluteFill}>
                <Onboarding
                  onDone={() => {
                    getStore().setMeta('onboarded', '1');
                    setFromOnboarding(true);
                    setPhase('signin');
                  }}
                />
              </Animated.View>
            ) : null}
            {phase === 'signin' ? (
              <Animated.View key="signin" entering={FadeIn.duration(260)} exiting={FadeOut.duration(200)} style={StyleSheet.absoluteFill}>
                <SignIn onDone={() => setPhase('app')} onBack={fromOnboarding ? () => setPhase('onboarding') : undefined} />
              </Animated.View>
            ) : null}
            {phase === 'app' ? (
              <Animated.View key="app" entering={FadeIn.duration(260)} style={StyleSheet.absoluteFill}>
                <CalendarScreen appearance={appearance} onAppearance={onAppearance} />
              </Animated.View>
            ) : null}
            {phase === 'error' ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
                <T size={20} weight="600" center>
                  Couldn’t open your calendar
                </T>
                <T size={15} color={theme.c.ink2} center>
                  {error}
                </T>
                <TextButton label="Try again" onPress={() => { setPhase('boot'); start(); }} />
              </View>
            ) : null}
          </View>
        </ToastProvider>
      </AppNavContext.Provider>
    </ThemeContext.Provider>
  );
}
