/* Leave Calendar — rules engine. Exact port of the web app's logic. Pure functions, no UI, no I/O.
   Months are 0-based (0 = January) everywhere; dates are local 'YYYY-MM-DD' strings. */

export type LeaveType = 'apl' | 'sick' | 'wfh';
export type Day = { leave: LeaveType | null; title: string; note: string };
export type HolOverride = { on: boolean; name: string };
export type Recurring = { name: string; md: string; from: number; until?: number };
export type Settings = { aplPerMonth: number; aplStart: string; sickPerYear: number; wfhPerMonth: number; weekStart: 0 | 1; weeklyOff: boolean };
export type Checkpoint = { d: string; v: number };
export type State = {
  days: Record<string, Day>;                                  // iso -> day entry (only days with something on them)
  hol: Record<string, HolOverride>;                           // iso -> one-off add / remove / rename of a holiday
  rec: Record<string, Recurring>;                             // id  -> holidays the user added that repeat yearly
  settings: Settings;
  adjust: Record<LeaveType, Record<string, Checkpoint>>;      // typed balances: one checkpoint per 'YYYY-MM' per type
};
export type Holiday = {
  name: string;
  src: 'builtin' | 'weekly' | 'custom' | 'oneoff';
  office: boolean;                                            // true = office holiday (ring + grey fill); false = added by user (ring only)
  id?: string;
  kind?: 'fixed' | 'mapped' | 'weekly';
  from?: number;
  until?: number | null;
};

/* ---------- Constants ---------- */
export const LEAVES: Record<LeaveType, { name: string; label: string; short: string }> = {
  apl: { name: 'All-purpose leave', label: 'All-purpose', short: 'APL' },
  sick: { name: 'Sick leave', label: 'Sick', short: 'Sick' },
  wfh: { name: 'Work from home', label: 'WFH', short: 'WFH' },
};
export const LEAVE_KEYS: LeaveType[] = ['apl', 'sick', 'wfh'];
export const JOIN = '2026-04-30';                             // joining date: nothing earlier is counted
export const JOIN_MONTH = JOIN.slice(0, 7);
export const DEFAULTS: Settings = { aplPerMonth: 2, aplStart: '2026-05', sickPerYear: 15, wfhPerMonth: 2, weekStart: 1, weeklyOff: true };
export const WEEKLY = 'Weekly off';
export const MAPPED_UNTIL = 2030;
/* Office list. Fixed dates repeat every year; festival dates are mapped per year. */
export const OFFICE_HOLIDAYS: { id: string; name: string; md?: string; dates?: Record<number, string> }[] = [
  { id: 'labour', name: 'Labour Day', md: '05-01' },
  { id: 'bakrid', name: 'Bakrid (Eid-ul-Zuha)', dates: { 2026: '05-28', 2027: '05-17', 2028: '05-06', 2029: '04-25', 2030: '04-14' } },
  { id: 'independence', name: 'Independence Day', md: '08-15' },
  { id: 'ganesh', name: 'Ganesh Chaturthi', dates: { 2026: '09-14', 2027: '09-04', 2028: '08-23', 2029: '09-11', 2030: '09-01' } },
  { id: 'gandhi', name: 'Gandhi Jayanti', md: '10-02' },
  { id: 'dussehra', name: 'Dussehra', dates: { 2026: '10-20', 2027: '10-09', 2028: '09-27', 2029: '10-16', 2030: '10-06' } },
  { id: 'diwali', name: 'Diwali', dates: { 2026: '11-08', 2027: '10-29', 2028: '10-17', 2029: '11-05', 2030: '10-26' } },
  { id: 'christmas', name: 'Christmas Day', md: '12-25' },
];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MON3 = MONTHS.map(m => m.slice(0, 3));
export const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WD3 = WD.map(w => w.slice(0, 3));

/* ---------- Dates & formatting ---------- */
export const pad = (n: number) => String(n).padStart(2, '0');
export const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
export const ymKey = (y: number, m: number) => `${y}-${pad(m + 1)}`;
export const ymIdx = (k: string) => { const [y, m] = k.split('-').map(Number); return y * 12 + m - 1; };
export const partsOf = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return { y, m: m - 1, d }; };
export const dowOf = (iso: string) => { const p = partsOf(iso); return new Date(p.y, p.m, p.d).getDay(); };
export const daysIn = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
export const todayIso = (now: Date = new Date()) => isoOf(now.getFullYear(), now.getMonth(), now.getDate());
export const isIso = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
export const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
export const fmtNum = (n: number) => (n < 0 ? '−' + -n : String(n));            // U+2212 minus sign
export const fmtShort = (iso: string) => { const p = partsOf(iso); return `${WD3[dowOf(iso)]}, ${p.d} ${MON3[p.m]}`; };   // "Sat, 14 Nov"
export const fmtDM = (iso: string) => { const p = partsOf(iso); return `${p.d} ${MON3[p.m]}`; };                        // "2 Nov"

