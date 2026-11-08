import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as R from './rules.ts';

const seed = R.normalizeState(JSON.parse(fs.readFileSync(new URL('./leave-calendar-data.json', import.meta.url), 'utf8')));
const vals = (b: any) => [b.total, b.apl.value, b.sick.value, b.wfh.value];   // [Total, APL, Sick, WFH]

// Balances, month by month (as of month end)
assert.deepEqual(vals(R.balances(seed, 2026, 10)), [22, 11, 11, 2]);   // Nov 2026
assert.deepEqual(vals(R.balances(seed, 2026, 11)), [22, 11, 11, 2]);   // Dec 2026: +2 credit, 2 APL logged
assert.deepEqual(vals(R.balances(seed, 2027, 0)), [28, 13, 15, 2]);    // Jan 2027: sick resets to 15
assert.deepEqual(vals(R.balances(seed, 2027, 1)), [30, 15, 15, 1]);    // Feb 2027: 1 WFH on 26 Feb
assert.deepEqual(vals(R.balances(seed, 2027, 2)), [22, 10, 12, 0]);    // Mar 2027: 7 APL, 3 sick, 2 WFH
assert.deepEqual(vals(R.balances(seed, 2027, 3)), [24, 12, 12, 2]);    // Apr 2027
assert.equal(R.balances(seed, 2026, 2), null);                          // Mar 2026: before joining -> "–"

// Holidays
const hols = (y: number, m: number) => { const o: string[] = []; for (let d = 1; d <= R.daysIn(y, m); d++) { const h = R.holidayOn(seed, R.isoOf(y, m, d)); if (h) o.push(`${d}${h.office ? 'o' : 'm'}${R.plainWeekly(h) ? '' : ':' + h.name}`); } return o; };
assert.deepEqual(hols(2026, 10), ['1o', '7o', '8o:Diwali', '14o', '15o', '21o', '22o', '28o', '29o']);
assert.deepEqual(hols(2027, 9), ['2o:Gandhi Jayanti', '3o', '9o:Dussehra', '10o', '16o', '17o', '23o', '24o', '29o:Diwali', '30o', '31o']);
assert.deepEqual(R.holidaysInYear(seed, 2027).map(h => `${R.fmtShort(h.iso)} ${h.name}`), [
  'Sat, 1 May Labour Day', 'Mon, 17 May Bakrid (Eid-ul-Zuha)', 'Sun, 15 Aug Independence Day', 'Sat, 4 Sep Ganesh Chaturthi',
  'Sat, 2 Oct Gandhi Jayanti', 'Sat, 9 Oct Dussehra', 'Fri, 29 Oct Diwali', 'Sat, 25 Dec Christmas Day']);
assert.deepEqual(hols(2026, 2), []);                                    // before joining

// Live preview while editing Wed 25 Nov 2026 with APL selected
assert.deepEqual(vals(R.balances(seed, 2026, 10, { days: R.previewDays(seed, '2026-11-25', 'apl') })), [21, 10, 11, 2]);
const dr = R.initDayDraft(seed, '2026-11-25'); dr.leave = 'apl';
assert.deepEqual(R.optionLeft(seed, '2026-11-25', dr, 'apl'), { text: '10 left', over: false });
assert.deepEqual(R.optionLeft(seed, '2026-11-25', dr, 'sick'), { text: '11 left', over: false });

// A leave before the 2 Nov checkpoint is already counted
assert.deepEqual(vals(R.balances(seed, 2026, 10, { days: R.previewDays(seed, '2026-11-01', 'apl') })), [22, 11, 11, 2]);
assert.equal(R.absorbedNote(seed, '2026-11-01', 'apl'), 'This date is before 2 Nov, when you set your APL balance, so it’s already counted there.');

