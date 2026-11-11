/**
 * tmp-keypad-debug.mjs — reproduce home-check's keypad scenario and dump
 * what is actually on the page when press('5') fails.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { preview } from 'vite'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const DEBUG_PORT = 9226

function launchChrome() {
  const userDir = mkdtempSync(join(tmpdir(), 'suab-chrome-'))
  const child = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=' + DEBUG_PORT,
    '--user-data-dir=' + userDir, '--no-first-run', '--no-default-browser-check',
    '--disable-gpu', 'about:blank',
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
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || 'Page script threw')
  }
  return result.result.value
}

const server = await preview({ preview: { port: 4177, strictPort: true } })
const { child, userDir } = await launchChrome()
try {
  const page = await connectPage()
  await page.send('Page.enable')
  await page.send('Runtime.enable')
  await page.send('Log.enable')
  const logs = []
  page.send('Runtime.consoleAPICalled').catch(() => {})
  // collect console + exceptions via a second websocket? simpler: poll
  await page.send('Page.navigate', { url: 'http://localhost:4177/Suab-deploy/' })
  await new Promise((r) => setTimeout(r, 1500))

  const seed = `
(async () => {
  const start = new Date(Date.now() - 6 * 60 * 1000).toISOString();
  const d = new Date();
  const today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  localStorage.clear();
  localStorage.setItem('suab.session', JSON.stringify({ phone: '9876543210' }));
  localStorage.setItem('suab.attendance', JSON.stringify({ checkInAt: start, workerLat: 28.61415, workerLng: 77.20925, distanceMeters: 35, date: today }));
  localStorage.setItem('suab.allotment', JSON.stringify({ date: today, machineId: 'M-04', machineName: 'Tile Press #4', machineType: 'Pressing', targetQuantity: 500, acceptedAt: start }));
  localStorage.setItem('suab.assignedQuantity', JSON.stringify(500));
  localStorage.setItem('suab.shiftStart', JSON.stringify(start));
  localStorage.setItem('suab.language', JSON.stringify('en'));
  setTimeout(() => location.reload(), 50);
  return 'seeded';
})()
`
  await evaluate(page, seed)
  let ready = false
  for (let i = 0; i < 60 && !ready; i += 1) {
    await new Promise((r) => setTimeout(r, 250))
    try { ready = await evaluate(page, "Boolean(document.querySelector('.product-submit'))") } catch { }
  }
  console.log('product screen present:', ready)

  const state = await evaluate(page, `
({
  root: document.getElementById('root')?.childElementCount ?? -1,
  productSubmit: Boolean(document.querySelector('.product-submit')),
  title: document.querySelector('.screen__title')?.textContent.trim() ?? null,
  keypadKeys: Array.from(document.querySelectorAll('.keypad__key')).map((k) => k.textContent.trim()),
  confirmBtn: Boolean(document.querySelector('.product-submit__actions .btn-primary')),
  bodyClasses: document.body.className,
  homePresent: Boolean(document.querySelector('.home')),
  otBadge: document.querySelector('.ot__badge')?.textContent.trim() ?? null,
  shiftTimer: document.querySelector('.shift-timer')?.textContent.trim() ?? null,
})
`)
  console.log(JSON.stringify(state, null, 2))
} finally {
  child.kill()
  rmSync(userDir, { recursive: true, force: true })
  await new Promise((r) => server.httpServer.close(r))
}