/* ---------- Normalise anything read from storage, a seed file or an import ---------- */
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
export function normDay(v: any): Day | null {
  if (!v || typeof v !== 'object') return null;
  const leave: LeaveType | null = LEAVE_KEYS.includes(v.leave) ? v.leave : null;
  const title = str(v.title, 120).trim();
  const note = str(v.note, 2000);
  return leave || title || note.trim() ? { leave, title, note } : null;
}
export function normHol(v: any): HolOverride | null {
  return v && typeof v === 'object' ? { on: !!v.on, name: str(v.name, 80).trim() } : null;
}
export function normRec(v: any): Recurring | null {
  if (!v || typeof v !== 'object' || !/^\d{2}-\d{2}$/.test(v.md) || !Number.isInteger(v.from)) return null;
  const r: Recurring = { name: str(v.name, 80).trim() || 'Office holiday', md: v.md, from: v.from };
  if (Number.isInteger(v.until)) r.until = v.until;
  return r;
}
export function normSettings(v: any): Settings {
  const s: Settings = { ...DEFAULTS };
  if (v && typeof v === 'object') {
    for (const k of ['aplPerMonth', 'sickPerYear', 'wfhPerMonth'] as const) if (Number.isFinite(v[k]) && v[k] >= 0 && v[k] <= 99) s[k] = Math.round(v[k]);
    if (typeof v.aplStart === 'string' && /^\d{4}-\d{2}$/.test(v.aplStart)) s.aplStart = v.aplStart;
    if (v.weekStart === 0 || v.weekStart === 1) s.weekStart = v.weekStart;
    if (typeof v.weeklyOff === 'boolean') s.weeklyOff = v.weeklyOff;
  }
  return s;
}
export function normAdjust(v: any): State['adjust'] {
  const a: State['adjust'] = { apl: {}, sick: {}, wfh: {} };
  if (v && typeof v === 'object') for (const t of LEAVE_KEYS) {
    const src = v[t];
    if (!src || typeof src !== 'object') continue;
    for (const k of Object.keys(src)) {
      const c = src[k];
      if (/^\d{4}-\d{2}$/.test(k) && c && typeof c === 'object' && isIso(c.d) && Number.isFinite(c.v)) a[t][k] = { d: c.d, v: Math.round(c.v) };
    }
  }
  return a;
}
export function emptyState(): State {
  return { days: {}, hol: {}, rec: {}, settings: { ...DEFAULTS }, adjust: { apl: {}, sick: {}, wfh: {} } };
}
export function normalizeState(raw: any): State {
  const s = emptyState();
  if (!raw || typeof raw !== 'object') return s;
  for (const k of Object.keys(raw.days || {})) { const d = isIso(k) && normDay(raw.days[k]); if (d) s.days[k] = d; }
  for (const k of Object.keys(raw.hol || {})) { const h = isIso(k) && normHol(raw.hol[k]); if (h) s.hol[k] = h; }
  for (const k of Object.keys(raw.rec || {})) { const r = normRec(raw.rec[k]); if (r) s.rec[k] = r; }
  s.settings = normSettings(raw.settings);
  s.adjust = normAdjust(raw.adjust);
  return s;
}
const clone = (s: State): State => JSON.parse(JSON.stringify(s));

