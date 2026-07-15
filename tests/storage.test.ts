import { describe, expect, it } from "vitest";
import { createEmptyState, filterCards, migrateState } from "../src/shared/state";
import type { ExtractedCard } from "../src/shared/types";
import { DEFAULT_WHATNOT_SETTINGS } from "../src/shared/whatnotSettings";
import {
  STORAGE_KEY,
  addExtractedCard,
  ensureState,
  loadState,
  removeAllCards,
  removeCard,
  saveCardOrder,
  saveCardTitle,
  saveCsvSettings,
  type StorageDriver,
  undoLastCard,
} from "../src/storage/storageAdapter";

class MemoryDriver implements StorageDriver {
  readonly values = new Map<string, unknown>();
  async get(key: string): Promise<unknown> { return this.values.get(key); }
  async set(key: string, value: unknown): Promise<void> { this.values.set(key, structuredClone(value)); }
}

function extracted(title: string): ExtractedCard {
  return {
    name: title,
    number: "001/001",
    rarity: "RARE",
    setCode: "TST",
    imageUrl: "https://example.test/image.jpg",
    title,
  };
}

describe("stockage local versionné", () => {
  it("initialise et persiste un schéma de données simple", async () => {
    const driver = new MemoryDriver();
    expect(await ensureState(driver)).toEqual(createEmptyState());
    expect(driver.values.has(STORAGE_KEY)).toBe(true);
    await addExtractedCard(extracted("Pikachu"), driver);
    expect((await loadState(driver)).cards[0]?.title).toBe("Pikachu");
  });

  it("ajoute volontairement deux lignes pour la même carte", async () => {
    const driver = new MemoryDriver();
    await addExtractedCard(extracted("Mew"), driver);
    const state = await addExtractedCard(extracted("Mew"), driver);
    expect(state.cards).toHaveLength(2);
    expect(state.cards[0]?.id).not.toBe(state.cards[1]?.id);
  });

  it("modifie, réordonne, supprime et annule le dernier ajout", async () => {
    const driver = new MemoryDriver();
    let state = await addExtractedCard(extracted("A"), driver);
    state = await addExtractedCard(extracted("B"), driver);
    state = await addExtractedCard(extracted("C"), driver);
    const [a, b, c] = state.cards;
    state = await saveCardTitle(b!.id, "B modifiée", driver);
    expect(state.cards[1]?.title).toBe("B modifiée");
    state = await saveCardOrder([c!.id, a!.id, b!.id], driver);
    expect(state.cards.map((card) => card.title)).toEqual(["C", "A", "B modifiée"]);
    state = await undoLastCard(driver);
    expect(state.cards.map((card) => card.title)).toEqual(["A", "B modifiée"]);
    state = await removeCard(a!.id, driver);
    expect(state.cards.map((card) => card.title)).toEqual(["B modifiée"]);
  });

  it("enregistre les valeurs communes et vide uniquement la liste", async () => {
    const driver = new MemoryDriver();
    await addExtractedCard(extracted("Carte"), driver);
    let state = await saveCsvSettings({ Catégorie: "Pokémon", Quantité: "1" }, driver);
    expect(state.csvSettings).toEqual({ Catégorie: "Pokémon", Quantité: "1" });
    state = await removeAllCards(driver);
    expect(state.cards).toEqual([]);
    expect(state.csvSettings.Catégorie).toBe("Pokémon");
  });

  it("migre sans casser les données valides et ignore les entrées invalides", () => {
    const migrated = migrateState({
      schemaVersion: 99,
      revision: -8,
      cards: [
        { id: "ok", title: "Valide", name: "Valide", createdAt: 1 },
        { id: "bad", title: "" },
        null,
      ],
      csvSettings: { Prix: "3,50", Mauvais: 12 },
      lastAddedCardId: "absent",
    });
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.revision).toBe(0);
    expect(migrated.cards).toHaveLength(1);
    expect(migrated.csvSettings).toEqual({ Prix: "3,50" });
    expect(migrated.lastAddedCardId).toBeNull();
  });

  it("ajoute une seule fois les nouveaux réglages par défaut aux données version 1", () => {
    const migrated = migrateState({
      schemaVersion: 1,
      revision: 3,
      cards: [],
      csvSettings: {
        Catégorie: "",
        "Sous-catégorie": "Cartes Pokémon",
        Description: "ma description",
      },
      lastAddedCardId: null,
    });
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.csvSettings.Catégorie).toBe(DEFAULT_WHATNOT_SETTINGS.Catégorie);
    expect(migrated.csvSettings.Description).toBe("ma description");
    expect(migrated.csvSettings.Quantité).toBe("1");
  });

  it("recherche dans le titre, le numéro, la rareté et le set", () => {
    const cards = [
      { id: "1", createdAt: 1, name: "Pikachu", title: "Pikachu ex", number: "057/191", rarity: "DOUBLE RARE", setCode: "SV8", imageUrl: "" },
      { id: "2", createdAt: 2, name: "Mew", title: "Mew", number: "151/165", rarity: "RARE", setCode: "MEW", imageUrl: "" },
    ];
    expect(filterCards(cards, "057")).toHaveLength(1);
    expect(filterCards(cards, "double rare")[0]?.name).toBe("Pikachu");
    expect(filterCards(cards, "mew")).toHaveLength(1);
  });
});
