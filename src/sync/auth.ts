/* Google sign-in, used only to reach the user's own Google Drive app folder (scope drive.appdata).

   Wraps @react-native-google-signin/google-signin (free edition). On Android it still uses Google's legacy
   Sign-In SDK, which Google has deprecated in favour of Credential Manager + AuthorizationClient. Everything
   the app needs from Google goes through this one file, so moving to another implementation later
   (the library's paid Universal edition, or a small AuthorizationClient module) means editing only this file.

   The native module isn't in Expo Go: the require below fails there and sign-in reports "unavailable". */

import { Platform } from 'react-native';
import { DRIVE_APPDATA_SCOPE } from './drive';

export type Account = { id: string; email: string; name: string | null; photo: string | null };
export type SignInFailure = 'cancelled' | 'no-drive-access' | 'unavailable' | 'play-services' | 'in-progress' | 'error';
export type SignInResult = { ok: true; account: Account } | { ok: false; reason: SignInFailure; message?: string };
export type RestoreResult = { status: 'ok'; account: Account } | { status: 'signed-out' } | { status: 'error' };

/** Thrown when there's no usable Google session (sign in again) or the module is missing. */
export class AuthError extends Error {
  code: 'signin' | 'unavailable';
  constructor(code: 'signin' | 'unavailable', message: string) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

type GoogleModule = typeof import('@react-native-google-signin/google-signin');
type GoogleUser = import('@react-native-google-signin/google-signin').User;
let mod: GoogleModule | null | undefined;

function google(): GoogleModule | null {
  if (mod !== undefined) return mod;
  try {
    // Loaded lazily so a build without the native module (Expo Go, web) still runs.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require('@react-native-google-signin/google-signin') as GoogleModule;
    m.GoogleSignin.configure({
      scopes: [DRIVE_APPDATA_SCOPE],
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || undefined,
      iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || undefined,
    });
    mod = m;
  } catch (err) {
    if (__DEV__) console.info('[auth] Google sign-in is not available in this build', err);
    mod = null;
  }
  return mod;
}

const toAccount = (u: GoogleUser): Account => ({ id: u.user.id, email: u.user.email, name: u.user.name, photo: u.user.photo });
const hasDrive = (u: GoogleUser) => u.scopes.includes(DRIVE_APPDATA_SCOPE);
let lastToken: string | null = null;

export const googleAuth = {
  available(): boolean {
    return google() !== null;
  },

  async signIn(): Promise<SignInResult> {
    const m = google();
    if (!m) return { ok: false, reason: 'unavailable' };
    const { GoogleSignin, statusCodes, isErrorWithCode } = m;
    try {
      if (Platform.OS === 'android') await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const res = await GoogleSignin.signIn();
      if (res.type !== 'success') return { ok: false, reason: 'cancelled' };
      let user = res.data;
      if (!hasDrive(user)) {
        // The person unticked the Drive permission on Google's consent screen: ask once more.
        const more = await GoogleSignin.addScopes({ scopes: [DRIVE_APPDATA_SCOPE] });
        if (!more || more.type !== 'success' || !hasDrive(more.data)) {
          await GoogleSignin.signOut().catch(() => undefined);
          return { ok: false, reason: 'no-drive-access' };
        }
        user = more.data;
      }
      return { ok: true, account: toAccount(user) };
    } catch (err) {
      if (isErrorWithCode(err)) {
        if (err.code === statusCodes.SIGN_IN_CANCELLED) return { ok: false, reason: 'cancelled' };
        if (err.code === statusCodes.IN_PROGRESS) return { ok: false, reason: 'in-progress' };
        if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) return { ok: false, reason: 'play-services' };
      }
      return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
    }
  },

  /** Restore the previous session without UI (app start). Network trouble is reported as 'error', not signed out. */
  async restore(): Promise<RestoreResult> {
    const m = google();
    if (!m) return { status: 'signed-out' };
    try {
      const res = await m.GoogleSignin.signInSilently();
      if (res.type !== 'success') return { status: 'signed-out' };
      return hasDrive(res.data) ? { status: 'ok', account: toAccount(res.data) } : { status: 'signed-out' };
    } catch {
      return { status: 'error' };
    }
  },

  /** A Google access token for Drive. `refresh` drops the cached one first (it was rejected). */
  async getAccessToken({ refresh }: { refresh: boolean }): Promise<string> {
    const m = google();
    if (!m) throw new AuthError('unavailable', 'Google sign-in is not available in this build.');
    const { GoogleSignin } = m;
    if (refresh && lastToken && Platform.OS === 'android') await GoogleSignin.clearCachedAccessToken(lastToken).catch(() => null);
    if (!GoogleSignin.getCurrentUser()) {
      const res = await GoogleSignin.signInSilently().catch(() => null);
      if (!res || res.type !== 'success') throw new AuthError('signin', 'Sign in to Google again to keep syncing.');
    }
    try {
      const { accessToken } = await GoogleSignin.getTokens();
      lastToken = accessToken;
      return accessToken;
    } catch (err) {
      throw new AuthError('signin', err instanceof Error ? err.message : 'Could not get a Google token.');
    }
  },

  async signOut(): Promise<void> {
    lastToken = null;
    await google()?.GoogleSignin.signOut().catch(() => null);
  },

  /** Remove this app's access to the Google account entirely. */
  async revoke(): Promise<void> {
    const m = google();
    lastToken = null;
    if (!m) return;
    await m.GoogleSignin.revokeAccess().catch(() => null);
    await m.GoogleSignin.signOut().catch(() => null);
  },
};
