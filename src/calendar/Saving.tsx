/* Settings -> SAVING: Google account sync, manual backup files, sign out, delete backup. */

import { createContext, useContext, useState } from 'react';
import { ActivityIndicator, Alert, Platform, View } from 'react-native';
import { DEVICE_META, boundAccount, connectGoogle, getMode, getStore, getSync, signOut, useCalendar, useSyncStatus } from '../core';
import { exportBackup, pickBackup } from '../data/backup';
import { googleAuth, type SignInFailure } from '../sync/auth';
import { useTheme } from '../theme';
import { Cell, Foot, Group, GroupLabel } from '../ui/group';
import { T } from '../ui/T';
import { useToast } from '../ui/Toast';

/** Lets screens send the app back to the sign-in screen (after signing out). */
export const AppNavContext = createContext<{ toSignIn: () => void }>({ toSignIn: () => undefined });

export function signInMessage(reason: SignInFailure): string | null {
  switch (reason) {
    case 'cancelled':
    case 'in-progress':
      return null;
    case 'no-drive-access':
      return 'Leave Calendar needs permission to keep its backup in your Google Drive.';
    case 'unavailable':
      return Platform.OS === 'web' ? 'Google sign-in isn’t available in the web preview.' : 'Google sign-in isn’t available in this build.';
    case 'play-services':
      return 'Google Play services are needed to sign in with Google.';
    default:
      return 'Couldn’t sign in to Google. Check your connection, then try again.';
  }
}

export function ago(ms: number | null, now = Date.now()): string {
  if (!ms) return 'Not synced yet';
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return 'Synced just now';
  if (s < 3600) return `Synced ${Math.round(s / 60)} min ago`;
  if (s < 86400) return `Synced ${Math.round(s / 3600)} h ago`;
  const d = new Date(ms);
  return `Synced ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

function TapRow({ label, onPress, danger, busy }: { label: string; onPress: () => void; danger?: boolean; busy?: boolean }) {
  const { c } = useTheme();
  return (
    <Cell onPress={busy ? undefined : onPress} label={label}>
      <T size={16} color={danger ? c.danger : c.accent} style={{ flex: 1 }}>
        {label}
      </T>
      {busy ? <ActivityIndicator size="small" color={c.ink2} /> : null}
    </Cell>
  );
}

export function SavingGroup() {
  const { c } = useTheme();
  const toast = useToast();
  const nav = useContext(AppNavContext);
  const state = useCalendar();
  const status = useSyncStatus();
  const mode = getMode();
  const [busy, setBusy] = useState<string | null>(null);

  async function signIn() {
    setBusy('signin');
    try {
      const r = await googleAuth.signIn();
      if (!r.ok) {
        const msg = signInMessage(r.reason);
        if (msg) toast(msg);
        return;
      }
      const bound = boundAccount();
      if (bound && bound.id !== r.account.id) {
        Alert.alert(
          'Switch Google account?',
          `This device has the calendar from ${bound.email}. It stays in that account’s Google Drive and is removed from this device.`,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => void googleAuth.signOut() },
            {
              text: 'Switch',
              style: 'destructive',
              onPress: async () => {
                getSync().stop();
                await getStore().wipe(DEVICE_META);
                connectGoogle(r.account);
              },
            },
          ],
        );
        return;
      }
      connectGoogle(r.account);
    } finally {
      setBusy(null);
    }
  }

  async function doExport() {
    try {
      await exportBackup(state);
    } catch {
      toast(Platform.OS === 'web' ? 'Export isn’t available in the web preview.' : 'Couldn’t export the backup.');
    }
  }

  async function doImport() {
    let res: Awaited<ReturnType<typeof pickBackup>>;
    try {
      res = await pickBackup();
    } catch {
      toast('That file isn’t a Leave Calendar backup.');
      return;
    }
    if (!res) return;
    if ('error' in res) {
      toast('That file isn’t a Leave Calendar backup.');
      return;
    }
    const next = res.state;
    Alert.alert('Replace everything in the calendar with this backup?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Replace', style: 'destructive', onPress: () => void getStore().commit(next) },
    ]);
  }

  function confirmSignOut() {
    Alert.alert('Sign out?', 'Your calendar stays in your Google account and is removed from this device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          setBusy('signout');
          const safe = await getSync().finalSync();
          setBusy(null);
          const go = async () => {
            await signOut();
            nav.toSignIn();
          };
          if (safe) return go();
          Alert.alert('Some changes aren’t backed up yet', 'If you sign out now, they’ll be lost. Check your connection to back them up first.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign out anyway', style: 'destructive', onPress: () => void go() },
          ]);
        },
      },
    ]);
  }

  function confirmDelete() {
    Alert.alert('Delete your backup?', 'This removes your calendar from your Google account and from this device. You can’t undo this.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusy('delete');
          try {
            await getSync().deleteBackup();
            await signOut({ revoke: true });
            nav.toSignIn();
          } catch {
            toast('Couldn’t delete the backup. Check your connection, then try again.');
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  }

  const needsSignIn = status.state === 'signin' || status.state === 'permission';
  return (
    <View>
      <GroupLabel>Saving</GroupLabel>
      {mode === 'google' && status.account ? (
        <>
          <Group>
            <Cell>
              <T style={{ flex: 1 }}>Saved to your Google account and synced across your devices.</T>
            </Cell>
            <Cell>
              <View style={{ flex: 1, minWidth: 0 }}>
                <T size={16} numberOfLines={1}>
                  {status.account.email}
                </T>
                <T size={13} color={c.ink2}>
                  {status.state === 'syncing' ? 'Syncing…' : needsSignIn ? 'Sign in again to keep syncing' : ago(status.lastSyncAt)}
                </T>
              </View>
            </Cell>
            {needsSignIn ? <TapRow label="Sign in again" onPress={signIn} busy={busy === 'signin'} /> : null}
            <TapRow label="Export backup" onPress={doExport} />
            <TapRow label="Import backup" onPress={doImport} />
            <TapRow label="Sign out" danger onPress={confirmSignOut} busy={busy === 'signout'} />
          </Group>
          <Foot>Your calendar is kept in a private app folder in your Google Drive that only Leave Calendar can open. Sign in on another phone to get it back.</Foot>
          <Group style={{ marginTop: 18 }}>
            <TapRow label="Delete backup" danger onPress={confirmDelete} busy={busy === 'delete'} />
          </Group>
        </>
      ) : (
        <>
          <Group>
            <Cell>
              <T style={{ flex: 1 }}>Saved on this device.</T>
            </Cell>
            <TapRow label="Sign in with Google" onPress={signIn} busy={busy === 'signin'} />
            <TapRow label="Export backup" onPress={doExport} />
            <TapRow label="Import backup" onPress={doImport} />
          </Group>
          <Foot>Sign in with Google to back up your calendar to your Google account and keep it in sync across your phones.</Foot>
        </>
      )}
    </View>
  );
}
