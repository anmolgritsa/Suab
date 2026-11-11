/**
 * tmp-login-browser.mjs — real-browser login verification for BOTH roles.
 *
 * Two SEPARATE headless Chrome processes (isolated profiles/localStorage):
 *   Profile SUP: login SUP001 + 9812345678 → Supervisor Dashboard,
 *                session + currentUser mirror carry the supervisor role.
 *   Profile LAB: login LAB001 + 9876540010 → Mark Attendance (labour flow),
 *                session + currentUser mirror carry the labour role.
 * Also asserts the app healed its localStorage copy of the DB (11 users)
 * and that a wrong mobile is rejected with the inline error.
 *
 * Run with:  node tmp-login-browser.mjs   (expects the dev server on :5173)
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://localhost:5173/Suab-deploy/';
const PORT_SUP = 9261;
const PORT_LAB = 9262;
const PORT_NEG = 9263;

let passed = 0;
let failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.error(`  FAIL  ${name}${detail ? '  [' + detail + ']' : ''}`); }
};

function launchChrome(debugPort) {
  const userDir = mkdtempSync(join(tmpdir(), 'suab-login-'));
  const child = spawn(CHROME, [
    '--headless=new',
    '--remote-debugging-port=' + debugPort,
    '--user-data-dir=' + userDir,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Chrome did not start :' + debugPort)), 20000);
    child.stderr.on('data', (chunk) => {
      const match = String(chunk).match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) { clearTimeout(timer); resolve({ child, userDir, debugPort }); }
    });
  });
}

async function connectBrowser(debugPort) {
  const version = await (await fetch('http://127.0.0.1:' + debugPort + '/json/version')).json();
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error('ws fail')); });
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
  const send = (method, params = {}) => new Promise((resolve, reject) => {
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
    const list = await (await fetch('http://127.0.0.1:' + debugPort + '/json/list')).json();
    target = list.find((t) => t.type === 'page' && t.id === targetId) ?? null;
    if (!target) await new Promise((r) => setTimeout(r, 200));
  }
  if (!target) throw new Error('target not found');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error('ws fail')); });
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
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    nextId += 1;
    pending.set(nextId, { resolve, reject });
    ws.send(JSON.stringify({ id: nextId, method, params }));
  });
  return { send, close: () => ws.close() };
}

async function evaluate(page, expression) {
  const result = await page.send('Runtime.evaluate', {
    expression, awaitPromise: true, returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || 'Page script threw');
  }
  return result.result.value;
}

async function waitFor(page, expression, tries = 60, everyMs = 250) {
  for (let i = 0; i < tries; i += 1) {
    if (await evaluate(page, expression)) return true;
    await new Promise((r) => setTimeout(r, everyMs));
  }
  return false;
}

const HELPERS = `
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
    (async () => { ${HELPERS}
      const inputs = $$('input');
      setReactValue(inputs[0], '${phone}');
      setReactValue(inputs[1], '${employeeId}');
      buttonByText('Login').click();
      return true;
    })()
  `;
}

const procs = [];
async function main() {
  let supBrowser, labBrowser, supTab, labTab, sup, lab;
  try {
    procs.push(await launchChrome(PORT_SUP));
    procs.push(await launchChrome(PORT_LAB));
    supBrowser = await connectBrowser(PORT_SUP);
    labBrowser = await connectBrowser(PORT_LAB);

    /* ---- Supervisor: SUP001 ---- */
    supTab = await openTab(supBrowser, URL);
    sup = await connectTarget(PORT_SUP, supTab);
    await sup.send('Page.navigate', { url: URL });
    ok('SUP: login screen shown',
      await waitFor(sup, "document.body.innerText.includes('Welcome Back')"));
    ok('SUP: app healed localStorage DB (11 users)',
      await waitFor(sup, "(JSON.parse(localStorage.getItem('suab.db')||'{\"collections\":{}}').collections.users||[]).length === 11"));
    await evaluate(sup, loginScript('9812345678', 'SUP001'));
    ok('SUP: Supervisor Dashboard opens (no refresh)',
      await waitFor(sup, "document.body.innerText.includes('Supervisor Dashboard')"));
    const supState = await evaluate(sup, `JSON.stringify({
      session: JSON.parse(localStorage.getItem('suab.session') || 'null'),
      user: JSON.parse(localStorage.getItem('suab.currentUser') || 'null'),
    })`);
    const supParsed = JSON.parse(supState);
    ok('SUP: session employeeId = SUP001',
      supParsed.session?.employeeId === 'SUP001', String(supParsed.session?.employeeId));
    ok('SUP: mirrored user role = supervisor',
      supParsed.user?.role === 'supervisor', String(supParsed.user?.role));
    ok('SUP: mirrored user name = Sandeep Malhotra',
      supParsed.user?.name === 'Sandeep Malhotra', String(supParsed.user?.name));

    /* ---- Labour: LAB001 ---- */
    labTab = await openTab(labBrowser, URL);
    lab = await connectTarget(PORT_LAB, labTab);
    await lab.send('Page.navigate', { url: URL });
    ok('LAB: login screen shown',
      await waitFor(lab, "document.body.innerText.includes('Welcome Back')"));
    ok('LAB: app healed localStorage DB (11 users)',
      await waitFor(lab, "(JSON.parse(localStorage.getItem('suab.db')||'{\"collections\":{}}').collections.users||[]).length === 11"));
    await evaluate(lab, loginScript('9876540010', 'LAB001'));
    ok('LAB: labour flow opens (Mark Attendance)',
      await waitFor(lab, "document.body.innerText.includes('Mark Attendance')"));
    const labState = await evaluate(lab, `JSON.stringify({
      session: JSON.parse(localStorage.getItem('suab.session') || 'null'),
      user: JSON.parse(localStorage.getItem('suab.currentUser') || 'null'),
    })`);
    const labParsed = JSON.parse(labState);
    ok('LAB: session employeeId = LAB001',
      labParsed.session?.employeeId === 'LAB001', String(labParsed.session?.employeeId));
    ok('LAB: mirrored user role = labour',
      labParsed.user?.role === 'labour', String(labParsed.user?.role));
    ok('LAB: mirrored user name = Ramesh Kumar',
      labParsed.user?.name === 'Ramesh Kumar', String(labParsed.user?.name));

    /* ---- Negative: wrong mobile must NOT log in (fresh isolated profile) ---- */
    procs.push(await launchChrome(PORT_NEG));
    const negBrowser = await connectBrowser(PORT_NEG);
    const negTab = await openTab(negBrowser, URL);
    const neg = await connectTarget(PORT_NEG, negTab);
    await neg.send('Page.navigate', { url: URL });
    ok('NEG: login screen shown',
      await waitFor(neg, "document.body.innerText.includes('Welcome Back')"));
    await evaluate(neg, loginScript('9876540010', 'SUP001'));
    ok('NEG: wrong mobile rejected with inline error',
      await waitFor(neg, "document.body.innerText.includes('Invalid Employee ID or mobile number')"));
    ok('NEG: still on the login screen (no session)',
      await evaluate(neg, "localStorage.getItem('suab.session') === null"));
    neg.close();
    negBrowser.close();
  } finally {
    for (const page of [sup, lab]) page?.close?.();
    for (const browser of [supBrowser, labBrowser]) browser?.close?.();
    for (const proc of procs) {
      try { proc.child.kill(); } catch { /* already gone */ }
      try { rmSync(proc.userDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => { console.error(error); process.exit(1); });
