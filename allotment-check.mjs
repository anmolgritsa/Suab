/**
 * allotment-check.mjs — real-browser test for the Machine Allotment screen,
 * its tappable detail screens and the Other requests screen.
 *
 * Walks the flow in headless Chrome at the iPhone 16 viewport (393x852)
 * against the production build:
 *
 *   seeded session + attendance (no allotment) -> machine-allotment
 *     -> layout: MACHINE NO. (M-04) + JOB (Bolt Size 12) + Next + OTHER
 *        as the 4th button, and no leftover static cards ("Stainless ...")
 *     -> tap Machine No.  -> Machine Inputs (3 materials, short names,
 *        grade/spec as colour chips) -> screenshot -> back -> allotment
 *     -> tap Job          -> Product Dimensions (Stainless Steel Coils,
 *        width / thickness / coil weight / grade) -> screenshot -> back
 *     -> tap Other        -> 4 option cards -> back -> allotment
 *     -> Hindi reboot: the detail screens + Other render the hi strings
 *     -> Next still confirms the allotment and opens the homepage
 *     -> half-day flow: Other -> Apply for Half Day -> pending -> after
 *        10s APPROVED (toast + green card + shift type 'half' in storage
 *        + "Shift updated to Half Shift") -> Continue to Home -> homepage
 *
 * Screenshots of the detail screens are saved next to this script for
 * visual comparison with the mockups.
 *
 * Uses only Node built-ins (WebSocket is global since Node 21) plus Vite.
 * Run with:  node allotment-check.mjs
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { preview } from 'vite'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const DEBUG_PORT = 9226
const SHOT_ALLOT = join(import.meta.dirname, '.tmp-allot-shot.png')
const SHOT_INPUTS = join(import.meta.dirname, '.tmp-inputs-shot.png')
const SHOT_DIMS = join(import.meta.dirname, '.tmp-dims-shot.png')
const SHOT_OTHER = join(import.meta.dirname, '.tmp-other-shot.png')

// ### cdp-helpers ###

function launchChrome() {
  const userDir = mkdtempSync(join(tmpdir(), 'suab-chrome-'))
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
  )
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Chrome did not start')), 20000)
    child.stderr.on('data', (chunk) => {
      const match = String(chunk).match(/DevTools listening on (ws:\/\/\S+)/)
      if (match) {
        clearTimeout(timer)
        resolve({ child, userDir })
      }
    })
  })
}

async function connectPage() {
  const list = await (await fetch('http://127.0.0.1:' + DEBUG_PORT + '/json/list')).json()
  const page = list.find((t) => t.type === 'page')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = () => reject(new Error('WebSocket failed'))
  })
  let nextId = 0
  const pending = new Map()
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) reject(new Error(msg.error.message))
      else resolve(msg.result)
    }
  }
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      nextId += 1
      pending.set(nextId, { resolve, reject })
      ws.send(JSON.stringify({ id: nextId, method, params }))
    })
  return { send, close: () => ws.close() }
}

async function evaluate(page, expression) {
  const result = await page.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  if (result.exceptionDetails) {
    const lines = String(expression).split('\n')
    for (const n of [5, 14]) {
      if (lines[n - 1] !== undefined) {
        console.error('  [crashed script line ' + n + '] ' + lines[n - 1].trim())
      }
    }
    throw new Error(result.exceptionDetails.exception?.description || 'Page script threw')
  }
  return result.result.value
}

async function screenshot(page, path) {
  const { data } = await page.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(path, Buffer.from(data, 'base64'))
}

// Poll until `js` is truthy, tolerating the "target navigated" errors the
// CDP session throws while the page is mid-reload.
async function waitFor(page, js, label, tries = 60) {
  let ready = false
  for (let i = 0; i < tries && !ready; i += 1) {
    await new Promise((r) => setTimeout(r, 250))
    try {
      ready = await evaluate(page, js)
    } catch { /* page is mid-reload - poll again */ }
  }
  if (!ready) throw new Error(label + ' never appeared')
}

// ### end cdp-helpers ###
// ### page-scripts ###

// Seed a live session + today's attendance but NO allotment, so the app
// boots straight onto the machine-allotment screen.
const SEED_ALLOTMENT = `
(async () => {
  const d = new Date();
  const today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
    + '-' + String(d.getDate()).padStart(2, '0');
  localStorage.clear();
  localStorage.setItem('suab.session', JSON.stringify({ phone: '9876543210' }));
  localStorage.setItem('suab.attendance', JSON.stringify({
    checkInAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    workerLat: 28.61415, workerLng: 77.20925,
    distanceMeters: 35, date: today,
  }));
  localStorage.setItem('suab.language', JSON.stringify('en'));
  setTimeout(() => location.reload(), 50);
  return 'seeded';
})()
`;

