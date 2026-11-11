/**
 * syncServer.js — the local cross-browser sync server (no dependencies,
 * Node's built-in http only).
 *
 * WHY: localStorage is per browser profile, so a labour checking in on
 * Chrome can never reach a supervisor dashboard open in Edge. This server
 * gives every browser one shared copy of the app's DB document:
 *
 *   GET /api/db          → 200 { version, revision, db }   (latest doc)
 *   PUT /api/db          → writes the posted doc when revision is newer
 *   GET /api/db/events   → Server-Sent Events stream; each write pushes a
 *                          `revision` event so browsers update within ~1s
 *
 * The document is persisted to a JSON file on disk (server/dataFile.js)
 * after every accepted write, so data survives server restarts. Revision
 * numbers make concurrent writers safe: a stale/in-flight tab can never
 * clobber a newer one (its PUT is rejected with 409 and it reloads).
 *
 * Run standalone:  node server/syncServer.js [--file .data/db.json] [--port 3847]
 * Or mounted in Vite dev: see vite.config.js (handler is reused unchanged).
 */

import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { migrateDb, ensureSeededUsers } from '../src/data/dbCore.js';
import { DEFAULT_DATA_FILE, ensureDbFile, persistDbFile, parseCliArgs } from './dataFile.js';

export const DEFAULT_PORT = 3847;

/* ### section-uploads */
/**
 * Work-update media uploads (images/videos a labour attaches to an update).
 * Files are saved under <project>/data/work-uploads/ and served back at
 * /api/work-uploads/<filename> so the supervisor's browser can render them
 * inline (<img> / <video>) without the whole base64 blob living in the DB.
 */
const UPLOAD_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'work-uploads');
const UPLOAD_URL_PREFIX = '/api/work-uploads/';
/** Extension + mime per accepted media kind (mirrors UPDATE_MEDIA_KINDS). */
const UPLOAD_KINDS = {
  image: { ext: '.jpg', mime: 'image/jpeg' },
  video: { ext: '.webm', mime: 'video/webm' },
  audio: { ext: '.webm', mime: 'audio/webm' },
};
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB per file

/** 'data:image/png;base64,AAA' → { mime, buffer } or null when malformed. */
function parseDataUrl(dataUrl) {
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(String(dataUrl ?? ''));
  if (!match) return null;
  try {
    return { mime: match[1], buffer: Buffer.from(match[2], 'base64') };
  } catch {
    return null;
  }
}

/** Pick a safe extension from the mime type (falls back to the kind's). */
function extForMime(mime, fallbackExt) {
  const table = {
    'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
    'image/gif': '.gif', 'video/webm': '.webm', 'video/mp4': '.mp4',
    'audio/webm': '.webm', 'audio/mp4': '.m4a', 'audio/mpeg': '.mp3',
  };
  return table[mime] ?? fallbackExt;
}

/**
 * Save one media item's data URL to disk. Returns the public URL path
 * ('/api/work-uploads/upd-…-1.jpg') or null when the item carries no
 * parsable data URL (kept as-is by the caller).
 */
async function saveUploadMedia(updateId, index, item) {
  const kind = UPLOAD_KINDS[item.kind] ? item.kind : null;
  const parsed = parseDataUrl(item.dataUrl);
  if (!kind || !parsed) return null;
  const ext = extForMime(parsed.mime, UPLOAD_KINDS[kind].ext);
  if (parsed.buffer.length === 0 || parsed.buffer.length > MAX_UPLOAD_BYTES) return null;
  await mkdir(UPLOAD_DIR, { recursive: true });
  const safeId = String(updateId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'upd';
  const filename = `${safeId}-${index}${ext}`;
  await writeFile(join(UPLOAD_DIR, filename), parsed.buffer);
  return `${UPLOAD_URL_PREFIX}${filename}`;
}

/** Serve one uploaded file (whitelisted dir, no traversal possible). */
async function serveUploadFile(res, filename) {
  const safe = String(filename).replace(/[^a-zA-Z0-9._-]/g, '');
  if (!safe || safe.includes('..')) return false;
  try {
    const buffer = await readFile(join(UPLOAD_DIR, safe));
    const ext = (safe.split('.').pop() ?? '').toLowerCase();
    const mimes = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
      gif: 'image/gif', webm: 'video/webm', mp4: 'video/mp4', m4a: 'audio/mp4',
      mp3: 'audio/mpeg',
    };
    res.writeHead(200, {
      'content-type': mimes[ext] ?? 'application/octet-stream',
      'cache-control': 'public, max-age=31536000, immutable',
    });
    res.end(buffer);
    return true;
  } catch {
    return false;
  }
}
/* ### endsection-uploads */

/** Parse --port on top of dataFile's args. */
export function parseServerArgs(argv) {
  const args = { ...parseCliArgs(argv), port: DEFAULT_PORT };
  for (let index = 2; index < argv.length; index += 1) {
    if (argv[index] === '--port') {
      args.port = Number(argv[index + 1]) || DEFAULT_PORT;
      index += 1;
    }
  }
  return args;
}

function sendJson(res, status, body, headers = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(payload);
}

