/* Minimal Google Drive v3 REST client for the hidden app data folder (scope: drive.appdata).
   Users can't see or edit this folder; only this app can. Uses fetch, so it runs anywhere. */

export const DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FILE_FIELDS = 'id,name,md5Checksum,modifiedTime,size';

export type DriveFile = { id: string; name: string; md5Checksum?: string; modifiedTime?: string; size?: string };

export type Drive = {
  /** Files in the app folder whose name starts with `prefix`. */
  list(prefix: string): Promise<DriveFile[]>;
  download(id: string): Promise<string>;
  create(name: string, json: string): Promise<DriveFile>;
  update(id: string, json: string): Promise<DriveFile>;
  remove(id: string): Promise<void>;
};

/** Returns an access token. `refresh` asks for a fresh one (the previous one was rejected). */
export type TokenSource = (opts: { refresh: boolean }) => Promise<string>;

export class DriveError extends Error {
  status: number;
  /** Google's error reason, e.g. "storageQuotaExceeded", "insufficientPermissions", "rateLimitExceeded". */
  reason: string;
  constructor(status: number, reason: string, message: string) {
    super(message);
    this.name = 'DriveError';
    this.status = status;
    this.reason = reason;
  }
}

async function toError(res: Response): Promise<DriveError> {
  let reason = '';
  let message = `Google Drive request failed (${res.status})`;
  try {
    const body = (await res.json()) as { error?: { message?: string; status?: string; errors?: { reason?: string }[] } };
    reason = body.error?.errors?.[0]?.reason || body.error?.status || '';
    if (body.error?.message) message = body.error.message;
  } catch {
    /* not JSON */
  }
  return new DriveError(res.status, reason, message);
}

export function createDrive(getToken: TokenSource, fetchImpl: typeof fetch = fetch): Drive {
  async function call(url: string, init: RequestInit = {}): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      const token = await getToken({ refresh: attempt > 0 });
      const res = await fetchImpl(url, { ...init, headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` } });
      if (res.status === 401 && attempt === 0) continue; // expired token: get a fresh one and retry once
      if (!res.ok) throw await toError(res);
      return res;
    }
  }

  return {
    async list(prefix) {
      const files: DriveFile[] = [];
      let pageToken = '';
      do {
        const q = encodeURIComponent(`name contains '${prefix.replace(/'/g, "\\'")}' and trashed = false`);
        const url = `${API}/files?spaces=appDataFolder&q=${q}&pageSize=1000&orderBy=createdTime&fields=nextPageToken,files(${FILE_FIELDS})${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
        const body = (await (await call(url)).json()) as { files?: DriveFile[]; nextPageToken?: string };
        for (const f of body.files ?? []) if (f.name.startsWith(prefix)) files.push(f);
        pageToken = body.nextPageToken ?? '';
      } while (pageToken);
      return files;
    },

    async download(id) {
      return (await call(`${API}/files/${encodeURIComponent(id)}?alt=media`)).text();
    },

    async create(name, json) {
      const boundary = `lc${Math.random().toString(36).slice(2)}`;
      const metadata = JSON.stringify({ name, parents: ['appDataFolder'], mimeType: 'application/json' });
      const body =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${json}\r\n--${boundary}--`;
      const res = await call(`${UPLOAD}/files?uploadType=multipart&fields=${FILE_FIELDS}`, {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body,
      });
      return (await res.json()) as DriveFile;
    },

    async update(id, json) {
      const res = await call(`${UPLOAD}/files/${encodeURIComponent(id)}?uploadType=media&fields=${FILE_FIELDS}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: json,
      });
      return (await res.json()) as DriveFile;
    },

    async remove(id) {
      try {
        await call(`${API}/files/${encodeURIComponent(id)}`, { method: 'DELETE' });
      } catch (e) {
        if (!(e instanceof DriveError && e.status === 404)) throw e; // already gone is fine
      }
    },
  };
}