// The allotment layout + the absence of the removed static cards.
const ALLOTMENT_CHECK = `
(() => {
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const text = (sel) => document.querySelector(sel)?.textContent.trim() ?? null;
  const out = {
    title: text('.screen__title'),
    machineLabel: text('.allot-card--machine .allot-card__label'),
    machineValue: text('.allot-card--machine .allot-card__value'),
    jobLabel: text('.allot-card--job .allot-card__label'),
    jobValue: text('.allot-card--job .allot-card__value'),
    otherLabel: text('.allot-card--other .allot-card__label'),
    next: $$('button').find((b) => b.textContent.trim() === 'Next')?.textContent.trim() ?? null,
    // The revert removed the static "Stainless Steel" cards entirely.
    noStaticCards: !document.body.innerText.includes('Stainless Steel'),
    machineCardTappable: document.querySelector('.allot-card--machine')?.tagName === 'BUTTON',
    jobCardTappable: document.querySelector('.allot-card--job')?.tagName === 'BUTTON',
    otherCardTappable: document.querySelector('.allot-card--other')?.tagName === 'BUTTON',
    // "Other" is the 4th button on the page: Machine No. -> Job -> Next -> Other.
    buttonOrder: $$('.allot__main button').map((b) =>
      b.classList.contains('allot-card--machine') ? 'machine'
        : b.classList.contains('allot-card--job') ? 'job'
          : b.classList.contains('allot-card--other') ? 'other'
            : 'next'),
  };
  return JSON.stringify(out);
})()
`;

// Tap the Machine No. card -> Machine Inputs (simplified: short names +
// grade/spec colour chips instead of labelled rows). Stays on the screen
// so the Node side can screenshot it; BACK_TO_ALLOTMENT does the return.
const INPUTS_FLOW = `
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const text = (sel) => document.querySelector(sel)?.textContent.trim() ?? null;
  const out = {};

  document.querySelector('.allot-card--machine').click();
  for (let i = 0; i < 20 && !document.querySelector('.detail'); i += 1) await sleep(100);
  out.title = text('.screen__title');
  out.subtitle = text('.screen__subtitle');
  out.materials = $$('.allot__cards--detail .allot-card').map((card) => {
    const chips = card.querySelectorAll('.chip');
    return {
      name: card.querySelector('.allot-card__value--sm')?.textContent.trim() ?? null,
      grade: chips[0]?.textContent.trim() ?? null,
      spec: chips[1]?.textContent.trim() ?? null,
    };
  });
  // The simplification removed the labelled spec rows.
  out.noSpecRows = document.querySelectorAll('.spec-row').length === 0;
  return JSON.stringify(out);
})()
`;

// Tap the Job card -> Product Dimensions (stays on the screen so the Node
// side can screenshot it; BACK_TO_ALLOTMENT does the return trip).
const DIMS_FLOW = `
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const text = (sel) => document.querySelector(sel)?.textContent.trim() ?? null;
  const out = {};

  document.querySelector('.allot-card--job').click();
  for (let i = 0; i < 20 && !document.querySelector('.detail'); i += 1) await sleep(100);
  out.title = text('.screen__title');
  out.subtitle = text('.screen__subtitle');
  out.productLabel = text('.allot-card--product .allot-card__label');
  out.productName = text('.allot-card--product .allot-card__value--sm');
  out.dimensions = $$('.allot-card--product .spec-row').map((row) => ({
    label: row.querySelector('.spec-row__label')?.textContent.trim() ?? null,
    value: row.querySelector('.spec-row__value')?.textContent.trim() ?? null,
  }));
  return JSON.stringify(out);
})()
`;

// The shared round back button returns to the allotment screen.
const BACK_TO_ALLOTMENT = `
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelector('.detail__back').click();
  for (let i = 0; i < 20 && !document.querySelector('.allot'); i += 1) await sleep(100);
  return Boolean(document.querySelector('.allot'));
})()
`;