// Balance sheets
const rows = (t: R.LeaveType, v: number) => R.adjustRows(seed, t, 2026, 10, v).map(r => `${r.label}=${r.value}`);
assert.deepEqual(rows('sick', 11), ['Yearly quota · 2026=15', 'Taken in 2026=4', 'Left=11']);
assert.deepEqual(rows('sick', 10), ['Yearly quota · 2026=15', 'Taken in 2026=5', 'Left=10']);
assert.deepEqual(rows('apl', 11), ['Credited · 11 months × 2=22', 'Taken by 30 Nov=11', 'Balance=11']);
assert.deepEqual(rows('wfh', 2), ['Monthly quota · Nov=2', 'Used in Nov=0', 'Left=2']);
const s2 = R.applyAdjust(seed, { type: 'sick', y: 2026, m: 10, v: 10, v0: 11, reset: false }, '2026-11-08');
assert.deepEqual(s2.adjust.sick['2026-11'], { d: '2026-11-08', v: 10 });
assert.equal(R.balances(s2, 2026, 10)!.sick.value, 10);
assert.equal(R.calendarOnlyValue(seed, 'apl', 2026, 10), 22);
const s3 = R.applyAdjust(seed, { type: 'apl', y: 2026, m: 10, v: 22, v0: 11, reset: true }, '2026-11-08');
assert.deepEqual(s3.adjust.apl, {});
assert.equal(R.adjustTexts(seed, 'sick', 2026, 10, '2026-11-08').how, 'Set this to the balance your HR portal shows. The difference counts as leave already taken as of today (8 Nov). Leave you log from then on still comes off.');

// Weekends and holidays in the day editor / details
const det = R.dayDetails(seed, '2026-11-14');
assert.equal(det.weekday, 'SATURDAY'); assert.equal(det.date, '14 November 2026');
assert.deepEqual(det.items[0], { swatch: { holiday: true, office: true }, title: 'Weekly off', sub: 'Office holiday · every Sat & Sun' });
assert.equal(det.foot, 'November balance: 11 all-purpose · 11 sick · 2 WFH.');
const dw = R.initDayDraft(seed, '2026-11-14'); dw.leave = 'apl';
assert.equal(R.optionsFoot(seed, '2026-11-14', dw), 'This is an office holiday. Leave logged here still comes off your balance.');
const d14 = R.initDayDraft(seed, '2026-11-14'); d14.holOn = false;
const s4 = R.saveDay(seed, '2026-11-14', d14, () => 'x');
assert.equal(R.holidayOn(s4, '2026-11-14'), null);                      // working Saturday: this date only
assert.ok(R.holidayOn(s4, '2026-11-21'));
assert.equal(R.optionsFoot(seed, '2026-11-14', d14), 'Weekly off is switched off for this date only.');
const d25 = R.initDayDraft(seed, '2026-11-25'); d25.holOn = true; d25.holName = 'Team day off';
const s5 = R.saveDay(seed, '2026-11-25', d25, () => 'h1');
assert.equal(R.holidayOn(s5, '2026-11-25')!.office, false);              // added by you: ring only
assert.equal(R.holidayOn(s5, '2027-11-25')!.name, 'Team day off');      // repeats yearly by default
assert.equal(R.holidayFoot(s5, '2026-11-25', d25), 'Also shows on this date in every following year. Holidays you add show just the ring.');
assert.deepEqual(R.holidayOption(seed, '2026-11-08'), { office: true, caption: 'Office', groupLabel: 'Office holiday', a11y: 'Office holiday', repeatsInfo: 'Every year, date mapped' });

// Grid, list, captions
assert.deepEqual(R.monthLayout(seed, 2026, 10), { lead: 6, days: 30, trail: 6 });
assert.deepEqual(R.weekdayHeader(1).map(w => w.letter).join(''), 'MTWTFSS');
const c8 = R.cellModel(seed, '2026-11-08', '2026-11-08');
assert.deepEqual([c8.office, c8.today, c8.labels[0].text, c8.a11yLabel], [true, true, 'Diwali', 'Sunday 8 November, today, office holiday: Diwali']);
assert.deepEqual(R.agendaRows(seed, 2026, 11).map(r => `${r.day}|${r.title}|${r.sub}`), [
  '9|Mumbai (BOM) → Bangkok (BKK) Non-Stop AI 2337 (13:40–19:40) or 6E 1059 (14:00–19:50)|Wed · All-purpose leave',
  '14|Bangkok (BKK) → Seoul (ICN) Non-Stop Thai Airways TG 652 (08:00–15:25 A350) or 1-Stop ZH 306+633|Mon · All-purpose leave',
  '25|Christmas Day|Fri · Office holiday']);
assert.equal(R.agendaRows(seed, 2027, 1).at(-1)!.sub, 'Sun · Weekly off');   // 28 Feb 2027 title on a weekend
assert.deepEqual(R.tileCaptions(seed, 2026, 10).wfh, { short: 'of 2 / month', long: 'of 2 in Nov · lapses 30 Nov' });
assert.equal(R.agendaEmpty(0), 'Nothing in January yet. Tap a date to log a leave, add a title or mark an office holiday.');
console.log('All rules tests passed');
