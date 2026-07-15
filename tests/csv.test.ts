import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCsv, parseWhatnotTemplate } from "../src/csv/templateParser";
import {
  buildWhatnotRows,
  exportWhatnotCsv,
  getCommonHeaders,
  getTemplateDefaults,
} from "../src/csv/whatnotExporter";
import { WHATNOT_IMAGE_COLUMN, WHATNOT_TITLE_COLUMN } from "../src/csv/whatnotColumns";
import type { CardRecord } from "../src/shared/types";
import {
  DEFAULT_WHATNOT_SETTINGS,
  ESSENTIAL_COMMON_HEADERS,
  mergeWhatnotDefaults,
} from "../src/shared/whatnotSettings";

const rawTemplate = readFileSync(resolve(process.cwd(), "src/csv/template-whatnot.csv"), "utf8");
const template = parseWhatnotTemplate(rawTemplate);

function card(index: number, overrides: Partial<CardRecord> = {}): CardRecord {
  return {
    id: `card-${index}`,
    createdAt: index,
    name: `Carte ${index}`,
    number: `${String(index).padStart(3, "0")}/500`,
    rarity: "RARE",
    setCode: "TST",
    imageUrl: `https://pokecardex-scans.b-cdn.net/sets_fr/TST/${index}.jpg`,
    title: `Carte ${index} - RARE - ${String(index).padStart(3, "0")}/500 - TST`,
    ...overrides,
  };
}

describe("modèle et export CSV Whatnot", () => {
  it("analyse exactement le véritable modèle fourni", () => {
    expect(template.delimiter).toBe(",");
    expect(template.hasBom).toBe(false);
    expect(template.hasTemplateRow).toBe(true);
    expect(template.headers).toHaveLength(21);
    expect(template.templateRow).toHaveLength(21);
    expect(template.templateRow.slice(0, 8)).toEqual([
      "Trading Card Games",
      "Cartes Pokémon",
      "",
      "",
      "",
      "Auction",
      "1",
      "De 0 à <20\u00A0grammes",
    ]);
    expect(template.templateRow.slice(8)).toEqual(Array(13).fill(""));
    expect(template.headers[2]).toBe("Titre");
    expect(template.headers[13]).toBe("Image URL 1");
    expect(rawTemplate.endsWith("\n")).toBe(true);
  });

  it("n’affiche pas C et N dans les valeurs communes", () => {
    const headers = getCommonHeaders(template);
    expect(headers).toHaveLength(19);
    expect(headers).not.toContain(WHATNOT_TITLE_COLUMN.header);
    expect(headers).not.toContain(WHATNOT_IMAGE_COLUMN.header);
    expect(getTemplateDefaults(template)).toMatchObject({
      Catégorie: "Trading Card Games",
      "Sous-catégorie": "Cartes Pokémon",
      Type: "Auction",
      Prix: "1",
      "Profil de livraison": "De 0 à <20\u00A0grammes",
    });
  });

  it("applique les sept réglages demandés avec la casse exacte de Whatnot", () => {
    const defaults = mergeWhatnotDefaults(getTemplateDefaults(template));
    expect(ESSENTIAL_COMMON_HEADERS).toHaveLength(7);
    expect(Object.fromEntries(ESSENTIAL_COMMON_HEADERS.map((header) => [header, defaults[header]])))
      .toEqual(DEFAULT_WHATNOT_SETTINGS);
  });

  it("place le titre en C, l’image en N et conserve toutes les autres valeurs", () => {
    const values = getTemplateDefaults(template);
    values["Catégorie"] = "Cartes à collectionner";
    values["Description"] = "Carte française";
    values["Quantité"] = "1";
    values["Prix"] = "2,50";
    const rows = buildWhatnotRows(template, [card(1)], values);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveLength(21);
    expect(rows[0]?.[2]).toBe(card(1).title);
    expect(rows[0]?.[13]).toBe(card(1).imageUrl);
    expect(rows[0]?.[0]).toBe("Cartes à collectionner");
    expect(rows[0]?.[3]).toBe("Carte française");
    expect(rows[0]?.[4]).toBe("1");
    expect(rows[0]?.[6]).toBe("2,50");
    expect(rows[0]?.[20]).toBe("");
  });

  it("échappe accents, virgules, points-virgules, guillemets, apostrophes et retours à la ligne", () => {
    const tricky = card(2, {
      title: 'Évoli, dit "l’intrépide"; édition\nspéciale',
      imageUrl: "https://images.example/carte,2.jpg?x=1;y=2",
    });
    const values = getTemplateDefaults(template);
    values.Description = 'Ligne 1, "rare"; l’apostrophe\r\nLigne 2';
    const csv = exportWhatnotCsv(template, [tricky], values);
    expect(csv.startsWith("\uFEFF")).toBe(false);
    const reparsed = parseCsv(csv).rows;
    expect(reparsed).toHaveLength(2);
    expect(reparsed[1]?.[2]).toBe(tricky.title);
    expect(reparsed[1]?.[3]).toBe(values.Description);
    expect(reparsed[1]?.[13]).toBe(tricky.imageUrl);
    expect(reparsed[1]).toHaveLength(21);
  });

  it("conserve l’ordre exact des colonnes et les cellules vides", () => {
    const csv = exportWhatnotCsv(template, [card(3)], {});
    const rows = parseCsv(csv).rows;
    expect(rows[0]).toEqual(template.headers);
    expect(rows[1]).toHaveLength(template.headers.length);
    expect(rows[1]?.filter(Boolean)).toEqual([
      "Trading Card Games",
      "Cartes Pokémon",
      card(3).title,
      "Auction",
      "1",
      "De 0 à <20\u00A0grammes",
      card(3).imageUrl,
    ]);
  });

  it("exporte 500 cartes sans perte ni décalage", () => {
    const cards = Array.from({ length: 500 }, (_, index) => card(index + 1));
    const values = { ...getTemplateDefaults(template), Quantité: "1", Type: "Achetez maintenant" };
    const csv = exportWhatnotCsv(template, cards, values);
    const rows = parseCsv(csv).rows;
    expect(rows).toHaveLength(501);
    expect(rows[1]?.[2]).toBe(cards[0]?.title);
    expect(rows[500]?.[2]).toBe(cards[499]?.title);
    expect(rows[500]?.[13]).toBe(cards[499]?.imageUrl);
    expect(rows.slice(1).every((row) => row.length === 21 && row[4] === "1" && row[5] === "Achetez maintenant")).toBe(true);
  });
});
