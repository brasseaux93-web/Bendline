import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import lighthouse from "lighthouse";
import { chromium } from "@playwright/test";

const TARGET_URL = process.env.LIGHTHOUSE_BASE_URL || "http://127.0.0.1:3000";
const ROUTES = ["/", "/accuracy", "/tools", "/legal/terms"];

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        const port = addr.port;
        server.close(() => resolve(port));
      } else {
        reject(new Error("Could not allocate debug port"));
      }
    });
  });
}

async function waitForPort(port, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await new Promise((resolve, reject) => {
        const sock = net.connect(port, "127.0.0.1", () => {
          sock.destroy();
          resolve();
        });
        sock.on("error", reject);
      });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error(`Timed out waiting for Chromium debugging port ${port}`);
}

async function main() {
  const port = await getFreePort();
  const exePath = chromium.executablePath();
  const userDataDir = path.join(os.tmpdir(), `bendline-lh-${Date.now()}`);

  const chromeProc = spawn(
    exePath,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
    ],
    { stdio: "ignore" }
  );

  try {
    await waitForPort(port);

    const results = [];
    for (const route of ROUTES) {
      const runnerResult = await lighthouse(`${TARGET_URL}${route}`, {
        port,
        output: "json",
        logLevel: "error",
        onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
        formFactor: "mobile",
        screenEmulation: {
          mobile: true,
          width: 412,
          height: 823,
          deviceScaleFactor: 1.75,
          disabled: false,
        },
        throttling: {
          rttMs: 150,
          throughputKbps: 1638.4,
          cpuSlowdownMultiplier: 4,
          requestLatencyMs: 150 * 3.75,
          downloadThroughputKbps: 1638.4 * 0.9,
          uploadThroughputKbps: 750 * 0.9,
        },
      });

      const lhr = runnerResult.lhr;
      results.push({
        route,
        performance: Math.round((lhr.categories.performance?.score ?? 0) * 100),
        accessibility: Math.round((lhr.categories.accessibility?.score ?? 0) * 100),
        bestPractices: Math.round((lhr.categories["best-practices"]?.score ?? 0) * 100),
        seo: Math.round((lhr.categories.seo?.score ?? 0) * 100),
        fcp: lhr.audits["first-contentful-paint"]?.displayValue,
        lcp: lhr.audits["largest-contentful-paint"]?.displayValue,
        tbt: lhr.audits["total-blocking-time"]?.displayValue,
        cls: lhr.audits["cumulative-layout-shift"]?.displayValue,
        si: lhr.audits["speed-index"]?.displayValue,
      });
    }

    console.log(JSON.stringify(results, null, 2));
  } finally {
    chromeProc.kill();
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      // Windows may briefly hold Chromium temp dir handles on exit
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
