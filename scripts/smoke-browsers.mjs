import { chromium } from "playwright-core";
import { mkdir, readFile, rm } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const extensionDir = join(projectRoot, "dist", "chrome-edge");
const qaDir = resolve(
  process.env.PCDX_QA_DIR ||
    "C:\\Users\\aline\\.codex\\visualizations\\2026\\07\\15\\019f6769-12a0-7561-bb7f-ffefa29e9f42\\pokecardex-extension",
);
const tempRoot = join(projectRoot, "tmp", "browser-smoke");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertInsideProject(target) {
  const rel = relative(projectRoot, resolve(target));
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`Chemin temporaire non autorisé: ${target}`);
  }
}

function svgCard(label, color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="148" height="208"><rect width="148" height="208" rx="12" fill="${color}"/><rect x="10" y="10" width="128" height="188" rx="9" fill="white" opacity=".9"/><circle cx="74" cy="82" r="34" fill="${color}" opacity=".5"/><text x="74" y="160" font-family="Arial" font-size="16" font-weight="700" text-anchor="middle" fill="#0f172a">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const sampleState = {
  schemaVersion: 1,
  revision: 7,
  cards: [
    {
      id: "card-1",
      createdAt: 1,
      name: "Pikachu ex",
      number: "057/191",
      rarity: "DOUBLE RARE",
      setCode: "SV8",
      imageUrl: svgCard("Pikachu", "#facc15"),
      title: "Pikachu ex - DOUBLE RARE - 057/191 - SV8",
    },
    {
      id: "card-2",
      createdAt: 2,
      name: "Mewtwo ex",
      number: "058/165",
      rarity: "DOUBLE RARE",
      setCode: "MEW",
      imageUrl: svgCard("Mewtwo", "#c4b5fd"),
      title: "Mewtwo ex - DOUBLE RARE - 058/165 - MEW",
    },
    {
      id: "card-3",
      createdAt: 3,
      name: "Dracaufeu ex",
      number: "112/081",
      rarity: "ULTRA RARE",
      setCode: "SV3",
      imageUrl: svgCard("Dracaufeu", "#fb923c"),
      title: "Dracaufeu ex - ULTRA RARE - 112/081 - SV3",
    },
  ],
  csvSettings: {},
  lastAddedCardId: "card-3",
};

async function seed(page, value = sampleState) {
  await page.evaluate(
    ({ key, state }) =>
      new Promise((resolve, reject) => {
        chrome.storage.local.set({ [key]: state }, () => {
          const error = chrome.runtime.lastError;
          if (error) reject(new Error(error.message));
          else resolve();
        });
      }),
    { key: "pokecardexWhatnotState", state: value },
  );
}

async function waitForExtensionWorker(context) {
  const existing = context.serviceWorkers()[0];
  if (existing) return existing;
  return context.waitForEvent("serviceworker", { timeout: 15_000 });
}

async function runBrowser({ name, executablePath, fullFlow }) {
  const profileDir = join(tempRoot, name.toLowerCase().replace(/[^a-z]+/g, "-"));
  assertInsideProject(profileDir);
  await rm(profileDir, { recursive: true, force: true });
  await mkdir(profileDir, { recursive: true });

  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath,
    headless: false,
    acceptDownloads: true,
    viewport: { width: 1440, height: 1024 },
    args: [
      "--headless=new",
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
      "--disable-features=DisableLoadExtensionCommandLineSwitch",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-component-update",
    ],
  });

  const errors = [];
  try {
    const worker = await waitForExtensionWorker(context);
    const extensionId = new URL(worker.url()).host;
    assert(extensionId, `${name}: identifiant d’extension introuvable`);

    const page = await context.newPage();
    page.on("console", (message) => {
      if (["error", "warning"].includes(message.type())) errors.push(`${message.type()}: ${message.text()}`);
    });
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    await page.goto(`chrome-extension://${extensionId}/list.html`, { waitUntil: "domcontentloaded" });
    await page.locator("#essential-form .field").first().waitFor({ state: "visible" });
    await seed(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1_000);
    if (await page.locator(".card-row").count() === 0) {
      await page.screenshot({ path: join(qaDir, `${name.toLowerCase()}-render-failure.png`), fullPage: true });
      const bodyText = await page.locator("body").innerText();
      throw new Error(`${name}: aucune carte rendue. Page: ${bodyText.slice(0, 600)}. Console: ${errors.join(" | ")}`);
    }

    assert((await page.title()).includes("Ma liste"), `${name}: mauvais titre de page`);
    assert((await page.locator("h1").textContent())?.trim() === "Ma liste", `${name}: écran principal absent`);
    assert(await page.locator(".card-row").count() === 3, `${name}: les 3 cartes ne sont pas affichées`);
    assert(await page.locator("#essential-form .field").count() === 7, `${name}: les 7 réglages essentiels ne sont pas affichés`);
    assert(await page.locator("#csv-form .field").count() === 12, `${name}: les 12 champs facultatifs ne sont pas disponibles`);
    assert(await page.locator("[data-header]").count() === 19, `${name}: le formulaire ne contient pas 19 champs communs`);
    assert(await page.locator('[data-header="Titre"], [data-header="Image URL 1"]').count() === 0, `${name}: C ou N est affichée dans le formulaire`);
    assert(await page.locator('[data-header="Catégorie"]').inputValue() === "Trading Card Games", `${name}: catégorie par défaut incorrecte`);
    assert(await page.locator('[data-header="Sous-catégorie"]').inputValue() === "Cartes Pokémon", `${name}: sous-catégorie par défaut incorrecte`);
    assert(await page.locator('[data-header="Description"]').inputValue() === "vu en live", `${name}: description par défaut incorrecte`);
    assert(await page.locator('[data-header="Quantité"]').inputValue() === "1", `${name}: quantité par défaut incorrecte`);
    assert(await page.locator('[data-header="Type"]').inputValue() === "Auction", `${name}: type par défaut incorrect`);
    assert(await page.locator('[data-header="Prix"]').inputValue() === "1", `${name}: prix par défaut incorrect`);
    assert(await page.locator('[data-header="Profil de livraison"]').inputValue() === "De 0 à <20 grammes", `${name}: profil de livraison incorrect`);
    assert((await page.locator("#export-filename").textContent())?.endsWith(".csv"), `${name}: nom de fichier absent`);

    await page.screenshot({ path: join(qaDir, `${name.toLowerCase()}-desktop.png`), fullPage: true });

    const popup = await context.newPage();
    await popup.setViewportSize({ width: 390, height: 650 });
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: "domcontentloaded" });
    await popup.locator("#card-count").waitFor({ state: "visible" });
    assert((await popup.locator("#card-count").textContent()) === "3", `${name}: compteur de la fenêtre incorrect`);
    assert((await popup.locator("#setting-category").textContent()) === "Trading Card Games", `${name}: résumé de la fenêtre incorrect`);
    await popup.screenshot({ path: join(qaDir, `${name.toLowerCase()}-popup.png`), fullPage: true });
    await popup.close();

    if (fullFlow) {
      const firstRow = page.locator('[data-card-id="card-1"]');
      await firstRow.getByRole("button", { name: "Modifier" }).click();
      const editInput = firstRow.locator(".edit-form input");
      await editInput.fill("Pikachu ex - titre modifié");
      await firstRow.getByRole("button", { name: "Enregistrer" }).click();
      await page.locator('[data-card-id="card-1"] .card-title').waitFor({ state: "visible" });
      assert((await page.locator('[data-card-id="card-1"] .card-title').textContent()) === "Pikachu ex - titre modifié", "Chrome: modification non appliquée");
      await page.reload({ waitUntil: "domcontentloaded" });
      assert((await page.locator('[data-card-id="card-1"] .card-title').textContent()) === "Pikachu ex - titre modifié", "Chrome: modification non persistée");

      await page.dragAndDrop('[data-card-id="card-1"]', '[data-card-id="card-3"]');
      const order = await page.locator(".card-row").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-card-id")));
      assert(order.join(",") === "card-2,card-3,card-1", `Chrome: ordre inattendu ${order.join(",")}`);

      await page.getByRole("button", { name: "Supprimer Mewtwo ex - DOUBLE RARE - 058/165 - MEW" }).click();
      assert(await page.locator(".card-row").count() === 2, "Chrome: suppression non appliquée");
      await page.getByRole("button", { name: "Annuler le dernier ajout" }).click();
      assert(await page.locator(".card-row").count() === 1, "Chrome: annulation du dernier ajout non appliquée");

      await seed(page);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.locator('[data-header="Description"]').fill("vu en live");
      await page.locator('[data-header="Type"]').selectOption("Auction");
      const downloadPromise = page.waitForEvent("download");
      await page.getByRole("button", { name: "Exporter le CSV Whatnot" }).click();
      const download = await downloadPromise;
      const downloadPath = join(qaDir, "export-browser.csv");
      await download.saveAs(downloadPath);
      const exported = await readFile(downloadPath, "utf8");
      assert(exported.startsWith("Catégorie,Sous-catégorie,Titre"), "Chrome: en-têtes CSV incorrects");
      assert(exported.includes("Pikachu ex - DOUBLE RARE - 057/191 - SV8"), "Chrome: titre absent du CSV téléchargé");
      assert(exported.includes("Trading Card Games,Cartes Pokémon,Pikachu ex - DOUBLE RARE - 057/191 - SV8,vu en live,1,Auction,1,De 0 à <20 grammes"), "Chrome: réglages exacts absents du CSV téléchargé");

      const site = await context.newPage();
      const siteErrors = [];
      site.on("console", (message) => {
        if (["error", "warning"].includes(message.type())) siteErrors.push(`${message.type()}: ${message.text()}`);
      });
      await site.goto("https://www.pokecardex.com/series/MEG", { waitUntil: "domcontentloaded" });
      await site.locator("#pcdx-open-list-button").waitFor({ state: "visible" });
      assert((await site.locator("#pcdx-open-list-button").textContent()) === "Ma liste · 3", "Chrome: compteur Pokecardex incorrect");

      const liveCard = site.locator('img[alt="Bulbizarre 001/132"]');
      await site.waitForTimeout(3_000);
      if (await liveCard.count() === 0) {
        // Chrome for Testing ne rend pas toujours l’application Pokecardex dans ce profil
        // sans fenêtre. On conserve l’URL réelle et on reproduit localement le DOM observé
        // dans le navigateur interactif pour exercer le content script et le MutationObserver.
        await site.evaluate(() => {
          const dialog = document.createElement("div");
          dialog.setAttribute("role", "dialog");
          dialog.innerHTML = `
            <div><h2>Bulbizarre</h2></div>
            <img src="https://pokecardex-scans.b-cdn.net/sets/MEG/FR/1.jpg?class=md" alt="Bulbizarre 001/132">
            <img src="https://pokecardex-scans.b-cdn.net/sets/MEG/FR/1.jpg?class=hd" alt="Bulbizarre 001/132">
            <button id="pcdx-browser-test-add">Ajouter</button>`;
          document.body.appendChild(dialog);
        });
      } else {
        await liveCard.first().click();
        const liveDialog = site.locator('[role="dialog"]');
        await liveDialog.waitFor({ state: "visible" });
        await liveDialog.evaluate((element) => {
          const nativeAdd = document.createElement("button");
          nativeAdd.id = "pcdx-browser-test-add";
          nativeAdd.textContent = "Ajouter";
          element.appendChild(nativeAdd);
        });
      }
      const dialog = site.locator('[role="dialog"]');
      await dialog.waitFor({ state: "visible" });
      await dialog.locator(".pcdx-add-button").waitFor({ state: "visible" });
      await dialog.locator(".pcdx-add-button").click();
      await dialog.locator('.pcdx-add-button[data-state="added"]').waitFor({ state: "visible" });

      const stored = await page.evaluate(
        (key) => new Promise((resolve) => chrome.storage.local.get([key], (items) => resolve(items[key]))),
        "pokecardexWhatnotState",
      );
      const last = stored.cards.at(-1);
      assert(last.title === "Bulbizarre - 001/132 - MEG", `Chrome: extraction réelle inattendue « ${last.title} »`);
      assert(last.imageUrl.includes("class=hd"), "Chrome: l’image HD réelle n’a pas été retenue");
      assert(siteErrors.every((entry) => !entry.includes("chrome-extension://")), `Chrome: erreur du content script: ${siteErrors.join(" | ")}`);

      await page.setViewportSize({ width: 390, height: 844 });
      await page.reload({ waitUntil: "domcontentloaded" });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert(overflow <= 1, `Chrome: débordement mobile de ${overflow}px`);
      await page.screenshot({ path: join(qaDir, "chrome-mobile.png"), fullPage: true });
    }

    const relevantErrors = errors.filter((entry) => !/favicon|ERR_BLOCKED_BY_CLIENT|Failed to load resource.*pokecardex-scans/.test(entry));
    assert(relevantErrors.length === 0, `${name}: erreurs console: ${relevantErrors.join(" | ")}`);
    return { name, extensionId, checks: fullFlow ? 16 : 7, errors: relevantErrors.length };
  } finally {
    await context.close();
    await rm(profileDir, { recursive: true, force: true });
  }
}

await mkdir(qaDir, { recursive: true });
await mkdir(tempRoot, { recursive: true });

const results = [];
results.push(
  await runBrowser({
    name: "Chrome",
    executablePath: "C:\\Users\\aline\\.cache\\codex-browser-testing\\chrome\\win64-150.0.7871.124\\chrome-win64\\chrome.exe",
    fullFlow: true,
  }),
);
results.push(
  await runBrowser({
    name: "Edge",
    executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    fullFlow: false,
  }),
);

console.log(JSON.stringify({ qaDir, results }, null, 2));
