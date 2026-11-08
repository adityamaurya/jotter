/* Building blocks inside sheets: group label, rounded group, rows with hairlines, foot text. */

import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme';
import { T } from './T';

export function GroupLabel({ children, first, right }: { children: string; first?: boolean; right?: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ marginTop: first ? 8 : 18, marginHorizontal: 4, marginBottom: 7, minHeight: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <T size={13} color={c.ink2} upper em={0.03} accessibilityRole="header">
        {children}
      </T>
      {right}
    </View>
  );
}

/** A card-coloured rounded group. Rows get a 1 pt hairline between them, inset 14 from the left. */
export function Group({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const rows = Children.toArray(children).filter(ch => isValidElement(ch) || typeof ch === 'string');
  return (
    <View style={[{ backgroundColor: c.card, borderRadius: 12, overflow: 'hidden' }, style]}>
      {rows.map((row, i) => (
        <Fragment key={i}>
          {i > 0 ? <View style={{ height: 1, marginLeft: 14, backgroundColor: c.sep }} /> : null}
          {row}
        </Fragment>
      ))}
    </View>
  );
}

export function Cell({ children, onPress, style, label }: { children: ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle>; label?: string }) {
  const { c } = useTheme();
  const base: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingVertical: 6, paddingHorizontal: 14 };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [base, { backgroundColor: pressed ? c.fill : c.card }, style]}>
      {children}
    </Pressable>
  );
}

export function Foot({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return (
    <View style={[{ marginTop: 8, marginHorizontal: 4 }, style]}>
      <T size={13} lh={1.45} color={c.ink2}>
        {children}
      </T>
    </View>
  );
}
