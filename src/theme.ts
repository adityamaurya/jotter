/* Design tokens, exactly as in the web app (light / dark). rgba values composite over what's behind. */

import { createContext, useContext } from 'react';
import { useWindowDimensions } from 'react-native';
import type { LeaveType } from './rules';

export type Colors = {
  bg: string; sheet: string; card: string; segOn: string; fill: string; fill2: string; off: string; off2: string;
  ink: string; ink2: string; ink3: string; sep: string; accent: string; accentInk: string; ring: string; on: string; danger: string;
  apl: string; aplInk: string; aplTint: string; sick: string; sickInk: string; sickTint: string; wfh: string; wfhInk: string; wfhTint: string;
  scrim: string; shadow: string;
};

export const LIGHT: Colors = {
  bg: '#FFFFFF', sheet: '#F2F2F7', card: '#FFFFFF', segOn: '#FFFFFF',
  fill: 'rgba(118,118,128,0.10)', fill2: 'rgba(118,118,128,0.20)', off: '#EBEBEF', off2: '#E0E0E6',
  ink: '#0B0B0C', ink2: 'rgba(60,60,67,0.68)', ink3: 'rgba(60,60,67,0.32)', sep: 'rgba(60,60,67,0.14)',
  accent: '#007AFF', accentInk: '#0061C9', ring: '#0B0B0C', on: '#34C759', danger: '#D92D20',
  apl: '#FF3B30', aplInk: '#C81E15', aplTint: 'rgba(255,59,48,0.15)',
  sick: '#AF52DE', sickInk: '#8A35B8', sickTint: 'rgba(175,82,222,0.17)',
  wfh: '#A2845E', wfhInk: '#7C6040', wfhTint: 'rgba(162,132,94,0.22)',
  scrim: 'rgba(0,0,0,0.26)', shadow: '0px 12px 48px rgba(0,0,0,0.16)',
};

export const DARK: Colors = {
  bg: '#000000', sheet: '#1C1C1E', card: '#2C2C2E', segOn: '#636366',
  fill: 'rgba(118,118,128,0.22)', fill2: 'rgba(118,118,128,0.36)', off: '#3A3A3C', off2: '#48484A',
  ink: '#F5F5F7', ink2: 'rgba(235,235,245,0.64)', ink3: 'rgba(235,235,245,0.30)', sep: 'rgba(84,84,88,0.55)',
  accent: '#0A84FF', accentInk: '#64ADFF', ring: '#F5F5F7', on: '#30D158', danger: '#FF6961',
  apl: '#FF453A', aplInk: '#FF7A71', aplTint: 'rgba(255,69,58,0.26)',
  sick: '#BF5AF2', sickInk: '#D796F8', sickTint: 'rgba(191,90,242,0.28)',
  wfh: '#AC8E68', wfhInk: '#D0B48E', wfhTint: 'rgba(172,142,104,0.32)',
  scrim: 'rgba(0,0,0,0.5)', shadow: '0px 12px 48px rgba(0,0,0,0.6)',
};

export type Theme = { dark: boolean; c: Colors };
export const ThemeContext = createContext<Theme>({ dark: false, c: LIGHT });
export const useTheme = () => useContext(ThemeContext);

export const leaveColor = (c: Colors, t: LeaveType) => c[t];
export const leaveInk = (c: Colors, t: LeaveType) => (t === 'apl' ? c.aplInk : t === 'sick' ? c.sickInk : c.wfhInk);
export const leaveTint = (c: Colors, t: LeaveType) => (t === 'apl' ? c.aplTint : t === 'sick' ? c.sickTint : c.wfhTint);

/** Font size cap for Dynamic Type / Android font scale. */
export const MAX_FONT_SCALE = 1.3;

/** Layout breakpoints, as in the web app: < 700 phone, >= 700 room for labels, >= 960 sidebar + side panel. */
export function useLayout() {
  const { width, height } = useWindowDimensions();
  return { width, height, labels: width >= 700, wide: width >= 960 };
}
