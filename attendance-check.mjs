/**
 * attendance-check.mjs — real-browser test for the Labour Attendance screen.
 *
 * Walks the FULL demo flow in headless Chrome at the iPhone 16 viewport
 * (393x852) against the production build:
 *
 *   Login -> Attendance (3 simulated GPS states)
 *     -> Check In -> Machine Allotment -> Labour Homepage -> refresh
 *     (persistence)
 *
 * Uses only Node built-ins (WebSocket is global since Node 21) plus Vite.
 * Run with:  node attendance-check.mjs
 */

import { spawn, execSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { preview } from 'vite'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const DEBUG_PORT = 9224

// ---- CDP helpers (same pattern as keypad-check.mjs) ------------------------

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

// ---- page script (runs inside the browser) ---------------------------------
// Part 1: walk Login and land on the Attendance screen.

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
  // Snapshot of everything the assertions need about the attendance screen.
  const snap = () => {
    const btn = document.querySelector('.att__actions .btn-primary');
    const pill = document.querySelector('.att__distance');
    const art = document.querySelector('.att-art');
    const wave = document.querySelector('.att__wave path');
    const root = document.querySelector('.att');
    return {
      rootClass: root ? root.className : null,
      title: document.querySelector('.att__title')?.textContent ?? null,
      subtitle: document.querySelector('.att__subtitle')?.textContent ?? null,
      buttonText: btn?.textContent.trim() ?? null,
      buttonBg: btn ? getComputedStyle(btn).backgroundColor : null,
      distance: pill?.textContent.trim() ?? null,
      artBox: art ? (({ width, height }) => ({ width, height }))(art.getBoundingClientRect()) : null,
      waveFill: wave ? getComputedStyle(wave).fill : null,
      simChips: $$('.att__sim-chip').map((c) => c.textContent.trim()),
    };
  };
  const out = { steps: [] };

  // 1. Login with the demo PIN (phone + PIN; React controlled inputs need
  //    the native value setter).
  const inputs = $$('input');
  setReactValue(inputs[0], '9876543210');
  setReactValue(inputs[1], '1234');
  buttonByText('Login').click();
  for (let i = 0; i < 20 && !document.body.innerText.includes('Mark Attendance'); i += 1) {
    await sleep(100);
  }
  out.steps.push({ attendance: document.body.innerText.includes('Mark Attendance') });
  out.state1 = snap();
  return JSON.stringify(out);
})()
`;


// Part 2: exercise the three simulated GPS states, check in, then verify
// the record survives a refresh and the Machine placeholder is reachable.

const ATT_FLOW = `
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const buttonByText = (text) => $$('button').find((b) => b.textContent.trim() === text);
  const chipByText = (text) => $$('.att__sim-chip').find((c) => c.textContent.trim() === text);
  const snap = () => {
    const btn = document.querySelector('.att__actions .btn-primary');
    const pill = document.querySelector('.att__distance');
    return {
      rootClass: document.querySelector('.att')?.className ?? null,
      title: document.querySelector('.att__title')?.textContent ?? null,
      subtitle: document.querySelector('.att__subtitle')?.textContent ?? null,
      buttonText: btn?.textContent.trim() ?? null,
      buttonBg: btn ? getComputedStyle(btn).backgroundColor : null,
      distance: pill?.textContent.trim() ?? null,
    };
  };
  const out = {};

  // --- state 2: NOT AT LOCATION (worker ~1.1 km away) ---
  chipByText('Not at location').click();
  await sleep(350); // > the 0.15s button background transition, so colours settle
  out.state2 = snap();

  // "Go to Location" pretends the worker walked to the factory.
  buttonByText('Go to Location').click();
  await sleep(350); // > the 0.15s button background transition, so colours settle
  out.afterGoTo = snap();
  out.toastShown = document.body.innerText.includes('reached the factory');

  // --- state 3: LOCATION OFF (no GPS fix) ---
  chipByText('Location off').click();
  await sleep(350); // > the 0.15s button background transition, so colours settle
  out.state3 = snap();

  // "Turn On Location" simulates enabling GPS again.
  buttonByText('Turn On Location').click();
  await sleep(350); // > the 0.15s button background transition, so colours settle
  out.afterTurnOn = snap();

  // --- check in -> machine allotment -> homepage ---
  // Since Part 3 the homepage (not the Machine placeholder) follows
  // check-in — now via the Machine Allotment screen, which must be
  // confirmed before the shift starts.
  buttonByText('Check In').click();
  for (let i = 0; i < 20 && !document.querySelector('.allotment'); i += 1) {
    await sleep(100);
  }
  out.allotment = {
    shown: Boolean(document.querySelector('.allotment')),
    title: document.querySelector('.allotment .screen__title')?.textContent.trim() ?? null,
    machine: document.querySelector('.allotment .machine-card__name')?.textContent.trim() ?? null,
  };
  Array.from(document.querySelectorAll('.allotment button'))
    .find((b) => b.textContent.trim() === 'Confirm & Start Shift').click();
  for (let i = 0; i < 20 && !document.querySelector('.home'); i += 1) {
    await sleep(100);
  }
  out.home = {
    shown: Boolean(document.querySelector('.home')),
    cards: Array.from(document.querySelectorAll('.action-card .action-card__label'))
      .map((c) => c.textContent.trim()),
  };

  // --- the attendance record in localStorage ---
  out.record = JSON.parse(localStorage.getItem('suab.attendance') ?? 'null');

  return JSON.stringify(out);
})()
`;


// Part 3: after a fresh navigation (the "refresh"), the session + today's
// attendance + the accepted machine allotment in localStorage must resume
// straight on the Labour Homepage — the allotment was already confirmed
// before the refresh, so the router must not show it again.

const POST_RELOAD = `
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = {};
  out.afterReload = {
    homeShown: Boolean(document.querySelector('.home')),
    attendanceKeyStillSet: localStorage.getItem('suab.attendance') !== null,
  };
  return JSON.stringify(out);
})()
`;

// ---- assertions ------------------------------------------------------------

const BLUE = 'rgb(46, 131, 249)' // --blue #2e83f9
const CORAL = 'rgb(249, 109, 127)' // --coral #f96d7f
const PURPLE = 'rgb(143, 123, 250)' // --purple #8f7bfa

/**
 * Colour comparison with a ±3 tolerance per channel. The buttons animate
 * their background (transition: background .15s), so a sample taken just
 * after a state switch can be 99% blended — an exact match would be flaky.
 */
function matchesColor(actual, expected) {
  const parse = (s) => (String(s).match(/\d+/g) ?? []).slice(0, 3).map(Number)
  const a = parse(actual)
  const e = parse(expected)
  return a.length === 3 && a.every((v, i) => Math.abs(v - e[i]) <= 3)
}

function check(data, today) {
  const failures = []
  const ok = (label, pass, detail = '') => {
    console.log((pass ? 'PASS ' : 'FAIL ') + label + (detail ? '  [' + detail + ']' : ''))
    if (!pass) failures.push(label)
  }
  const { steps, state1, state2, state3, afterGoTo, afterTurnOn, home, record, afterReload, toastShown } = data

  // The auth walk still works end to end.
  ok('attendance screen shown after Login', steps[0].attendance)

  // --- state 1: AT LOCATION ---
  ok('state1 root class', state1.rootClass === 'att att--at-location', state1.rootClass)
  ok('state1 title "Mark Attendance"', state1.title === 'Mark Attendance', state1.title)
  ok('state1 subtitle', state1.subtitle === "You're at the location", state1.subtitle)
  ok('state1 button "Check In" in blue', state1.buttonText === 'Check In' && matchesColor(state1.buttonBg, BLUE), state1.buttonBg)
  ok('state1 distance pill (inside 150 m geofence)', /^\d+ m from SUAB Factory$/.test(state1.distance ?? ''), state1.distance)
  ok('state1 illustration sized ~230px', state1.artBox && Math.abs(state1.artBox.width - 230) < 2 && Math.abs(state1.artBox.height - 230) < 2, JSON.stringify(state1.artBox))
  ok('state1 wave rendered with tint', state1.waveFill && state1.waveFill !== 'rgba(0, 0, 0, 0)', state1.waveFill)
  ok('state1 demo chips present', JSON.stringify(state1.simChips) === JSON.stringify(['At location', 'Not at location', 'Location off']), String(state1.simChips))

  // --- state 2: NOT AT LOCATION ---
  ok('state2 root class', state2.rootClass === 'att att--not-at-location', state2.rootClass)
  ok('state2 title "Not at Location"', state2.title === 'Not at Location', state2.title)
  ok('state2 button "Go to Location" in coral', state2.buttonText === 'Go to Location' && matchesColor(state2.buttonBg, CORAL), state2.buttonBg)
  ok('state2 distance ~1.1 km (outside geofence)', /\.1 km from SUAB Factory$/.test(state2.distance ?? ''), state2.distance)
  ok('state2 "Go to Location" returns to at-location', afterGoTo.title === 'Mark Attendance' && afterGoTo.buttonText === 'Check In')
  ok('state2 toast confirmed arrival', toastShown)

  // --- state 3: LOCATION OFF ---
  ok('state3 root class', state3.rootClass === 'att att--location-off', state3.rootClass)
  ok('state3 title "Location Off"', state3.title === 'Location Off', state3.title)
  ok('state3 button "Turn On Location" in purple', state3.buttonText === 'Turn On Location' && matchesColor(state3.buttonBg, PURPLE), state3.buttonBg)
  ok('state3 shows "GPS is switched off"', state3.distance === 'GPS is switched off', state3.distance)
  ok('state3 "Turn On Location" returns to at-location', afterTurnOn.title === 'Mark Attendance')

  // --- check-in -> allotment -> homepage + record ---
  ok('check-in opens the machine allotment', allotment.shown && allotment.title === 'Machine Allotment', JSON.stringify(allotment))
  ok('allotment shows today\'s machine', typeof allotment.machine === 'string' && allotment.machine.length > 0, allotment.machine)
  ok('allotment confirm lands on the homepage', home.shown && home.cards.length === 3, JSON.stringify(home.cards))
  ok('attendance record saved to localStorage', Boolean(record), JSON.stringify(record))
  ok('record stamped with today date', record?.date === today, record?.date)
  ok('record has check-in time', typeof record?.checkInAt === 'string' && !Number.isNaN(Date.parse(record.checkInAt)), record?.checkInAt)
  ok('record distance ~35 m (inside preset)', Math.abs((record?.distanceMeters ?? -1) - 35) < 6, String(record?.distanceMeters))

  // --- persistence across refresh ---
  ok('refresh resumes on the homepage', afterReload.homeShown)
  ok('attendance survives refresh', afterReload.attendanceKeyStillSet)

  return failures
}
// ---- main ------------------------------------------------------------------
async function main() {
  // Today's local date, computed the same way storage.js does.
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  const server = await preview({ preview: { port: 4174, strictPort: true } })
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

    // Wait for the login screen to render.
    let ready = false
    for (let i = 0; i < 40 && !ready; i += 1) {
      await new Promise((r) => setTimeout(r, 250))
      ready = await evaluate(session, "document.body.innerText.includes('Welcome Back')")
    }
    if (!ready) throw new Error('Login screen never appeared')

    const auth = JSON.parse(await evaluate(session, AUTH_WALK))
    const flow = JSON.parse(await evaluate(session, ATT_FLOW))

    // A fresh navigation acts as the refresh: same localStorage, new page.
    await session.send('Page.navigate', { url })
    let homeReady = false
    for (let i = 0; i < 40 && !homeReady; i += 1) {
      await new Promise((r) => setTimeout(r, 250))
      homeReady = await evaluate(session, "Boolean(document.querySelector('.home'))")
    }
    if (!homeReady) throw new Error('Homepage never appeared after refresh')
    const post = JSON.parse(await evaluate(session, POST_RELOAD))
    const failures = check({ ...auth, ...flow, ...post }, today)

    if (failures.length > 0) {
      console.log('\n' + failures.length + ' attendance check(s) FAILED')
      process.exitCode = 1
    } else {
      console.log('\nAll attendance checks passed')
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
    server.httpServer.closeAllConnections?.()
    await new Promise((resolve) => server.httpServer.close(resolve))
  }
}

main().catch((error) => {
  console.error('attendance-check crashed:', error.message)
  process.exit(1)
})
