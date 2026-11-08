import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, test } from 'node:test';
import * as R from '../rules.ts';
import { createClock } from '../data/hlc.ts';
import { Store } from '../data/store.ts';
import { fakeDriveFolder, manualClock, memoryPersistence } from '../test/fakes.ts';
import { DriveError, createDrive } from './drive.ts';
import { deleteAllReplicas, syncOnce } from './engine.ts';
import { FORMAT, REPLICA_PREFIX, encodeReplica } from './replica.ts';

const seed = R.normalizeState(JSON.parse(fs.readFileSync(new URL('../leave-calendar-data.json', import.meta.url), 'utf8')));
const vals = (b: R.Balances | null) => (b ? [b.total, b.apl.value, b.sick.value, b.wfh.value] : null);
const draft = (s: R.State, iso: string, patch: Partial<R.DayDraft>) => ({ ...R.initDayDraft(s, iso), ...patch });

async function device(folder: ReturnType<typeof fakeDriveFolder>, name: string, wall = manualClock()) {
  const p = memoryPersistence();
  const store = new Store(p, createClock(name, wall.now));
  await store.init();
  const drive = folder.handle(name);
  return { store, drive, p, wall, sync: () => syncOnce(store, drive, () => new Date(wall.now())) };
}
const edit = (d: { store: Store }, iso: string, patch: Partial<R.DayDraft>) => {
  const s = d.store.getState();
  d.store.commit(R.saveDay(s, iso, draft(s, iso, patch), () => 'h' + Math.random().toString(36).slice(2, 8)));
};

describe('sync between devices', () => {
  test('back up from one phone, restore on a new one', async () => {
    const folder = fakeDriveFolder();
    const phone = await device(folder, 'phone');
    phone.store.commit(seed);
    const first = await phone.sync();
    assert.equal(first.uploaded, true);
    assert.equal(folder.files.size, 1);

    const newPhone = await device(folder, 'new');
    await newPhone.sync();
    assert.deepEqual(newPhone.store.getState(), seed);
    assert.deepEqual(vals(R.balances(newPhone.store.getState(), 2026, 10)), [22, 11, 11, 2]);
  });

  test('edits to different fields of the same day on two devices both survive', async () => {
    const folder = fakeDriveFolder();
    const a = await device(folder, 'a');
    const b = await device(folder, 'b');
    a.store.commit(seed);
    await a.sync();
    await b.sync();
    // Offline at the same time: A marks 25 Nov as APL, B writes a note on it.
    edit(a, '2026-11-25', { leave: 'apl' });
    edit(b, '2026-11-25', { note: 'Dentist at 10' });
    await b.sync();
    await a.sync();
    await b.sync();
    for (const d of [a, b]) assert.deepEqual(d.store.getState().days['2026-11-25'], { leave: 'apl', title: '', note: 'Dentist at 10' });
    assert.deepEqual(a.store.getState(), b.store.getState());
  });

  test('the same field edited on two devices: the later edit wins everywhere', async () => {
    const folder = fakeDriveFolder();
    const wall = manualClock();
    const a = await device(folder, 'a', wall);
    const b = await device(folder, 'b', wall);
    edit(a, '2026-11-25', { leave: 'apl' });
    wall.advance(5_000);
    edit(b, '2026-11-25', { leave: 'sick' });
    await a.sync();
    await b.sync();
    await a.sync();
    assert.equal(a.store.getState().days['2026-11-25'].leave, 'sick');
    assert.equal(b.store.getState().days['2026-11-25'].leave, 'sick');
  });

  test('a phone with a slow clock still wins with an edit made after it synced (HLC)', async () => {
    const folder = fakeDriveFolder();
    const real = manualClock();
    const ahead = { now: () => real.now() + 3_600_000 }; // tablet clock is 1 hour fast
    const tablet = await device(folder, 'tablet', { ...real, now: ahead.now });
    const phone = await device(folder, 'phone', real);
    edit(tablet, '2026-11-25', { leave: 'apl' });
    await tablet.sync();
    await phone.sync();
    real.advance(1000);
    edit(phone, '2026-11-25', { leave: 'wfh' }); // happens after, though the phone's clock says otherwise
    await phone.sync();
    await tablet.sync();
    assert.equal(tablet.store.getState().days['2026-11-25'].leave, 'wfh');
  });

  test('deletes sync (tombstones), including removing a repeating holiday', async () => {
    const folder = fakeDriveFolder();
    const a = await device(folder, 'a');
    const b = await device(folder, 'b');
    edit(a, '2026-11-25', { holOn: true, holName: 'Team day off' });
    await a.sync();
    await b.sync();
    assert.equal(R.holidayOn(b.store.getState(), '2027-11-25')!.name, 'Team day off');
    edit(b, '2026-11-25', { holOn: false });
    await b.sync();
    await a.sync();
    assert.equal(R.holidayOn(a.store.getState(), '2026-11-25'), null);
    assert.equal(R.holidayOn(a.store.getState(), '2027-11-25'), null);
  });

  test('offline changes are kept and go up when the connection is back', async () => {
    const folder = fakeDriveFolder();
    const a = await device(folder, 'a');
    a.store.commit(seed);
    (a.drive as { offline: boolean }).offline = true;
    await assert.rejects(a.sync(), TypeError);
    assert.equal(a.store.dirty, true);
    assert.equal(folder.files.size, 0);
    (a.drive as { offline: boolean }).offline = false;
    await a.sync();
    assert.equal(a.store.dirty, false);
    const b = await device(folder, 'b');
    await b.sync();
    assert.deepEqual(b.store.getState(), seed);
  });

  test('nothing new means one list request and no uploads', async () => {
    const folder = fakeDriveFolder();
    const a = await device(folder, 'a');
    const b = await device(folder, 'b');
    a.store.commit(seed);
    await a.sync();
    await b.sync();
    await a.sync(); // picks up b's file once
    folder.calls.length = 0;
    await a.sync();
    await b.sync();
    assert.deepEqual(folder.calls, ['a:list', 'b:list']);
  });

  test('a sign-in on a device that already has local data merges both, nothing is lost', async () => {
    const folder = fakeDriveFolder();
    const cloud = await device(folder, 'cloud');
    cloud.store.commit(seed);
    await cloud.sync();
    const local = await device(folder, 'local');
    edit(local, '2027-05-03', { leave: 'apl', title: 'Long weekend' });
    await local.sync();
    const s = local.store.getState();
    assert.equal(s.days['2027-05-03'].title, 'Long weekend');
    assert.equal(s.days['2026-12-09'].leave, 'apl');
    await cloud.sync();
    assert.deepEqual(cloud.store.getState(), s);
  });

  test('a file from a newer app version is left alone and reported', async () => {
    const folder = fakeDriveFolder();
    const future = folder.handle('future');
    await future.create(`${REPLICA_PREFIX}future.json`, JSON.stringify({ format: FORMAT, v: 99, records: {} }));
    const a = await device(folder, 'a');
    edit(a, '2026-11-25', { leave: 'apl' });
    const out = await a.sync();
    assert.equal(out.newerFormat, true);
    assert.equal([...folder.files.values()].find(f => f.name.includes('future'))!.body.includes('"v":99'), true);
  });

  test('if our own file is overwritten by a restored copy of this device, we put our data back', async () => {
    const folder = fakeDriveFolder();
    const a = await device(folder, 'a');
    a.store.commit(seed);
    await a.sync();
    const [file] = [...folder.files.values()];
    file.body = encodeReplica(a.store.getMeta('replica')!, new Map(), new Date()); // a twin wrote an empty copy
    await a.sync();
    const b = await device(folder, 'b');
    await b.sync();
    assert.deepEqual(b.store.getState(), seed);
  });

  test('delete backup removes every replica file', async () => {
    const folder = fakeDriveFolder();
    const a = await device(folder, 'a');
    const b = await device(folder, 'b');
    a.store.commit(seed);
    await a.sync();
    await b.sync();
    assert.equal(folder.files.size, 2);
    assert.equal(await deleteAllReplicas(a.drive), 2);
    assert.equal(folder.files.size, 0);
  });
});

