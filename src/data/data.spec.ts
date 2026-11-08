import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, test } from 'node:test';
import * as R from '../rules.ts';
import { ZERO_STAMP, createClock, parseStamp } from './hlc.ts';
import type { Json, Rec, RecordMap } from './records.ts';
import { diff, flatten, mergeMaps, unflatten, valuesOf, wins } from './records.ts';
import { Store } from './store.ts';
import { manualClock, memoryPersistence } from '../test/fakes.ts';

const seedRaw = JSON.parse(fs.readFileSync(new URL('../leave-calendar-data.json', import.meta.url), 'utf8'));
const seed = R.normalizeState(seedRaw);
const vals = (b: R.Balances | null) => (b ? [b.total, b.apl.value, b.sick.value, b.wfh.value] : null);

describe('HLC', () => {
  test('stamps sort in the order they were made, even when the wall clock stands still or goes back', () => {
    const wall = manualClock();
    const c = createClock('a', wall.now);
    const a = c.now();
    const b = c.now(); // same millisecond
    wall.advance(-60_000); // clock moved back a minute
    const d = c.now();
    assert.ok(a < b && b < d);
    assert.equal(parseStamp(a)!.ms, wall.now() + 60_000);
  });

  test('observing a stamp from a device whose clock runs ahead keeps later local edits newer', () => {
    const wall = manualClock();
    const fast = createClock('f', () => wall.now() + 3_600_000);
    const slow = createClock('s', wall.now);
    const remote = fast.now();
    slow.observe(remote);
    assert.ok(slow.now() > remote);
  });

  test('counter overflow rolls into the next millisecond', () => {
    const c = createClock('a', () => 1000);
    let prev = c.now();
    for (let i = 0; i < 50_000; i++) {
      const s = c.now();
      assert.ok(s > prev);
      prev = s;
    }
  });

  test('ZERO_STAMP is older than any real stamp', () => {
    assert.ok(ZERO_STAMP < createClock('a', () => 1).now());
  });
});

