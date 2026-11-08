/* Day sheet: view mode (details) and edit mode (mark the day, holiday, title, notes). */

import { useEffect, useRef, type ComponentProps, type Ref } from 'react';
import { TextInput, View, type TextInputInstance } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import {
  LEAVES, LEAVE_KEYS, baseHoliday, dayDetails, holidayFoot, holidayOption, optionLeft, optionsFoot, partsOf,
  type DayDraft, type LeaveType, type State,
} from '../rules';
import { MAX_FONT_SCALE, leaveColor, useTheme } from '../theme';
import { DayCircle } from '../ui/Circle';
import { PressScale, Switch, TextButton, tick } from '../ui/controls';
import { Cell, Foot, Group, GroupLabel } from '../ui/group';
import { Check } from '../ui/icons';
import { useRevealInSheet } from '../ui/Sheet';
import { T } from '../ui/T';

/* ---------------- View mode ---------------- */
export function DayDetailsBody({ state, iso }: { state: State; iso: string }) {
  const { c } = useTheme();
  const det = dayDetails(state, iso);
  const day = partsOf(iso).d;
  return (
    <View>
      <View style={{ paddingTop: 8, paddingHorizontal: 4, paddingBottom: 14 }}>
        <T size={13} weight="600" color={c.ink2} em={0.05}>
          {det.weekday}
        </T>
        <T size={26} weight="700" em={-0.02} style={{ marginTop: 2 }} accessibilityRole="header">
          {det.date}
        </T>
      </View>
      {det.items.length ? (
        <Group>
          {det.items.map((it, i) => (
            <Cell key={i}>
              {it.swatch.titleDot ? (
                <DayCircle size={30} fill={c.fill}>
                  <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: c.ink3 }} />
                </DayCircle>
              ) : (
                <DayCircle size={30} fontSize={13} label={day} leave={it.swatch.leave} office={!!it.swatch.office} ring={!!it.swatch.holiday} />
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <T size={17}>{it.title}</T>
                <T size={13} color={c.ink2}>
                  {it.sub}
                </T>
              </View>
            </Cell>
          ))}
        </Group>
      ) : null}
      {det.note ? (
        <>
          <GroupLabel>Notes</GroupLabel>
          <Group>
            <View style={{ paddingVertical: 12, paddingHorizontal: 14 }}>
              <T size={15} lh={1.45} selectable>
                {det.note}
              </T>
            </View>
          </Group>
        </>
      ) : null}
      <Foot>{det.foot}</Foot>
    </View>
  );
}

/* ---------------- Edit mode ---------------- */
function OptionCard({
  kind, day, selected, caption, over, office, ringAll, label, onPress,
}: {
  kind: LeaveType | 'hol'; day: number; selected: boolean; caption: string; over?: boolean; office?: boolean; ringAll: boolean; label: string; onPress: () => void;
}) {
  const { c } = useTheme();
  const tone = kind === 'hol' ? c.ring : leaveColor(c, kind);
  const badge = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    badge.set(withTiming(selected ? 1 : 0, { duration: 150 }));
  }, [selected, badge]);
  const badgeStyle = useAnimatedStyle(() => ({ opacity: badge.value, transform: [{ scale: 0.6 + 0.4 * badge.value }] }));
  return (
    <PressScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 5, paddingTop: 14, paddingBottom: 11, paddingHorizontal: 4, borderRadius: 14, backgroundColor: c.card }}
    >
      <DayCircle
        size={40}
        fontSize={17}
        label={day}
        leave={kind === 'hol' ? null : kind}
        office={kind === 'hol' && office}
        ring={kind === 'hol' || ringAll}
      />
      <T size={14} weight="600" numberOfLines={1}>
        {kind === 'hol' ? 'Holiday' : LEAVES[kind].short}
      </T>
      <T size={12} color={over ? c.danger : c.ink2} tabular numberOfLines={1}>
        {caption}
      </T>
      {selected ? <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 14, borderWidth: 2, borderColor: tone }} /> : null}
      <Animated.View
        pointerEvents="none"
        style={[{ position: 'absolute', top: 7, right: 7, width: 18, height: 18, borderRadius: 9, backgroundColor: tone, alignItems: 'center', justifyContent: 'center' }, badgeStyle]}
      >
        <Check size={11} color={kind === 'hol' ? c.bg : '#FFFFFF'} />
      </Animated.View>
    </PressScale>
  );
}

export function Input(props: ComponentProps<typeof TextInput> & { inputRef?: Ref<TextInputInstance> }) {
  const { c, dark } = useTheme();
  const { inputRef, style, ...rest } = props;
  return (
    <TextInput
      ref={inputRef}
      placeholderTextColor={c.ink3}
      keyboardAppearance={dark ? 'dark' : 'light'}
      maxFontSizeMultiplier={MAX_FONT_SCALE}
      selectionColor={c.accent}
      {...rest}
      style={[{ flex: 1, minWidth: 0, fontSize: 17, color: c.ink, paddingVertical: 8 }, style]}
    />
  );
}

