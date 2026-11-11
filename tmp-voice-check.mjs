/**
 * tmp-voice-check.mjs — render the Input Errors report screen in headless
 * Chrome and verify the new voice-note UI (mic pill, label) is present,
 * then exercise the overtime badge logic on the homepage.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { preview } from 'vite'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const DEBUG_PORT = 9227

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function launchChrome() {
  const userDir = mkdtempSync(join(tmpdir(), 'suab-chrome-'))
  const child = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=' + DEBUG_PORT,
    '--user-data-dir=' + userDir, '--no-first-run', '--no-default-browser-check',
    '--disable-gpu', 'about:blank',
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
  ], { stdio: ['ignore', 'ignore', 'pipe'] })
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Chrome did not start')), 20000)
    child.stderr.on('data', (chunk) => {
      const match = String(chunk).match(/DevTools listening on (ws:\/\/\S+)/)
      if (match) { clearTimeout(timer); resolve({ child, userDir }) }
    })
  })
}

async function connectPage() {
  const list = await (await fetch('http://127.0.0.1:' + DEBUG_PORT + '/json/list')).json()
  const page = list.find((t) => t.type === 'page')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error('ws failed')) })
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
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    nextId += 1
    pending.set(nextId, { resolve, reject })
    ws.send(JSON.stringify({ id: nextId, method, params }))
  })
  return { send, close: () => ws.close() }
}

async function evaluate(page, expression) {
  const result = await page.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || 'threw')
  return result.result.value
}

const results = []
const ok = (name, pass, got) => {
  results.push(pass)
  console.log((pass ? 'PASS ' : 'FAIL ') + name + (got !== undefined ? '  [' + JSON.stringify(got) + ']' : ''))
}

const server = await preview({ preview: { port: 4178, strictPort: true } })
const { child, userDir } = await launchChrome()
try {
  const page = await connectPage()
  await page.send('Page.enable')
  await page.send('Page.navigate', { url: 'http://localhost:4178/Suab-deploy/' })
  await new Promise((r) => setTimeout(r, 1500))

  // ---- report screen: the voice-note UI ----
  await evaluate(page, `
(async () => {
  localStorage.clear();
  localStorage.setItem('suab.session', JSON.stringify({ phone: '9876543210' }));
  localStorage.setItem('suab.language', JSON.stringify('en'));
  setTimeout(() => location.reload(), 50);
  return 'ok';
})()
`)
  await new Promise((r) => setTimeout(r, 1200))
  // login -> attendance -> allotment -> home -> first report card
  await evaluate(page, `
(async () => {
  const q = (s) => document.querySelector(s);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clickByText = (sel, text) => {
    const el = Array.from(document.querySelectorAll(sel)).find((n) => n.textContent.trim() === text);
    if (el) { el.click(); return true; } return false;
  };
  clickByText('button', 'Login');
  await sleep(400);
  clickByText('button', 'Check In');
  await sleep(400);
  clickByText('button', 'Next');
  await sleep(400);
  // open the first action card (Raw Material Issue)
  const card = document.querySelector('.action-card');
  if (card) card.click();
  await sleep(400);
  return 'walked';
})()
`)
  await new Promise((r) => setTimeout(r, 400))
  const report = await evaluate(page, `
({
  onReport: Boolean(document.querySelector('.report')),
  voiceLabel: Array.from(document.querySelectorAll('.report__label')).map((n) => n.textContent.trim()),
  micPill: document.querySelector('.report__voice-mic')?.textContent.trim() ?? null,
  micClass: document.querySelector('.report__voice-mic')?.className ?? null,
  submitDisabled: document.querySelector('.report__actions .btn-primary')?.disabled ?? null,
})
`)
  ok('report screen open', report.onReport, report.onReport)
  ok('voice label present', report.voiceLabel.some((x) => x === 'Add a voice note (optional)'), report.voiceLabel)
  ok('mic pill present', report.micPill === 'Record voice note', report.micPill)
  ok('mic pill not in recording state initially', !String(report.micClass).includes('--rec'), report.micClass)
  ok('submit enabled (no take recording)', report.submitDisabled === false, report.submitDisabled)

  // ---- homepage: overtime badge states ----
  await evaluate(page, `
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  history.back && null;
  // navigate back home via the back button on the report screen
  const back = document.querySelector('.report .back-button');
  if (back) back.click();
  await sleep(300);
  // seed a fresh shift + an APPROVED 2-hour overtime request, then reboot
  const start = new Date(Date.now() - 60 * 1000).toISOString(); // 1 min in (regular shift = 5 min)
  const d = new Date();
  const today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  localStorage.setItem('suab.attendance', JSON.stringify({ checkInAt: start, workerLat: 28.61415, workerLng: 77.20925, distanceMeters: 35, date: today }));
  localStorage.setItem('suab.allotment', JSON.stringify({ date: today, machineId: 'M-04', machineName: 'Tile Press #4', machineType: 'Pressing', targetQuantity: 500, acceptedAt: start }));
  localStorage.setItem('suab.shiftStart', JSON.stringify(start));
  localStorage.setItem('suab.overtimeRequest', JSON.stringify({ status: 'approved', hours: 2, requestedAt: start, approvedAt: start, date: today }));
  setTimeout(() => location.reload(), 50);
  return 'seeded';
})()
`)
  await new Promise((r) => setTimeout(r, 1500))
  const early = await evaluate(page, `
({
  onHome: Boolean(document.querySelector('.home')),
  title: document.querySelector('.screen__title')?.textContent.trim() ?? null,
  rootClass: document.getElementById('root')?.firstElementChild?.className ?? null,
  timerClass: document.querySelector('.shift-timer')?.className ?? null,
  badge: document.querySelector('.ot__badge')?.textContent.trim() ?? null,
  badgeClass: document.querySelector('.ot__badge')?.className ?? null,
  badgeCount: document.querySelectorAll('.ot__badge').length,
  shiftStart: localStorage.getItem('suab.shiftStart'),
  otReq: localStorage.getItem('suab.overtimeRequest'),
})
`)
  ok('homepage shown', early.onHome, early.onHome)
  ok('timer in regular state before regular shift ends', !String(early.timerClass).includes('--overtime'), early.timerClass)
  ok('NO overtime badge before regular shift ends', early.badge === null, early.badge)
  ok('zero badge elements before regular shift ends', early.badgeCount === 0, early.badgeCount)

  // now jump past the regular 5-minute shift (but inside the +2 min extension)
  await evaluate(page, `
(() => {
  const start = new Date(Date.now() - 6 * 60 * 1000).toISOString(); // 6 min: regular over, extension (7 min) running
  localStorage.setItem('suab.shiftStart', JSON.stringify(start));
  localStorage.setItem('suab.attendance', JSON.stringify({ checkInAt: start, workerLat: 28.61415, workerLng: 77.20925, distanceMeters: 35, date: '2026-11-04' }));
  setTimeout(() => location.reload(), 50);
  return 'reseeded';
})()
`)
  await new Promise((r) => setTimeout(r, 1500))
  const late = await evaluate(page, `
({
  timerClass: document.querySelector('.shift-timer')?.className ?? null,
  badge: document.querySelector('.ot__badge')?.textContent.trim() ?? null,
  badgeClass: document.querySelector('.ot__badge')?.className ?? null,
  badgeCount: document.querySelectorAll('.ot__badge').length,
})
`)
  ok('timer switched to the overtime state', String(late.timerClass).includes('--overtime'), late.timerClass)
  ok('orange Overtime shift badge shown', late.badge === 'Overtime shift', late.badge)
  ok('only one badge at a time', late.badgeCount === 1, late.badgeCount)

  // ---- scenario 2: full voice recording flow (fake mic) ----
  await evaluate(page, `location.reload()`)
  await sleep(1200)
  await evaluate(page, `
(() => {
  const card = document.querySelector('.action-card');
  if (card) card.click();
  return 'opened';
})()
`)
  await sleep(600)
  await evaluate(page, `
(() => {
  const btns = [...document.querySelectorAll('button')];
  const mic = btns.find(b => b.className.includes('report__voice-mic'));
  mic.click();
  return 'clicked';
})()
`)
  await sleep(1500) // record ~1.5s with the fake mic
  const rec = await evaluate(page, `
(() => {
  const btns = [...document.querySelectorAll('button')];
  const mic = btns.find(b => b.className.includes('report__voice-mic'));
  const recState = mic.className.includes('--rec');
  mic.click(); // stop
  return recState;
})()
`)
  ok('mic pill entered recording state', rec === true, rec)
  await sleep(600)
  const review = await evaluate(page, `
(() => {
  const row = document.querySelector('.report__voice');
  if (!row) return null;
  return {
    chips: [...row.querySelectorAll('button.report__voice-chip')].map(b => b.textContent.trim()),
    len: row.querySelector('.report__voice-length')?.textContent.trim(),
    submitDisabled: document.querySelector('.report__actions .btn-primary')?.disabled,
  };
})()
`)
  ok('review row with Play/Retake chips after stop', !!review && review.chips.length === 2 && review.chips[0] === 'Play' && review.chips[1] === 'Retake', review && review.chips)
  ok('review row shows recorded length', !!review && /^\d+:\d{2}$/.test(review.len || ''), review && review.len)
  ok('submit still enabled with take recording', review && review.submitDisabled === false, review && review.submitDisabled)

  // retake flow: the Retake chip starts a new recording right away
  await evaluate(page, `
(() => {
  const row = document.querySelector('.report__voice');
  [...row.querySelectorAll('button')].find(b => b.className.includes('report__voice-chip--retake')).click();
  return 'retake';
})()
`)
  await sleep(300)
  const afterRetake = await evaluate(page, `
(() => {
  const mic = [...document.querySelectorAll('button')].find(b => b.className.includes('report__voice-mic'));
  return { reviewGone: !document.querySelector('.report__voice'), micRec: mic && mic.className.includes('--rec') };
})()
`)
  ok('retake starts a fresh recording (review row gone, pill recording)', afterRetake.reviewGone === true && afterRetake.micRec === true, afterRetake)
  await sleep(1200)
  await evaluate(page, `
(() => {
  const btns = [...document.querySelectorAll('button')];
  btns.find(b => b.className.includes('report__voice-mic')).click(); // stop
  return 'stopped';
})()
`)
  await sleep(600)

  // play chip toggles to Stop and back (stub Audio — headless can't decode the
  // recorded blob, error code 4, so playback state would reset immediately)
  const playToggle = await evaluate(page, `
(() => {
  window.Audio = function () {
    return { play: () => Promise.resolve(), pause: () => {}, onended: null, onerror: null };
  };
  const row = document.querySelector('.report__voice');
  const play = [...row.querySelectorAll('button.report__voice-chip')].find(b => !b.className.includes('--retake'));
  play.click();
  return 'clicked';
})()
`)
  await sleep(400)
  const playToggle2 = await evaluate(page, `
(() => {
  const row = document.querySelector('.report__voice');
  const btn = [...row.querySelectorAll('button.report__voice-chip')].find(b => !b.className.includes('--retake'));
  const label = btn.textContent.trim();
  if (label === 'Stop') btn.click();
  return label;
})()
`)
  ok('play chip toggles to Stop during playback', playToggle === 'clicked' && playToggle2 === 'Stop', [playToggle, playToggle2])

  // attach a photo + submit, then verify the persisted voiceNote
  await evaluate(page, `
(() => {
  const dt = new DataTransfer();
  dt.items.add(new File([new Uint8Array([1, 2, 3, 4])], 'p.jpg', { type: 'image/jpeg' }));
  const input = document.querySelector('.report__file-input');
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return 'attached';
})()
`)
  await sleep(300)
  await evaluate(page, `
(() => {
  document.querySelector('.report__actions .btn-primary').click();
  return 'submitted';
})()
`)
  await sleep(800)
  const persisted = await evaluate(page, `
(() => {
  const reports = JSON.parse(localStorage.getItem('suab.issueReports') || '[]');
  const r = reports[reports.length - 1];
  return r && r.voiceNote ? { prefix: r.voiceNote.slice(0, 30), size: r.voiceNote.length } : null;
})()
`)
  ok('submitted report persists a voiceNote data URL', !!persisted && persisted.prefix.startsWith('data:audio'), persisted)

  // remove chip clears the take (submit showed the success view — start a fresh form)
  await evaluate(page, `
(() => {
  const again = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Submit another report');
  if (again) { again.click(); return 'new form'; }
  return 'no success view';
})()
`)
  await sleep(600)
  await evaluate(page, `
(() => {
  const btns = [...document.querySelectorAll('button')];
  btns.find(b => b.className.includes('report__voice-mic')).click();
  return 'rec';
})()
`)
  await sleep(1000)
  await evaluate(page, `
(() => {
  const btns = [...document.querySelectorAll('button')];
  btns.find(b => b.className.includes('report__voice-mic')).click();
  return 'stop';
})()
`)
  await sleep(500)
  await evaluate(page, `
(() => {
  const row = document.querySelector('.report__voice');
  row.querySelector('.report__voice-remove').click();
  return 'clicked';
})()
`)
  await sleep(400)
  const removed = await evaluate(page, `!document.querySelector('.report__voice')`)
  ok('remove chip clears the take', removed === true, removed)
} finally {
  child.kill()
  try { rmSync(userDir, { recursive: true, force: true }) } catch { }
  await new Promise((r) => server.httpServer.close(r))
}
const failed = results.filter((r) => !r).length
console.log(failed ? failed + ' check(s) FAILED' : 'All checks passed')
process.exit(failed ? 1 : 0)
