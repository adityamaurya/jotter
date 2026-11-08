/* Web preview only: Google sign-in isn't wired up on web, so the app runs in "this device only" mode. */

import type { RestoreResult, SignInResult } from './auth';

export type { Account, RestoreResult, SignInFailure, SignInResult } from './auth';

export class AuthError extends Error {
  code: 'signin' | 'unavailable';
  constructor(code: 'signin' | 'unavailable', message: string) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

export const googleAuth = {
  available: (): boolean => false,
  signIn: async (): Promise<SignInResult> => ({ ok: false, reason: 'unavailable' }),
  restore: async (): Promise<RestoreResult> => ({ status: 'signed-out' }),
  getAccessToken: async (_opts: { refresh: boolean }): Promise<string> => {
    throw new AuthError('unavailable', 'Google sign-in is not available on web.');
  },
  signOut: async (): Promise<void> => undefined,
  revoke: async (): Promise<void> => undefined,
};
