/**
 * supervisor-attendance-check.mjs — cross-tab sync test for the Supervisor
 * Attendance screen.
 *
 * Spins up the production build in headless Chrome and opens TWO targets
 * (tabs) that SHARE one browser profile — so they share localStorage, like
 * a worker and a supervisor with the app open at the same time:
 *
 *   Tab B (supervisor)  logs in as SUP001 -> opens the Attendance sheet
 *   Tab A (labour)      logs in as LAB001 -> checks in (Check In)
 *   Tab B               updates automatically via the 'storage' event —
 *                        LAB001 flips to Present with its check-in time,
 *                        everyone else stays Not Present, no refresh
 *
 * Asserts the DB seed (11 users: 10 labour + 1 supervisor, version 1),
 * the initial all-absent sheet, the live cross-tab Present row, and the
 * supervisor dashboard's live Attendance-card note.
 *
 * Uses only Node built-ins (WebSocket is global since Node 21) plus Vite.
 * Run with:  node supervisor-attendance-check.mjs
 */

import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { preview } from 'vite';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEBUG_PORT = 9225; // distinct from other checks (9224) to avoid clashes

/* ---- CDP helpers ----------------------------------------------------------- */

function launchChrome() {
  const userDir = mkdtempSync(join(tmpdir(), 'suab-sync-chrome-'));
  const child = spawn(
    CHROME,
    [
      '--headless=new',
      '--remote-debugging-port=' + DEBUG_PORT,
      '--user-data-dir=' + userDir,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Chrome did not start')), 20000);
    child.stderr.on('data', (chunk) => {
      const match = String(chunk).match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) {
        clearTimeout(timer);
        resolve({ child, userDir });
      }
    });
  });
}

/** One WebSocket to the browser target -> can create new page targets. */
async function connectBrowser() {
  const version = await (
    await fetch('http://127.0.0.1:' + DEBUG_PORT + '/json/version')
  ).json();
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error('Browser WebSocket failed'));
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
  return { send, close: () => ws.close() };
}

/** A fresh page target with its own JS realm, but the SAME browser profile. */
async function openTab(browser, url) {
  const { targetId } = await browser.send('Target.createTarget', { url });
  return { targetId };
}

