/* The date circle used everywhere (grid, list, details, editor, legend, settings).
   Leave = tint fill + ink number; office holiday = grey fill; any holiday = ring drawn just outside the edge
   (like CSS box-shadow 0 0 0 1.5px); today = accent number. */

import type { ReactNode } from 'react';
import { Platform, View, type ViewStyle } from 'react-native';
import type { LeaveType } from '../rules';
import { leaveInk, leaveTint, useTheme } from '../theme';
import { T } from './T';

export type CircleProps = {
  size: number;
  fontSize?: number;
  label?: string | number;
  leave?: LeaveType | null;
  office?: boolean;
  ring?: boolean;
  ringWidth?: number;
  today?: boolean;
  /** Weekend with nothing on it: number in ink2. */
  weekend?: boolean;
  /** Background when there's no leave and no office fill (e.g. the "title" swatch). */
  fill?: string;
  children?: ReactNode;
  style?: ViewStyle;
};

export function DayCircle({ size, fontSize, label, leave, office, ring, ringWidth = 1.5, today, weekend, fill, children, style }: CircleProps) {
  const { c } = useTheme();
  const bg = leave ? leaveTint(c, leave) : office ? c.off : fill ?? 'transparent';
  let color = c.ink;
  if (leave) color = leaveInk(c, leave);
  else if (!office && weekend) color = c.ink2;
  let weight: '400' | '600' | '700' | undefined = leave ? '600' : undefined;
  if (today) {
    color = office && !leave ? c.accentInk : c.accent;
    weight = '700';
  }
  // One view for fill + ring (an opaque border outside the circle), so there's no seam between them.
  // Browsers floor fractional border widths, so the web preview draws the ring as a box-shadow, like the web app.
  const web = Platform.OS === 'web';
  const rw = ring && !web ? ringWidth : 0;
  return (
    <View style={[{ width: size, height: size }, style]}>
      <View
        style={{
          position: 'absolute',
          left: -rw,
          top: -rw,
          width: size + rw * 2,
          height: size + rw * 2,
          borderRadius: (size + rw * 2) / 2,
          borderWidth: rw,
          borderColor: ring ? c.ring : 'transparent',
          backgroundColor: bg,
          boxShadow: ring && web ? `0px 0px 0px ${ringWidth}px ${c.ring}` : undefined,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {label != null ? (
          <T size={fontSize ?? size / 2} lh={1} weight={weight} color={color} tabular style={{ includeFontPadding: false, textAlignVertical: 'center' }}>
            {label}
          </T>
        ) : null}
        {children}
      </View>
    </View>
  );
}