/* ---------- Holidays ---------- */
export function builtinOn(y: number, md: string): Holiday | null {
  for (const t of OFFICE_HOLIDAYS) {
    if (t.md === md) return { name: t.name, src: 'builtin', id: t.id, kind: 'fixed', office: true };
    if (t.dates && t.dates[y] === md) return { name: t.name, src: 'builtin', id: t.id, kind: 'mapped', office: true };
  }
  return null;
}
export const isWeekend = (iso: string) => { const w = dowOf(iso); return w === 0 || w === 6; };
export function baseHoliday(s: State, iso: string): Holiday | null {
  if (iso < JOIN) return null;
  const y = +iso.slice(0, 4), md = iso.slice(5);
  const b = builtinOn(y, md);
  if (b) return b;
  const weekly = s.settings.weeklyOff && isWeekend(iso);
  for (const id of Object.keys(s.rec)) {
    const r = s.rec[id];
    if (r.md === md && y >= r.from && (r.until == null || y <= r.until)) return { name: r.name, src: 'custom', id, from: r.from, until: r.until == null ? null : r.until, office: weekly };
  }
  return weekly ? { name: WEEKLY, src: 'weekly', kind: 'weekly', office: true } : null;
}
export function holidayOn(s: State, iso: string): Holiday | null {
  const base = baseHoliday(s, iso), o = s.hol[iso];
  if (o) {
    if (!o.on) return null;
    return { ...(base || { src: 'oneoff', office: false, name: '' }), name: o.name || (base && base.name) || 'Holiday' } as Holiday;
  }
  return base;
}
export const isDefault = (h: Holiday | null) => !!h && (h.src === 'builtin' || h.src === 'weekly');
export const plainWeekly = (h: Holiday | null) => !!h && h.src === 'weekly' && h.name === WEEKLY;
export function holidaysInYear(s: State, y: number): (Holiday & { iso: string })[] {
  const out: (Holiday & { iso: string })[] = [];
  for (let m = 0; m < 12; m++) for (let d = 1, n = daysIn(y, m); d <= n; d++) {
    const iso = isoOf(y, m, d), h = holidayOn(s, iso);
    if (h && !plainWeekly(h)) out.push({ iso, ...h });
  }
  return out;
}
export function repeatText(h: Holiday | null): string {
  if (!h) return '';
  if (h.src === 'weekly') return 'every Sat & Sun';
  if (h.src === 'builtin') return h.kind === 'fixed' ? 'repeats every year' : 'mapped to each year’s date';
  if (h.src === 'custom' && h.until == null) return 'repeats every year';
  return '';
}
export const holKind = (h: Holiday) => (h.office ? 'Office holiday' : 'Added by you');

/* ---------- Balances ----------
   Every figure is "as of the last day of the month on screen".
   APL: aplPerMonth credited on the 1st of each month from aplStart, minus APL logged up to month end; carries forward.
   Sick: sickPerYear minus sick days logged this calendar year up to month end; lapses 31 Dec.
   WFH: wfhPerMonth minus WFH days logged this month; lapses at month end.
   A typed balance is a checkpoint { d, v }: "at the start of day d the balance was v". Leave dated before d is treated
   as already inside v; leave on or after d still comes off; APL keeps earning credits for months after d's month. */