// Tap the Other card -> the Other screen with its four option cards
// (stays on the screen for the screenshot; BACK_TO_ALLOTMENT returns).
const OTHER_OPEN_FLOW = `
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const text = (sel) => document.querySelector(sel)?.textContent.trim() ?? null;
  const out = {};

  document.querySelector('.allot-card--other').click();
  for (let i = 0; i < 20 && !document.querySelector('.detail'); i += 1) await sleep(100);
  out.title = text('.screen__title');
  out.subtitle = text('.screen__subtitle');
  out.options = $$('.allot__cards--detail .allot-card').map((card) => ({
    label: card.querySelector('.allot-card__label')?.textContent.trim() ?? null,
    tappable: card.tagName === 'BUTTON' && !card.disabled,
  }));
  return JSON.stringify(out);
})()
`;

// Reboot in Hindi and open the Machine Inputs screen (i18n check).
const HINDI_INPUTS = `
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const text = (sel) => document.querySelector(sel)?.textContent.trim() ?? null;
  const out = {};

  // Reboot in Hindi: the seeded session + attendance survive, so the app
  // lands back on the allotment screen. The reload is deferred so this
  // evaluation resolves before the context is torn down.
  localStorage.setItem('suab.language', JSON.stringify('hi'));
  setTimeout(() => location.reload(), 50);
  return 'rebooting';
})()
`;

const HINDI_INPUTS_PART2 = `
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const text = (sel) => document.querySelector(sel)?.textContent.trim() ?? null;
  const out = {};
  // The Node side has already waited for the rebooted allotment screen.
  document.querySelector('.allot-card--machine').click();
  for (let i = 0; i < 20 && !document.querySelector('.detail'); i += 1) await sleep(100);
  out.inputsTitle = text('.screen__title');

  // Product Dimensions in Hindi.
  document.querySelector('.detail__back').click();
  for (let i = 0; i < 20 && !document.querySelector('.allot'); i += 1) await sleep(100);
  document.querySelector('.allot-card--job').click();
  for (let i = 0; i < 20 && !document.querySelector('.detail'); i += 1) await sleep(100);
  out.dimsTitle = text('.screen__title');
  out.widthLabel = $$('.allot-card--product .spec-row')
    .find((row) => row.textContent.includes('1250'))
    ?.querySelector('.spec-row__label')?.textContent.trim() ?? null;

  // The Other screen in Hindi.
  document.querySelector('.detail__back').click();
  for (let i = 0; i < 20 && !document.querySelector('.allot'); i += 1) await sleep(100);
  document.querySelector('.allot-card--other').click();
  for (let i = 0; i < 20 && !document.querySelector('.detail'); i += 1) await sleep(100);
  out.otherTitle = text('.screen__title');
  out.halfDayLabel = text('.allot-card--halfday .allot-card__label');
  return JSON.stringify(out);
})()
`;

// Open the Other screen and tap "Apply for Half Day" -> pending state.
const HALFDAY_TAP = `
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const text = (sel) => document.querySelector(sel)?.textContent.trim() ?? null;
  const out = {};

  document.querySelector('.allot-card--other').click();
  for (let i = 0; i < 20 && !document.querySelector('.detail'); i += 1) await sleep(100);
  out.title = text('.screen__title');
  out.options = $$('.allot__cards--detail .allot-card').map((card) => ({
    label: card.querySelector('.allot-card__label')?.textContent.trim() ?? null,
    tappable: card.tagName === 'BUTTON' && !card.disabled,
  }));

  // Tap the half-day card -> it flips to a pending state immediately.
  const halfCard = document.querySelector('.allot-card--halfday');
  halfCard.click();
  await sleep(150);
  out.pendingText = halfCard.querySelector('.other__status')?.textContent.trim() ?? null;
  out.pendingDisabled = halfCard.disabled;
  out.pendingSpinner = Boolean(halfCard.querySelector('.other__spinner'));
  return JSON.stringify(out);
})()
`;

// After the 10s timer: approved card + toast + shift type in storage.
const HALFDAY_APPROVED = `
(() => {
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const text = (sel) => document.querySelector(sel)?.textContent.trim() ?? null;
  const halfCard = document.querySelector('.allot-card--approved');
  const req = JSON.parse(localStorage.getItem('suab.halfDayRequest') ?? 'null');
  const out = {
    approvedText: halfCard?.querySelector('.other__status')?.textContent.trim() ?? null,
    approvedEnabled: halfCard ? !halfCard.disabled : null,
    // The toast's message span (the ✕ close button is a sibling <button>).
    toast: text('.toast span'),
    note: text('.other__note'),
    continueBtn: $$('button').find((b) => b.textContent.trim() === 'Continue to Home')?.textContent.trim() ?? null,
    shiftType: JSON.parse(localStorage.getItem('suab.shiftType') ?? 'null'),
    halfDayRequest: req
      ? { status: req.status, hasRequestedAt: typeof req.requestedAt === 'string' && req.requestedAt.length > 0 }
      : null,
  };
  return JSON.stringify(out);
})()
`;

