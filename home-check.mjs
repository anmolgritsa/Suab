/**
 * home-check.mjs — real-browser test for the Labour Homepage (Parts 3+4).
 *
 * Walks the FULL demo flow in headless Chrome at the iPhone 16 viewport
 * (393x852) against the production build:
 *
 *   Login -> Attendance -> Check In -> Machine Allotment -> Labour Homepage
 *     -> SOS dialog (cancel + send) -> language switch -> report screen
 *     -> refresh (persistence)
 *
 *   Seeded scenarios (localStorage planted, then the app reboots):
 *     -> work-update reminder pops twice consecutively (seed-race fix
 *        verified): send-without-attachment is blocked, then attach +
 *        send, and dismiss
 *     -> all three issue reports (mandatory-attachment validation, cancel,
 *        submit, attachment metadata, confirmation, back navigation)
 *     -> shift auto-end -> product submission keypad (empty / over the
 *        assigned limit / valid / early end) -> shift-completed screen
 *     -> reset demo
 *
 * Also captures a screenshot of the homepage for visual comparison with
 * the mockups (uploads/6.1 home page.png, 6.2 homepage a…png).
 *
 * Uses only Node built-ins (WebSocket is global since Node 21) plus Vite.
 * Run with:  node home-check.mjs
 */

import { spawn, execSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { preview } from 'vite'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const DEBUG_PORT = 9225
const SHOT_PATH = join(import.meta.dirname, '.tmp-home-shot.png')

// A tiny stand-in "photo" for the attachment pickers. Only the file's
// metadata (name / type / size) is read by the app — nothing is uploaded
// — so the bytes are irrelevant, but the name must match what the
// attachment-chip assertions expect.
const TMP_DIR = mkdtempSync(join(tmpdir(), 'suab-upload-'))
const PHOTO_PATH = join(TMP_DIR, 'site-photo.png')

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
    throw new Error(result.exceptionDetails.exception?.description || 'Page script threw')
  }
  return result.result.value
}

async function screenshot(page, path) {
  const { data } = await page.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(path, Buffer.from(data, 'base64'))
}

/**
 * Point a hidden <input type="file"> at a real file on disk — the same
 * CDP route Puppeteer's uploadFile takes. The browser fires a genuine
 * change event, so the app's metadata-only attachment logic (name /
 * type / size) runs for real without any polyfilling.
 */
async function setFileInputFiles(session, selector, filePath) {
  const { root } = await session.send('DOM.getDocument')
  const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector })
  if (!nodeId) throw new Error('file input not found: ' + selector)
  await session.send('DOM.setFileInputFiles', { files: [filePath], nodeId })
}

// ### end cdp-helpers ###
// ### page-scripts ###
// Part 1: walk Login and land on the Attendance screen.
// (Same walk as attendance-check.mjs, trimmed to what the homepage needs.)

const AUTH_WALK = `
(async () => {
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
  const out = { steps: [] };

  // 1. Login with the supervisor-issued credentials (phone + Employee ID;
  //    React controlled inputs need the native value setter).
  const inputs = $$('input');
  setReactValue(inputs[0], '9876543210');
  setReactValue(inputs[1], 'SUAB-1024');
  buttonByText('Login').click();
  for (let i = 0; i < 20 && !document.body.innerText.includes('Mark Attendance'); i += 1) {
    await sleep(100);
  }
  out.steps.push({ attendance: document.body.innerText.includes('Mark Attendance') });
  // Second section on the attendance screen: the "Today's Shift" summary
  // card must be present and mirror the demo timing knobs (5-min shift,
  // 3-min reminder) plus the not-checked-in status.
  out.attendanceSection = {
    present: Boolean(document.querySelector('.att__shift-card')),
    title: document.querySelector('.att__shift-title')?.textContent.trim() ?? null,
    rows: $$('.att__shift-row dd').map((dd) => dd.textContent.trim()),
  };
  return JSON.stringify(out);
})()
`;

// Part 2: check in, then exercise the homepage — snapshot, SOS dialog
// (cancel + send), language switch, card navigation.

const HOME_FLOW = `
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const buttonByText = (text) => $$('button').find((b) => b.textContent.trim() === text);
  // React 18 ignores plain value writes, so route through the native setter.
  const nativeSetter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype, 'value'
  ).set;
  const setReactValue = (textarea, value) => {
    nativeSetter.call(textarea, value);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const out = {};

  // --- check in -> machine allotment -> homepage (skipped when a
  //     screenshot pass already did it) ---
  if (!document.querySelector('.home')) {
    buttonByText('Check In').click();
    for (let i = 0; i < 20 && !document.querySelector('.allotment'); i += 1) {
      await sleep(100);
    }
    buttonByText('Confirm & Start Shift').click();
    for (let i = 0; i < 20 && !document.querySelector('.home'); i += 1) {
      await sleep(100);
    }
  }
  const snap = () => ({
    logoLoaded: (() => {
      const img = document.querySelector('img.brand-logo');
      return Boolean(img) && img.complete && img.naturalWidth > 0;
    })(),
    langPill: document.querySelector('.lang__pill')?.textContent.trim() ?? null,
    shiftText: document.querySelector('.shift-timer')?.textContent.trim() ?? null,
    shiftLabel: document.querySelector('.shift-timer')?.getAttribute('aria-label') ?? null,
    cards: $$('.action-card .action-card__label').map((c) => c.textContent.trim()),
    // Tap-target geometry of the three action cards: the tiles must be
    // large, visible and easy to hit on an iPhone-sized viewport.
    cardRects: $$('.action-card').map((c) => {
      const r = c.getBoundingClientRect();
      const badge = c.querySelector('.action-card__badge');
      const b = badge ? badge.getBoundingClientRect() : null;
      return {
        w: Math.round(r.width),
        h: Math.round(r.height),
        badge: b ? Math.round(b.width) : 0,
        labelPx: c.querySelector('.action-card__label')
          ? parseFloat(getComputedStyle(c.querySelector('.action-card__label')).fontSize)
          : 0,
      };
    }),
    sos: document.querySelector('.sos-button')?.textContent.trim() ?? null,
    sosBg: (() => {
      const el = document.querySelector('.sos-button');
      return el ? getComputedStyle(el).backgroundColor : null;
    })(),
    reset: document.querySelector('.home__footer .link-button')?.textContent.trim() ?? null,
  });
  out.home = snap();

  // --- SOS: cancel first (no alert must fire) ---
  document.querySelector('.sos-button').click();
  await sleep(150);
  out.sosDialog = {
    title: document.querySelector('.sos-dialog .modal__title')?.textContent.trim() ?? null,
    cancel: document.querySelector('.sos-dialog__cancel')?.textContent.trim() ?? null,
    send: document.querySelector('.sos-dialog__send')?.textContent.trim() ?? null,
  };
  document.querySelector('.sos-dialog__cancel').click();
  await sleep(150);
  out.afterCancel = {
    dialogGone: !document.querySelector('.sos-dialog'),
    toastShown: Boolean(document.querySelector('.toast')),
    sosSaved: localStorage.getItem('suab.sosEvents') !== null,
  };

  // --- SOS: send (alert fires + toast + localStorage) ---
  document.querySelector('.sos-button').click();
  await sleep(150);
  document.querySelector('.sos-dialog__send').click();
  await sleep(200);
  out.afterSend = {
    dialogGone: !document.querySelector('.sos-dialog'),
    toast: document.querySelector('.toast')?.textContent.trim() ?? null,
    sosSaved: localStorage.getItem('suab.sosEvents') !== null,
  };

  // --- card navigation: first card -> report screen -> back (in English) ---
  document.querySelector('.action-card').click();
  await sleep(250);
  out.reportScreen = {
    title: document.querySelector('.report .screen__title')?.textContent.trim() ?? null,
    subtitle: document.querySelector('.report .screen__subtitle')?.textContent.trim() ?? null,
    hasTextarea: Boolean(document.querySelector('.report__textarea')),
    hasFileInput: Boolean(document.querySelector('.report__file-input')),
    submitLabel: document.querySelector('.report__actions .btn-primary')?.textContent.trim() ?? null,
    // The design request: the Submit Report button wears the SAME colours
    // as the attachment picker above it. Capture both to compare.
    submitBg: (() => {
      const el = document.querySelector('.report__actions .btn-primary');
      return el ? getComputedStyle(el).backgroundColor : null;
    })(),
    submitColor: (() => {
      const el = document.querySelector('.report__actions .btn-primary');
      return el ? getComputedStyle(el).color : null;
    })(),
    pickerBg: (() => {
      const el = document.querySelector('.report__pick');
      return el ? getComputedStyle(el).backgroundColor : null;
    })(),
    pickerColor: (() => {
      const el = document.querySelector('.report__pick');
      return el ? getComputedStyle(el).color : null;
    })(),
    cancelLabel: document.querySelector('.report__actions .link-button')?.textContent.trim() ?? null,
  };
  document.querySelector('.report .back-button').click();
  await sleep(250);
  out.backHome = {
    homeShown: Boolean(document.querySelector('.home')),
    firstCard: document.querySelector('.action-card .action-card__label')?.textContent.trim() ?? null,
  };

  // --- language dropdown: 5 options, switch to the 2nd (Hindi) ---
  document.querySelector('.lang__pill').click();
  await sleep(150);
  out.langMenu = {
    optionCount: $$('.lang__menu button').length,
  };
  $$('.lang__menu button')[1].click();
  await sleep(200);
  out.afterLangSwitch = {
    pill: document.querySelector('.lang__pill')?.textContent.trim() ?? null,
    firstCard: document.querySelector('.action-card .action-card__label')?.textContent.trim() ?? null,
    menuClosed: !document.querySelector('.lang__menu'),
  };

  return JSON.stringify(out);
})()
`;

