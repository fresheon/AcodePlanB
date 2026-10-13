const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const { rspack } = require("@rspack/core");
const { chromium } = require("playwright");
(async () => {
  const repo = path.resolve(__dirname, "../..");
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "acode-startup-"));
  let browser, server;
  try {
    const [config] = require(path.join(repo, "rspack.config.js"))({}, { mode: "development" });
    config.entry = { before: path.join(__dirname, "fixtures/startupBeforeProfilesFix.js") };
    config.output = { ...config.output, path: temporary, publicPath: "/before/" };
    await new Promise((resolve, reject) => {
      const compiler = rspack(config);
      compiler.run((error, stats) => compiler.close(() => error || stats.hasErrors() ? reject(error || new Error(stats.toString())) : resolve()));
    });
    server = http.createServer((req, res) => {
      if (req.url === "/") { res.setHeader("Content-Type", "text/html"); res.end('<html><body><wc-page id="root"></wc-page></body></html>'); return; }
      const target = req.url.startsWith("/before/") ? path.join(temporary, req.url.slice(8)) : path.join(repo, "www", req.url.split("?")[0]);
      if (!fs.existsSync(target) || !fs.statSync(target).isFile()) { res.writeHead(404); res.end(); return; }
      res.setHeader("Content-Type", target.endsWith(".js") ? "application/javascript" : target.endsWith(".css") ? "text/css" : "text/html");
      res.end(fs.readFileSync(target));
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true, args: ["--no-sandbox"] });
    async function load(script) {
      const page = await browser.newPage();
      const errors = []; page.on("pageerror", error => errors.push(error.message));
      await page.goto(origin);
      await page.evaluate(() => {
        window.device = { platform: "Android" }; window.readyListeners = 0;
        window.cordova = { require: () => () => {}, exec: () => {}, plugins: {}, platformId: "android" };
        const add = document.addEventListener.bind(document);
        document.addEventListener = (name, ...args) => { if (name === "deviceready") window.readyListeners++; return add(name, ...args); };
      });
      await page.addScriptTag({ url: `${origin}${script}` });
      await page.waitForTimeout(100);
      const listeners = await page.evaluate(() => window.readyListeners);
      await page.close(); return { errors, listeners };
    }
    const before = await load("/before/before.js");
    assert(before.errors.some(error => /undefined.*\bon\b/.test(error)), JSON.stringify(before));
    const after = await load("/build/main.js");
    assert.deepEqual(after.errors, []); assert.equal(after.listeners, 1);
    console.log("Startup entry regression passed: previous eager import reproduces undefined.on; actual fixed main.js evaluates without error and registers deviceready.");
  } finally {
    await browser?.close(); await new Promise(resolve => server ? server.close(resolve) : resolve());
    fs.rmSync(temporary, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