describe('records', () => {
  test('flatten -> unflatten round-trips the real data', () => {
    const back = unflatten(flatten(seed));
    assert.deepEqual(back, seed);
    assert.deepEqual(vals(R.balances(back, 2026, 10)), [22, 11, 11, 2]);
    assert.deepEqual(vals(R.balances(back, 2027, 2)), [22, 10, 12, 0]);
  });

  test('a day is stored per field, so leave and note sync independently', () => {
    const f = flatten(seed);
    assert.equal(f.get('d/2027-02-26/leave'), 'wfh');
    assert.equal(f.get('d/2027-02-26/title'), 'Pack and Prep');
    assert.equal(f.has('d/2027-02-26/note'), false); // empty fields aren't stored
    assert.equal(f.get('s/aplStart'), '2026-01');
    assert.deepEqual(f.get('a/sick/2026-11'), { d: '2026-11-02', v: 11 });
  });

  test('diff only reports what changed, and a removed day becomes null', () => {
    const next = R.saveDay(seed, '2026-11-25', { ...R.initDayDraft(seed, '2026-11-25'), leave: 'apl' }, () => 'x');
    assert.deepEqual(diff(flatten(seed), flatten(next)), [['d/2026-11-25/leave', 'apl']]);
    const cleared = R.saveDay(seed, '2026-12-09', { ...R.initDayDraft(seed, '2026-12-09'), leave: null, title: '' }, () => 'x');
    assert.deepEqual(diff(flatten(seed), flatten(cleared)).sort(), [['d/2026-12-09/leave', null], ['d/2026-12-09/title', null]]);
  });

  test('a bad record cannot break the State (normalisers run on everything)', () => {
    const s = unflatten([
      ['d/2026-11-25/leave', 'holiday'],
      ['d/not-a-date/leave', 'apl'],
      ['s/aplPerMonth', 500],
      ['a/apl/2026-11', { d: 'x', v: 3 }],
      ['zzz', 1],
    ]);
    assert.deepEqual(s.days, {});
    assert.equal(s.settings.aplPerMonth, R.DEFAULTS.aplPerMonth);
    assert.deepEqual(s.adjust.apl, {});
  });

  test('merge is commutative, associative and idempotent (random maps)', () => {
    let seedN = 7;
    const rnd = () => ((seedN = (seedN * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const keys = ['d/2026-11-01/leave', 'd/2026-11-01/note', 'h/2026-11-14', 's/weekStart', 'r/h1'];
    const values: Json[] = ['apl', 'sick', null, 1, 0, { on: false, name: '' }, 'x'];
    const randomMap = (): RecordMap => {
      const m: RecordMap = new Map();
      for (const k of keys) if (rnd() < 0.7) m.set(k, { v: values[Math.floor(rnd() * values.length)], s: `00000000${Math.floor(rnd() * 4)}-000-${'abc'[Math.floor(rnd() * 3)]}` });
      return m;
    };
    const eq = (a: RecordMap, b: RecordMap) => assert.deepEqual(Object.fromEntries(a), Object.fromEntries(b));
    for (let i = 0; i < 300; i++) {
      const a = randomMap(), b = randomMap(), c = randomMap();
      eq(mergeMaps(a, b), mergeMaps(b, a));
      eq(mergeMaps(mergeMaps(a, b), c), mergeMaps(a, mergeMaps(b, c)));
      eq(mergeMaps(a, a), a);
    }
  });

  test('same stamp, different values: every device picks the same winner', () => {
    const x: Rec = { v: 'apl', s: '000000001-000-a' };
    const y: Rec = { v: 'sick', s: '000000001-000-a' };
    assert.notEqual(wins(x, y), wins(y, x));
  });
});

describe('Store', () => {
  test('commit stamps only changed records and survives a restart', async () => {
    const p = memoryPersistence();
    const s = new Store(p, createClock('a', manualClock().now));
    await s.init();
    s.commit(seed);
    await s.flushNow();
    const n = p.rows.size;
    s.commit(R.saveDay(s.getState(), '2026-11-25', { ...R.initDayDraft(s.getState(), '2026-11-25'), leave: 'sick' }, () => 'x'));
    await s.flushNow();
    assert.equal(p.rows.size, n + 1);

    const again = new Store(p);
    await again.init();
    assert.deepEqual(vals(R.balances(again.getState(), 2026, 10)), [21, 11, 10, 2]);
    assert.equal(again.getMeta('replica'), s.getMeta('replica'));
    assert.equal(again.dirty, true); // not uploaded yet, and that survives a restart
  });

  test('a failed database write is kept and retried', async () => {
    const p = memoryPersistence();
    const s = new Store(p);
    await s.init();
    p.failNext = 1;
    s.commit(seed);
    await s.flushNow();
    assert.ok(s.lastWriteError);
    assert.equal(p.rows.size, 0);
    await s.flushNow();
    assert.equal(s.lastWriteError, null);
    const again = new Store(p);
    await again.init();
    assert.deepEqual(again.getState(), seed);
  });

  test('a no-op commit changes nothing', async () => {
    const s = new Store(memoryPersistence());
    await s.init();
    s.commit(seed);
    const v = s.version;
    assert.equal(s.commit(R.normalizeState(seedRaw)), false);
    assert.equal(s.version, v);
  });

  test('import replaces everything: days missing from the backup are deleted', async () => {
    const s = new Store(memoryPersistence());
    await s.init();
    s.commit(seed);
    s.commit(R.normalizeState({ days: { '2026-11-25': { leave: 'apl', title: '', note: '' } } }));
    const st = s.getState();
    assert.deepEqual(Object.keys(st.days), ['2026-11-25']);
    assert.equal(st.settings.aplStart, R.DEFAULTS.aplStart);
    assert.deepEqual(st.adjust, { apl: {}, sick: {}, wfh: {} });
    assert.equal(valuesOf(s.snapshot().records).filter(([, v]) => v === null).length > 0, true); // tombstones
  });

  test('wipe clears the calendar but keeps the listed meta', async () => {
    const p = memoryPersistence();
    const s = new Store(p);
    await s.init();
    s.commit(seed);
    s.setMeta('onboarded', '1');
    s.setMeta('account', '{"id":"1"}');
    await s.wipe(['onboarded', 'replica']);
    assert.deepEqual(s.getState(), R.emptyState());
    assert.equal(s.getMeta('onboarded'), '1');
    assert.equal(s.getMeta('account'), undefined);
    assert.equal(p.rows.size, 0);
  });
});
