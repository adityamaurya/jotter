import type { ConfigContext, ExpoConfig } from 'expo/config';

/*
 * Store identifiers. They are permanent once the app is uploaded to the App Store / Play Store,
 * so confirm them before the first release. Override with APP_ID=... if you need another one.
 */
const APP_ID = process.env.APP_ID || 'com.adityamaurya.leavecalendar';

/*
 * Google Sign-In. The iOS OAuth client ID (type "iOS" in Google Cloud Console) also gives the
 * URL scheme Google redirects back to: 1234-abc.apps.googleusercontent.com -> com.googleusercontent.apps.1234-abc
 * Android needs no ID here: Google matches the package name + signing certificate SHA-1.
 */
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';
const IOS_URL_SCHEME = IOS_CLIENT_ID
  ? `com.googleusercontent.apps.${IOS_CLIENT_ID.replace(/\.apps\.googleusercontent\.com$/, '')}`
  : '';

const IPAD_ORIENTATIONS = [
  'UIInterfaceOrientationPortrait',
  'UIInterfaceOrientationPortraitUpsideDown',
  'UIInterfaceOrientationLandscapeLeft',
  'UIInterfaceOrientationLandscapeRight',
];

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Leave Calendar',
  slug: 'leave-calendar',
  scheme: 'leavecalendar',
  version: '1.0.0',
  // Phones are locked to portrait at runtime (src/App.tsx); tablets rotate.
  orientation: 'default',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  backgroundColor: '#FFFFFF',
  platforms: ['ios', 'android', 'web'],
  ios: {
    bundleIdentifier: APP_ID,
    supportsTablet: true,
    icon: {
      light: './assets/icon.png',
      dark: './assets/icon-dark.png',
      tinted: './assets/icon-tinted.png',
    },
    config: { usesNonExemptEncryption: false },
    infoPlist: {
      UISupportedInterfaceOrientations: ['UIInterfaceOrientationPortrait'],
      'UISupportedInterfaceOrientations~ipad': IPAD_ORIENTATIONS,
    },
  },
  android: {
    package: APP_ID,
    adaptiveIcon: {
      foregroundImage: './assets/android-icon-foreground.png',
      monochromeImage: './assets/android-icon-monochrome.png',
      backgroundColor: '#FFFFFF',
    },
    predictiveBackGestureEnabled: false,
    // Not needed: backups go through the system file picker and share sheet.
    blockedPermissions: [
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
    ],
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-sqlite',
    'expo-system-ui',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 168,
        resizeMode: 'contain',
        backgroundColor: '#FFFFFF',
        dark: { image: './assets/splash-icon.png', backgroundColor: '#000000' },
      },
    ],
    ...(IOS_URL_SCHEME
      ? [['@react-native-google-signin/google-signin', { iosUrlScheme: IOS_URL_SCHEME }] as [string, object]]
      : []),
  ],
  extra: {
    ...config.extra,
    ...(process.env.EAS_PROJECT_ID ? { eas: { projectId: process.env.EAS_PROJECT_ID } } : {}),
  },
});