// ### end page-scripts ###

// Part 3: after a fresh navigation (the "refresh"), the persisted session +
// shift start must resume straight on the homepage, with the chosen
// language still applied.

const RELOAD = `
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = {};
  out.afterReload = {
    homeShown: Boolean(document.querySelector('.home')),
    langPill: document.querySelector('.lang__pill')?.textContent.trim() ?? null,
    shiftText: document.querySelector('.shift-timer')?.textContent.trim() ?? null,
    shiftStartPersisted: localStorage.getItem('suab.shiftStart') !== null,
    // The persisted start must be a real timestamp in the (recent) past —
    // proof the timer is counting from the pre-refresh moment. The value
    // is stored JSON-encoded, so unwrap it before parsing.
    shiftElapsedMs: (() => {
      let raw = null
      try { raw = JSON.parse(localStorage.getItem('suab.shiftStart') ?? 'null') } catch { /* not JSON */ }
      const start = Date.parse(typeof raw === 'string' ? raw : '')
      return Number.isNaN(start) ? null : Date.now() - start;
    })(),
  };
  return JSON.stringify(out);
})()
`;

// ### end page-scripts ###

// ---- seeded scenarios ------------------------------------------------------
// Each scenario boots the app straight onto the homepage with a shift that
// began `minutesAgo` minutes ago, so the reminder / shift-end logic can be
// exercised without waiting. With the demo timings (5-minute shift, 3-minute
// reminder interval) the seeds are:
//   4 min  -> reminder due (>= 3 min) but the shift not over yet (< 5 min)
//   1 min  -> quiet homepage (no reminder due, shift far from its end)
//   6 min  -> shift already past its 5-minute length -> auto-end

/**
 * Page script that plants a logged-in, checked-in, machine-allotted session
 * with a shift started `minutesAgo` minutes ago (and no reminder shown yet),
 * then REBOOTS the app.
 *
 * The allotment record is required: without it the router would resume on
 * the Machine Allotment screen instead of the homepage. Its shape matches
 * what MachineAllotmentScreen persists (date-stamped so it expires at
 * midnight, like attendance).
 *
 * The reload at the end is the seed-race fix: the previous homepage's
 * reminder timer ticks every 30s, and if it fires in the gap between
 * seeding and the outer navigation it writes suab.lastReminderAt into
 * the freshly seeded state — suppressing the modal the scenario expects.
 * Reloading 50ms after seeding reboots the app straight from the seeded
 * storage and destroys every old timer, making the scenario
 * deterministic (a stray tick must land inside a 50ms window).
 */
function seedScript(minutesAgo) {
  return `
(async () => {
  const start = new Date(Date.now() - ${minutesAgo} * 60 * 1000).toISOString();
  const d = new Date();
  const today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
    + '-' + String(d.getDate()).padStart(2, '0');
  localStorage.clear();
  localStorage.setItem('suab.session', JSON.stringify({ phone: '9876543210' }));
  localStorage.setItem('suab.attendance', JSON.stringify({
    checkInAt: start, workerLat: 28.61415, workerLng: 77.20925,
    distanceMeters: 35, date: today,
  }));
  localStorage.setItem('suab.allotment', JSON.stringify({
    date: today, machineId: 'M-04', machineName: 'Tile Press #4',
    machineType: 'Pressing', targetQuantity: 500, acceptedAt: start,
  }));
  localStorage.setItem('suab.assignedQuantity', JSON.stringify(500));
  localStorage.setItem('suab.shiftStart', JSON.stringify(start));
  localStorage.setItem('suab.language', JSON.stringify('en'));
  localStorage.removeItem('suab.lastReminderAt');
  localStorage.removeItem('suab.workUpdates');
  setTimeout(() => location.reload(), 50);
  return 'seeded';
})()
`;
}

/**
 * Seed + reboot, then wait for `readyJs` (evaluated in the reloaded
 * page) to turn true. Belt and braces: if the condition still isn't met
 * after a full wait, force one more clean reboot — the only way a stray
 * timer can win is by poisoning the state inside the 50ms reload window,
 * and re-removing suab.lastReminderAt + reloading again defeats that too.
 */
async function seedAndReboot(session, minutesAgo, readyJs, label) {
  await evaluate(session, seedScript(minutesAgo))
  let ready = false
  for (let i = 0; i < 60 && !ready; i += 1) {
    await new Promise((r) => setTimeout(r, 250))
    try {
      ready = await evaluate(session, readyJs)
    } catch { /* page is mid-reload — poll again */ }
  }
  if (!ready) {
    await evaluate(session, "localStorage.removeItem('suab.lastReminderAt'); setTimeout(() => location.reload(), 20); 'forced'")
    for (let i = 0; i < 60 && !ready; i += 1) {
      await new Promise((r) => setTimeout(r, 250))
      try {
        ready = await evaluate(session, readyJs)
      } catch { /* page is mid-reload — poll again */ }
    }
  }
  if (!ready) throw new Error(label + ' never appeared')
}

