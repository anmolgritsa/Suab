/**
 * requests-check.mjs — TRUE cross-browser half-day / overtime request flow.
 *
 * Same harness as sync-check.mjs: TWO SEPARATE headless Chrome processes,
 * each with its own user-data-dir (isolated localStorage), so the ONLY way
 * a decision can reach the labour browser is the sync server via
 * syncBridge.js + useStorageSync — no manual refresh anywhere.
 *
 *   Browser LAB  (profile B)  login LAB001 → check-in → allotment → Home
 *                             → Other → Apply for Half Day (records a REAL
 *                             voice note via Chrome's fake media device)
 *                             → submit → Apply for Overtime → submit
 *   Browser SUP  (profile A)  login SUP001 → Requests inbox sees BOTH live
 *                             cards (name, ID, date, time, type, hours,
 *                             voice-note player) → plays the voice note
 *                             → Approves half-day → Approves overtime
 *   Browser LAB               WITHOUT any navigation or refresh: the Other
 *                             screen's tiles flip to Approved, the shared
 *                             DB records flip to approved, and walking
 *                             back Home shortens the timer to the half
 *                             shift (suab.shiftType === 'half').
 *
 * Also asserts: the saved record carries labour id + name + date + time +
 * type + details + Pending status; a duplicate half-day application is
 * blocked (tile disabled); the supervisor cannot double-handle (the
 * Approve/Reject buttons disappear once decided).
 *
 * Run with:  node requests-check.mjs   (builds nothing — serves the
 *                                      production dist via vite preview,
 *                                      so run `npm run build` first)
 */

import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { preview } from 'vite';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT_SUP = 9261; // supervisor browser CDP
const PORT_LAB = 9262; // labour browser CDP (isolated profile)
const PREVIEW_PORT = 4299;

/* ### cdp-helpers */
// Identical to sync-check.mjs — one WS per browser profile, one per page.
function launchChrome(debugPort, userDir) {
  const child = spawn(
    CHROME,
    [
      '--headless=new',
      '--remote-debugging-port=' + debugPort,
      '--user-data-dir=' + userDir,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      // Fake mic + auto-granted permission: the half-day screen records a
      // REAL MediaRecorder clip from Chrome's fake audio device.
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      // The supervisor's voice-note player calls audio.play() — headless
      // Chrome otherwise rejects it (no user activation from .click()).
      '--autoplay-policy=no-user-gesture-required',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Chrome did not start on :' + debugPort)),
      20000,
    );
    child.stderr.on('data', (chunk) => {
      const match = String(chunk).match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) {
        clearTimeout(timer);
        resolve({ child, userDir, debugPort });
      }
    });
  });
}

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

async function openTab(browser, url) {
  const { targetId } = await browser.send('Target.createTarget', { url });
  return targetId;
}

async function connectTarget(debugPort, targetId) {
  let target = null;
  for (let i = 0; i < 30 && !target; i += 1) {
    const list = await (
      await fetch('http://127.0.0.1:' + debugPort + '/json/list')
    ).json();
    target = list.find((t) => t.type === 'page' && t.id === targetId) ?? null;
    if (!target) await new Promise((r) => setTimeout(r, 200));
  }
  if (!target) throw new Error('target not found: ' + targetId);
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error('Target WebSocket failed'));
  });
  const pageErrors = [];
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.method === 'Runtime.exceptionThrown') {
      pageErrors.push(msg.params.exceptionDetails?.exception?.description ?? 'exception');
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      pageErrors.push(msg.params.args?.map((a) => a.value ?? a.description ?? '').join(' '));
    }
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
  await send('Runtime.enable');
  return { send, close: () => ws.close(), targetId, errors: pageErrors };
}

async function evaluate(page, expression) {
  const result = await page.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description || 'Page script threw',
    );
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


/* ### page-snippets */