export type Bal = { value: number; quota: number; taken: number; calQuota: number; cp: Checkpoint | null; months?: number };
export type Balances = { key: string; y: number; m: number; end: string; apl: Bal; sick: Bal; wfh: Bal; total: number };
export function latestCp(s: State, type: LeaveType, E: string, prefix?: string): Checkpoint | null {
  let best: Checkpoint | null = null;
  for (const c of Object.values(s.adjust[type])) {
    if (c.d > E || (prefix && !c.d.startsWith(prefix))) continue;
    if (!best || c.d > best.d) best = c;
  }
  return best;
}
export function balances(s: State, y: number, m: number, opt: { days?: Record<string, Day>; noCp?: boolean } = {}): Balances | null {
  const key = ymKey(y, m);
  if (key < JOIN_MONTH) return null;                        // before joining: show "–"
  const days = opt.days || s.days, st = s.settings, E = isoOf(y, m, daysIn(y, m)), yStr = String(y);
  const L: Record<LeaveType, string[]> = { apl: [], sick: [], wfh: [] };
  for (const iso of Object.keys(days)) { const lv = days[iso] && days[iso].leave; if (lv && iso <= E) L[lv].push(iso); }
  const since = (arr: string[], d: string) => arr.filter(x => x >= d).length;
  const vIdx = y * 12 + m, sIdx = ymIdx(st.aplStart);
  const months = vIdx >= sIdx ? vIdx - sIdx + 1 : 0;
  const credited = months * st.aplPerMonth;

  const cA = opt.noCp ? null : latestCp(s, 'apl', E);
  let aV: number;
  if (cA) {
    const later = Math.max(0, vIdx - Math.max(ymIdx(cA.d.slice(0, 7)) + 1, sIdx) + 1);
    aV = cA.v + later * st.aplPerMonth - since(L.apl, cA.d);
  } else aV = credited - L.apl.length;

  const sickY = L.sick.filter(x => x.startsWith(yStr));
  const cS = opt.noCp ? null : latestCp(s, 'sick', E, yStr);
  const sV = cS ? cS.v - since(sickY, cS.d) : st.sickPerYear - sickY.length;

  const wfhM = L.wfh.filter(x => x.startsWith(key));
  const cW = opt.noCp ? null : latestCp(s, 'wfh', E, key);
  const wV = cW ? cW.v - since(wfhM, cW.d) : st.wfhPerMonth - wfhM.length;

  const mk = (value: number, quota: number, cp: Checkpoint | null): Bal => { const taken = Math.max(0, quota - value); return { value, quota: value + taken, taken, calQuota: quota, cp }; };
  const apl = mk(aV, credited, cA); apl.months = months;
  return { key, y, m, end: E, apl, sick: mk(sV, st.sickPerYear, cS), wfh: mk(wV, st.wfhPerMonth, cW), total: aV + sV };
}
/* The day being edited, applied to the saved days, so balances can preview it before Done. */
export function previewDays(s: State, iso: string, draftLeave: LeaveType | null): Record<string, Day> {
  const d = { ...s.days }, cur = d[iso];
  if (draftLeave) d[iso] = { leave: draftLeave, title: '', note: '' };
  else if (cur && cur.leave) d[iso] = { leave: null, title: cur.title, note: cur.note };
  return d;
}
/* Tile captions. short = phone, long = wide layout (>= 960). */
export function tileCaptions(s: State, y: number, m: number) {
  const st = s.settings, last = daysIn(y, m);
  if (ymKey(y, m) < JOIN_MONTH) {
    const c = { short: 'Before joining', long: 'Before you joined' };
    return { total: { short: 'APL + Sick', long: 'All-purpose + Sick' }, apl: c, sick: c, wfh: c };
  }
  return {
    total: { short: 'APL + Sick', long: 'All-purpose + Sick' },
    apl: { short: `+${st.aplPerMonth} / month`, long: `+${st.aplPerMonth} every month · carries over` },
    sick: { short: `of ${st.sickPerYear} / year`, long: `of ${st.sickPerYear} in ${y} · lapses 31 Dec` },
    wfh: { short: `of ${st.wfhPerMonth} / month`, long: `of ${st.wfhPerMonth} in ${MON3[m]} · lapses ${last} ${MON3[m]}` },
  };
}

