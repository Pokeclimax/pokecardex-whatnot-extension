import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import webExt from "web-ext";
import { JwtApiAuth, signAddon } from "web-ext/util/submit-addon";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const sourceDirectory = path.join(projectRoot, "dist", "firefox");
const releaseDirectory = path.join(projectRoot, "release");
const signingDirectory = path.join(projectRoot, "tmp", "mozilla-signed");
const finalXpi = path.join(releaseDirectory, "extension-firefox-signed.xpi");
const manifestPath = path.join(sourceDirectory, "manifest.json");
const savedIdPath = path.join(sourceDirectory, ".web-extension-id");
const savedUploadUuidPath = path.join(sourceDirectory, ".amo-upload-uuid");
const apiBaseUrl = "https://addons.mozilla.org/api/v5/";

const apiKey = process.env.WEB_EXT_API_KEY;
const apiSecret = process.env.WEB_EXT_API_SECRET;

if (!apiKey || !apiSecret) {
  throw new Error(
    "Définissez WEB_EXT_API_KEY et WEB_EXT_API_SECRET dans l’environnement.",
  );
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const addonId = manifest.browser_specific_settings?.gecko?.id;

if (!addonId) {
  throw new Error("Le manifeste Firefox ne contient pas d’identifiant Gecko.");
}

class ShortLivedJwtApiAuth extends JwtApiAuth {
  constructor(options) {
    // L’API AMO refuse désormais les JWT de cinq minutes utilisés par défaut
    // par web-ext. Un jeton frais de 45 secondes est créé pour chaque requête.
    super({ ...options, apiJwtExpiresIn: 45 });
  }
}

const auth = new ShortLivedJwtApiAuth({ apiKey, apiSecret });

async function authenticatedFetch(url, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", await auth.getAuthHeader());
  headers.set("Accept", headers.get("Accept") || "application/json");
  headers.set("User-Agent", `pokecardex-whatnot-extension/${manifest.version}`);
  return fetch(url, { ...init, headers });
}

async function findCurrentVersion() {
  const encodedId = encodeURIComponent(addonId);
  const url = new URL(
    `addons/addon/${encodedId}/versions/?filter=all_with_unlisted&page_size=50`,
    apiBaseUrl,
  );
  const response = await authenticatedFetch(url);

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Lecture de la soumission Mozilla impossible (${response.status}).`);
  }

  const payload = await response.json();
  return payload.results?.find((entry) => entry.version === manifest.version) ?? null;
}

async function savePublicVersion(version) {
  const file = version?.file;
  if (file?.status !== "public" || !file.url) return false;

  const response = await authenticatedFetch(file.url, {
    headers: { Accept: "application/x-xpinstall,application/zip" },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Téléchargement du XPI signé impossible (${response.status}).`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  const actualHash = createHash("sha256").update(bytes).digest("hex");
  const expectedHash = String(file.hash ?? "").replace(/^sha256:/, "");

  if (expectedHash && actualHash !== expectedHash) {
    throw new Error("L’empreinte SHA-256 du XPI signé ne correspond pas à Mozilla.");
  }

  await mkdir(releaseDirectory, { recursive: true });
  await writeFile(finalXpi, bytes);
  await rm(savedUploadUuidPath, { force: true });
  console.log(`XPI signé créé : ${finalXpi}`);
  console.log(`SHA-256 : ${actualHash}`);
  return true;
}

const existingVersion = await findCurrentVersion();
if (await savePublicVersion(existingVersion)) {
  process.exit(0);
}

if (existingVersion) {
  throw new Error(
    `La version ${manifest.version} existe déjà chez Mozilla mais n’est pas encore publique. ` +
      "Attendez son approbation, puis relancez cette commande.",
  );
}

await rm(signingDirectory, { recursive: true, force: true });
await mkdir(signingDirectory, { recursive: true });
await mkdir(releaseDirectory, { recursive: true });

const buildResult = await webExt.cmd.build({
  sourceDir: sourceDirectory,
  artifactsDir: signingDirectory,
  filename: "extension-firefox-upload.xpi",
  overwriteDest: true,
  showReadyMessage: false,
});

const result = await signAddon({
  apiKey,
  apiSecret,
  amoBaseUrl: apiBaseUrl,
  id: addonId,
  xpiPath: buildResult.extensionPath,
  downloadDir: signingDirectory,
  channel: "unlisted",
  savedIdPath,
  savedUploadUuidPath,
  validationCheckTimeout: 5 * 60 * 1000,
  approvalCheckTimeout: 15 * 60 * 1000,
  userAgentString: `pokecardex-whatnot-extension/${manifest.version} web-ext/10.5.0`,
  ApiAuthClass: ShortLivedJwtApiAuth,
});

const downloadedFiles = result?.downloadedFiles ?? [];
let signedFilename = downloadedFiles.find((filename) => filename.endsWith(".xpi"));

if (!signedFilename) {
  const artifacts = await readdir(signingDirectory);
  signedFilename = artifacts.find(
    (filename) => filename.endsWith(".xpi") && filename !== "extension-firefox-upload.xpi",
  );
}

if (!signedFilename) {
  throw new Error("Mozilla n’a renvoyé aucun XPI signé.");
}

await copyFile(path.join(signingDirectory, signedFilename), finalXpi);
await rm(savedUploadUuidPath, { force: true });
console.log(`XPI signé créé : ${finalXpi}`);
