/**
 * tmp-e2e-check.mjs — end-to-end verification of the work-update upload flow:
 *  1. start the sync server on a scratch port + scratch db file
 *  2. PUT a db doc whose update carries a base64 PNG data URL
 *  3. expect data/work-uploads/<id>-0.png to exist on disk
 *  4. expect GET /api/db to return the update with a /api/work-uploads/ path
 *  5. expect GET /api/work-uploads/<file> to serve the exact bytes back
 */
import { createServer } from 'node:http';
import { readFile, rm, stat } from 'node:fs/promises';
import { createSyncServer } from './server/syncServer.js';

const PORT = 3977;
const FILE = '.data/tmp-e2e-db.json';
const BASE = `http://localhost:${PORT}`;

// 1x1 red PNG
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const sync = await createSyncServer({ file: FILE });
const server = createServer((req, res) => {
  sync.handler(req, res).then((handled) => {
    if (!handled) {
      res.writeHead(404);
      res.end('not found');
    }
  });
});
await new Promise((resolve) => server.listen(PORT, resolve));

let failures = 0;
function check(name, ok, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failures += 1;
}

try {
  // 2. PUT a db doc with an update carrying a data-URL image.
  const now = new Date().toISOString();
  const db = {
    version: 3,
    collections: {
      users: [],
      attendance: [],
      requests: [],
      updates: [
        {
          id: 'upd-e2e-test-1',
          labourId: 'LAB001',
          labourName: 'Ramesh Kumar',
          type: 'work-activity',
          details: 'E2E check update',
          media: [{ kind: 'image', dataUrl: `data:image/png;base64,${PNG_B64}`, name: 'shot.png' }],
          date: now.slice(0, 10),
          status: 'new',
          createdAt: now,
          updatedAt: now,
        },
      ],
    },
  };
  const put = await fetch(`${BASE}/api/db`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ revision: Date.now() + 5, db }),
  });
  check('PUT /api/db accepted', put.status === 200, `status ${put.status}`);

  // 3. the file exists on disk under data/work-uploads/.
  const diskPath = 'data/work-uploads/upd-e2e-test-1-0.png';
  let diskOk = false;
  let diskBytes = null;
  try {
    diskBytes = await readFile(diskPath);
    diskOk = diskBytes.length > 0;
  } catch {
    diskOk = false;
  }
  check('file saved to data/work-uploads/', diskOk, diskPath);

  // 4. GET /api/db returns the update with the served path (not the data URL).
  const got = await fetch(`${BASE}/api/db`);
  const body = await got.json();
  const stored = body.db.collections.updates[0];
  const storedUrl = stored?.media?.[0]?.dataUrl ?? '';
  check(
    'record stores the file path',
    storedUrl === '/api/work-uploads/upd-e2e-test-1-0.png',
    storedUrl,
  );

  // 5. GET the file back — exact bytes, correct content type.
  const fileRes = await fetch(`${BASE}${storedUrl}`);
  const fileBytes = Buffer.from(await fileRes.arrayBuffer());
  check(
    'GET file serves exact bytes',
    fileRes.status === 200 && fileBytes.equals(diskBytes),
    `status ${fileRes.status}, ${fileBytes.length} bytes`,
  );
  check(
    'content-type is image/png',
    (fileRes.headers.get('content-type') ?? '') === 'image/png',
    fileRes.headers.get('content-type') ?? '',
  );

  // 6. idempotency: re-PUT the same doc — no duplicate file, path preserved.
  const put2 = await fetch(`${BASE}/api/db`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ revision: Date.now() + 6, db: body.db }),
  });
  check('re-PUT accepted', put2.status === 200, `status ${put2.status}`);
  const got2 = await (await fetch(`${BASE}/api/db`)).json();
  const again = got2.db.collections.updates[0]?.media?.[0]?.dataUrl ?? '';
  check(
    'path survives a re-PUT (idempotent)',
    again === '/api/work-uploads/upd-e2e-test-1-0.png',
    again,
  );

  // 7. traversal guard: a nasty filename must not serve.
  const evil = await fetch(`${BASE}/api/work-uploads/..%2F..%2Fpackage.json`);
  check('path traversal blocked', evil.status !== 200, `status ${evil.status}`);
} finally {
  server.close();
  await rm(FILE, { force: true });
  await rm('data/work-uploads/upd-e2e-test-1-0.png', { force: true });
}

console.log(failures === 0 ? '\nALL E2E CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
