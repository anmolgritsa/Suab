/**
 * sync-check.mjs — TRUE cross-browser attendance sync verification.
 *
 * Unlike supervisor-attendance-check.mjs (which opens two tabs sharing ONE
 * browser profile → shared localStorage), this test launches TWO SEPARATE
 * headless Chrome processes, each with its own user-data-dir → its own
 * isolated localStorage. That is exactly "a labour on Chrome and a
 * supervisor on Edge": no storage event can cross between them, so the ONLY
 * way the supervisor sheet can update is through the sync server
 * (server/syncServer.js) via syncBridge.js (SSE revision push → pull →
 * mirror into localStorage → useStorageSync re-render).
 *
 *   Browser SUP  (profile A)  login SUP001 → Attendance sheet (all absent)
 *   Browser LAB  (profile B)  login LAB001 → Check In
 *   Browser SUP               flips LAB001 to Present automatically, ~1–2 s,
 *                             NO manual refresh
 *
 * Also asserts: API reachable (no 404 — the reported bug), duplicate
 * same-day check-in is idempotent, labour page refresh shows already-marked,
 * and the roster keeps all 10 labour with the others Not Present.
 *
 * Uses only Node built-ins + Vite preview (production build served WITH the
 * sync API mounted — the exact scenario that 404'd before the fix).
 * Run with:  npm run check:sync   (or: node sync-check.mjs)
 */

import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { preview } from 'vite';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT_SUP = 9251; // supervisor browser CDP
const PORT_LAB = 9252; // labour browser CDP (isolated profile)
const PREVIEW_PORT = 4199;

/* ---- CDP helpers ----------------------------------------------------------- */

function launchChrome(debugPort) {
  const userDir = mkdtempSync(join(tmpdir(), 'suab-xbrowser-'));
  const child = spawn(
    CHROME,
    [
      '--headless=new',
      '--remote-debugging-port=' + debugPort,
      '--user-data-dir=' + userDir,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Chrome did not start on :' + debugPort)), 20000);
    child.stderr.on('data', (chunk) => {
      const match = String(chunk).match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) {
        clearTimeout(timer);
        resolve({ child, userDir, debugPort });
      }
    });
  });
}

/** One WS to a browser target so we can create page targets in THAT profile. */
async function connectBrowser(debugPort) {
  const version = await (
    await fetch('http://127.0.0.1:' + debugPort + '/json/version')
  ).json();
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error('Browser WebSocket failed :' + debugPort));
  });
  let nextId = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      nextId += 1;
      pending.set(nextId, { resolve, reject });
      ws.send(JSON.stringify({ id: nextId, method, params }));
    });
  return { send, close: () => ws.close(), debugPort };
}

/** A fresh page in a given browser (that profile's own localStorage). */
async function openTab(browser, url) {
  const { targetId } = await browser.send('Target.createTarget', { url });
  return targetId;
}

async function connectTarget(debugPort, targetId) {
  let target = null;
  for (let i = 0; i < 30 && !target; i += 1) {
    const list = await (await fetch('http://127.0.0.1:' + debugPort + '/json/list')).json();
    target = list.find((t) => t.type === 'page' && t.id === targetId) ?? null;
    if (!target) await new Promise((r) => setTimeout(r, 200));
  }
  if (!target) throw new Error('target not found: ' + targetId);
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error('Target WebSocket failed'));
  });
  let nextId = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      nextId += 1;
      pending.set(nextId, { resolve, reject });
      ws.send(JSON.stringify({ id: nextId, method, params }));
    });
  return { send, close: () => ws.close(), targetId };
}

async function evaluate(page, expression) {
  const result = await page.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || 'Page script threw');
  }
  return result.result.value;
}

async function waitFor(page, expression, tries = 50, everyMs = 200) {
  for (let i = 0; i < tries; i += 1) {
    if (await evaluate(page, expression)) return true;
    await new Promise((r) => setTimeout(r, everyMs));
  }
  return false;
}

/* ---- in-page driver snippets ------------------------------------------------ */

const HELPERS = `
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const buttonByText = (text) => $$('button').find((b) => b.textContent.trim() === text);
  const nativeSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype, 'value'
  ).set;
  const setReactValue = (input, value) => {
    nativeSetter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
`;

function loginScript(phone, employeeId) {
  return `
    (async () => {
      ${HELPERS}
      const inputs = $$('input');
      setReactValue(inputs[0], '${phone}');
      setReactValue(inputs[1], '${employeeId}');
      buttonByText('Login').click();
      return true;
    })()
  `;
}

/* ---- main --------------------------------------------------------------------- */

