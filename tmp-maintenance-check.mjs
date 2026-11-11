/**
 * tmp-maintenance-check.mjs — headless-Chrome end-to-end check of the new
 * Machine Maintenance page: Other-screen tile navigation, the voice form
 * (record → review → retake → submit), persistence as a kind:'maintenance'
 * work update, and a regression pass over the work-activities screen.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { preview } from 'vite'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const DEBUG_PORT = 9229

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

const server = await preview({ preview: { port: 4179, strictPort: true } })
const { child, userDir } = await launchChrome()
try {
  const page = await connectPage()
  await page.send('Page.enable')
  await page.send('Page.navigate', { url: 'http://localhost:4179/Suab-deploy/' })
  await new Promise((r) => setTimeout(r, 1500))

  // ---- walk: login → attendance → allotment → home ----
  await evaluate(page, `
(async () => {
  localStorage.clear();
  localStorage.setItem('suab.session', JSON.stringify({ phone: '9876543210' }));
  localStorage.setItem('suab.language', JSON.stringify('en'));
  setTimeout(() => location.reload(), 50);
  return 'ok';
})()
`)
  await sleep(1200)
  await evaluate(page, `
(async () => {
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
  return 'walked';
})()
`)
  await sleep(400)
  const allottedMachineId = await evaluate(
    page,
    `JSON.parse(localStorage.getItem('suab.allotment') || 'null')?.machineId ?? null`,
  )

  // ---- home → Other ----
  await evaluate(page, `
(() => {
  const card = Array.from(document.querySelectorAll('.action-card'))
    .find((n) => n.textContent.trim() === 'Other');
  if (card) card.click();
  return 'opened-other';
})()
`)
  await sleep(400)
  const other = await evaluate(page, `
({
  onOther: Boolean(document.querySelector('.other__body')),
  tiles: Array.from(document.querySelectorAll('.action-card')).map((n) => n.textContent.trim()),
})
`)
  ok('Other screen open', other.onOther, other.onOther)
  ok('maintenance tile present', other.tiles.includes('Report Machine Maintenance'), other.tiles)

  // ---- Other → Machine Maintenance ----
  await evaluate(page, `
(() => {
  const card = Array.from(document.querySelectorAll('.action-card'))
    .find((n) => n.textContent.trim() === 'Report Machine Maintenance');
  if (card) card.click();
  return 'clicked';
})()
`)
  await sleep(400)
  const maint = await evaluate(page, `
({
  onMaint: Boolean(document.querySelector('.maint__body')),
  title: document.querySelector('.screen__title')?.textContent.trim() ?? null,
  sub: document.querySelector('.screen__subtitle')?.textContent.trim() ?? null,
  micClass: document.querySelector('.maint__mic')?.className ?? null,
  status: document.querySelector('.maint__status')?.textContent.trim() ?? null,
  submitDisabled: document.querySelector('.maint__submit')?.disabled ?? null,
})
`)
  ok('maintenance screen open', maint.onMaint, maint.onMaint)
  ok('title is Report Machine Maintenance', maint.title === 'Report Machine Maintenance', maint.title)
  ok('subtitle present', maint.sub === 'Record a short voice note about the machine maintenance needed', maint.sub)
  ok('mic idle (blue, not recording)', !String(maint.micClass).includes('--rec'), maint.micClass)
  ok('submit disabled before a take', maint.submitDisabled === true, maint.submitDisabled)

  // ---- the reference-design sections: machine chip, reason cards, voice header, photo ----
  const sections = await evaluate(page, `
({
  machineLabel: document.querySelector('.maint__machine-label')?.textContent.trim() ?? null,
  machineNo: document.querySelector('.maint__machine-no')?.textContent.trim() ?? null,
  reasons: Array.from(document.querySelectorAll('.maint__reason .maint__reason-label')).map((n) => n.textContent.trim()),
  voiceTitle: document.querySelector('.maint__voicehead-title')?.textContent.trim() ?? null,
  voiceSub: document.querySelector('.maint__voicehead-sub')?.textContent.trim() ?? null,
  idleStatus: document.querySelector('.maint__status')?.textContent.trim() ?? null,
  photoPill: document.querySelector('.maint__photo-pick')?.textContent.trim() ?? null,
})
`)
  ok('machine chip shows the Machine# label', sections.machineLabel === 'Machine#', sections.machineLabel)
  ok('machine chip shows the allotted machine id', sections.machineNo === allottedMachineId, [sections.machineNo, allottedMachineId])
  ok('three reason cards with the reference labels', sections.reasons.length === 3 && sections.reasons[0] === 'Machine not working' && sections.reasons[1] === 'Unusual sound' && sections.reasons[2] === 'Other issue', sections.reasons)
  ok('voice header title', sections.voiceTitle === 'Tell us the problem', sections.voiceTitle)
  ok('voice header sub', sections.voiceSub === 'Speak in your language', sections.voiceSub)
  ok('idle status line replaced by the voice header', sections.idleStatus === null, sections.idleStatus)
  ok('Add photo pill present', sections.photoPill === 'Add photo', sections.photoPill)

  // ---- pick a reason: the card tints with its accent; tap again clears ----
  const reasonPick = await evaluate(page, `
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const card = document.querySelectorAll('.maint__reason')[0];
  card.click();
  await sleep(150); // let React flush the re-render before reading the class
  const onAfterTap = card.className.includes('maint__reason--on');
  card.click();
  await sleep(150);
  const offAfterSecondTap = !card.className.includes('maint__reason--on');
  card.click(); // leave it selected for submit
  await sleep(150);
  return { onAfterTap, offAfterSecondTap };
})()
`)
  ok('reason card selects on tap', reasonPick.onAfterTap === true, reasonPick.onAfterTap)
  ok('reason card clears on second tap', reasonPick.offAfterSecondTap === true, reasonPick.offAfterSecondTap)

  // ---- pick a photo (in-page File → DataTransfer → change event) ----
  await evaluate(page, `
(() => {
  const input = document.querySelector('.report__file-input');
  const dt = new DataTransfer();
  dt.items.add(new File(['fake'], 'crack.png', { type: 'image/png' }));
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return 'picked';
})()
`)
  await sleep(300)
  const photoRow = await evaluate(page, `
({
  row: document.querySelector('.maint__photo')?.textContent.trim() ?? null,
  pillGone: !document.querySelector('.maint__photo-pick'),
})
`)
  ok('photo row shows the file name', String(photoRow.row || '').includes('crack.png'), photoRow.row)
  ok('photo pill replaced by the row', photoRow.pillGone === true, photoRow.pillGone)

  // ---- record with the fake mic ----
  await evaluate(page, `document.querySelector('.maint__mic').click()`)
  await sleep(1500)
  const rec = await evaluate(page, `
(() => {
  const mic = document.querySelector('.maint__mic');
  const recState = mic.className.includes('--rec');
  const status = document.querySelector('.maint__status')?.textContent.trim();
  mic.click(); // stop
  return { recState, status };
})()
`)
  ok('mic entered recording state', rec.recState === true, rec.recState)
  ok('status shows Recording + timer', /^Recording… \d+:\d{2}$/.test(rec.status || ''), rec.status)
  await sleep(600)
  const review = await evaluate(page, `
(() => {
  const row = document.querySelector('.maint__review');
  return {
    chips: row ? Array.from(row.querySelectorAll('button')).map((b) => b.textContent.trim()) : null,
    status: document.querySelector('.maint__status')?.textContent.trim() ?? null,
    submitDisabled: document.querySelector('.maint__submit')?.disabled ?? null,
  };
})()
`)
  ok('review chips Play/Retake after stop', !!review && review.chips.length === 2 && review.chips[0] === 'Play' && review.chips[1] === 'Retake', review && review.chips)
  ok('status shows the take length', /^\d+:\d{2}$/.test(review.status || ''), review && review.status)
  ok('submit enabled with a take', review.submitDisabled === false, review.submitDisabled)

  // ---- retake: deletes the take and returns to the idle mic ----
  // (the same Retake semantics as the half-day and work-activities screens)
  await evaluate(page, `
(() => {
  const chips = Array.from(document.querySelectorAll('.maint__chip'));
  chips.find((b) => b.textContent.trim() === 'Retake').click();
  return 'retake';
})()
`)
  await sleep(600)
  const retake = await evaluate(page, `
({
  reviewGone: !document.querySelector('.maint__review'),
  micIdle: !String(document.querySelector('.maint__mic')?.className).includes('--rec'),
  submitDisabled: document.querySelector('.maint__submit')?.disabled ?? null,
})
`)
  ok('retake clears the review row', retake.reviewGone === true, retake.reviewGone)
  ok('retake returns the mic to idle', retake.micIdle === true, retake.micIdle)
  ok('submit disabled again after retake', retake.submitDisabled === true, retake.submitDisabled)

  // record take two, stop it, then submit
  await evaluate(page, `document.querySelector('.maint__mic').click()`)
  await sleep(1200)
  await evaluate(page, `document.querySelector('.maint__mic').click()`) // stop
  await sleep(600)

  // ---- submit → toast → back to Other, persisted as a work update ----
  await evaluate(page, `document.querySelector('.maint__submit').click()`)
  await sleep(400)
  const sent = await evaluate(page, `
({
  toast: document.querySelector('.toast')?.textContent.trim() ?? null,
  updates: JSON.parse(localStorage.getItem('suab.workUpdates') || '[]'),
})
`)
  ok('success toast shown', String(sent.toast || '').startsWith('Maintenance request sent'), sent.toast)
  ok('work update saved with kind maintenance', sent.updates.length === 1 && sent.updates[0].kind === 'maintenance', sent.updates.map((u) => u.kind))
  ok('update carries the machine id', sent.updates[0]?.machine === allottedMachineId, sent.updates[0]?.machine)
  ok('update carries the picked reason', sent.updates[0]?.reason === 'not-working', sent.updates[0]?.reason)
  ok('update carries the photo metadata', sent.updates[0]?.photo?.name === 'crack.png' && sent.updates[0]?.photo?.type === 'image/png', sent.updates[0]?.photo)
  ok('voice note persisted as data URL', typeof sent.updates[0]?.voiceNote === 'string' && sent.updates[0].voiceNote.startsWith('data:audio'), String(sent.updates[0]?.voiceNote || '').slice(0, 30))
  await sleep(1500)
  const back = await evaluate(page, `
({
  onOther: Boolean(document.querySelector('.other__body')),
})
`)
  ok('returned to Other after the toast', back.onOther, back.onOther)

  // ---- regression: the work-activities screen still opens ----
  await evaluate(page, `
(() => {
  const card = Array.from(document.querySelectorAll('.action-card'))
    .find((n) => n.textContent.trim() === 'Update Other Work Activities');
  if (card) card.click();
  return 'clicked';
})()
`)
  await sleep(400)
  const act = await evaluate(page, `
({
  onAct: Boolean(document.querySelector('.workact__body')),
  title: document.querySelector('.screen__title')?.textContent.trim() ?? null,
})
`)
  ok('work-activities screen still opens', act.onAct, act.onAct)
  ok('work-activities title intact', act.title === 'Update Other Work Activities', act.title)

  // ---- back button on the maintenance screen returns to Other ----
  await evaluate(page, `
(() => {
  const back = document.querySelector('.workact__body')?.closest('.detail')?.querySelector('.back-button');
  if (back) back.click();
  return 'back';
})()
`)
  await sleep(400)
  const backOther = await evaluate(page, `Boolean(document.querySelector('.other__body'))`)
  ok('back from activities returns to Other', backOther === true, backOther)
} finally {
  await server.close()
  try { child.kill() } catch {}
  try { rmSync(userDir, { recursive: true, force: true }) } catch {}
}

const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} checks passed`)
process.exit(passed === results.length ? 0 : 1)
