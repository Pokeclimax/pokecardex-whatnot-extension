import { describe, expect, it, vi } from "vitest";
import { installPokecardexContent, type ContentDependencies } from "../src/content/injectButton";
import { createEmptyState } from "../src/shared/state";
import type { ExtensionState } from "../src/shared/types";

function modal(name: string, number: string): string {
  return `
    <section role="dialog">
      <button aria-label="Fermer">×</button>
      <header><h2>${name} - ${number}</h2></header>
      <img src="https://pokecardex-scans.b-cdn.net/sets_fr/MEW/cartes/${number}.jpg?class=hd" alt="${name} - ${number}">
      <button>Ajouter</button>
    </section>`;
}

function dependencies(overrides: Partial<ContentDependencies> = {}): ContentDependencies {
  return {
    addCard: vi.fn(async () => ({ ...createEmptyState(), revision: 1, cards: [] })),
    loadState: vi.fn(async () => createEmptyState()),
    subscribe: vi.fn(() => () => undefined),
    openList: vi.fn(),
    ...overrides,
  };
}

describe("injection sur Pokecardex", () => {
  it("injecte un bouton unique près de chaque bouton Ajouter", () => {
    document.body.innerHTML = modal("Pikachu", "025/165") + modal("Mew", "151/165");
    const cleanup = installPokecardexContent(dependencies());
    expect(document.querySelectorAll(".pcdx-add-button")).toHaveLength(2);
    expect(document.querySelectorAll("#pcdx-open-list-button")).toHaveLength(1);
    cleanup();
  });

  it("injecte dans une fenêtre ajoutée dynamiquement avec debounce", async () => {
    vi.useFakeTimers();
    const cleanup = installPokecardexContent(dependencies());
    document.body.insertAdjacentHTML("beforeend", modal("Dracaufeu", "006/165"));
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(120);
    expect(document.querySelectorAll(".pcdx-add-button")).toHaveLength(1);
    cleanup();
    vi.useRealTimers();
  });

  it("bloque uniquement le double clic accidentel puis revient à l’état initial", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = modal("Pikachu", "025/165");
    let resolveAdd!: (state: ExtensionState) => void;
    const addCard = vi.fn(
      () => new Promise<ExtensionState>((resolve) => { resolveAdd = resolve; }),
    );
    const cleanup = installPokecardexContent(dependencies({ addCard }));
    const button = document.querySelector<HTMLButtonElement>(".pcdx-add-button")!;
    button.click();
    button.click();
    expect(addCard).toHaveBeenCalledTimes(1);
    expect(button.textContent).toBe("Ajout…");

    resolveAdd({ ...createEmptyState(), revision: 1, cards: [{
      id: "1",
      createdAt: 1,
      name: "Pikachu",
      number: "025/165",
      rarity: "",
      setCode: "MEW",
      imageUrl: "image",
      title: "Pikachu - 025/165 - MEW",
    }], lastAddedCardId: "1" });
    await Promise.resolve();
    await Promise.resolve();
    expect(button.textContent).toBe("Ajouté ✓");
    await vi.advanceTimersByTimeAsync(1_400);
    expect(button.textContent).toBe("Ajouter à ma liste");
    expect(button.disabled).toBe(false);
    cleanup();
    vi.useRealTimers();
  });

  it("met à jour le compteur permanent et ouvre la liste", async () => {
    let subscriber: ((state: ExtensionState) => void) | undefined;
    const openList = vi.fn();
    const deps = dependencies({
      openList,
      loadState: async () => ({ ...createEmptyState(), cards: [], revision: 1 }),
      subscribe: (listener) => {
        subscriber = listener;
        return () => undefined;
      },
    });
    const cleanup = installPokecardexContent(deps);
    await Promise.resolve();
    const listButton = document.querySelector<HTMLButtonElement>("#pcdx-open-list-button")!;
    expect(listButton.textContent).toBe("Ma liste · 0");
    subscriber?.({ ...createEmptyState(), revision: 2, cards: Array.from({ length: 12 }, (_, index) => ({
      id: String(index), createdAt: index, name: "Carte", number: "", rarity: "", setCode: "", imageUrl: "", title: `Carte ${index}`,
    })) });
    expect(listButton.textContent).toBe("Ma liste · 12");
    listButton.click();
    expect(openList).toHaveBeenCalledOnce();
    cleanup();
  });
});