async function connectTarget(targetId) {
  // Poll the HTTP target list until this id appears — a freshly created
  // target can take a moment to register with the DevTools endpoint.
  let target = null;
  for (let i = 0; i < 30 && !target; i += 1) {
     
    const list = await (await fetch('http://127.0.0.1:' + DEBUG_PORT + '/json/list')).json();
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

/** Poll an expression in a page until it is truthy (or give up). */
async function waitFor(page, expression, tries = 40, everyMs = 200) {
  for (let i = 0; i < tries; i += 1) {
     
    if (await evaluate(page, expression)) return true;
     
    await new Promise((r) => setTimeout(r, everyMs));
  }
  return false;
}

/* ---- in-page helpers (shared driver snippets) ------------------------------- */

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

/** Drive the credential login (phone first, Employee ID second) from blank. */
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

/* ---- main ------------------------------------------------------------------- */

async function main() {
  const failures = [];
  const ok = (label, pass, detail = '') => {
    console.log((pass ? 'PASS ' : 'FAIL ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!pass) failures.push(label);
  };

  const server = await preview({ preview: { port: 4177, strictPort: true } });
  const url = server.resolvedUrls.local[0];
  console.log('Serving ' + url);

  let chrome;
  let browser;
  let tabSup;
  let tabLab;
  try {
    chrome = await launchChrome();
    browser = await connectBrowser();

    // One phone-sized viewport for every target.
    await browser.send('Emulation.setDeviceMetricsOverride', {
      width: 393, height: 852, deviceScaleFactor: 3, mobile: true,
    }).catch(() => {});

    /* ---- Tab B: the supervisor, on the Attendance sheet ---- */
    ({ targetId: tabSup } = await openTab(browser, url));
    const sup = await connectTarget(tabSup);
    await sup.send('Emulation.setDeviceMetricsOverride', {
      width: 393, height: 852, deviceScaleFactor: 3, mobile: true,
    }).catch(() => {});
    await sup.send('Page.navigate', { url });

    ok('login shown', await waitFor(sup, "document.body.innerText.includes('Welcome Back')"));
    await evaluate(sup, loginScript('9812345678', 'SUP001'));
    ok('supervisor dashboard opens', await waitFor(sup, "document.body.innerText.includes('Supervisor')"));
    const noteBefore = await waitFor(sup, "document.body.innerText.includes('No check-in yet today')");
    ok('dashboard Attendance card shows "No check-in yet"', noteBefore);

    // Open the Attendance sheet (the dashboard's Attendance card). Find the
    // action-card whose LABEL span says "Attendance" — matching the whole
    // <button>'s text would fail because it also contains the status note.
    await evaluate(sup, `
      (async () => { ${HELPERS}
        const label = $$('.action-card__label').find((el) => el.textContent.trim() === 'Attendance');
        if (!label) throw new Error('Attendance card label not found');
        label.closest('button').click();
        return true;
      })()
    `);
    ok('supervisor attendance sheet opens', await waitFor(sup, "document.querySelector('.supat__list') !== null"));

    // Seed + initial roster accuracy.
    const seed = JSON.parse(await evaluate(sup, `
      (async () => {
        const db = JSON.parse(localStorage.getItem('suab.db'));
        const users = db.collections.users;
        const labour = users.filter((u) => u.role === 'labour');
        const sup = users.filter((u) => u.role === 'supervisor');
        return JSON.stringify({
          version: db.version,
          total: users.length,
          labour: labour.length,
          sup: sup.length,
          supId: sup[0]?.credentials.employeeId,
          firstLab: labour[0]?.credentials.employeeId,
          lastLab: labour[labour.length - 1]?.credentials.employeeId,
        });
      })()
    `));
    ok('schema version 1', seed.version === 1, 'v=' + seed.version);
    ok('11 seeded users', seed.total === 11, String(seed.total));
    ok('10 labour LAB001..LAB010', seed.labour === 10 && seed.firstLab === 'LAB001' && seed.lastLab === 'LAB010', seed.firstLab + '..' + seed.lastLab);
    ok('1 supervisor SUP001', seed.sup === 1 && seed.supId === 'SUP001', String(seed.supId));

    const rowsBefore = JSON.parse(await evaluate(sup, `
      (async () => {
        ${HELPERS}
        const rows = $$('.supat__row').map((r) => ({
          id: r.querySelector('.supat__text small')?.textContent.trim(),
          present: r.querySelector('.supat__badge')?.textContent.trim() === 'Present',
          time: r.querySelector('.supat__time')?.textContent.trim() ?? null,
        }));
        return JSON.stringify({ count: rows.length, present: rows.filter((r) => r.present).length });
      })()
    `));
    ok('sheet lists all 10 labour', rowsBefore.count === 10, String(rowsBefore.count));
    ok('all start Not Present', rowsBefore.present === 0, 'present=' + rowsBefore.present);

    /* ---- Tab A: a labour (same profile -> same localStorage) ----
       localStorage is device-scoped, and a successful login records a
       session AND seeds a device-scoped app-lock vault — unlocking that
       vault resumes the locker's identity (openSession(vault.employeeId)),
       so a different account can't sign in "in another tab" of the same
       device. Real use is one operator per device at a time; handing the
       device over is the same teardown reset/“Not you?” does (clear the
       session AND the lock vault). Do that from the supervisor tab, then
       the labour gets the credential login. */
    await evaluate(sup, `['suab.session','suab.appLock','suab.appLockSet','suab.currentUser','suab.pinSet','suab.pinVault'].forEach((k) => localStorage.removeItem(k))`);
    ({ targetId: tabLab } = await openTab(browser, url));
    const lab = await connectTarget(tabLab);
    await lab.send('Emulation.setDeviceMetricsOverride', {
      width: 393, height: 852, deviceScaleFactor: 3, mobile: true,
    }).catch(() => {});
    await lab.send('Page.navigate', { url });

    ok('labour sees login', await waitFor(lab, "document.body.innerText.includes('Welcome Back')", 60, 250));

    // Read the seeded credential PAIRS straight out of the shared DB so the
    // login always matches the seed (never a guess about mobile numbering).
    const creds = JSON.parse(await evaluate(lab, `
      (async () => {
        const users = JSON.parse(localStorage.getItem('suab.db')).collections.users;
        const get = (id) => users.find((u) => u.credentials.employeeId === id)?.credentials.mobile;
        return JSON.stringify({ labourMobile: get('LAB001'), supMobile: get('SUP001') });
      })()
    `));
    console.log('seeded credentials:', creds);

    await evaluate(lab, loginScript(creds.labourMobile, 'LAB001'));
    ok('labour reaches Mark Attendance', await waitFor(lab, "document.body.innerText.includes('Mark Attendance')"));

    // Check in -> writes the shared DB (fires the 'storage' event that the
    // supervisor tab's useStorageSync listens for). Click via a by-class
    // lookup (the button carries .btn-primary inside .att__actions), with a
    // settle pause so the screen's button has mounted.
    const clicked = await evaluate(lab, `
      (async () => { ${HELPERS}
        await sleep(400);
        const btn = document.querySelector('.att__actions .btn-primary') ?? $$('button').find((b) => b.textContent.trim() === 'Check In');
        if (!btn) return false;
        btn.click();
        return true;
      })()
    `);
    ok('check-in button found on attendance screen', clicked === true);
    const checkedIn = await waitFor(lab, "Boolean(document.querySelector('.allot')) || document.body.innerText.includes('Attendance Marked')");
    ok('labour check-in saved (allotment/next screen)', checkedIn);

    const record = JSON.parse(await evaluate(lab, `
      (async () => {
        const db = JSON.parse(localStorage.getItem('suab.db'));
        const a = db.collections.attendance.find((r) => r.employeeId === 'LAB001');
        return JSON.stringify(a ? { id: a.employeeId, name: a.name, date: a.date, checkInAt: a.checkInAt, status: a.status } : null);
      })()
    `));
    ok('DB record has labour id', record?.id === 'LAB001', String(record?.id));
    ok('DB record has labour name', record?.name === 'Ramesh Kumar', String(record?.name));
    ok('DB record has check-in time', Boolean(record?.checkInAt) && !Number.isNaN(Date.parse(record.checkInAt)), String(record?.checkInAt));
    ok('DB record status present', record?.status === 'present', String(record?.status));
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    ok('DB record stamped today', record?.date === todayStr, record?.date + ' vs ' + todayStr);

    /* ---- CROSS-CHANNEL SYNC ON THE SHARED DB ----
       The labour's check-in rewrote 'suab.db' in the shared localStorage.
       The supervisor tab is still OPEN on the Attendance sheet: although
       the app's single session now points at LAB001, the DB document was
       mutated — exactly the change useStorageSync watches. Read the sheet
       after letting any storage-event/frame flush; the tab re-renders.
       (A same-tab write wouldn't fire 'storage', but this write came from
       tab A, so tab B's listener ran.) */
    const rowsAfter = JSON.parse(await evaluate(sup, `
      (async () => {
        ${HELPERS}
        // Yield twice so any 'storage'-event-driven state update flushes.
        await sleep(120);
        const rows = $$('.supat__row').map((r) => ({
          id: r.querySelector('.supat__text small')?.textContent.trim(),
          name: r.querySelector('.supat__text strong')?.textContent.trim(),
          badge: r.querySelector('.supat__badge')?.textContent.trim(),
          time: r.querySelector('.supat__time')?.textContent.trim() ?? null,
        }));
        return JSON.stringify(rows);
      })()
    `));
    const lab001 = rowsAfter.find((r) => r.id === 'LAB001');
    ok('[cross-tab] LAB001 flips to Present automatically', lab001?.badge === 'Present', 'badge=' + (lab001?.badge ?? 'absent row'));
    ok('[cross-tab] LAB001 row shows a check-in time', Boolean(lab001?.time) && /\d{2}:\d{2}\s(AM|PM)/.test(lab001.time), String(lab001?.time));
    ok('[cross-tab] present count is exactly 1', rowsAfter.filter((r) => r.badge === 'Present').length === 1);
    ok('[cross-tab] other labour stay Not Present', rowsAfter.filter((r) => r.id !== 'LAB001').every((r) => r.badge === 'Not Present'));

    /* ---- supervisor reviews again on a fresh open (the real hand-off) ----
       LAB001 checked in on the labour tab. Now the supervisor re-opens the
       app and signs back in: clear the labour session + the device lock
       vault, then a fresh tab driven by SUP001 sees the shared DB — the
       dashboard card and the (reopened) sheet both show LAB001 Present. */
    await evaluate(lab, `['suab.session','suab.appLock','suab.appLockSet','suab.currentUser'].forEach((k) => localStorage.removeItem(k))`);
    const { targetId: tabSup2 } = await openTab(browser, url);
    const sup2 = await connectTarget(tabSup2);
    await sup2.send('Page.navigate', { url });
    ok('supervisor fresh open sees login', await waitFor(sup2, "document.body.innerText.includes('Welcome Back')", 60, 250));
    await evaluate(sup2, loginScript(creds.supMobile, 'SUP001'));
    ok('supervisor relogin opens dashboard', await waitFor(sup2, "document.body.innerText.includes('Supervisor')", 60));
    ok('[dashboard] card reads "Checked in today"', await waitFor(sup2, "document.body.innerText.includes('Checked in today')"));
    await evaluate(sup2, `
      (async () => { ${HELPERS}
        const label = $$('.action-card__label').find((el) => el.textContent.trim() === 'Attendance');
        if (!label) throw new Error('Attendance card label not found');
        label.closest('button').click();
        return true;
      })()
    `);
    ok('sheet reopens on fresh supervisor login', await waitFor(sup2, "document.querySelector('.supat__list') !== null"));
    const rowsAgain = JSON.parse(await evaluate(sup2, `
      (async () => { ${HELPERS}
        const rows = $$('.supat__row').map((r) => ({
          id: r.querySelector('.supat__text small')?.textContent.trim(),
          badge: r.querySelector('.supat__badge')?.textContent.trim(),
        }));
        return JSON.stringify(rows);
      })()
    `));
    const lab001Again = rowsAgain.find((r) => r.id === 'LAB001');
    ok('[fresh login] LAB001 still Present in reopened sheet', lab001Again?.badge === 'Present', 'badge=' + (lab001Again?.badge ?? 'absent'));
    ok('[fresh login] roster intact (still 10 labour)', rowsAgain.length === 10, String(rowsAgain.length));
    await sup2.close();

    if (failures.length > 0) {
      console.log('\n' + failures.length + ' check(s) FAILED');
      process.exitCode = 1;
    } else {
      console.log('\nAll supervisor-attendance sync checks passed');
    }
  } finally {
    try { tabLab && (await browser.send('Target.closeTarget', { targetId: tabLab })); } catch { /* gone */ }
    try { tabSup && (await browser.send('Target.closeTarget', { targetId: tabSup })); } catch { /* gone */ }
    browser?.close();
    if (chrome) {
      try {
        execSync('taskkill /PID ' + chrome.child.pid + ' /T /F', { stdio: 'ignore' });
      } catch { /* already gone */ }
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          rmSync(chrome.userDir, { recursive: true, force: true });
          break;
        } catch {
          await new Promise((r) => setTimeout(r, 300));
        }
      }
    }
    server.httpServer.closeAllConnections?.();
    await new Promise((resolve) => server.httpServer.close(resolve));
  }
}

main().catch((error) => {
  console.error('supervisor-attendance-check crashed:', error.message);
  process.exit(1);
});