// Scenario A: the work-update reminder (mockup 6.2) pops after one full
// interval of work time. The attachment is MANDATORY, so this first script
// taps "Send Update" with nothing attached: the send must be blocked with
// the validation message, the modal must stay in its ask stage, and no
// update may be recorded.

const REMINDER_BLOCKED = `
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = {};
  out.shown = {
    modal: Boolean(document.querySelector('.update-reminder')),
    title: document.querySelector('.update-reminder .modal__title')?.textContent.trim() ?? null,
    subtitle: document.querySelector('.update-reminder .modal__subtitle')?.textContent.trim() ?? null,
    send: document.querySelector('.update-reminder__send')?.textContent.trim() ?? null,
    hasFileInput: Boolean(document.querySelector('.update-reminder input[type="file"]')),
    snoozedOnShow: localStorage.getItem('suab.lastReminderAt') !== null,
  };
  document.querySelector('.update-reminder__send').click();
  for (let i = 0; i < 20 && !document.querySelector('.update-reminder .field__error'); i += 1) {
    await sleep(100);
  }
  out.blocked = {
    error: document.querySelector('.update-reminder .field__error')?.textContent.trim() ?? null,
    pickerError: document.querySelector('.update-reminder .report__pick')?.className.includes('report__pick--error') ?? false,
    stillAskStage: document.querySelector('.update-reminder .modal__title')?.textContent.trim() === 'Work update needed',
    updateCount: JSON.parse(localStorage.getItem('suab.workUpdates') ?? '[]').length,
  };
  return JSON.stringify(out);
})()
`;

// Scenario A (continued): with a photo attached, "Send Update" records the
// update (with the file's metadata), shows the in-modal confirmation, and
// Done closes it. The file is injected via CDP before this runs.

const REMINDER_SEND = `
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = {};
  out.attachmentChip = document.querySelector('.update-reminder .report__attachment-name')?.textContent.trim() ?? null;
  out.errorCleared = !document.querySelector('.update-reminder .field__error');
  document.querySelector('.update-reminder__send').click();
  for (let i = 0; i < 20 && !document.body.innerText.includes('Update sent!'); i += 1) {
    await sleep(100);
  }
  const updates = JSON.parse(localStorage.getItem('suab.workUpdates') ?? '[]');
  out.confirmStage = {
    title: document.querySelector('.update-reminder .modal__title')?.textContent.trim() ?? null,
    subtitle: document.querySelector('.update-reminder .modal__subtitle')?.textContent.trim() ?? null,
    done: document.querySelector('.update-reminder__send')?.textContent.trim() ?? null,
    saved: updates[0] ?? null,
    updateCount: updates.length,
  };
  document.querySelector('.update-reminder__send').click(); // Done
  for (let i = 0; i < 20 && document.querySelector('.update-reminder'); i += 1) {
    await sleep(100);
  }
  out.afterDone = {
    modalGone: !document.querySelector('.update-reminder'),
    toast: document.querySelector('.toast')?.textContent.trim() ?? null,
  };
  return JSON.stringify(out);
})()
`;

// Scenario A2: the same reminder on the very next boot, WITH a photo
// attached before sending — proves the seed-race fix holds back-to-back
// and exercises the attachment-metadata path end to end.

const REMINDER_ATTACH = `
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = {};
  out.shown = { modal: Boolean(document.querySelector('.update-reminder')) };
  out.attachmentChip = document.querySelector('.update-reminder .report__attachment-name')?.textContent.trim() ?? null;
  document.querySelector('.update-reminder__send').click();
  for (let i = 0; i < 20 && !document.body.innerText.includes('Update sent!'); i += 1) {
    await sleep(100);
  }
  const updates = JSON.parse(localStorage.getItem('suab.workUpdates') ?? '[]');
  out.saved = updates[0] ?? null;
  document.querySelector('.update-reminder__send').click(); // Done
  for (let i = 0; i < 20 && document.querySelector('.update-reminder'); i += 1) {
    await sleep(100);
  }
  out.afterDone = {
    modalGone: !document.querySelector('.update-reminder'),
    toast: document.querySelector('.toast')?.textContent.trim() ?? null,
  };
  return JSON.stringify(out);
})()
`;

// Scenario B: dismissing the reminder (the X button) closes it without
// recording an update.

const REMINDER_DISMISS = `
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = {};
  for (let i = 0; i < 30 && !document.querySelector('.update-reminder'); i += 1) {
    await sleep(100);
  }
  document.querySelector('.update-reminder .modal__close').click();
  await sleep(250);
  out.afterDismiss = {
    modalGone: !document.querySelector('.update-reminder'),
    toastShown: Boolean(document.querySelector('.toast')),
    workUpdates: localStorage.getItem('suab.workUpdates') !== null,
  };
  return JSON.stringify(out);
})()
`;

// Scenario C: a shift that reached its full length auto-ends — the
// homepage hands over to the product submission form and clears the
// shift (the "Shift complete!" confirmation only appears after a count
// is submitted, which the product-keypad scenario does next).

const SHIFT_END_FLOW = `
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = {};
  out.shiftEnd = {
    homeGone: !document.querySelector('.home'),
    title: document.querySelector('.product-submit .screen__title')?.textContent.trim() ?? null,
    subtitle: document.querySelector('.product-submit .screen__subtitle')?.textContent.trim() ?? null,
    assignedChip: document.querySelector('.product-submit__assigned')?.textContent.trim() ?? null,
    display: document.querySelector('.product-submit__value')?.textContent.trim() ?? null,
    keypadKeys: Array.from(document.querySelectorAll('.keypad__key')).map((k) => k.textContent.trim()),
    confirmLabel: document.querySelector('.product-submit__actions .btn-primary')?.textContent.trim() ?? null,
    earlyLabel: document.querySelector('.product-submit__actions .link-button')?.textContent.trim() ?? null,
    backAriaLabel: document.querySelector('.product-submit .back-button')?.getAttribute('aria-label') ?? null,
    shiftStartCleared: localStorage.getItem('suab.shiftStart') === null,
    lastReminderCleared: localStorage.getItem('suab.lastReminderAt') === null,
  };
  return JSON.stringify(out);
})()
`;

// Scenario C2: exercising the product submission keypad — empty submit,
// over-the-assigned-limit submit, digits-only entry (no minus key exists,
// so negatives are impossible by construction), clear/backspace, then a
// valid 450 submission -> "Shift complete!" confirmation -> Start New
// Shift returns to a fresh homepage.

