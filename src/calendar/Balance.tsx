/* "BALANCE · NOV 2026" + the four tiles. Also drawn as a non-interactive copy above the scrim while a day
   sheet is open, so the live preview stays visible. */

import { View } from 'react-native';
import { MON3, fmtNum, type Balances, type LeaveType } from '../rules';
import { leaveColor, useTheme } from '../theme';
import { PressScale } from '../ui/controls';
import { T } from '../ui/T';

type Caption = { short: string; long: string };
export type BalanceProps = {
  y: number;
  m: number;
  /** Balances to show (with the day editor's draft applied while it's open). */
  shown: Balances | null;
  /** Saved balances, to show what the draft would change. */
  saved: Balances | null;
  captions: { total: Caption; apl: Caption; sick: Caption; wfh: Caption };
  wide: boolean;
  onTile?: (t: LeaveType) => void;
};

const LABELS: Record<'total' | LeaveType, [string, string]> = {
  total: ['Total', 'Total'],
  apl: ['APL', 'All-purpose'],
  sick: ['Sick', 'Sick'],
  wfh: ['WFH', 'Work from home'],
};

function Tile({ kind, value, was, caption, wide, onPress }: { kind: 'total' | LeaveType; value: number | null; was: number | null; caption: Caption; wide: boolean; onPress?: () => void }) {
  const { c } = useTheme();
  const diff = value != null && was != null ? value - was : 0;
  const tone = kind === 'total' ? c.ink : leaveColor(c, kind);
  const label = LABELS[kind][wide ? 1 : 0];
  const num = value == null ? '–' : fmtNum(value);
  const numSize = wide ? (kind === 'total' ? 34 : 28) : 26;

  const labelRow = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 0 }}>
      {kind !== 'total' ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tone }} /> : null}
      <T size={wide ? 13 : 12} weight="600" color={c.ink2} numberOfLines={1}>
        {label}
      </T>
    </View>
  );
  const numberRow = (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
      <T size={numSize} weight="600" em={-0.02} lh={1.15} tabular color={value != null && value < 0 ? c.danger : c.ink}>
        {num}
      </T>
      {diff ? (
        <T size={13} weight="600" color={tone} tabular>
          {`${diff > 0 ? '+' : '−'}${Math.abs(diff)}`}
        </T>
      ) : null}
    </View>
  );
  const captionText = (
    <T size={wide ? 12 : 11} color={c.ink2} numberOfLines={1}>
      {wide ? caption.long : caption.short}
    </T>
  );

  const box = {
    flex: wide ? undefined : 1,
    minWidth: 0,
    borderRadius: 14,
    backgroundColor: kind === 'total' ? 'transparent' : c.fill,
    paddingTop: wide ? 12 : 10,
    paddingBottom: wide ? 12 : 9,
    paddingHorizontal: wide ? 14 : 10,
  } as const;
  const content = wide ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        {labelRow}
        {captionText}
      </View>
      {numberRow}
    </View>
  ) : (
    <View style={{ gap: 1, alignItems: 'flex-start' }}>
      {labelRow}
      {numberRow}
      {captionText}
    </View>
  );
  const borders = (
    <>
      {kind === 'total' ? <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 14, borderWidth: 1, borderColor: c.sep }} /> : null}
      {diff ? <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 14, borderWidth: 2, borderColor: tone }} /> : null}
    </>
  );
  const a11y = `${kind === 'total' ? 'Total, all-purpose plus sick' : label} balance: ${value == null ? 'not counted' : num}${diff ? `, would change by ${diff}` : ''}`;
  if (!onPress) {
    return (
      <View style={box} accessible accessibilityLabel={a11y}>
        {content}
        {borders}
      </View>
    );
  }
  return (
    <PressScale style={box} onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y} accessibilityHint="Opens the balance to check or correct it">
      {content}
      {borders}
    </PressScale>
  );
}

export function BalanceSection({ y, m, shown, saved, captions, wide, onTile }: BalanceProps) {
  const { c } = useTheme();
  const v = (b: Balances | null, k: 'total' | LeaveType) => (b == null ? null : k === 'total' ? b.total : b[k].value);
  return (
    <View>
      <T size={13} weight="500" color={c.ink2} upper em={0.04} style={{ marginBottom: 8 }} accessibilityRole="header">
        {`Balance · ${MON3[m]} ${y}`}
      </T>
      <View style={{ flexDirection: wide ? 'column' : 'row', gap: 8 }}>
        <Tile kind="total" value={v(shown, 'total')} was={v(saved, 'total')} caption={captions.total} wide={wide} />
        {(['apl', 'sick', 'wfh'] as const).map(k => (
          <Tile key={k} kind={k} value={v(shown, k)} was={v(saved, k)} caption={captions[k]} wide={wide} onPress={onTile ? () => onTile(k) : undefined} />
        ))}
      </View>
    </View>
  );
}
