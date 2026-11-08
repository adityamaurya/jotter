import { Text, type TextProps, type TextStyle } from 'react-native';
import { MAX_FONT_SCALE, useTheme } from '../theme';

type Weight = '400' | '500' | '600' | '700';

export type TProps = TextProps & {
  size?: number;
  weight?: Weight;
  color?: string;
  /** Tabular figures, for numbers that line up. */
  tabular?: boolean;
  /** Letter spacing in em, like the CSS. */
  em?: number;
  /** Line height as a multiple of the font size (CSS default here is 1.35). */
  lh?: number;
  center?: boolean;
  upper?: boolean;
};

/** Text with the app's defaults: system font, ink colour, line-height 1.35, font scaling capped at 1.3×. */
export function T({ size = 17, weight, color, tabular, em, lh = 1.35, center, upper, style, ...rest }: TProps) {
  const { c } = useTheme();
  const s: TextStyle = {
    fontSize: size,
    lineHeight: Math.round(size * lh * 100) / 100,
    color: color ?? c.ink,
    ...(weight ? { fontWeight: weight } : null),
    ...(tabular ? { fontVariant: ['tabular-nums'] as const } : null),
    ...(em ? { letterSpacing: em * size } : null),
    ...(center ? { textAlign: 'center' as const } : null),
    ...(upper ? { textTransform: 'uppercase' as const } : null),
  };
  return <Text allowFontScaling maxFontSizeMultiplier={MAX_FONT_SCALE} {...rest} style={[s, style]} />;
}