const PRODUCT_FLOW = `
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const display = () => document.querySelector('.product-submit__value')?.textContent.trim() ?? null;
  const errorText = () => document.querySelector('.product-submit__error')?.textContent.trim() ?? null;
  const confirmBtn = () => document.querySelector('.product-submit__actions .btn-primary');
  // React 18 batches the queued entry updates, so every press must yield
  // before the next read/click — otherwise Confirm fires on a stale entry.
  const press = async (label) => {
    $$('.keypad__key').find((k) => k.textContent.trim() === label).click();
    await sleep(50);
  };
  const waitUntil = async (fn, tries = 30) => {
    for (let i = 0; i < tries && !fn(); i += 1) await sleep(100);
    return Boolean(fn());
  };
  const out = {};

  // 1. submitting with nothing typed -> "Enter the quantity produced."
  confirmBtn().click();
  for (let i = 0; i < 10 && !document.querySelector('.product-submit__error'); i += 1) {
    await sleep(100);
  }
  out.emptyError = document.querySelector('.product-submit__error')?.textContent.trim() ?? null;

  // 2. over the assigned limit: 5-0-0-0 -> 5000 > 500
  for (const digit of ['5', '0', '0', '0']) await press(digit);
  out.displayOverLimit = display();
  confirmBtn().click();
  // The step-1 error is already showing — wait for the over-limit one to
  // replace it (a fixed sleep would flake; the text swap is the real signal).
  if (!(await waitUntil(() => errorText() === 'Quantity cannot exceed the assigned limit.'))) {
    throw new Error('over-limit error missing, got: ' + errorText());
  }
  out.overLimitError = errorText();
  out.stillOnForm = Boolean(document.querySelector('.keypad'));
  out.savedCountAfterBadSubmits = JSON.parse(localStorage.getItem('suab.productSubmissions') ?? '[]').length;

  // 3. the keypad can only produce digits — negative entries are
  //    impossible by construction (no minus key exists)
  await press('C');
  for (const digit of ['4', '5']) await press(digit);
  out.digitsOnlyDisplay = display();
  // Backslash-free digit check — a regex inside this template literal
  // needs a doubled backslash in the source to survive template cooking,
  // which is a silent-failure trap; charCode comparison can't be mis-escaped.
  const digits = out.digitsOnlyDisplay ?? '';
  out.entryIsDigitsOnly = digits.length > 0
    && Array.from(digits).every((ch) => ch >= '0' && ch <= '9');

  // 4. backspace removes the last digit
  await press('⌫');
  out.afterBackspace = display(); // "4"

  // 5. valid submission: clear, type 450, confirm
  await press('C');
  for (const digit of ['4', '5', '0']) await press(digit);
  out.displayBeforeSubmit = display();
  confirmBtn().click();
  for (let i = 0; i < 30 && !document.querySelector('.product-submit__action'); i += 1) {
    await sleep(100);
  }
  const submissions = JSON.parse(localStorage.getItem('suab.productSubmissions') ?? '[]');
  out.completed = {
    title: document.querySelector('.product-submit .screen__title')?.textContent.trim() ?? null,
    subtitle: document.querySelector('.product-submit .screen__subtitle')?.textContent.trim() ?? null,
    rows: $$('.product-submit__row').map((r) => r.textContent.trim()),
    saved: submissions[0] ?? null,
    submissionCount: submissions.length,
    startLabel: document.querySelector('.product-submit__action')?.textContent.trim() ?? null,
    logoutLabel: Array.from(document.querySelectorAll('.product-submit .link-button')).map((b) => b.textContent.trim())[0] ?? null,
  };

  // 6. "Start New Shift" -> a fresh machine allotment (the daily flow's
  //    step 3) -> confirming it opens a fresh homepage with a new shift
  const startBtn = document.querySelector('.product-submit__action');
  if (!startBtn) {
    throw new Error(
      'confirmation missing after 450 submit — state=' + JSON.stringify({
        out,
        nowShowing: {
          title: document.querySelector('.screen__title')?.textContent.trim() ?? null,
          error: errorText(),
          display: display(),
          keypadCount: $$('.keypad').length,
          formCount: $$('.product-submit').length,
        },
      }),
    );
  }
  startBtn.click();
  for (let i = 0; i < 30 && !document.querySelector('.allotment'); i += 1) {
    await sleep(100);
  }
  out.afterStartNewShift = {
    allotmentShown: Boolean(document.querySelector('.allotment')),
    allotmentTitle: document.querySelector('.allotment .screen__title')?.textContent.trim() ?? null,
  };
  // Click confirm fresh from the live DOM; if the homepage has not appeared
  // after ~1.5s (a click swallowed by a re-render), try once more — the
  // handler is idempotent (it re-stamps the same allotment and re-navigates).
  const confirmAllotment = () => {
    const btn = $$('.allotment button').find((b) => b.textContent.trim() === 'Confirm & Start Shift');
    if (btn) btn.click();
    return Boolean(btn);
  };
  let confirmFound = confirmAllotment();
  for (let i = 0; i < 30 && !document.querySelector('.home'); i += 1) {
    await sleep(100);
    if (i === 15) confirmFound = confirmAllotment() || confirmFound;
  }
  out.afterConfirmAllotment = {
    homeShown: Boolean(document.querySelector('.home')),
    shiftRestarted: localStorage.getItem('suab.shiftStart') !== null,
    confirmFound,
    nowShowing: document.querySelector('.screen__title')?.textContent.trim() ?? null,
  };
  return JSON.stringify(out);
})()
`;

// Scenario C3: the manual "End Shift & Submit" path (early completion)
// records endedEarly on the submission, and Logout from the
// shift-completed screen ends the session at the login screen.

const PRODUCT_EARLY_FLOW = `
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  // Same React 18 batching as PRODUCT_FLOW: yield after every press so
  // the queued entry renders before "End Shift & Submit" reads it.
  const press = async (label) => {
    $$('.keypad__key').find((k) => k.textContent.trim() === label).click();
    await sleep(50);
  };
  const out = {};

  for (const digit of ['1', '2', '0']) await press(digit);
  const earlyBtn = $$('.product-submit__actions .link-button')[0];
  earlyBtn.click();
  for (let i = 0; i < 20 && !document.body.innerText.includes('Shift complete!'); i += 1) {
    await sleep(100);
  }
  const submissions = JSON.parse(localStorage.getItem('suab.productSubmissions') ?? '[]');
  out.early = {
    saved: submissions[0] ?? null,
    endedEarlyFlag: submissions[0]?.endedEarly === true,
  };

  // Logout from the shift-completed confirmation -> login screen
  const logoutBtn = $$('.product-submit .link-button').find((b) => b.textContent.trim() === 'Logout');
  logoutBtn.click();
  for (let i = 0; i < 20 && !document.body.innerText.includes('Welcome Back'); i += 1) {
    await sleep(100);
  }
  out.afterLogout = {
    loginShown: document.body.innerText.includes('Welcome Back'),
    sessionCleared: localStorage.getItem('suab.session') === null,
  };
  return JSON.stringify(out);
})()
`;

// Scenario C4: the back button on the product submission form ends the
// session (it is labelled Logout) — the worker bails out to login.

const PRODUCT_BACK_FLOW = `
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = {};
  document.querySelector('.product-submit .back-button').click();
  for (let i = 0; i < 20 && !document.body.innerText.includes('Welcome Back'); i += 1) {
    await sleep(100);
  }
  out.backFromForm = {
    loginShown: document.body.innerText.includes('Welcome Back'),
    sessionCleared: localStorage.getItem('suab.session') === null,
  };
  return JSON.stringify(out);
})()
`;

