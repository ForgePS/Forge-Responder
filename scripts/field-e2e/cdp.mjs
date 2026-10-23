// Minimal Chrome DevTools Protocol driver (no dependencies).
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launchChrome({ port = 9333, headless = true } = {}) {
  const profile = mkdtempSync(join(tmpdir(), "field-e2e-"));
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-features=Translate",
    "--window-size=430,932", ...(headless ? [] : ["--window-position=-2400,0"]),
    ...(headless ? ["--headless=new"] : []),
    "about:blank",
  ];
  const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
  const proc = spawn(chromePath, args, { stdio: "ignore" });
  for (let i = 0; i < 50; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return { proc, port, version: await res.json() };
    } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error("Chrome did not start");
}

export class Session {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.handlers = [];
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message} ${msg.error.data || ""}`));
        else resolve(msg.result);
      } else if (msg.method) {
        this.handlers.forEach((h) => h(msg));
      }
    });
  }

  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", reject, { once: true });
    });
    return new Session(ws);
  }

  send(method, params = {}, sessionId) {
    const id = ++this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  on(handler) {
    this.handlers.push(handler);
  }
}

export async function openPage(port) {
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const browser = await Session.connect(version.webSocketDebuggerUrl);
  const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
  const page = new Page(browser, sessionId, targetId);
  await page.init();
  return page;
}

export class Page {
  constructor(browser, sessionId, targetId) {
    this.browser = browser;
    this.sessionId = sessionId;
    this.targetId = targetId;
    this.console = [];
    this.swSessions = new Set();
    this.offline = false;
  }

  send(method, params) {
    return this.browser.send(method, params, this.sessionId);
  }

  async init() {
    await this.send("Page.enable");
    await this.send("Runtime.enable");
    await this.send("Network.enable");
    await this.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await this.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    this.browser.on((msg) => {
      if (msg.sessionId === this.sessionId && msg.method === "Runtime.consoleAPICalled") {
        const text = msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ");
        this.console.push(`[${msg.params.type}] ${text}`);
      }
      if (msg.method === "Target.attachedToTarget" && msg.params.targetInfo.type === "service_worker") {
        const swSession = msg.params.sessionId;
        this.swSessions.add(swSession);
        this.browser.send("Network.enable", {}, swSession).catch(() => null);
        if (this.offline) this.applyNetwork(swSession).catch(() => null);
        this.browser.send("Runtime.runIfWaitingForDebugger", {}, swSession).catch(() => null);
      }
    });
    await this.browser.send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
    await this.browser.send("Target.setDiscoverTargets", { discover: true });
  }

  async applyNetwork(sessionId) {
    await this.browser.send("Network.emulateNetworkConditions", {
      offline: this.offline,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    }, sessionId);
    // Newer Chrome drives navigator.onLine from this call.
    await this.browser.send("Network.overrideNetworkState", {
      offline: this.offline,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    }, sessionId).catch(() => null);
  }

  /** Airplane mode for the page and its service worker. */
  async setOffline(offline) {
    this.offline = offline;
    // Attach to any running service workers.
    const { targetInfos } = await this.browser.send("Target.getTargets");
    for (const info of targetInfos.filter((t) => t.type === "service_worker" && !t.attached)) {
      try {
        const { sessionId } = await this.browser.send("Target.attachToTarget", { targetId: info.targetId, flatten: true });
        this.swSessions.add(sessionId);
        await this.browser.send("Network.enable", {}, sessionId);
      } catch { /* already attached */ }
    }
    await this.applyNetwork(this.sessionId);
    for (const sw of this.swSessions) await this.applyNetwork(sw).catch(() => null);
  }

  async goto(url) {
    await this.send("Page.navigate", { url });
    await this.waitForLoad();
  }

  async reload() {
    await this.send("Page.reload", { ignoreCache: false });
    // A navigation resets navigator.onLine emulation; apply it again.
    if (this.offline) {
      await sleep(50);
      await this.setOffline(true);
    }
    await this.waitForLoad();
  }

  async waitForLoad(timeout = 20000) {
    const start = Date.now();
    await sleep(300);
    while (Date.now() - start < timeout) {
      try {
        const state = await this.eval("document.readyState");
        if (state === "complete") return;
      } catch { /* navigating */ }
      await sleep(200);
    }
  }

  async eval(expression) {
    const result = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (result.exceptionDetails) {
      throw new Error(`eval failed: ${result.exceptionDetails.exception?.description || result.exceptionDetails.text}`);
    }
    return result.result.value;
  }

  async waitFor(expression, { timeout = 20000, label = expression } = {}) {
    const start = Date.now();
    let last;
    while (Date.now() - start < timeout) {
      try {
        last = await this.eval(expression);
        if (last) return last;
      } catch (error) {
        last = error.message;
      }
      await sleep(250);
    }
    throw new Error(`Timed out waiting for: ${label} (last: ${JSON.stringify(last)})`);
  }

  async screenshot(file) {
    const { data } = await this.send("Page.captureScreenshot", { format: "png" });
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, Buffer.from(data, "base64"));
    return file;
  }

  async setFiles(selector, files) {
    const { root } = await this.send("DOM.getDocument", { depth: -1 });
    const { nodeId } = await this.send("DOM.querySelector", { nodeId: root.nodeId, selector });
    if (!nodeId) throw new Error(`no node for ${selector}`);
    await this.send("DOM.setFileInputFiles", { nodeId, files });
  }
}

export { sleep };
