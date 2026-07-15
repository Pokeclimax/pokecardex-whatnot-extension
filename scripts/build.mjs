import { build } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = join(projectRoot, "dist");
const releaseRoot = join(projectRoot, "release");

function assertInsideProject(target) {
  const rel = relative(projectRoot, resolve(target));
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`Chemin de build non autorisé: ${target}`);
  }
}

async function resetDirectory(target) {
  assertInsideProject(target);
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
}

const sharedManifest = {
  manifest_version: 3,
  name: "Pokecardex → CSV Whatnot",
  version: "1.1.0",
  description: "Ajoute des cartes Pokecardex à une liste locale et exporte le CSV Whatnot.",
  permissions: ["storage"],
  host_permissions: ["https://www.pokecardex.com/*"],
  icons: {
    16: "assets/icon-16.png",
    32: "assets/icon-32.png",
    48: "assets/icon-48.png",
    128: "assets/icon-128.png",
  },
  action: {
    default_title: "Pokecardex vers Whatnot",
    default_popup: "popup.html",
    default_icon: {
      16: "assets/icon-16.png",
      32: "assets/icon-32.png",
      48: "assets/icon-48.png",
      128: "assets/icon-128.png",
    },
  },
  content_scripts: [
    {
      matches: ["https://www.pokecardex.com/*"],
      js: ["content.js"],
      css: ["content.css"],
      run_at: "document_idle",
    },
  ],
  content_security_policy: {
    extension_pages:
      "script-src 'self'; object-src 'self'; img-src 'self' data: https://pokecardex-scans.b-cdn.net https://www.pokecardex.com;",
  },
};

const variants = [
  {
    name: "chrome-edge",
    target: ["chrome114"],
    manifest: {
      ...sharedManifest,
      background: { service_worker: "background.js" },
    },
  },
  {
    name: "firefox",
    target: ["firefox115"],
    manifest: {
      ...sharedManifest,
      background: { scripts: ["background.js"] },
      browser_specific_settings: {
        gecko: {
          id: "pokecardex-whatnot@local.kyky",
          strict_min_version: "140.0",
          data_collection_permissions: {
            required: ["none"],
          },
        },
        gecko_android: {
          strict_min_version: "142.0",
        },
      },
    },
  },
];

await mkdir(releaseRoot, { recursive: true });

for (const variant of variants) {
  const outdir = join(distRoot, variant.name);
  await resetDirectory(outdir);

  await build({
    absWorkingDir: projectRoot,
    entryPoints: {
      content: "src/content/pokecardex.ts",
      background: "src/background.ts",
      list: "src/interface/list.ts",
      popup: "src/interface/popup.ts",
    },
    outdir,
    bundle: true,
    format: "iife",
    platform: "browser",
    target: variant.target,
    minify: true,
    sourcemap: false,
    charset: "utf8",
    legalComments: "none",
  });

  await cp(join(projectRoot, "src/content/content.css"), join(outdir, "content.css"));
  await cp(join(projectRoot, "src/interface/list.html"), join(outdir, "list.html"));
  await cp(join(projectRoot, "src/interface/list.css"), join(outdir, "list.css"));
  await cp(join(projectRoot, "src/interface/popup.html"), join(outdir, "popup.html"));
  await cp(join(projectRoot, "src/interface/popup.css"), join(outdir, "popup.css"));
  await mkdir(join(outdir, "assets"), { recursive: true });
  await cp(
    join(projectRoot, "src/csv/template-whatnot.csv"),
    join(outdir, "assets/template-whatnot.csv"),
  );
  await cp(
    join(projectRoot, "src/data/whatnot-values.json"),
    join(outdir, "assets/whatnot-values.json"),
  );
  for (const size of [16, 32, 48, 64, 128]) {
    await cp(
      join(projectRoot, `src/assets/icon-${size}.png`),
      join(outdir, `assets/icon-${size}.png`),
    );
  }
  await writeFile(
    join(outdir, "manifest.json"),
    `${JSON.stringify(variant.manifest, null, 2)}\n`,
    "utf8",
  );
}

const template = await readFile(join(projectRoot, "src/csv/template-whatnot.csv"), "utf8");
if (
  !template.startsWith("Catégorie,Sous-catégorie,Titre,Description,Quantité,Type,Prix,Profil de livraison") ||
  !template.includes("Trading Card Games,Cartes Pokémon")
) {
  throw new Error("Le modèle CSV embarqué ne correspond plus au fichier source analysé.");
}

await cp(
  join(projectRoot, "src/guide/GUIDE-INSTALLATION.html"),
  join(releaseRoot, "GUIDE-INSTALLATION.html"),
);

console.log("Build Chrome/Edge et Firefox terminé.");