// Scenario D: the three issue-report screens (via the shared ReportForm).
// For each card: open -> title -> empty submit (no attachment) ->
// validation error -> cancel (no save) -> reopen -> attach a photo via
// CDP -> submit -> confirmation -> suab.issueReports entry -> Back to Home.

const REPORT_OPEN = (cardIndex) => `
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelectorAll('.action-card')[${cardIndex}].click();
  for (let i = 0; i < 20 && !document.querySelector('.report'); i += 1) {
    await sleep(100);
  }
  return JSON.stringify({
    title: document.querySelector('.report .screen__title')?.textContent.trim() ?? null,
    subtitle: document.querySelector('.report .screen__subtitle')?.textContent.trim() ?? null,
    hasTextarea: Boolean(document.querySelector('.report__textarea')),
    hasFileInput: Boolean(document.querySelector('.report__file-input')),
    submitLabel: document.querySelector('.report__actions .btn-primary')?.textContent.trim() ?? null,
    // Every card's Submit must wear the same colours as its picker.
    submitBg: (() => {
      const el = document.querySelector('.report__actions .btn-primary');
      return el ? getComputedStyle(el).backgroundColor : null;
    })(),
    submitColor: (() => {
      const el = document.querySelector('.report__actions .btn-primary');
      return el ? getComputedStyle(el).color : null;
    })(),
    pickerBg: (() => {
      const el = document.querySelector('.report__pick');
      return el ? getComputedStyle(el).backgroundColor : null;
    })(),
    pickerColor: (() => {
      const el = document.querySelector('.report__pick');
      return el ? getComputedStyle(el).color : null;
    })(),
    cancelLabel: document.querySelector('.report__actions .link-button')?.textContent.trim() ?? null,
  });
})()
`;

// Empty submit (no attachment yet) -> the mandatory-attachment validation
// error; then Cancel -> home without saving.

const REPORT_CANCEL = `
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelector('.report__actions .btn-primary').click();
  for (let i = 0; i < 10 && !document.querySelector('.report .field__error'); i += 1) {
    await sleep(100);
  }
  const emptyError = document.querySelector('.report .field__error')?.textContent.trim() ?? null;
  document.querySelector('.report__actions .link-button').click();
  for (let i = 0; i < 20 && !document.querySelector('.home'); i += 1) {
    await sleep(100);
  }
  return JSON.stringify({
    emptyError,
    backHome: Boolean(document.querySelector('.home')),
    reportsAfterCancel: JSON.parse(localStorage.getItem('suab.issueReports') ?? '[]').length,
  });
})()
`;

// Submit (the attachment has already been injected via CDP) and read the
// confirmation + saved record. The description field no longer exists —
// the attachment is the only input.

const REPORT_SUBMIT = `
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelector('.report__actions .btn-primary').click();
  for (let i = 0; i < 20 && !document.body.innerText.includes('Report submitted!'); i += 1) {
    await sleep(100);
  }
  const reports = JSON.parse(localStorage.getItem('suab.issueReports') ?? '[]');
  return JSON.stringify({
    confirmed: document.body.innerText.includes('Report submitted!'),
    confirmSubtitle: document.querySelector('.report .screen__subtitle')?.textContent.trim() ?? null,
    backHomeLabel: document.querySelector('.report .btn-primary')?.textContent.trim() ?? null,
    anotherLabel: Array.from(document.querySelectorAll('.report .link-button')).map((b) => b.textContent.trim())[0] ?? null,
    saved: reports[0] ?? null,
    reportCount: reports.length,
  });
})()
`;

// "Back to Home" on the confirmation closes the loop.

const REPORT_BACK_HOME = `
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelector('.report .btn-primary').click();
  for (let i = 0; i < 20 && !document.querySelector('.home'); i += 1) {
    await sleep(100);
  }
  return JSON.stringify({ backHome: Boolean(document.querySelector('.home')) });
})()
`;

// Scenario E: the small "Reset demo data" link wipes everything and
// restarts the demo at the login screen.

const RESET_FLOW = `
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = {};
  document.querySelector('.home__footer .link-button').click();
  for (let i = 0; i < 30 && !document.body.innerText.includes('Welcome Back'); i += 1) {
    await sleep(100);
  }
  out.afterReset = {
    loginShown: document.body.innerText.includes('Welcome Back'),
    sessionCleared: localStorage.getItem('suab.session') === null,
    attendanceCleared: localStorage.getItem('suab.attendance') === null,
    shiftCleared: localStorage.getItem('suab.shiftStart') === null,
  };
  return JSON.stringify(out);
})()
`;

// ---- assertions ------------------------------------------------------------

const DANGER = 'rgb(229, 72, 77)' // --danger #e5484d

/**
 * Colour comparison with a ±3 tolerance per channel (same rationale as
 * attendance-check.mjs: transitions may still be settling).
 */
function matchesColor(actual, expected) {
  const parse = (s) => (String(s).match(/\d+/g) ?? []).slice(0, 3).map(Number)
  const a = parse(actual)
  const e = parse(expected)
  return a.length === 3 && a.every((v, i) => Math.abs(v - e[i]) <= 3)
}