// "Continue to Home" starts the (half) shift and opens the homepage.
const HALFDAY_HOME = `
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  Array.from(document.querySelectorAll('button'))
    .find((b) => b.textContent.trim() === 'Continue to Home').click();
  for (let i = 0; i < 20 && !document.querySelector('.home'); i += 1) await sleep(100);
  return Boolean(document.querySelector('.home'));
})()
`;

// Clear the allotment + shift keys and reboot back to the allotment screen
// (used to re-enter the flow after Next already saved an allotment).
const RESET_TO_ALLOTMENT = `
(() => {
  ['suab.allotment', 'suab.shiftStart', 'suab.shiftType', 'suab.halfDayRequest',
    'suab.shiftAlertsShown'].forEach((k) => localStorage.removeItem(k));
  setTimeout(() => location.reload(), 50);
  return 'resetting';
})()
`;

// The Next button still confirms the allotment and opens the homepage.
const NEXT_FLOW = `
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = {};
  // Back to English so the homepage check reads the en strings.
  localStorage.setItem('suab.language', JSON.stringify('en'));
  setTimeout(() => location.reload(), 50);
  return 'rebooting';
})()
`;

const NEXT_FLOW_PART2 = `
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = {};
  // The Node side has already waited for the rebooted allotment screen.
  Array.from(document.querySelectorAll('button'))
    .find((b) => b.textContent.trim() === 'Next').click();
  for (let i = 0; i < 20 && !document.querySelector('.home'); i += 1) await sleep(100);
  out.homeShown = Boolean(document.querySelector('.home'));
  const allotment = JSON.parse(localStorage.getItem('suab.allotment') ?? 'null');
  out.allotmentSaved = allotment?.machineId === 'M-04' && allotment?.date !== undefined;
  return JSON.stringify(out);
})()
`;

// ### end page-scripts ###

let failures = 0
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures += 1
  console.log(ok ? 'PASS' : 'FAIL', label, '->', JSON.stringify(actual))
}