describe('Drive REST client', () => {
  type Call = { url: string; init: RequestInit };
  const respond = (status: number, body: unknown) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  test('refreshes the token once on 401, sends Bearer auth, and pages through list results', async () => {
    const calls: Call[] = [];
    const tokens: boolean[] = [];
    const queue = [
      respond(401, { error: { code: 401, message: 'expired' } }),
      respond(200, { files: [{ id: '1', name: 'lc-replica-a.json' }], nextPageToken: 'p2' }),
      respond(200, { files: [{ id: '2', name: 'lc-replica-b.json' }, { id: '3', name: 'other.json' }] }),
    ];
    const fetchFake = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return queue.shift()!;
    }) as unknown as typeof fetch;
    const drive = createDrive(async ({ refresh }) => {
      tokens.push(refresh);
      return refresh ? 'fresh' : 'stale';
    }, fetchFake);
    const files = await drive.list('lc-replica-');
    assert.deepEqual(files.map(f => f.id), ['1', '2']);
    assert.deepEqual(tokens, [false, true, false]);
    assert.equal((calls[1].init.headers as Record<string, string>).Authorization, 'Bearer fresh');
    assert.match(calls[0].url, /spaces=appDataFolder/);
    assert.match(decodeURIComponent(calls[0].url), /name contains 'lc-replica-' and trashed = false/);
    assert.match(calls[2].url, /pageToken=p2/);
  });

  test('creates files in appDataFolder with a multipart upload', async () => {
    let seen: Call | null = null;
    const drive = createDrive(async () => 't', (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return respond(200, { id: 'x', name: 'n', md5Checksum: 'm' });
    }) as unknown as typeof fetch);
    const f = await drive.create('lc-replica-a.json', '{"a":"→ ✓"}');
    assert.equal(f.id, 'x');
    const call = seen as unknown as Call;
    assert.match(call.url, /^https:\/\/www\.googleapis\.com\/upload\/drive\/v3\/files\?uploadType=multipart/);
    const ct = (call.init.headers as Record<string, string>)['Content-Type'];
    const boundary = /boundary=(\S+)/.exec(ct)![1];
    const body = String(call.init.body);
    assert.ok(body.startsWith(`--${boundary}\r\n`) && body.endsWith(`--${boundary}--`));
    assert.match(body, /"parents":\["appDataFolder"\]/);
    assert.match(body, /\{"a":"→ ✓"\}/);
  });

  test('turns Google errors into DriveError with the reason', async () => {
    const drive = createDrive(async () => 't', (async () =>
      respond(403, { error: { code: 403, message: 'The user’s Drive storage quota has been exceeded.', errors: [{ reason: 'storageQuotaExceeded' }] } })) as unknown as typeof fetch);
    await assert.rejects(drive.update('x', '{}'), (e: unknown) => e instanceof DriveError && e.status === 403 && e.reason === 'storageQuotaExceeded');
  });

  test('remove treats 404 as already deleted', async () => {
    const drive = createDrive(async () => 't', (async () => respond(404, { error: { code: 404, message: 'nf' } })) as unknown as typeof fetch);
    await drive.remove('gone');
  });
});