/* ---------- Month grid, list and day details ---------- */
export function weekdayHeader(weekStart: 0 | 1) {
  return Array.from({ length: 7 }, (_, i) => { const d = (weekStart + i) % 7; return { letter: WD[d][0], short: WD3[d], weekend: d === 0 || d === 6 }; });
}
export function monthLayout(s: State, y: number, m: number) {
  const n = daysIn(y, m), lead = (new Date(y, m, 1).getDay() - s.settings.weekStart + 7) % 7;
  return { lead, days: n, trail: (7 - ((lead + n) % 7)) % 7 };
}
export type Label = { text: string; kind: 'holiday' | 'title' | 'leave' | 'note'; leave?: LeaveType };
export function cellModel(s: State, iso: string, today: string) {
  const p = partsOf(iso), dow = dowOf(iso), e = s.days[iso], h = holidayOn(s, iso);
  const labels: Label[] = [];                                   // shown only at width >= 700
  if (h && !plainWeekly(h)) labels.push({ text: h.name, kind: 'holiday' });
  if (e && e.title) labels.push({ text: e.title, kind: 'title' });
  else if (e && e.leave) labels.push({ text: LEAVES[e.leave].short, kind: 'leave', leave: e.leave });
  else if (e && e.note) labels.push({ text: 'Note', kind: 'note' });
  const bits = [`${WD[dow]} ${p.d} ${MONTHS[p.m]}`];
  if (iso === today) bits.push('today');
  if (e && e.leave) bits.push(LEAVES[e.leave].name);
  if (h) bits.push(plainWeekly(h) ? 'weekly off' : (h.office ? 'office holiday: ' : 'your holiday: ') + h.name);
  if (e && e.title) bits.push(e.title);
  return {
    iso, day: p.d, weekend: dow === 0 || dow === 6, today: iso === today,
    hasNote: !!(e && (e.title || e.note)), leave: e ? e.leave : null,
    holiday: !!h, office: !!(h && h.office), labels, a11yLabel: bits.join(', '),
  };
}
export function agendaRows(s: State, y: number, m: number) {
  const rows: { iso: string; day: number; title: string; sub: string; leave: LeaveType | null; holiday: boolean; office: boolean }[] = [];
  for (let d = 1, n = daysIn(y, m); d <= n; d++) {
    const iso = isoOf(y, m, d), e = s.days[iso], hol = holidayOn(s, iso);
    if (!e && (!hol || plainWeekly(hol))) continue;
    const sub = [WD3[dowOf(iso)]];
    let title: string;
    if (e && e.title) { title = e.title; if (e.leave) sub.push(LEAVES[e.leave].name); if (hol) sub.push(hol.name); }
    else if (hol && !plainWeekly(hol)) { title = hol.name; if (e && e.leave) sub.push(LEAVES[e.leave].name); sub.push(holKind(hol)); }
    else if (e && e.leave) { title = LEAVES[e.leave].name; sub.push(hol ? 'On a weekly off' : 'Full day'); }
    else title = 'Note';
    rows.push({ iso, day: d, title, sub: sub.join(' · '), leave: e ? e.leave : null, holiday: !!hol, office: !!(hol && hol.office) });
  }
  return rows;
}
export const agendaEmpty = (m: number) => `Nothing in ${MONTHS[m]} yet. Tap a date to log a leave, add a title or mark an office holiday.`;
export const dayHasData = (s: State, iso: string) => !!(s.days[iso] || holidayOn(s, iso));
export function balanceLine(s: State, iso: string): string {
  const p = partsOf(iso), b = balances(s, p.y, p.m);
  if (!b) return 'Before you joined, so this date doesn’t count towards balances.';
  return `${MONTHS[p.m]} balance: ${fmtNum(b.apl.value)} all-purpose · ${fmtNum(b.sick.value)} sick · ${fmtNum(b.wfh.value)} WFH.`;
}
/* Day details (view mode). */
export function dayDetails(s: State, iso: string) {
  const p = partsOf(iso), e = s.days[iso], h = holidayOn(s, iso);
  const items: { swatch: { leave?: LeaveType; holiday?: boolean; office?: boolean; titleDot?: boolean }; title: string; sub: string }[] = [];
  if (e && e.leave) items.push({ swatch: { leave: e.leave }, title: LEAVES[e.leave].name, sub: 'Full day' });
  if (h) { const r = repeatText(h); items.push({ swatch: { holiday: true, office: h.office }, title: h.name, sub: holKind(h) + (r ? ' · ' + r : '') }); }
  if (e && e.title) items.push({ swatch: { titleDot: true }, title: e.title, sub: 'Title' });
  return { weekday: WD[dowOf(iso)].toUpperCase(), date: `${p.d} ${MONTHS[p.m]} ${p.y}`, items, note: e && e.note ? e.note : '', foot: balanceLine(s, iso) };
}