const HELPERS = `
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const buttonByText = (text) => $$('button').find((b) => b.textContent.trim() === text);
  const cardByLabel = (text) =>
    $$('.action-card').find((c) => c.querySelector('.action-card__label')?.textContent.trim() === text);
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

/** The labour's full path to the Other screen: login → check-in →
    allotment "Next" → Home → "Other" card. */
const LAB_TO_OTHER = `
  (async () => {
    ${HELPERS}
    await sleep(400);
    const checkIn = document.querySelector('.att__actions .btn-primary')
      ?? $$('button').find((b) => b.textContent.trim() === 'Check In');
    checkIn.click();
    // Allotment screen → "Next" opens the homepage.
    if (!(await waitForGlobal('document.querySelector(".allot") !== null'))) return false;
    buttonByText('Next').click();
    // Homepage → "Other" card opens the Other screen.
    if (!(await waitForGlobal('cardByLabel("Other") !== null'))) return false;
    cardByLabel('Other').click();
    if (!(await waitForGlobal('document.body.innerText.includes("Apply for Half Day")'))) return false;
    return true;

    function waitForGlobal(expr) {
      // tiny inline waiter (page-local)
      return new Promise(async (resolve) => {
        for (let i = 0; i < 50; i += 1) {
          if (eval(expr)) return resolve(true);
          await sleep(200);
        }
        resolve(false);
      });
    }
  })()
`;

/** Record a voice note and submit the half-day request. */
const HALF_DAY_SUBMIT = `
  (async () => {
    ${HELPERS}
    cardByLabel('Apply for Half Day').click();
    if (!(await waitForGlobal('document.querySelector(".halfday__mic") !== null'))) return false;
    document.querySelector('.halfday__mic').click(); // start recording
    await sleep(1500);
    document.querySelector('.halfday__mic').click(); // stop
    if (!(await waitForGlobal('!document.querySelector(".halfday__submit").disabled'))) return false;
    document.querySelector('.halfday__submit').click();
    if (!(await waitForGlobal('document.body.innerText.includes("Half-day request sent")'))) return false;
    return true;

    function waitForGlobal(expr) {
      return new Promise(async (resolve) => {
        for (let i = 0; i < 50; i += 1) {
          if (eval(expr)) return resolve(true);
          await sleep(200);
        }
        resolve(false);
      });
    }
  })()
`;

/** Submit the overtime request with the default 2 hours. */
const OVERTIME_SUBMIT = `
  (async () => {
    ${HELPERS}
    cardByLabel('Apply for Overtime').click();
    if (!(await waitForGlobal('document.querySelector(".overtime__submit") !== null'))) return false;
    await sleep(300);
    document.querySelector('.overtime__submit').click();
    if (!(await waitForGlobal('document.body.innerText.includes("Overtime request sent")'))) return false;
    // Walk back to the Other screen — LAB parks here for the sync wait.
    await sleep(300);
    document.querySelector('.back-button').click();
    if (!(await waitForGlobal('cardByLabel("Apply for Half Day") !== null'))) return false;
    return true;

    function waitForGlobal(expr) {
      return new Promise(async (resolve) => {
        for (let i = 0; i < 50; i += 1) {
          if (eval(expr)) return resolve(true);
          await sleep(200);
        }
        resolve(false);
      });
    }
  })()
