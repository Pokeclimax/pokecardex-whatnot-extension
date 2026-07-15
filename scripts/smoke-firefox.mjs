import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const webExt = join(
  process.env.APPDATA || "C:\\Users\\aline\\AppData\\Roaming",
  "npm",
  "node_modules",
  "web-ext",
  "bin",
  "web-ext.js",
);
const firefox = "C:\\Program Files\\Mozilla Firefox\\firefox.exe";
const sourceDir = join(projectRoot, "dist", "firefox");

const child = spawn(
  process.execPath,
  [
    webExt,
    "run",
    "--source-dir",
    sourceDir,
    "--firefox",
    firefox,
    "--start-url",
    "about:blank",
    "--args=-headless",
    "--no-input",
    "--no-reload",
    "--verbose",
  ],
  { cwd: projectRoot, windowsHide: true, shell: false },
);

let output = "";
child.stdout.on("data", (chunk) => { output += chunk.toString(); });
child.stderr.on("data", (chunk) => { output += chunk.toString(); });

const result = await new Promise((resolveResult, reject) => {
  const timeout = setTimeout(() => resolveResult({ timedOut: true }), 12_000);
  const poll = setInterval(() => {
    if (/Installed .*temporary add-on|Extension ID|Executing firefox|Firefox args|Running web extension/i.test(output)) {
      clearInterval(poll);
      clearTimeout(timeout);
      setTimeout(() => resolveResult({ timedOut: false }), 2_000);
    }
  }, 150);
  child.once("error", (error) => {
    clearInterval(poll);
    clearTimeout(timeout);
    reject(error);
  });
  child.once("exit", (code) => {
    if (code && !/Installed .*temporary add-on|Extension ID/i.test(output)) {
      clearInterval(poll);
      clearTimeout(timeout);
      reject(new Error(`web-ext run s’est arrêté avec le code ${code}.\n${output}`));
    }
  });
});

if (child.pid) {
  spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
    windowsHide: true,
    stdio: "ignore",
  });
}

const stayedRunning = child.exitCode === null || child.signalCode !== null;
const loaded = /Installed .*temporary add-on|Extension ID|Executing firefox|Firefox args|Running web extension/i.test(output) || stayedRunning;
if (!loaded) {
  throw new Error(`Firefox n’a pas confirmé le chargement dans le délai prévu.\n${output}`);
}

const usefulLines = output
  .split(/\r?\n/)
  .filter((line) => /Running web extension|Installed|Extension ID|Executing firefox|Firefox args/i.test(line));
console.log(JSON.stringify({ browser: "Firefox", loaded: true, ...result, evidence: usefulLines }, null, 2));
