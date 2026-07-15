import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");

function manifest(variant: "chrome-edge" | "firefox"): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(root, "dist", variant, "manifest.json"), "utf8"));
}

describe("build de l’extension", () => {
  it.each(["chrome-edge", "firefox"] as const)("contient uniquement les fichiers nécessaires pour %s", (variant) => {
    for (const file of [
      "manifest.json",
      "background.js",
      "content.js",
      "content.css",
      "list.html",
      "list.js",
      "list.css",
      "popup.html",
      "popup.js",
      "popup.css",
      "assets/template-whatnot.csv",
      "assets/whatnot-values.json",
      "assets/icon-16.png",
      "assets/icon-128.png",
    ]) {
      expect(existsSync(resolve(root, "dist", variant, file))).toBe(true);
    }
  });

  it("produit un manifeste Chromium V3 aux permissions minimales", () => {
    const value = manifest("chrome-edge") as {
      manifest_version: number;
      permissions: string[];
      host_permissions: string[];
      background: Record<string, unknown>;
      content_scripts: Array<{ matches: string[] }>;
      action: { default_popup: string };
      version: string;
    };
    expect(value.manifest_version).toBe(3);
    expect(value.permissions).toEqual(["storage"]);
    expect(value.host_permissions).toEqual(["https://www.pokecardex.com/*"]);
    expect(value.content_scripts[0]?.matches).toEqual(["https://www.pokecardex.com/*"]);
    expect(value.background).toEqual({ service_worker: "background.js" });
    expect(value.action.default_popup).toBe("popup.html");
    expect(value.version).toBe("1.1.0");
  });

  it("produit un manifeste Firefox V3 avec identifiant stable", () => {
    const value = manifest("firefox") as {
      manifest_version: number;
      permissions: string[];
      host_permissions: string[];
      background: Record<string, unknown>;
      browser_specific_settings: {
        gecko: {
          id: string;
          strict_min_version: string;
          data_collection_permissions: { required: string[] };
        };
        gecko_android: { strict_min_version: string };
      };
    };
    expect(value.manifest_version).toBe(3);
    expect(value.permissions).toEqual(["storage"]);
    expect(value.host_permissions).toEqual(["https://www.pokecardex.com/*"]);
    expect(value.background).toEqual({ scripts: ["background.js"] });
    expect(value.browser_specific_settings.gecko.id).toBe("pokecardex-whatnot@local.kyky");
    expect(value.browser_specific_settings.gecko.strict_min_version).toBe("140.0");
    expect(value.browser_specific_settings.gecko_android.strict_min_version).toBe("142.0");
    expect(value.browser_specific_settings.gecko.data_collection_permissions).toEqual({
      required: ["none"],
    });
  });

  it("n’embarque plus Tampermonkey, Google Apps Script, token ni code distant", () => {
    for (const variant of ["chrome-edge", "firefox"]) {
      const content = readFileSync(resolve(root, "dist", variant, "content.js"), "utf8");
      const background = readFileSync(resolve(root, "dist", variant, "background.js"), "utf8");
      const combined = `${content}\n${background}`;
      expect(combined).not.toMatch(/GM_xmlhttpRequest|script\.google\.com|googleusercontent|AKfy|\bkyky\b/);
      expect(combined).not.toMatch(/https?:\/\/.*\.js/);
    }
  });
});