// ### main ###
async function main() {
  const server = await preview({ preview: { port: 4176, strictPort: true } })
  const url = server.resolvedUrls.local[0]
  console.log('Serving ' + url)

  let chrome, session
  try {
    chrome = await launchChrome()
    session = await connectPage()
    await session.send('Emulation.setDeviceMetricsOverride', {
      width: 393,
      height: 852,
      deviceScaleFactor: 3,
      mobile: true,
    })
    await session.send('Page.navigate', { url })

    // Wait for the app to render (fresh storage -> login screen), then
    // seed the session + attendance and reboot onto the allotment.
    let ready = false
    for (let i = 0; i < 40 && !ready; i += 1) {
      await new Promise((r) => setTimeout(r, 250))
      ready = await evaluate(session, "document.body.innerText.includes('Welcome Back')")
    }
    if (!ready) throw new Error('Login screen never appeared')
    await evaluate(session, SEED_ALLOTMENT)

    let allotReady = false
    for (let i = 0; i < 40 && !allotReady; i += 1) {
      await new Promise((r) => setTimeout(r, 250))
      allotReady = await evaluate(session, "Boolean(document.querySelector('.allot'))")
    }
    if (!allotReady) throw new Error('Machine allotment screen never appeared')

    check('allotment layout', JSON.parse(await evaluate(session, ALLOTMENT_CHECK)), {
      title: "Today's Machine",
      // Raw text — the uppercase look comes from CSS text-transform.
      machineLabel: 'Machine No.',
      machineValue: 'M-04',
      jobLabel: 'Job',
      jobValue: 'Bolt Size 12',
      otherLabel: 'Other',
      next: 'Next',
      noStaticCards: true,
      machineCardTappable: true,
      jobCardTappable: true,
      otherCardTappable: true,
      buttonOrder: ['machine', 'job', 'next', 'other'],
    })
    await screenshot(session, SHOT_ALLOT)

    check('machine inputs screen', JSON.parse(await evaluate(session, INPUTS_FLOW)), {
      title: 'Machine Inputs',
      subtitle: 'Raw material loaded into this machine',
      materials: [
        { name: 'SS Pipes & Tubes', grade: 'SS 304', spec: 'ASTM A312' },
        { name: 'SS Sheets', grade: 'SS 316L', spec: 'ASTM A240' },
        { name: 'MS Rods', grade: 'E250BR', spec: 'IS 2062' },
      ],
      noSpecRows: true,
    })
    await screenshot(session, SHOT_INPUTS)
    check('inputs back button', await evaluate(session, BACK_TO_ALLOTMENT), true)

    check('product dimensions screen', JSON.parse(await evaluate(session, DIMS_FLOW)), {
      title: 'Product Dimensions',
      subtitle: 'Finished output of this machine',
      // Raw text — the uppercase look comes from CSS text-transform.
      productLabel: 'Finished Product',
      productName: 'Stainless Steel Coils',
      dimensions: [
        { label: 'Width', value: '1250 mm' },
        { label: 'Thickness', value: '0.5 mm' },
        { label: 'Coil Weight', value: '2.5 t' },
        { label: 'Grade', value: 'SS 304' },
      ],
    })
    await screenshot(session, SHOT_DIMS)
    check('dims back button', await evaluate(session, BACK_TO_ALLOTMENT), true)

    check('other screen', JSON.parse(await evaluate(session, OTHER_OPEN_FLOW)), {
      title: 'Other',
      subtitle: 'Requests & updates',
      options: [
        { label: 'Apply for Half Day', tappable: true },
        { label: 'Apply for Overtime', tappable: true },
        { label: 'Report Machine Maintenance', tappable: true },
        { label: 'Update Other Work Activities', tappable: true },
      ],
    })
    await screenshot(session, SHOT_OTHER)
    check('other back button', await evaluate(session, BACK_TO_ALLOTMENT), true)

    await evaluate(session, HINDI_INPUTS)
    await waitFor(session, "Boolean(document.querySelector('.allot'))", 'Allotment screen (hi reboot)')
    check('hindi detail screens', JSON.parse(await evaluate(session, HINDI_INPUTS_PART2)), {
      inputsTitle: 'मशीन के इनपुट',
      dimsTitle: 'उत्पाद के आयाम',
      widthLabel: 'चौड़ाई',
      otherTitle: 'अन्य',
      halfDayLabel: 'आधे दिन के लिए आवेदन करें',
    })

    await evaluate(session, NEXT_FLOW)
    await waitFor(session, "Boolean(document.querySelector('.allot'))", 'Allotment screen (en reboot)')
    check('next still opens the homepage', JSON.parse(await evaluate(session, NEXT_FLOW_PART2)), {
      homeShown: true,
      allotmentSaved: true,
    })

    // Half-day flow: clear the saved allotment so the app boots back to the
    // allotment screen, then raise the request from the Other screen.
    await evaluate(session, RESET_TO_ALLOTMENT)
    await waitFor(session, "Boolean(document.querySelector('.allot'))", 'Allotment screen (reset)')
    check('half-day pending state', JSON.parse(await evaluate(session, HALFDAY_TAP)), {
      title: 'Other',
      options: [
        { label: 'Apply for Half Day', tappable: true },
        { label: 'Apply for Overtime', tappable: true },
        { label: 'Report Machine Maintenance', tappable: true },
        { label: 'Update Other Work Activities', tappable: true },
      ],
      pendingText: 'Pending…',
      pendingDisabled: true,
      pendingSpinner: true,
    })

    // The approval fires 10s after the tap; poll until the green card shows.
    await waitFor(
      session,
      "Boolean(document.querySelector('.allot-card--approved'))",
      'Half-day approval',
      60,
    )
    check('half-day approved', JSON.parse(await evaluate(session, HALFDAY_APPROVED)), {
      approvedText: 'Half Day Approved',
      // The card is done — it is only tappable while the request is idle.
      approvedEnabled: false,
      toast: 'Half Day Approved',
      note: 'Shift updated to Half Shift',
      continueBtn: 'Continue to Home',
      // saveShiftType stamps { type, date }; the homepage resolves the
      // half-shift duration from the type via utils/shift.js.
      shiftType: { type: 'half', date: new Date().toISOString().slice(0, 10) },
      halfDayRequest: { status: 'approved', hasRequestedAt: true },
    })
    check('continue to home', await evaluate(session, HALFDAY_HOME), true)

    console.log(failures === 0 ? '\nAll allotment checks passed' : '\n' + failures + ' check(s) FAILED')
  } finally {
    session?.close()
    await new Promise((r) => setTimeout(r, 200))
    chrome?.child?.kill()
    server.httpServer.close()
  }
  if (failures > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