/* ---------- Day editor ---------- */
export type DayDraft = { leave: LeaveType | null; title: string; note: string; holOn: boolean; holName: string; holRepeat: boolean };
export function initDayDraft(s: State, iso: string): DayDraft {
  const e = s.days[iso], h = holidayOn(s, iso), base = baseHoliday(s, iso);
  let repeat = true;
  if (base && base.src === 'custom') repeat = base.until == null;
  else if (!base && s.hol[iso] && s.hol[iso].on) repeat = false;
  return { leave: e ? e.leave : null, title: e ? e.title : '', note: e ? e.note : '', holOn: !!h, holName: h ? h.name : '', holRepeat: repeat };
}
/* Remaining count shown under each leave option (uses the draft, so it matches the live balance on top). */
export function optionLeft(s: State, iso: string, draft: DayDraft, type: LeaveType): { text: string; over: boolean } {
  const p = partsOf(iso), b = balances(s, p.y, p.m, { days: previewDays(s, iso, draft.leave) });
  if (!b) return { text: 'Not counted', over: false };
  const n = b[type].value;
  return n >= 0 ? { text: `${n} left`, over: false } : { text: `${-n} over`, over: true };
}
/* The holiday option's caption, its group label and its "Repeats" row. */
export function holidayOption(s: State, iso: string) {
  const base = baseHoliday(s, iso), office = !!(base && base.office);
  const repeatsInfo = isDefault(base) ? (base!.kind === 'weekly' ? 'Every Sat & Sun' : base!.kind === 'fixed' ? 'Every year' : 'Every year, date mapped') : null; // null = show "Repeat every year" switch
  return { office, caption: office ? 'Office' : 'Added', groupLabel: office ? 'Office holiday' : 'Holiday', a11y: office ? 'Office holiday' : 'Holiday', repeatsInfo };
}
export function absorbedNote(s: State, iso: string, leave: LeaveType | null): string {
  if (!leave) return '';
  const p = partsOf(iso), scope = leave === 'sick' ? String(p.y) : leave === 'wfh' ? ymKey(p.y, p.m) : '';
  let cp: Checkpoint | null = null;
  for (const c of Object.values(s.adjust[leave])) if (c.d > iso && (!scope || c.d.startsWith(scope)) && (!cp || c.d < cp.d)) cp = c;
  if (!cp) return '';
  return cp.d <= isoOf(p.y, p.m, daysIn(p.y, p.m))
    ? `This date is before ${fmtDM(cp.d)}, when you set your ${LEAVES[leave].short} balance, so it’s already counted there.`
    : `Your ${LEAVES[leave].short} balance set on ${fmtDM(cp.d)} already includes this day, so it only changes ${MONTHS[p.m]}’s figure.`;
}
/* Note under the four options. */
export function optionsFoot(s: State, iso: string, dr: DayDraft): string {
  const base = baseHoliday(s, iso), y = iso.slice(0, 4);
  const notes = [absorbedNote(s, iso, dr.leave)];
  if (dr.leave && dr.holOn && base && base.office) notes.push('This is an office holiday. Leave logged here still comes off your balance.');
  if (!dr.holOn && base) notes.push(base.src === 'weekly' ? 'Weekly off is switched off for this date only.' : `${base.name} is switched off for ${y} only. It stays in other years.`);
  return notes.filter(Boolean).join(' ') || 'A leave counts as a full day. The holiday ring can sit on its own or on top of a leave.';
}
/* Note under the holiday group (only shown while the holiday is on). */
export function holidayFoot(s: State, iso: string, dr: DayDraft): string {
  const base = baseHoliday(s, iso), y = iso.slice(0, 4);
  if (base && base.src === 'weekly') return 'Office policy: every Saturday and Sunday. Turning it off here removes it for this date only, for example a working Saturday.';
  if (base && base.src === 'builtin') return base.kind === 'fixed' ? 'On this date every year. Turning it off here removes it for this year only.' : `Mapped to the festival’s date each year up to ${MAPPED_UNTIL}. Turning it off here removes it for this year only.`;
  return (dr.holRepeat ? 'Also shows on this date in every following year.' : `Only in ${y}.`) + ' Holidays you add show just the ring.';
}
/* Done in the day editor. Returns the next state (input is not mutated). newId makes ids for repeating holidays. */
export function saveDay(s: State, iso: string, dr: DayDraft, newId: () => string): State {
  const next = clone(s);
  const day = normDay({ leave: dr.leave, title: dr.title, note: dr.note.trim() });
  if (day) next.days[iso] = day; else delete next.days[iso];
  applyHoliday(s, next, iso, dr, newId);
  return next;
}
function applyHoliday(s: State, next: State, iso: string, dr: DayDraft, newId: () => string) {
  const y = +iso.slice(0, 4), md = iso.slice(5);
  const base = baseHoliday(s, iso), cur = holidayOn(s, iso);
  if (!dr.holOn && !cur) return;
  if (!dr.holOn) {
    if (!base) delete next.hol[iso];
    else if (base.src === 'custom' && base.from === y) { delete next.rec[base.id!]; delete next.hol[iso]; }
    else next.hol[iso] = { on: false, name: '' };
    return;
  }
  const name = dr.holName.trim().slice(0, 80) || (base && base.name) || 'Holiday';
  if (isDefault(base)) {
    if (name !== base!.name) next.hol[iso] = { on: true, name }; else delete next.hol[iso];
  } else if (base && base.src === 'custom') {
    const r = s.rec[base.id!], nr: Recurring = { name, md: r.md, from: r.from };
    if (!dr.holRepeat) nr.until = y;
    next.rec[base.id!] = nr;
    delete next.hol[iso];
  } else if (dr.holRepeat) {
    next.rec[newId()] = { name, md, from: y };
    delete next.hol[iso];
  } else next.hol[iso] = { on: true, name };
}

