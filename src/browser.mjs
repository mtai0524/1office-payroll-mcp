// Minimal Chrome DevTools Protocol client for driving a logged-in 1Office tab.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { CHROME_PROFILE_DIR, loadConfig } from './config.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
  ].filter(Boolean);
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) throw new Error('Không tìm thấy chrome.exe (đặt biến môi trường CHROME_PATH)');
  return found;
}

async function devtoolsUp(port) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/json/version`);
    return r.ok;
  } catch {
    return false;
  }
}

export async function ensureChrome() {
  const { port, baseUrl } = loadConfig().browser;
  if (!(await devtoolsUp(port))) {
    const profile = loadConfig().browser.profileDir || CHROME_PROFILE_DIR;
    spawn(chromePath(), [`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', `${baseUrl}/user`], {
      detached: true,
      stdio: 'ignore',
    }).unref();
    for (let i = 0; i < 30 && !(await devtoolsUp(port)); i++) await sleep(500);
    if (!(await devtoolsUp(port))) throw new Error('Không khởi động được Chrome với remote debugging');
    await sleep(2000);
  }
}

async function findTab() {
  const { port, baseUrl } = loadConfig().browser;
  const host = new URL(baseUrl).host;
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  let tab = tabs.find((t) => t.type === 'page' && t.url.includes(host));
  if (!tab) {
    tab = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(baseUrl + '/user')}`, { method: 'PUT' })).json();
    await sleep(3000);
  }
  return tab;
}

class Session {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && this.pending.has(m.id)) {
        this.pending.get(m.id)(m);
        this.pending.delete(m.id);
      }
    };
  }
  send(method, params = {}) {
    return new Promise((resolve) => {
      const id = ++this.id;
      this.pending.set(id, resolve);
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const res = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (res.result?.exceptionDetails) {
      throw new Error('JS lỗi trong trang: ' + (res.result.exceptionDetails.exception?.description || res.result.exceptionDetails.text));
    }
    return res.result?.result?.value;
  }
  // Poll `expression` until it returns a truthy value.
  async waitFor(expression, timeoutMs = 20000, intervalMs = 500) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      try {
        const v = await this.eval(expression);
        if (v) return v;
      } catch {
        // page may be mid-navigation
      }
      await sleep(intervalMs);
    }
    return null;
  }
  async goto(url, readyExpr, timeoutMs = 25000) {
    await this.send('Page.navigate', { url });
    await sleep(800);
    const ok = await this.waitFor(`document.readyState==='complete' && (${readyExpr || 'true'})`, timeoutMs);
    const href = await this.eval('location.href');
    if (href.includes('/login')) {
      throw new Error('CHƯA ĐĂNG NHẬP: hãy đăng nhập 1Office trong cửa sổ Chrome vừa mở (tick "Keep me logged in") rồi gọi lại.');
    }
    return ok;
  }
  close() {
    this.ws.close();
  }
}

// Serialize browser access: every tool call drives the same tab.
let chain = Promise.resolve();
export function withPage(fn) {
  const run = chain.then(async () => {
    await ensureChrome();
    const tab = await findTab();
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = () => reject(new Error('Không kết nối được tới tab Chrome'));
    });
    const s = new Session(ws);
    try {
      return await fn(s);
    } finally {
      s.close();
    }
  });
  chain = run.catch(() => {});
  return run;
}