/**
 * Create the sync subsystem: state + an http request listener that can be
 * mounted inside Vite's dev server OR served by a standalone process.
 */
export async function createSyncServer({ file = DEFAULT_DATA_FILE } = {}) {
  let db = await ensureDbFile(file);
  let revision = Date.now();
  const sseClients = new Set();

  function broadcastRevision() {
    const frame = `event: revision\ndata: ${JSON.stringify({ revision })}\n\n`;
    for (const res of sseClients) {
      try {
        res.write(frame);
      } catch {
        sseClients.delete(res);
      }
    }
  }

  async function handleApiRequest(req, res) {
    const url = new URL(req.url ?? '/', 'http://localhost');

    /* ### uploads-route */
    // GET /api/work-uploads/<file> — a saved image/video/audio file.
    if (url.pathname.startsWith(UPLOAD_URL_PREFIX) && req.method === 'GET') {
      const served = await serveUploadFile(res, url.pathname.slice(UPLOAD_URL_PREFIX.length));
      if (served) return true;
      sendJson(res, 404, { error: 'upload not found' });
      return true;
    }

    if (url.pathname === '/api/db/events' && req.method === 'GET') {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      res.write(`event: revision\ndata: ${JSON.stringify({ revision })}\n\n`);
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));
      return true;
    }

    if (url.pathname === '/api/db' && req.method === 'GET') {
      sendJson(res, 200, { version: db.version, revision, db });
      return true;
    }

    if (url.pathname === '/api/db' && req.method === 'PUT') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      } catch {
        sendJson(res, 400, { error: 'invalid JSON body' });
        return true;
      }
      if (!body.db || typeof body.db !== 'object' || typeof body.db.version !== 'number') {
        sendJson(res, 422, { error: 'body must carry a valid DB document in `db`' });
        return true;
      }
      const offered = Number(body.revision);
      if (!Number.isFinite(offered) || offered <= revision) {
        // Stale writer — reject; the client will reload and retry.
        sendJson(res, 409, { revision });
        return true;
      }
      db = migrateDb(body.db);
      // Login guard: a document with an EMPTY users collection would lock
      // every worker out (authenticateUser finds nobody). Repair it the
      // same way the browser's getDb() does, so the shared file can never
      // hold a userless document again.
      db = ensureSeededUsers(db);
      // Work-update media: any data URL inside an update's media array is
      // written to data/work-uploads/ and replaced with its served URL path,
      // so the DB doc stays small and files survive DB rewrites.
      const updates = db?.collections?.updates;
      if (Array.isArray(updates)) {
        for (const update of updates) {
          if (!Array.isArray(update?.media)) continue;
          // Idempotent: items already holding a /api/work-uploads/ path (or
          // any non-data-URL value) fail parseDataUrl and pass through.
          const saved = [];
          for (let index = 0; index < update.media.length; index += 1) {
            const item = update.media[index];
            const urlPath = await saveUploadMedia(update.id, index, item);
            saved.push(urlPath ? { ...item, dataUrl: urlPath } : item);
          }
          update.media = saved;
        }
      }
      // Defect-report voice notes: the same pipeline for the labour
      // ReportForm's audio (defectReports[].voiceNote). A data URL is
      // written to data/work-uploads/ and replaced with its served path;
      // an already-saved '/api/work-uploads/…' path (or any non-data-URL)
      // fails parseDataUrl and passes through unchanged — idempotent.
      const defectReports = db?.collections?.defectReports;
      if (Array.isArray(defectReports)) {
        for (const report of defectReports) {
          if (typeof report?.voiceNote !== 'string') continue;
          const urlPath = await saveUploadMedia(report.id, 0, {
            kind: 'audio',
            dataUrl: report.voiceNote,
          });
          if (urlPath) report.voiceNote = urlPath;
        }
        // Attachment metadata (name/type/size) rides along untouched —
        // images are deliberately NOT uploaded (images-only upload later).
      }
      revision = offered;
      try {
        await persistDbFile(file, db);
      } catch (error) {
        sendJson(res, 500, { error: `persist failed: ${error.message}` });
        return true;
      }
      broadcastRevision();
      sendJson(res, 200, { revision });
      return true;
    }

    if (url.pathname === '/api/health') {
      sendJson(res, 200, { ok: true, revision });
      return true;
    }

    return false; // not one of ours — let the host (Vite) keep routing
  }

  return {
    getRevision: () => revision,
    getDb: () => db,
    handler: handleApiRequest,
    /** Start a standalone http server (used outside Vite / in preview). */
    listen(port = DEFAULT_PORT) {
      const server = createServer((req, res) => {
        handleApiRequest(req, res).then((handled) => {
          if (!handled) sendJson(res, 404, { error: 'not found' });
        });
      });
      server.listen(port, () => {
        console.log(`[sync-server] cross-browser sync on http://localhost:${port} (file: ${file})`);
      });
      return server;
    },
  };
}

/* CLI entry point: only when run directly, not when imported by vite config. */
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { file, port } = parseServerArgs(process.argv);
  createSyncServer({ file }).then((sync) => sync.listen(port));
}