/* ---------- Balance sheet (tap a balance tile) ---------- */
/* A typed balance is "as of" today, or the nearest day inside the month on screen. */
export function anchorDate(y: number, m: number, today: string): string {
  const a = isoOf(y, m, 1), z = isoOf(y, m, daysIn(y, m));
  return today < a ? a : today > z ? z : today;
}
export function adjustRows(s: State, type: LeaveType, y: number, m: number, v: number) {
  const x = balances(s, y, m)![type], st = s.settings;
  const q = x.calQuota, taken = Math.max(0, q - v), quota = v + taken, last = `${daysIn(y, m)} ${MON3[m]}`;
  const rows: { label: string; value: string; total?: boolean }[] = [];
  if (type === 'apl') rows.push({ label: quota === q ? `Credited · ${x.months} ${x.months === 1 ? 'month' : 'months'} × ${st.aplPerMonth}` : `Credited by ${last}`, value: String(quota) });
  else if (type === 'sick') rows.push({ label: `Yearly quota · ${y}`, value: String(quota) });
  else rows.push({ label: `Monthly quota · ${MON3[m]}`, value: String(quota) });
  rows.push({ label: type === 'apl' ? `Taken by ${last}` : type === 'sick' ? `Taken in ${y}` : `Used in ${MON3[m]}`, value: String(taken) });
  rows.push({ label: type === 'apl' ? 'Balance' : 'Left', value: fmtNum(v), total: true });
  return rows;
}
export function adjustTexts(s: State, type: LeaveType, y: number, m: number, today: string) {
  const st = s.settings, d = anchorDate(y, m, today), sIdx = ymIdx(st.aplStart);
  const when = d === today ? `today (${fmtDM(d)})` : `${fmtDM(d)} ${y}`;
  return {
    title: LEAVES[type].name,
    asOf: type === 'apl' ? `Balance on ${daysIn(y, m)} ${MON3[m]} ${y}` : type === 'sick' ? `Left in ${y}` : `Left in ${MONTHS[m]} ${y}`,
    rule: type === 'apl'
      ? `${st.aplPerMonth} credited on the 1st of every month from ${MONTHS[sIdx % 12]} ${Math.floor(sIdx / 12)}. Unused ones carry forward.`
      : type === 'sick' ? `${st.sickPerYear} per calendar year. Unused ones lapse on 31 Dec.` : `${st.wfhPerMonth} per month. Unused ones lapse at month end.`,
    how: `Set this to the balance your HR portal shows. The difference counts as leave already taken as of ${when}. Leave you log from then on still comes off.`,
    resetLabel: 'Count from the calendar only',
  };
}
/* Value the reset link puts in the big number. Show the link only when balances(...)[type].cp is set and reset wasn't tapped. */
export const calendarOnlyValue = (s: State, type: LeaveType, y: number, m: number) => balances(s, y, m, { noCp: true })![type].value;
/* Done in the balance sheet. v0 = value when the sheet opened; v = value on screen; reset = "Count from the calendar only" was tapped. */
export function applyAdjust(s: State, a: { type: LeaveType; y: number; m: number; v: number; v0: number; reset: boolean }, today: string): State {
  const { type, y, m, v, v0, reset } = a;
  if (!reset && v === v0) return s;
  const next = clone(s), E = isoOf(y, m, daysIn(y, m));
  if (reset) {
    const scope = type === 'sick' ? String(y) : type === 'wfh' ? ymKey(y, m) : '';
    for (const k of Object.keys(next.adjust[type])) {
      const c = next.adjust[type][k];
      if (c.d <= E && (!scope || c.d.startsWith(scope))) delete next.adjust[type][k];
    }
  }
  if (balances(next, y, m)![type].value !== v) {
    const d = anchorDate(y, m, today);
    let later = 0;
    for (const iso of Object.keys(next.days)) if (next.days[iso].leave === type && iso >= d && iso <= E) later++;
    next.adjust[type][d.slice(0, 7)] = { d, v: v + later };
  }
  return next;
}

/* ---------- Settings ---------- */
export const STEP_LIMITS = { aplPerMonth: 31, sickPerYear: 60, wfhPerMonth: 31 } as const;   // min 0
export const holidayListEmpty = (y: number) => (y < 2026 ? 'Before you joined.' : `No office holidays in ${y} yet.`);