function check(data) {
  const failures = []
  const ok = (label, pass, detail = '') => {
    console.log((pass ? 'PASS ' : 'FAIL ') + label + (detail ? '  [' + detail + ']' : ''))
    if (!pass) failures.push(label)
  }
  const {
    steps, attendanceSection, home, freshTimerText, sosDialog, afterCancel,
    afterSend, langMenu, afterLangSwitch,
    reportScreen, backHome, afterReload,
    reminder, reminderAttach, dismiss,
    reports, shiftEnd, product, productEarly, productBack, reset,
  } = data

  // The auth walk still works end to end.
  ok('attendance screen shown after Login', steps[0].attendance)

  // --- attendance screen: second section ("Today's Shift" summary card) ---
  ok('attendance screen has the Today\'s Shift second section',
    Boolean(attendanceSection?.present) && attendanceSection.title === 'Today’s Shift',
    JSON.stringify(attendanceSection))
  ok('second section mirrors the demo timings (5-min shift, 3-min reminder)',
    attendanceSection?.rows?.[0] === '5 min (demo)' && attendanceSection?.rows?.[1] === 'Every 3 min',
    JSON.stringify(attendanceSection?.rows))
  ok('second section shows the not-checked-in status', attendanceSection?.rows?.[2] === 'Not checked in yet',
    JSON.stringify(attendanceSection?.rows))

  // --- homepage layout ---
  ok('check-in lands on the homepage', Boolean(home.shiftText) && home.cards.length === 3, JSON.stringify(home.cards))
  ok('brand logo image loaded', home.logoLoaded)
  ok('language pill starts on English', home.langPill === 'English', home.langPill)
  ok('shift timer labelled for screen readers', home.shiftLabel === 'Shift time', home.shiftLabel)
  ok('shift timer shows hh:mm:ss format', /^\d{2}:\d{2}:\d{2}$/.test(home.shiftText ?? ''), home.shiftText)
  // A brand-new shift must read 00:00:00 (hours:minutes:seconds) — the
  // reading is captured the moment the homepage first paints, so zero
  // seconds have elapsed (1s of slack for the poll loop).
  ok('fresh shift timer starts at 00:00:00', /^00:00:0[01]$/.test(freshTimerText ?? ''), freshTimerText)
  ok('three action cards in mockup order', JSON.stringify(home.cards) === JSON.stringify(['Raw Material Issue', 'Machine Breakdown', 'Output Defect']), String(home.cards))
  // The three action cards are the homepage's primary touch targets: the
  // two square tiles must be ~204px tall and the full-width row ~124px,
  // all with a 72px badge and 19px label — far beyond Apple's 44px minimum.
  const rects = home.cardRects ?? []
  const tiles = rects.slice(0, 2)
  const wide = rects[2]
  ok('action cards are large touch targets (tiles >=190px tall, wide row >=110px, 72px badge, 19px label)',
    rects.length === 3 &&
      tiles.every((r) => r.h >= 190 && r.w >= 150 && r.badge >= 64 && r.labelPx >= 18) &&
      Boolean(wide) && wide.h >= 110 && wide.w >= 300 && wide.badge >= 64 && wide.labelPx >= 18,
    JSON.stringify(rects))
  ok('SOS button reads SOS / EMERGENCY', (home.sos ?? '').includes('SOS') && (home.sos ?? '').includes('EMERGENCY'), home.sos)
  ok('SOS button in danger red', matchesColor(home.sosBg, DANGER), home.sosBg)
  ok('reset-demo link at the bottom', home.reset === 'Reset demo data', home.reset)

  // --- SOS dialog: cancel ---
  ok('SOS dialog opens with confirm copy', sosDialog.title === 'Send emergency alert?', sosDialog.title)
  ok('SOS dialog actions labelled', sosDialog.cancel === 'Cancel' && sosDialog.send === 'Yes, send alert', JSON.stringify(sosDialog))
  ok('cancel closes dialog without alert', afterCancel.dialogGone && !afterCancel.toastShown && !afterCancel.sosSaved, JSON.stringify(afterCancel))

  // --- SOS dialog: send ---
  ok('send closes dialog', afterSend.dialogGone)
  ok('send raises the toast', (afterSend.toast ?? '').includes('Emergency alert sent — supervisor notified.'), afterSend.toast)
  ok('send records the SOS event', afterSend.sosSaved)

  // --- language dropdown ---
  ok('language menu offers five languages', langMenu.optionCount === 5, String(langMenu.optionCount))
  ok('switching language updates the pill', afterLangSwitch.pill !== null && afterLangSwitch.pill !== 'English', afterLangSwitch.pill)
  ok('switching language retranslates the cards', afterLangSwitch.firstCard !== null && afterLangSwitch.firstCard !== 'Raw Material Issue', afterLangSwitch.firstCard)
  ok('menu closes after choosing', afterLangSwitch.menuClosed)

  // --- card navigation (first card -> the real report screen) ---
  ok('first card opens the input-errors report screen', reportScreen.title === 'Input Errors', reportScreen.title)
  ok('report form has no description textarea', reportScreen.hasTextarea === false, JSON.stringify(reportScreen))
  ok('report form has the attachment input', reportScreen.hasFileInput, JSON.stringify(reportScreen))
  ok('report actions labelled', reportScreen.submitLabel === 'Submit Report' && reportScreen.cancelLabel === 'Cancel', JSON.stringify(reportScreen))
  ok('submit report button matches the picker colours',
    matchesColor(reportScreen.submitBg, reportScreen.pickerBg) &&
    matchesColor(reportScreen.submitColor, reportScreen.pickerColor),
    JSON.stringify({ submit: reportScreen.submitBg + ' / ' + reportScreen.submitColor, picker: reportScreen.pickerBg + ' / ' + reportScreen.pickerColor }))
  ok('back returns to the homepage', backHome.homeShown)

  // --- persistence across refresh ---
  ok('refresh resumes on the homepage', afterReload.homeShown)
  ok('shift start survives the refresh', afterReload.shiftStartPersisted)
  ok('shift timer still counting after refresh', /^\d{2}:\d{2}:\d{2}$/.test(afterReload.shiftText ?? ''), afterReload.shiftText)
  ok('shift elapsed is a real recent duration', afterReload.shiftElapsedMs !== null && afterReload.shiftElapsedMs >= 0 && afterReload.shiftElapsedMs < 10 * 60 * 1000, String(afterReload.shiftElapsedMs))
  ok('chosen language survives the refresh', afterReload.langPill === afterLangSwitch.pill, afterReload.langPill)

  // --- work-update reminder (mockup 6.2) — run 1 of 2: blocked send, then
  // attach + send. The attachment is MANDATORY: tapping "Send Update" with
  // nothing attached shows the validation message and records nothing.
  ok('reminder pops after a full work interval', reminder.shown.modal && reminder.shown.title === 'Work update needed', JSON.stringify(reminder.shown))
  ok('reminder copy + send button', reminder.shown.subtitle === 'Send a photo or video to supervisor' && reminder.shown.send === 'Send Update', JSON.stringify(reminder.shown))
  ok('reminder offers a photo/video attachment input', reminder.shown.hasFileInput)
  ok('showing the reminder snoozes the next one', reminder.shown.snoozedOnShow)
  ok('send without an attachment is blocked with the validation message',
    reminder.blocked.error === 'Please attach a photo or video.' && reminder.blocked.pickerError && reminder.blocked.stillAskStage,
    JSON.stringify(reminder.blocked))
  ok('blocked send records no work update', reminder.blocked.updateCount === 0, String(reminder.blocked.updateCount))
  ok('attachment chip shows the picked file name', reminder.attachmentChip === 'site-photo.png', reminder.attachmentChip)
  ok('picking a file clears the validation message', reminder.errorCleared)
  ok('send switches to the confirmation stage', reminder.confirmStage.title === 'Update sent!' && reminder.confirmStage.done === 'Done', JSON.stringify(reminder.confirmStage))
  ok('attached send records the update with the file metadata',
    reminder.confirmStage.saved?.attachment?.name === 'site-photo.png' &&
    reminder.confirmStage.saved?.attachment?.size > 0 &&
    reminder.confirmStage.updateCount === 1,
    JSON.stringify(reminder.confirmStage.saved))
  ok('Done closes the modal and toasts', reminder.afterDone.modalGone && (reminder.afterDone.toast ?? '').includes('Update sent to your supervisor.'), reminder.afterDone.toast)

  // --- work-update reminder — run 2 of 2 (consecutive boot): attach + send ---
  ok('reminder pops again on the very next boot', reminderAttach.shown.modal === true, 'second consecutive boot')
  ok('attachment chip shows the picked file name', reminderAttach.attachmentChip === 'site-photo.png', reminderAttach.attachmentChip)
  ok('attached update saves the file metadata', reminderAttach.saved?.attachment?.name === 'site-photo.png' && reminderAttach.saved?.attachment?.size > 0, JSON.stringify(reminderAttach.saved))
  ok('attach + send closes with the toast', reminderAttach.afterDone.modalGone && (reminderAttach.afterDone.toast ?? '').includes('Update sent to your supervisor.'), reminderAttach.afterDone.toast)

  // --- work-update reminder — dismiss path ---
  ok('dismiss (X) closes without sending', dismiss.afterDismiss.modalGone && !dismiss.afterDismiss.toastShown && !dismiss.afterDismiss.workUpdates, JSON.stringify(dismiss.afterDismiss))

  // --- issue reports (shared ReportForm behind all three cards) ---
  // `prior` = reports already saved by earlier cards in the scenario, so
  // each cancel assertion checks the count did NOT grow. The attachment is
  // MANDATORY now: every card attaches before its submit succeeds.
  const reportChecks = [
    { key: 'input', title: 'Input Errors', category: 'input-errors', prior: 0 },
    { key: 'machine', title: 'Machine Defect', category: 'machine-defect', prior: 1 },
    { key: 'output', title: 'Output Errors', category: 'output-errors', prior: 2 },
  ]
  for (const { key, title, category, prior } of reportChecks) {
    const flow = reports[key]
    ok(title + ' opens with title + subtitle', flow.open.title === title && Boolean(flow.open.subtitle), flow.open.title)
    ok(title + ': no description textarea', flow.open.hasTextarea === false, JSON.stringify(flow.open))
    ok(title + ': submit matches the picker colours',
      matchesColor(flow.open.submitBg, flow.open.pickerBg) &&
      matchesColor(flow.open.submitColor, flow.open.pickerColor),
      JSON.stringify({ submit: flow.open.submitBg + ' / ' + flow.open.submitColor, picker: flow.open.pickerBg + ' / ' + flow.open.pickerColor }))
    ok(title + ': submit without an attachment is rejected', flow.cancel.emptyError === 'Please attach a photo or video.', flow.cancel.emptyError)
    ok(title + ': cancel returns home without saving', flow.cancel.backHome && flow.cancel.reportsAfterCancel === prior, JSON.stringify(flow.cancel))
    ok(title + ': submit shows the confirmation', flow.submit.confirmed && flow.submit.confirmSubtitle === 'Your supervisor has been notified.', JSON.stringify(flow.submit))
    ok(title + ': saved with category + timestamp, no description',
      flow.submit.saved?.category === category &&
      Boolean(flow.submit.saved?.timestamp) &&
      flow.submit.saved?.description === undefined,
      JSON.stringify(flow.submit.saved))
    ok(title + ': attachment metadata captured', flow.submit.saved?.attachment?.name === 'site-photo.png' && flow.submit.saved?.attachment?.size > 0, JSON.stringify(flow.submit.saved?.attachment))
    ok(title + ': attachment chip shows the picked file', flow.chip === 'site-photo.png', String(flow.chip))
    ok(title + ': back home from the confirmation', flow.back.backHome)
  }

  // --- shift end -> product submission ---
  ok('full shift auto-ends to product submission', shiftEnd.shiftEnd.homeGone && shiftEnd.shiftEnd.title === 'Product Submission', JSON.stringify(shiftEnd.shiftEnd))
  ok('assigned quantity chip shows the machine + default 500',
    (shiftEnd.shiftEnd.assignedChip ?? '').endsWith('Assigned quantity: 500') &&
    (shiftEnd.shiftEnd.assignedChip ?? '').includes('Tile Press #4'), shiftEnd.shiftEnd.assignedChip)
  ok('keypad has 12 keys incl. backspace + clear', JSON.stringify(shiftEnd.shiftEnd.keypadKeys) === JSON.stringify(['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '⌫', 'C']), JSON.stringify(shiftEnd.shiftEnd.keypadKeys))
  ok('product form actions labelled', shiftEnd.shiftEnd.confirmLabel === 'Confirm' && shiftEnd.shiftEnd.earlyLabel === 'End Shift & Submit' && shiftEnd.shiftEnd.backAriaLabel === 'Logout', JSON.stringify(shiftEnd.shiftEnd))
  ok('shift start cleared after the shift ends', shiftEnd.shiftEnd.shiftStartCleared)
  ok('reminder snooze cleared with the shift', shiftEnd.shiftEnd.lastReminderCleared)

  // --- product submission keypad ---
  ok('empty quantity is rejected', product.emptyError === 'Enter the quantity produced.', product.emptyError)
  ok('over-limit quantity is rejected', product.overLimitError === 'Quantity cannot exceed the assigned limit.' && product.displayOverLimit === '5000' && product.stillOnForm, JSON.stringify({ over: product.overLimitError, display: product.displayOverLimit }))
  ok('bad submissions save nothing', product.savedCountAfterBadSubmits === 0, String(product.savedCountAfterBadSubmits))
  ok('keypad entry can only be digits (negatives impossible)', product.entryIsDigitsOnly, product.digitsOnlyDisplay)
  ok('backspace removes the last digit', product.afterBackspace === '4', product.afterBackspace)
  ok('valid 450 submission reaches shift complete', product.completed.title === 'Shift complete!' && product.completed.subtitle === 'Your product count has been submitted.', JSON.stringify(product.completed))
  ok('quantity + end time recorded on the submission', product.completed.saved?.quantity === 450 && typeof product.completed.saved?.shiftEndTime === 'string' && product.completed.saved?.endedEarly === false, JSON.stringify(product.completed.saved))
  ok('confirmation summarises the submitted count', product.completed.rows[0] === 'Quantity submitted450' && (product.completed.rows[1] ?? '').startsWith('Shift ended at'), JSON.stringify(product.completed.rows))
  ok('start-new-shift opens a fresh machine allotment',
    product.afterStartNewShift.allotmentShown && product.afterStartNewShift.allotmentTitle === 'Machine Allotment',
    JSON.stringify(product.afterStartNewShift))
  ok('allotment confirm opens a fresh homepage',
    product.afterConfirmAllotment.homeShown && product.afterConfirmAllotment.shiftRestarted,
    JSON.stringify(product.afterConfirmAllotment))

  // --- early end + logout / back navigation ---
  ok('End Shift & Submit records endedEarly', productEarly.early.endedEarlyFlag && productEarly.early.saved?.quantity === 120, JSON.stringify(productEarly.early))
  ok('logout from the confirmation returns to login', productEarly.afterLogout.loginShown && productEarly.afterLogout.sessionCleared, JSON.stringify(productEarly.afterLogout))
  ok('back button on the form ends the session', productBack.backFromForm.loginShown && productBack.backFromForm.sessionCleared, JSON.stringify(productBack.backFromForm))

  // --- reset demo ---
  ok('reset link returns to login', reset.afterReset.loginShown)
  ok('reset wipes the demo data', reset.afterReset.sessionCleared && reset.afterReset.attendanceCleared && reset.afterReset.shiftCleared, JSON.stringify(reset.afterReset))

  return failures
}

// ### main ###
async function main() {
  const server = await preview({ preview: { port: 4175, strictPort: true } })
  const url = server.resolvedUrls.local[0]
  console.log('Serving ' + url)

  // The stand-in photo the attachment scenarios pick (metadata only).
  writeFileSync(PHOTO_PATH, Buffer.from('not-a-real-photo-but-non-empty'))

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

    // Wait for the login screen to render.
    let ready = false
    for (let i = 0; i < 40 && !ready; i += 1) {
      await new Promise((r) => setTimeout(r, 250))
      ready = await evaluate(session, "document.body.innerText.includes('Welcome Back')")
    }
    if (!ready) throw new Error('Login screen never appeared')

    const auth = JSON.parse(await evaluate(session, AUTH_WALK))

    // Check in (through the machine allotment), then capture the homepage
    // in its default (English) state for visual comparison with the
    // mockups. The fresh timer reading is grabbed the moment the homepage
    // first paints — before any sleeps or screenshots — so it proves a new
    // shift starts at 00:00:00.
    const freshTimerText = await evaluate(session, `
      (async () => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const btn = Array.from(document.querySelectorAll('button'))
          .find((b) => b.textContent.trim() === 'Check In');
        btn.click();
        for (let i = 0; i < 20 && !document.querySelector('.allotment'); i += 1) {
          await sleep(100);
        }
        Array.from(document.querySelectorAll('button'))
          .find((b) => b.textContent.trim() === 'Confirm & Start Shift').click();
        for (let i = 0; i < 20 && !document.querySelector('.home'); i += 1) {
          await sleep(100);
        }
        return document.querySelector('.shift-timer')?.textContent.trim() ?? null;
      })()
    `)
    await screenshot(session, SHOT_PATH)
    console.log('Homepage screenshot saved to ' + SHOT_PATH)

    const flow = JSON.parse(await evaluate(session, HOME_FLOW))

    // A fresh navigation acts as the refresh: same localStorage, new page.
    await session.send('Page.navigate', { url })
    let homeReady = false
    for (let i = 0; i < 40 && !homeReady; i += 1) {
      await new Promise((r) => setTimeout(r, 250))
      homeReady = await evaluate(session, "Boolean(document.querySelector('.home'))")
    }
    if (!homeReady) throw new Error('Homepage never appeared after refresh')
    const post = JSON.parse(await evaluate(session, RELOAD))

    // --- scenario: work-update reminder, run 1 (mockup 6.2) ---
    // Seed a shift that began 4 minutes ago (> the 3-minute reminder
    // interval, but short of the 5-minute shift length); seedAndReboot
    // reboots the app straight from the seeded storage so the homepage's
    // deferred reminder check fires on clean state. The attachment is
    // mandatory now, so run 1 is: blocked send (validation message) ->
    // attach a photo via CDP -> send -> confirmation -> Done.
    await seedAndReboot(session, 4, "Boolean(document.querySelector('.update-reminder'))", 'Reminder modal')
    await screenshot(session, join(import.meta.dirname, '.tmp-reminder-shot.png'))
    const blocked = JSON.parse(await evaluate(session, REMINDER_BLOCKED))
    await setFileInputFiles(session, '.update-reminder .report__file-input', PHOTO_PATH)
    const sent = JSON.parse(await evaluate(session, REMINDER_SEND))
    const reminder = { ...blocked, ...sent }

    // --- scenario: work-update reminder, run 2 (consecutive boot) with a
    // photo attached — proves the seed-race fix holds back-to-back and
    // exercises the attachment-metadata path end to end.
    await seedAndReboot(session, 4, "Boolean(document.querySelector('.update-reminder'))", 'Reminder modal (attach run)')
    await setFileInputFiles(session, '.update-reminder .report__file-input', PHOTO_PATH)
    const reminderAttach = JSON.parse(await evaluate(session, REMINDER_ATTACH))

    // --- scenario: dismissing the reminder ---
    await seedAndReboot(session, 4, "Boolean(document.querySelector('.update-reminder'))", 'Reminder modal (dismiss scenario)')
    const dismiss = JSON.parse(await evaluate(session, REMINDER_DISMISS))

    // --- scenario: the three issue reports (shared ReportForm) ---
    // A fresh 1-minute-old shift: no reminder due (the interval is 3
    // minutes), so the homepage stays quiet while the reports are
    // exercised. Each card: open -> empty submit (attachment-required
    // error) -> cancel (no save) -> reopen -> attach a photo via CDP ->
    // submit -> confirmation -> back home.
    await seedAndReboot(session, 1, "Boolean(document.querySelector('.home'))", 'Homepage (reports scenario)')
    const reports = {}
    const REPORT_DEFS = [
      { key: 'input', cardIndex: 0 },
      { key: 'machine', cardIndex: 1 },
      { key: 'output', cardIndex: 2 },
    ]
    for (const def of REPORT_DEFS) {
      const open = JSON.parse(await evaluate(session, REPORT_OPEN(def.cardIndex)))
      const cancel = JSON.parse(await evaluate(session, REPORT_CANCEL))
      await evaluate(session, REPORT_OPEN(def.cardIndex)) // reopen the form
      await setFileInputFiles(session, '.report .report__file-input', PHOTO_PATH)
      const chip = await evaluate(session, "document.querySelector('.report .report__attachment-name')?.textContent.trim() ?? null")
      const submit = JSON.parse(await evaluate(session, REPORT_SUBMIT))
      const back = JSON.parse(await evaluate(session, REPORT_BACK_HOME))
      reports[def.key] = { open, cancel, chip, submit, back }
    }

    // --- scenario: shift end (6-min-old shift > the 5-min shift length) ---
    await seedAndReboot(session, 6, "Boolean(document.querySelector('.product-submit'))", 'Product submission screen')
    const shiftEnd = JSON.parse(await evaluate(session, SHIFT_END_FLOW))

    // --- scenario: product submission keypad (invalid + valid paths) ---
    await seedAndReboot(session, 6, "Boolean(document.querySelector('.product-submit'))", 'Product submission screen (keypad scenario)')
    const product = JSON.parse(await evaluate(session, PRODUCT_FLOW))

    // --- scenario: early shift end via "End Shift & Submit" + logout ---
    await seedAndReboot(session, 6, "Boolean(document.querySelector('.product-submit'))", 'Product submission screen (early scenario)')
    const productEarly = JSON.parse(await evaluate(session, PRODUCT_EARLY_FLOW))

    // --- scenario: the back button on the product form ends the session ---
    await seedAndReboot(session, 6, "Boolean(document.querySelector('.product-submit'))", 'Product submission screen (back scenario)')
    const productBack = JSON.parse(await evaluate(session, PRODUCT_BACK_FLOW))

    // --- scenario: reset demo (fresh 1-minute-old shift, no reminder due) ---
    await seedAndReboot(session, 1, "Boolean(document.querySelector('.home'))", 'Homepage (reset scenario)')
    const reset = JSON.parse(await evaluate(session, RESET_FLOW))

    const failures = check({
      ...auth, ...flow, ...post,
      freshTimerText,
      reminder, reminderAttach, dismiss,
      reports, shiftEnd, product, productEarly, productBack, reset,
    })

    if (failures.length > 0) {
      console.log('\n' + failures.length + ' homepage check(s) FAILED')
      process.exitCode = 1
    } else {
      console.log('\nAll homepage checks passed')
    }
  } finally {
    session?.close()
    if (chrome) {
      try {
        execSync('taskkill /PID ' + chrome.child.pid + ' /T /F', { stdio: 'ignore' })
      } catch { /* already gone */ }
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          rmSync(chrome.userDir, { recursive: true, force: true })
          break
        } catch {
          await new Promise((r) => setTimeout(r, 300))
        }
      }
    }
    rmSync(TMP_DIR, { recursive: true, force: true })
    server.httpServer.closeAllConnections?.()
    await new Promise((resolve) => server.httpServer.close(resolve))
  }
}

main().catch((error) => {
  console.error('home-check crashed:', error.message)
  process.exit(1)
})
