/* Balance sheet (tap APL, Sick or WFH): type the balance your HR portal shows. */

import { useState } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';
import { adjustRows, adjustTexts, balances, calendarOnlyValue, clamp, todayIso, type LeaveType, type State } from '../rules';
import { MAX_FONT_SCALE, useTheme } from '../theme';
import { TextButton, tick } from '../ui/controls';
import { Cell, Foot, Group } from '../ui/group';
import { Minus, Plus } from '../ui/icons';
import { T } from '../ui/T';

export type AdjustDraft = { type: LeaveType; y: number; m: number; v: number; v0: number; reset: boolean };

export function BalanceBody({ state, draft, onDraft, onDone }: { state: State; draft: AdjustDraft; onDraft: (d: AdjustDraft) => void; onDone: () => void }) {
  const { c, dark } = useTheme();
  const { type, y, m, v } = draft;
  // While typing, show what was typed; otherwise show the value (which ± and reset also change).
  const [typed, setTyped] = useState<string | null>(null);
  const text = typed ?? String(v);

  const texts = adjustTexts(state, type, y, m, todayIso());
  const rows = adjustRows(state, type, y, m, v);
  const showReset = !draft.reset && !!balances(state, y, m)?.[type].cp;
  const step = (d: number) => {
    tick();
    onDraft({ ...draft, v: clamp(v + d, -999, 999) });
  };
  const round = (d: number) => (
    <Pressable
      onPress={() => step(d)}
      accessibilityRole="button"
      accessibilityLabel={d < 0 ? 'One less' : 'One more'}
      style={({ pressed }) => ({ width: 52, height: 52, borderRadius: 26, backgroundColor: pressed ? c.fill2 : c.card, alignItems: 'center', justifyContent: 'center' })}
    >
      {d < 0 ? <Minus size={22} color={c.accent} /> : <Plus size={22} color={c.accent} />}
    </Pressable>
  );

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, paddingTop: 14, paddingBottom: 4 }}>
        {round(-1)}
        <TextInput
          value={text}
          onChangeText={t => {
            setTyped(t);
            const n = parseInt(t.replace('−', '-'), 10);
            if (Number.isFinite(n)) onDraft({ ...draft, v: clamp(n, -999, 999) });
          }}
          onFocus={() => setTyped(String(v))}
          onBlur={() => setTyped(null)}
          onSubmitEditing={onDone}
          keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric'}
          returnKeyType="done"
          selectTextOnFocus
          maxLength={4}
          keyboardAppearance={dark ? 'dark' : 'light'}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          selectionColor={c.accent}
          accessibilityLabel={`${texts.title} balance`}
          style={{ width: 128, textAlign: 'center', fontSize: 56, fontWeight: '700', letterSpacing: -0.03 * 56, fontVariant: ['tabular-nums'], color: c.ink, padding: 0 }}
        />
        {round(1)}
      </View>
      <T size={14} color={c.ink2} center style={{ marginBottom: 6 }}>
        {texts.asOf}
      </T>
      <Group>
        {rows.map(r => (
          <Cell key={r.label}>
            <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <T size={16} style={{ flexShrink: 1 }}>
                {r.label}
              </T>
              <T size={r.total ? 18 : 16} weight="600" tabular>
                {r.value}
              </T>
            </View>
          </Cell>
        ))}
      </Group>
      <Foot>{texts.rule}</Foot>
      <Foot>{texts.how}</Foot>
      {showReset ? (
        <View style={{ alignItems: 'center', marginTop: 18 }}>
          <TextButton label={texts.resetLabel} onPress={() => onDraft({ ...draft, reset: true, v: calendarOnlyValue(state, type, y, m) })} />
        </View>
      ) : null}
    </View>
  );
}