export function DayEditBody({ state, iso, draft, onDraft, onDone }: { state: State; iso: string; draft: DayDraft; onDraft: (d: DayDraft) => void; onDone: () => void }) {
  const { c } = useTheme();
  const reveal = useRevealInSheet();
  const day = partsOf(iso).d;
  const base = baseHoliday(state, iso);
  const hol = holidayOption(state, iso);
  const holNameRef = useRef<TextInputInstance>(null);
  const titleRef = useRef<TextInputInstance>(null);
  const noteRef = useRef<TextInputInstance>(null);
  const focusHolName = useRef(false);

  useEffect(() => {
    if (draft.holOn && focusHolName.current) {
      focusHolName.current = false;
      setTimeout(() => holNameRef.current?.focus(), 60);
    }
  }, [draft.holOn]);

  const pickLeave = (k: LeaveType) => {
    tick();
    onDraft({ ...draft, leave: draft.leave === k ? null : k });
  };
  const toggleHoliday = () => {
    tick();
    const on = !draft.holOn;
    let holName = draft.holName;
    if (on && !holName && base) holName = base.name;
    if (on && !holName) focusHolName.current = true;
    onDraft({ ...draft, holOn: on, holName });
  };
  const showClear = !!(draft.leave || draft.title.trim() || draft.note.trim());

  return (
    <View>
      <GroupLabel first>Mark this day</GroupLabel>
      <View style={{ flexDirection: 'row', gap: 8 }} accessibilityLabel="Mark this day">
        {LEAVE_KEYS.map(k => {
          const left = optionLeft(state, iso, draft, k);
          return (
            <OptionCard key={k} kind={k} day={day} selected={draft.leave === k} caption={left.text} over={left.over} ringAll={draft.holOn} label={LEAVES[k].name} onPress={() => pickLeave(k)} />
          );
        })}
        <OptionCard kind="hol" day={day} selected={draft.holOn} caption={hol.caption} office={hol.office} ringAll={draft.holOn} label={hol.a11y} onPress={toggleHoliday} />
      </View>
      <Foot>{optionsFoot(state, iso, draft)}</Foot>

      {draft.holOn ? (
        <View>
          <GroupLabel>{hol.groupLabel}</GroupLabel>
          <Group>
            <Cell>
              <Input
                inputRef={holNameRef}
                value={draft.holName}
                onChangeText={t => onDraft({ ...draft, holName: t })}
                placeholder="Holiday name"
                maxLength={80}
                autoComplete="off"
                autoCorrect={false}
                returnKeyType="done"
                accessibilityLabel="Holiday name"
                onFocus={() => reveal(holNameRef.current)}
              />
            </Cell>
            {hol.repeatsInfo ? (
              <Cell>
                <T style={{ flex: 1 }}>Repeats</T>
                <T color={c.ink2}>{hol.repeatsInfo}</T>
              </Cell>
            ) : (
              <Cell>
                <T style={{ flex: 1 }}>Repeat every year</T>
                <Switch value={draft.holRepeat} onChange={v => onDraft({ ...draft, holRepeat: v })} label="Repeat every year" />
              </Cell>
            )}
          </Group>
          <Foot>{holidayFoot(state, iso, draft)}</Foot>
        </View>
      ) : null}

      <GroupLabel>Title</GroupLabel>
      <Group>
        <Cell>
          <Input
            inputRef={titleRef}
            value={draft.title}
            onChangeText={t => onDraft({ ...draft, title: t })}
            placeholder="Add a title"
            maxLength={120}
            autoComplete="off"
            returnKeyType="done"
            submitBehavior="blurAndSubmit"
            onSubmitEditing={onDone}
            accessibilityLabel="Title"
            onFocus={() => reveal(titleRef.current)}
          />
        </Cell>
        <Cell style={{ alignItems: 'stretch' }}>
          <Input
            inputRef={noteRef}
            value={draft.note}
            onChangeText={t => onDraft({ ...draft, note: t })}
            placeholder="Notes"
            maxLength={2000}
            multiline
            textAlignVertical="top"
            accessibilityLabel="Notes"
            onFocus={() => reveal(noteRef.current)}
            style={{ minHeight: 64, maxHeight: 220, lineHeight: 17 * 1.4, paddingVertical: 10 }}
          />
        </Cell>
      </Group>

      {showClear ? (
        <View style={{ alignItems: 'center', marginTop: 18 }}>
          <TextButton label="Clear leave and title" danger onPress={() => onDraft({ ...draft, leave: null, title: '', note: '' })} />
        </View>
      ) : null}
    </View>
  );
}