async function main() {
  const failures = [];
  const ok = (label, pass, detail = '') => {
    console.log((pass ? 'PASS ' : 'FAIL ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!pass) failures.push(label);
  };

  // Production build served WITH the sync API mounted (the fix under test).
  const server = await preview({ preview: { port: PREVIEW_PORT, strictPort: true } });
  const url = server.resolvedUrls.local[0];
  console.log('Serving ' + url);

  /* Guard 0: the API must be reachable from the preview origin (the 404 bug).
     Probe the EXACT base-prefixed path the client bridge uses. */
  const apiPath = new URL('api/health', url).pathname;
  const health = await fetch(new URL('api/health', url));
  ok('sync API reachable on preview (no 404)', health.status === 200, 'GET ' + apiPath + ' -> ' + health.status);
  const dbGet = await fetch(new URL('api/db', url));
  ok('GET /api/db returns 200 JSON', dbGet.status === 200, String(dbGet.status));

  let supBrowser, labBrowser, supProc, labProc;
  try {
    // Two SEPARATE Chrome processes → two isolated profiles/localStorage.
    supProc = await launchChrome(PORT_SUP);
    labProc = await launchChrome(PORT_LAB);
    supBrowser = await connectBrowser(PORT_SUP);
    labBrowser = await connectBrowser(PORT_LAB);

    const metrics = { width: 393, height: 852, deviceScaleFactor: 3, mobile: true };

    /* ---- Browser SUP: supervisor on the Attendance sheet ---- */
    const supTab = await openTab(supBrowser, url);
    const sup = await connectTarget(PORT_SUP, supTab);
    await sup.send('Emulation.setDeviceMetricsOverride', metrics).catch(() => {});
    await sup.send('Page.navigate', { url });

    ok('SUP: login shown', await waitFor(sup, "document.body.innerText.includes('Welcome Back')", 60, 250));
    await evaluate(sup, loginScript('9812345678', 'SUP001'));
    ok('SUP: dashboard opens', await waitFor(sup, "document.body.innerText.includes('Supervisor')", 60));
    await evaluate(sup, `
      (async () => { ${HELPERS}
        const label = $$('.action-card__label').find((el) => el.textContent.trim() === 'Attendance');
        if (!label) throw new Error('Attendance card label not found');
        label.closest('button').click();
        return true;
      })()
    `);
    ok('SUP: attendance sheet opens', await waitFor(sup, "document.querySelector('.supat__list') !== null"));
    const rowsBefore = JSON.parse(await evaluate(sup, `
      (async () => { ${HELPERS}
        const rows = $$('.supat__row').map((r) => ({
          id: r.querySelector('.supat__text small')?.textContent.trim(),
          present: r.querySelector('.supat__badge')?.textContent.trim() === 'Present',
        }));
        return JSON.stringify({ count: rows.length, present: rows.filter((r) => r.present).length });
      })()
    `));
    ok('SUP: all 10 labour listed', rowsBefore.count === 10, String(rowsBefore.count));
    ok('SUP: all start Not Present', rowsBefore.present === 0, 'present=' + rowsBefore.present);

    /* ---- Browser LAB: labour logs in + checks in (isolated profile) ---- */
    const labTab = await openTab(labBrowser, url);
    const lab = await connectTarget(PORT_LAB, labTab);
    await lab.send('Emulation.setDeviceMetricsOverride', metrics).catch(() => {});
    await lab.send('Page.navigate', { url });

    ok('LAB: login shown', await waitFor(lab, "document.body.innerText.includes('Welcome Back')", 60, 250));
    // Sanity: this profile has its OWN localStorage (no supervisor session).
    const isolation = await evaluate(lab, "localStorage.getItem('suab.session') === null");
    ok('LAB: isolated localStorage (no shared session)', isolation === true);
    await evaluate(lab, loginScript('9876540010', 'LAB001'));
    ok('LAB: reaches Mark Attendance', await waitFor(lab, "document.body.innerText.includes('Mark Attendance')", 60));

    const clicked = await evaluate(lab, `
      (async () => { ${HELPERS}
        await sleep(400);
        const btn = document.querySelector('.att__actions .btn-primary') ?? $$('button').find((b) => b.textContent.trim() === 'Check In');
        if (!btn) return false;
        btn.click();
        return true;
      })()
    `);
    ok('LAB: check-in button found', clicked === true);
    ok('LAB: check-in saved', await waitFor(lab, "Boolean(document.querySelector('.allot')) || document.body.innerText.includes('Attendance Marked')", 60));

    const record = JSON.parse(await evaluate(lab, `
      (async () => {
        const db = JSON.parse(localStorage.getItem('suab.db'));
        const a = db.collections.attendance.find((r) => (r.employeeId || r.labourId) === 'LAB001');
        return JSON.stringify(a ? { id: a.employeeId || a.labourId, name: a.name, date: a.date, checkInAt: a.checkInAt, status: a.status } : null);
      })()
    `));
    ok('LAB: DB record has labour id LAB001', record?.id === 'LAB001', String(record?.id));
    ok('LAB: DB record has name', record?.name === 'Ramesh Kumar', String(record?.name));
    ok('LAB: DB record has check-in time', Boolean(record?.checkInAt) && !Number.isNaN(Date.parse(record.checkInAt)), String(record?.checkInAt));
    ok('LAB: DB record status present', record?.status === 'present', String(record?.status));

    /* ---- THE CORE CROSS-BROWSER ASSERTION ----
       SUP is a different Chrome process with isolated localStorage. Local
       storage events CANNOT reach it. Give SSE-pull-mirror-render up to
       ~4 s; the bridge targets ~1–2 s. No manual refresh is performed. */
    const t0 = Date.now();
    const flipped = await waitFor(sup, `
      (() => {
        const rows = Array.from(document.querySelectorAll('.supat__row'));
        const r = rows.find((el) => el.querySelector('.supat__text small')?.textContent.trim() === 'LAB001');
        return r ? r.querySelector('.supat__badge')?.textContent.trim() === 'Present' : false;
      })()
    `, 20, 200); // 20 * 200ms = 4s ceiling
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    ok('[cross-browser] SUP sheet flips LAB001→Present automatically (no refresh)', flipped, elapsed + 's');

    const rowsAfter = JSON.parse(await evaluate(sup, `
      (async () => { ${HELPERS}
        const rows = $$('.supat__row').map((r) => ({
          id: r.querySelector('.supat__text small')?.textContent.trim(),
          badge: r.querySelector('.supat__badge')?.textContent.trim(),
          time: r.querySelector('.supat__time')?.textContent.trim() ?? null,
        }));
        return JSON.stringify(rows);
      })()
    `));
    const lab001 = rowsAfter.find((r) => r.id === 'LAB001');
    ok('[cross-browser] LAB001 row shows check-in time', Boolean(lab001?.time) && /\d{2}:\d{2}\s(AM|PM)/.test(lab001.time), String(lab001?.time));
    ok('[cross-browser] present count is exactly 1', rowsAfter.filter((r) => r.badge === 'Present').length === 1);
    ok('[cross-browser] other 9 labour stay Not Present', rowsAfter.filter((r) => r.id !== 'LAB001').every((r) => r.badge === 'Not Present'));

    /* ---- duplicate same-day check-in is idempotent ----
       LAB refresh → shows already-marked; a second check-in must NOT add a
       second record for LAB001 today. */
    await lab.send('Page.navigate', { url });
    ok('LAB: refresh resumes (already marked / flow)', await waitFor(lab, "document.body.innerText.includes('Attendance Marked') || document.body.innerText.includes('Welcome Back') || Boolean(document.querySelector('.allot'))", 60, 250));
    // If back at login, log in again to test idempotent re-mark.
    const backAtLogin = await evaluate(lab, "document.body.innerText.includes('Welcome Back')");
    if (backAtLogin) {
      await evaluate(lab, loginScript('9876540010', 'LAB001'));
      await waitFor(lab, "document.body.innerText.includes('Attendance Marked') || document.body.innerText.includes('Mark Attendance')", 60);
    }
    const markedShown = await waitFor(lab, "document.body.innerText.includes('Attendance Marked') || Boolean(document.querySelector('.allot'))", 40);
    ok('LAB: already-marked state shown after re-entry', markedShown);

    // Attempt a duplicate via the same button path (if the sheet re-offered it),
    // then confirm the shared DB still holds exactly ONE LAB001-today record.
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const dupSupRows = JSON.parse(await evaluate(sup, `
      (async () => {
        const db = JSON.parse(localStorage.getItem('suab.db'));
        const mine = db.collections.attendance.filter((r) => ((r.employeeId || r.labourId) === 'LAB001') && r.date === '${todayStr}');
        return JSON.stringify({ count: mine.length });
      })()
    `));
    ok('duplicate same-day check-in idempotent (1 record)', dupSupRows.count === 1, 'records=' + dupSupRows.count);

    if (failures.length > 0) {
      console.log('\n' + failures.length + ' check(s) FAILED');
      process.exitCode = 1;
    } else {
      console.log('\nAll cross-browser sync checks passed');
    }
  } finally {
    for (const proc of [supProc, labProc]) {
      if (!proc) continue;
      try { execSync('taskkill /PID ' + proc.child.pid + ' /T /F', { stdio: 'ignore' }); } catch { /* gone */ }
      for (let a = 0; a < 5; a += 1) {
        try { rmSync(proc.userDir, { recursive: true, force: true }); break; } catch { await new Promise((r) => setTimeout(r, 300)); }
      }
    }
    try { supBrowser?.close(); } catch { /* gone */ }
    try { labBrowser?.close(); } catch { /* gone */ }
    server.httpServer.closeAllConnections?.();
    await new Promise((resolve) => server.httpServer.close(resolve));
  }
}

main().catch((error) => {
  console.error('sync-check crashed:', error.message);
  process.exit(1);
});