`;


/* ### main */

async function main() {
  const failures = [];
  const ok = (label, pass, detail = '') => {
    console.log(
      (pass ? 'PASS ' : 'FAIL ') + label + (detail ? '  [' + detail + ']' : ''),
    );
    if (!pass) failures.push(label);
  };

  rmSync('.data/db.json', { force: true }); // fresh server db every run
  const server = await preview({ preview: { port: PREVIEW_PORT, strictPort: true } });
  const url = server.resolvedUrls.local[0];
  console.log('Serving ' + url);

  const health = await fetch(new URL('api/health', url));
  ok('sync API reachable on preview', health.status === 200, String(health.status));

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  let supBrowser, labBrowser, supProc, labProc;
  try {
    const supDir = mkdtempSync(join(tmpdir(), 'suab-req-sup-'));
    const labDir = mkdtempSync(join(tmpdir(), 'suab-req-lab-'));
    supProc = await launchChrome(PORT_SUP, supDir);
    labProc = await launchChrome(PORT_LAB, labDir);
    supBrowser = await connectBrowser(PORT_SUP);
    labBrowser = await connectBrowser(PORT_LAB);
    const metrics = { width: 393, height: 852, deviceScaleFactor: 3, mobile: true };

    /* ---- LAB: login → check-in → allotment → Other ---- */
    const labTab = await openTab(labBrowser, url);
    const lab = await connectTarget(PORT_LAB, labTab);
    await lab.send('Emulation.setDeviceMetricsOverride', metrics).catch(() => {});
    await lab.send('Page.navigate', { url });
    ok('LAB: login shown', await waitFor(lab, "document.body.innerText.includes('Welcome Back')", 60, 250));
    await evaluate(lab, loginScript('9876540010', 'LAB001'));
    ok('LAB: reaches Mark Attendance', await waitFor(lab, "document.body.innerText.includes('Mark Attendance')", 60));
    ok('LAB: walked to the Other screen', await evaluate(lab, LAB_TO_OTHER) === true);

    /* ---- LAB: half-day request with a REAL voice note ---- */
    ok('LAB: half-day recorded + submitted', await evaluate(lab, HALF_DAY_SUBMIT) === true);
    const halfDay = JSON.parse(await evaluate(lab, `
      JSON.stringify((JSON.parse(localStorage.getItem('suab.db')).collections.requests
        .filter((r) => r.labourId === 'LAB001' && r.type === 'half_day')).at(-1) ?? null)
    `));
    ok('LAB: half-day saved with labour id', halfDay?.labourId === 'LAB001', String(halfDay?.labourId));
    ok('LAB: half-day saved with name', halfDay?.labourName === 'Ramesh Kumar', String(halfDay?.labourName));
    ok('LAB: half-day saved with today date', halfDay?.date === todayStr, String(halfDay?.date));
    ok('LAB: half-day saved with time', Boolean(halfDay?.requestedAt) && !Number.isNaN(Date.parse(halfDay.requestedAt)), String(halfDay?.requestedAt));
    ok('LAB: half-day status Pending', halfDay?.status === 'pending', String(halfDay?.status));
    ok('LAB: half-day carries the voice note', typeof halfDay?.voiceNote === 'string' && halfDay.voiceNote.startsWith('data:audio'), String(halfDay?.voiceNote?.slice(0, 30)));

    /* ---- LAB: duplicate half-day is blocked ---- */
    await waitFor(lab, "Array.from(document.querySelectorAll('.action-card .action-card__label')).some((el) => el.textContent.trim() === 'Apply for Half Day')", 30);
    const halfDayTile = JSON.parse(await evaluate(lab, `
      JSON.stringify((() => { ${HELPERS}
        const card = cardByLabel('Apply for Half Day');
        return { disabled: card?.disabled ?? null, badge: card?.querySelector('.other__badge')?.textContent.trim() ?? null };
      })())
    `));
    ok('LAB: duplicate blocked (tile disabled)', halfDayTile.disabled === true, String(halfDayTile.disabled));
    ok('LAB: tile shows Pending badge', halfDayTile.badge === 'Pending…', String(halfDayTile.badge));

    /* ---- LAB: overtime request ---- */
    ok('LAB: overtime submitted', await evaluate(lab, OVERTIME_SUBMIT) === true);
    const overtime = JSON.parse(await evaluate(lab, `
      JSON.stringify((JSON.parse(localStorage.getItem('suab.db')).collections.requests
        .filter((r) => r.labourId === 'LAB001' && r.type === 'overtime')).at(-1) ?? null)
    `));
    ok('LAB: overtime saved with labour id', overtime?.labourId === 'LAB001', String(overtime?.labourId));
    ok('LAB: overtime saved with hours', overtime?.hours === 2, String(overtime?.hours));
    ok('LAB: overtime status Pending', overtime?.status === 'pending', String(overtime?.status));

/* ### main-part2 */
    /* ---- SUP: login → Requests inbox sees BOTH live cards ---- */
    const supTab = await openTab(supBrowser, url);
    const sup = await connectTarget(PORT_SUP, supTab);
    await sup.send('Emulation.setDeviceMetricsOverride', metrics).catch(() => {});
    await sup.send('Page.navigate', { url });
    ok('SUP: login shown', await waitFor(sup, "document.body.innerText.includes('Welcome Back')", 60, 250));
    await evaluate(sup, loginScript('9812345678', 'SUP001'));
    ok('SUP: dashboard opens', await waitFor(sup, "document.body.innerText.includes('Supervisor')", 60));
    await evaluate(sup, `
      (async () => { ${HELPERS}
        cardByLabel('Requests').click();
        return true;
      })()
    `);
    ok('SUP: requests inbox opens', await waitFor(sup, "document.querySelector('.supr__list') !== null"));

    const supCards = await evaluate(sup, `
      (() => { ${HELPERS} return $$('.supr__card').filter((c) => c.textContent.includes('LAB001')).map((c) => ({
        type: c.querySelector('.supr__type')?.textContent.trim() ?? null,
        who: c.querySelector('.supr__who strong')?.textContent.trim() ?? null,
        meta: c.querySelector('.supr__who small')?.textContent.trim() ?? null,
        hours: c.querySelector('.supr__hours')?.textContent.trim() ?? null,
        status: c.querySelector('.supr__status')?.textContent.trim() ?? null,
        hasAudioBtn: c.querySelector('.supr__audio-btn') !== null,
        hasApprove: c.querySelector('.supr__act--approve') !== null,
      })); })()
    `);
    const supHalf = supCards.find((c) => c.type?.includes('Half Day'));
    const supOver = supCards.find((c) => c.type?.includes('Overtime'));
    ok('[cross-browser] SUP sees the half-day request (no refresh)', Boolean(supHalf), JSON.stringify(supHalf));
    ok('[cross-browser] SUP sees the overtime request (no refresh)', Boolean(supOver), JSON.stringify(supOver));
    ok('SUP: card shows labour name', supHalf?.who === 'Ramesh Kumar', String(supHalf?.who));
    ok('SUP: card shows ID + date + time', Boolean(supHalf?.meta?.includes('LAB001')) && supHalf.meta.includes(todayStr) && /\d{1,2}:\d{2}\s(AM|PM)/.test(supHalf.meta), String(supHalf?.meta));
    ok('SUP: overtime card shows requested hours', supOver?.hours?.includes('2'), String(supOver?.hours));
    ok('SUP: half-day card has a voice-note player', supHalf?.hasAudioBtn === true);
    ok('SUP: both cards Pending with Approve buttons', supHalf?.status === 'Pending' && supHalf?.hasApprove && supOver?.status === 'Pending' && supOver?.hasApprove);

    /* ---- SUP: play the real voice note ---- */
    const played = await evaluate(sup, `
      (async () => { ${HELPERS}
        const card = $$('.supr__card').find((c) => c.textContent.includes('LAB001') && c.textContent.includes('Half Day'));
        card.querySelector('.supr__audio-btn').click();
        await sleep(400);
        return card.querySelector('.supr__wave--on') !== null;
      })()
    `);
    ok('SUP: voice note plays (waveform animates)', played === true);

    /* ---- SUP: approve half-day, approve overtime (retry until the
       card flips — a sync re-render can swallow a click) ---- */
    async function approveCard(typeText) {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const done = await evaluate(sup, `
          (async () => { ${HELPERS}
            const card = $$('.supr__card').find((c) => c.textContent.includes('LAB001') && c.textContent.includes('${typeText}'));
            if (!card) return false;
            if (card.querySelector('.supr__status')?.textContent.trim() === 'Approved') return true;
            card.querySelector('.supr__act--approve')?.click();
            await sleep(250);
            return card.querySelector('.supr__status')?.textContent.trim() === 'Approved';
          })()
        `);
        if (done === true) return true;
        await new Promise((r) => setTimeout(r, 300));
      }
      return false;
    }
    ok('SUP: half-day approved', await approveCard('Half Day') === true);
    ok('SUP: overtime approved', await approveCard('Overtime') === true);
    const decided = await evaluate(sup, `
      (() => { ${HELPERS} return $$('.supr__card').filter((c) => c.textContent.includes('LAB001')).map((c) => ({
        status: c.querySelector('.supr__status')?.textContent.trim() ?? null,
        hasActions: c.querySelector('.supr__actions') !== null,
      })); })()
    `);
    ok('SUP: half-day card flips to Approved', decided.every((c) => c.status === 'Approved'), JSON.stringify(decided));
    ok('SUP: double-handling guarded (action buttons gone)', decided.every((c) => c.hasActions === false));

    /* ---- THE CORE CROSS-BROWSER ASSERTION ----
       LAB sits on the Other screen the whole time. No navigation, no
       refresh — the sync bridge must flip the tiles and the shared DB. */
    const t0 = Date.now();
    const labSynced = await waitFor(lab, `
      (() => {
        const db = JSON.parse(localStorage.getItem('suab.db'));
        const mine = db.collections.requests.filter((r) => r.labourId === 'LAB001');
        return mine.length === 2 && mine.every((r) => r.status === 'approved');
      })()
    `, 25, 200);
    ok('[cross-browser] LAB shared DB flipped to approved (no refresh)', labSynced, ((Date.now() - t0) / 1000).toFixed(1) + 's');

    const labBadges = await waitFor(lab, `
      document.body.innerText.includes('Half Day Approved') &&
      document.body.innerText.includes('Overtime Approved')
    `, 25, 200);
    ok('[cross-browser] LAB tiles show Approved badges live', labBadges === true);

    /* ---- LAB: walk Home (no refresh) → half shift + overtime stretch ---- */
    await evaluate(lab, `
      (async () => { ${HELPERS}
        document.querySelector('.back-button').click(); // Other → Home (onHome)
        return true;
      })()
    `);
    const homeReached = await waitFor(lab, "Array.from(document.querySelectorAll('.action-card .action-card__label')).some((el) => el.textContent.trim() === 'Other')", 40);
    if (!homeReached) {
      console.log('LAB screen after back-click: ' + await evaluate(lab, "document.body.innerText.replace(/\\n/g, ' | ').slice(0, 240)"));
      console.log('LAB page errors: ' + lab.errors.slice(-4).join(' || ').slice(0, 600));
    }
    ok('LAB: back on the homepage', homeReached);
    const shiftTypeRaw = await evaluate(lab, "localStorage.getItem('suab.shiftType')");
    const shiftType = JSON.parse(shiftTypeRaw ?? 'null');
    ok('LAB: approved half-day shortens the shift (suab.shiftType=half)', shiftType?.type === 'half' && shiftType?.date === todayStr, String(shiftTypeRaw));
    const timerText = await evaluate(lab, "document.querySelector('.shift-timer')?.textContent ?? ''");
    ok('LAB: shift timer still running', Boolean(timerText), String(timerText));

    if (failures.length > 0) {
      console.log('\n' + failures.length + ' check(s) FAILED');
      process.exitCode = 1;
    } else {
      console.log('\nAll request-flow checks passed');
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
    try { server.httpServer.closeAllConnections?.(); } catch { /* gone */ }
    await new Promise((resolve) => server.httpServer.close(resolve));
  }
}

main().catch((error) => {
  console.error('requests-check crashed:', error.message);
  process.exit(1);
});

