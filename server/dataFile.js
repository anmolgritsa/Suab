/**
 * dataFile.js — disk persistence for the local cross-browser sync server.
 *
 * The dev-time DB document lives in ONE JSON file so every browser (and
 * every restart of the file-server process) shares the same copy. This
 * module is a plain, self-contained Node ESM file: it needs no app imports,
 * so `node server/dataFile.js --help` works and the file can also be seeded
 * from the CLI after a reset or a corrupted JSON write.
 *
 *   node server/dataFile.js --file .data/db.json --migrated
 *   node server/dataFile.js --file .data/db.json --force
 *
 * `ensureDbFile()` re-seeds on first boot or a corrupt file, preserving
 * accounts across restarts; `--force` re-seeds unconditionally.
 */

import { open, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { migrateDb, seedDb, ensureSeededUsers } from '../src/data/dbCore.js';

export const DEFAULT_DATA_FILE = path.join('.data', 'db.json');

export function cliUsage() {
  return [
    'Usage: node server/dataFile.js [--file <path>] [--migrated|--force]',
    '  --file     path to the DB JSON file (default .data/db.json)',
    '  --migrated load, migrate, then persist (default)',
    '  --force    re-seed even if the file already exists',
  ].join('\n');
}

export function parseCliArgs(argv) {
  const args = { file: DEFAULT_DATA_FILE, migrated: false, force: false, help: false };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--file') {
      args.file = argv[index + 1] ?? args.file;
      index += 1;
    } else if (arg === '--migrated') {
      args.migrated = true;
    } else if (arg === '--force') {
      args.force = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    }
  }
  return args;
}

/** Load and migrate the JSON in `file`, or re-seed when missing/corrupt. */
export async function ensureDbFile(file = DEFAULT_DATA_FILE, { force = false } = {}) {
  try {
    if (!force) {
      const handle = await open(file, 'r');
      const raw = (await handle.readFile('utf8')).trim();
      await handle.close();
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === 'object' && typeof parsed.version === 'number') {
        // migrateDb() upgrades the shape; ensureSeededUsers() restores the
        // seeded accounts when the file is valid but its users collection
        // is empty (e.g. a partial write) — otherwise login breaks for
        // everyone until the file is deleted by hand.
        const usersBefore = Array.isArray(parsed?.collections?.users)
          ? parsed.collections.users.length
          : 0;
        const healed = ensureSeededUsers(migrateDb(parsed));
        if (usersBefore === 0 && healed.collections.users.length > 0) {
          await persistDbFile(file, healed); // write the repair back to disk
        }
        return healed;
      }
    }
  } catch {
    /* open/parse failed -> fall through to reseed */
  }
  const seeded = seedDb();
  await persistDbFile(file, seeded);
  return seeded;
}

/** Migrate the current file contents then write them straight back. */
export async function migrateDbFile(file = DEFAULT_DATA_FILE) {
  const migrated = await ensureDbFile(file);
  await persistDbFile(file, migrated);
  return migrated;
}

/**
 * Persist a DB document with a locked temp-file + rename so a crash
 * mid-write can never leave the main JSON half-written, and so no two
 * writers (SSE push + POST) can interleave bytes.
 */
export async function persistDbFile(file, db) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  const handle = await open(temp, 'w');
  const writeQueue = handle.writeFile(JSON.stringify(db, null, 2));
  await writeQueue;
  await handle.close();
  await rename(temp, file);
}

/* CLI entry point: only when run directly, not when imported by syncServer. */
const isCli = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
if (isCli) {
  const { file, migrated, force, help } = parseCliArgs(process.argv);
  if (help) {
    console.log(cliUsage());
  } else if (force) {
    const seeded = await ensureDbFile(file, { force: true });
    console.log(`[db-file] re-seeded ${file} (${seeded.collections.users.length} users)`);
  } else if (migrated) {
    const result = await migrateDbFile(file);
    console.log(`[db-file] migrated ${file} (version ${result.version})`);
  } else {
    console.log(cliUsage());
  }
}
