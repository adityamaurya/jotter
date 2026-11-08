/* Sign in with Google (to back up and sync), or use the calendar on this device only.
   The second option keeps the app usable without an account, which App Store guideline 5.1.1(v) requires
   for apps whose core features don't depend on one. */

import { useEffect, useState } from 'react';
import { BackHandler, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { chooseLocal, connectGoogle, getSync } from '../core';
import { signInMessage } from '../calendar/Saving';
import { googleAuth } from '../sync/auth';
import { useTheme } from '../theme';
import { TextButton } from '../ui/controls';
import { T } from '../ui/T';
import { useToast } from '../ui/Toast';
import { GoogleButton } from './Buttons';
import { Mascot } from './Mascot';

export function SignIn({ onDone, onBack }: { onDone: () => void; onBack?: () => void }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const toast = useToast();
  const [busy, setBusy] = useState<null | 'google' | 'restoring'>(null);

  useEffect(() => {
    if (!onBack) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (busy) return true;
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack, busy]);

  async function google() {
    setBusy('google');
    const r = await googleAuth.signIn();
    if (!r.ok) {
      setBusy(null);
      const msg = signInMessage(r.reason);
      if (msg) toast(msg);
      return;
    }
    // Bring back anything already in this account's Google Drive before showing the calendar.
    setBusy('restoring');
    connectGoogle(r.account);
    await getSync().syncNow(15_000);
    onDone();
  }

  const artSize = Math.min(width * 0.56, height * 0.32, 280);
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top, paddingBottom: Math.max(24, insets.bottom + 12), paddingHorizontal: 24, alignItems: 'center' }}>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Mascot pose="relax" size={artSize} />
      </View>
      <View style={{ width: '100%', maxWidth: 420, gap: 10, alignItems: 'center' }}>
        <T size={28} weight="700" em={-0.02} lh={1.15} center accessibilityRole="header">
          Welcome to Leave Calendar
        </T>
        <T size={17} lh={1.4} color={c.ink2} center>
          Sign in with Google to back up your calendar and keep it in sync across your phones.
        </T>
        <View style={{ width: '100%', marginTop: 18 }}>
          <GoogleButton onPress={google} busy={!!busy} label={busy === 'restoring' ? 'Getting your calendar…' : 'Continue with Google'} />
        </View>
        <TextButton
          label="Use on this device only"
          disabled={!!busy}
          onPress={() => {
            chooseLocal();
            onDone();
          }}
        />
        <T size={12} lh={1.45} color={c.ink2} center style={{ marginTop: 6 }}>
          Your calendar is saved in a private app folder in your own Google Drive. Leave Calendar has no servers and can’t see your other files.
        </T>
      </View>
    </View>
  );
}
