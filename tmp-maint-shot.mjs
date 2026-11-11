/**
 * tmp-maint-shot.mjs — one-off: screenshot the maintenance screen's new
 * quick-report sections for a visual layout check against the reference.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { preview } from 'vite'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const DEBUG_PORT = 9231
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function launchChrome() {
  const userDir = mkdtempSync(join(tmpdir(), 'suab-chrome-'))
  const child = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=' + DEBUG_PORT,
    '--user-data-dir=' + userDir, '--no-first-run', '--no-default-browser-check',
    '--disable-gpu', '--window-size=430,932', 'about:blank',
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

const server = await preview({ preview: { port: 4181, strictPort: true } })
const { child, userDir } = await launchChrome()
try {
  const page = await connectPage()
  await page.send('Page.enable')
  await page.send('Page.navigate', { url: 'http://localhost:4181/Suab-deploy/' })
  await sleep(1500)
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
  const card = Array.from(document.querySelectorAll('.action-card'))
    .find((n) => n.textContent.trim() === 'Other');
  if (card) card.click();
  await sleep(400);
  const tile = Array.from(document.querySelectorAll('.action-card'))
    .find((n) => n.textContent.trim() === 'Report Machine Maintenance');
  if (tile) tile.click();
  await sleep(500);
  // select the middle reason so the screenshot shows a selected accent too
  const cards = document.querySelectorAll('.maint__reason');
  if (cards[1]) cards[1].click();
  await sleep(200);
  return 'on-maintenance';
})()
`)
  await sleep(400)
  const shot = await page.send('Page.captureScreenshot', { format: 'png' })
  const { writeFileSync } = await import('node:fs')
  writeFileSync('tmp-maint-shot.png', Buffer.from(shot.data, 'base64'))
  console.log('screenshot saved: tmp-maint-shot.png')
} finally {
  await server.close()
  try { child.kill() } catch {}
  try { rmSync(userDir, { recursive: true, force: true }) } catch {}
}
