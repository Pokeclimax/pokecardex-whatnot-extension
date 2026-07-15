import { describe, expect, it } from "vitest";
import {
  buildCardTitle,
  extractCard,
  formatSetCode,
  getCardScanImg,
  normalizeRarity,
} from "../src/extraction/cardExtractor";

function mount(html: string): HTMLButtonElement {
  document.body.innerHTML = html;
  const button = document.querySelector<HTMLButtonElement>("button[data-add]");
  if (!button) throw new Error("Bouton Ajouter absent du test");
  return button;
}

function dialog({
  name,
  number,
  rarity = "Double rare",
  set = "SV8",
  language = "fr",
  imageQuery = "?class=hd",
}: {
  name: string;
  number: string;
  rarity?: string;
  set?: string;
  language?: string;
  imageQuery?: string;
}): string {
  return `
    <section role="dialog">
      <button aria-label="Fermer">×</button>
      <header>
        <h2><button>${name}</button> - ${number}</h2>
        <img src="https://www.pokecardex.com/assets/images/rarete/ids/rarete_2.png" alt="${rarity}">
      </header>
      <img src="https://pokecardex-scans.b-cdn.net/sets_${language}/${set}/cartes/001.jpg${imageQuery}" alt="${name} - ${number}">
      <button data-add>Ajouter</button>
    </section>`;
}

describe("extracteur Pokecardex conservé", () => {
  it("extrait une carte française et construit le titre complet", () => {
    const add = mount(dialog({ name: "Pikachu ex", number: "057/191", set: "SV8" }));
    expect(extractCard(add)).toEqual({
      name: "Pikachu ex",
      number: "057/191",
      rarity: "DOUBLE RARE",
      setCode: "SV8",
      imageUrl: "https://pokecardex-scans.b-cdn.net/sets_fr/SV8/cartes/001.jpg?class=hd",
      title: "Pikachu ex - DOUBLE RARE - 057/191 - SV8",
    });
  });

  it.each([
    ["001/PCG-P", "PCGP", "PCG-P"],
    ["001/SV-P", "SVP", "SV-P"],
    ["001/XY-P", "XYP", "XY-P"],
  ])("gère la promo japonaise %s", (number, pathSet, expectedSet) => {
    const add = mount(
      dialog({
        name: "ピカチュウ",
        number,
        rarity: "Inexistante",
        set: pathSet,
        language: "jp",
      }),
    );
    const card = extractCard(add);
    expect(card.name).toBe("ピカチュウ");
    expect(card.number).toBe(number);
    expect(card.rarity).toBe("");
    expect(card.setCode).toBe(expectedSet);
    expect(card.title).toBe(`ピカチュウ - ${number} - ${expectedSet}`);
  });

  it.each(["112/081", "026/081"])("conserve le numéro classique %s", (number) => {
    const add = mount(dialog({ name: "Dracaufeu", number, set: "M2" }));
    expect(extractCard(add).number).toBe(number);
  });

  it("transforme UPC en Promo non numérotée", () => {
    const add = mount(dialog({ name: "Évoli", number: "001/001", set: "UPC" }));
    expect(extractCard(add).setCode).toBe("Promo non numérotée");
  });

  it("ignore les raretés absentes ou indiquées comme inexistantes", () => {
    expect(normalizeRarity("Sans rareté")).toBe("");
    expect(normalizeRarity("Aucune rareté")).toBe("");
    expect(normalizeRarity("Non existante")).toBe("");
    expect(normalizeRarity("No rarity")).toBe("");
    expect(normalizeRarity("Ultra rare")).toBe("ULTRA RARE");
  });

  it("préfère l’image HD parmi plusieurs images", () => {
    const add = mount(`
      <section role="dialog">
        <button aria-label="Fermer">×</button>
        <header><h2>Carapuce - 026/081</h2></header>
        <img src="https://pokecardex-scans.b-cdn.net/sets_fr/MEW/cartes/placeholder.png" alt="placeholder">
        <img id="large" src="https://pokecardex-scans.b-cdn.net/sets_fr/MEW/cartes/026.jpg" alt="Carapuce - 026/081">
        <img id="hd" src="https://pokecardex-scans.b-cdn.net/sets_fr/MEW/cartes/026.jpg?class=hd" alt="Carapuce - 026/081" style="display:none">
        <button data-add>Ajouter</button>
      </section>`);
    expect(getCardScanImg(add.closest("section")!)?.id).toBe("hd");
    expect(extractCard(add).imageUrl).toContain("class=hd");
  });

  it("récupère le set depuis le symbole si le chemin du scan ne le contient pas", () => {
    const add = mount(`
      <section role="dialog">
        <button aria-label="Fermer">×</button>
        <header><h2>Mew - 151/165</h2></header>
        <img src="https://pokecardex-scans.b-cdn.net/cartes/151.jpg" alt="Mew - 151/165">
        <img src="https://www.pokecardex.com/assets/images/symboles_fr/MEW.png" alt="Symbole">
        <button data-add>Ajouter</button>
      </section>`);
    expect(extractCard(add).setCode).toBe("MEW");
  });

  it("récupère le set depuis le lien si l’image et le symbole ne le donnent pas", () => {
    const add = mount(`
      <section role="dialog">
        <button aria-label="Fermer">×</button>
        <header><h2>Raichu - 025/165</h2></header>
        <img src="https://pokecardex-scans.b-cdn.net/cartes/025.jpg" alt="Raichu - 025/165">
        <a href="/series/fr/SV3">Voir la série</a>
        <button data-add>Ajouter</button>
      </section>`);
    expect(extractCard(add).setCode).toBe("SV3");
  });

  it("sélectionne la bonne carte quand plusieurs fenêtres et boutons existent", () => {
    document.body.innerHTML =
      dialog({ name: "Bulbizarre", number: "001/165", set: "MEW" }).replace("data-add", "data-first") +
      dialog({ name: "Mewtwo ex", number: "058/165", set: "MEW" }).replace("data-add", "data-second");
    const second = document.querySelector<HTMLButtonElement>("button[data-second]")!;
    expect(extractCard(second).title).toBe("Mewtwo ex - DOUBLE RARE - 058/165 - MEW");
  });

  it("reste utilisable sans image", () => {
    const add = mount(`
      <section>
        <header>
          <h2><button>Évoli</button> - 133/165</h2>
          <img src="/assets/images/rarete/ids/rarete_1.png" alt="Sans rareté">
        </header>
        <a href="/series/fr/MEW">Série</a>
        <button data-add>Ajouter</button>
      </section>`);
    expect(extractCard(add)).toMatchObject({
      title: "Évoli - 133/165 - MEW",
      imageUrl: "",
    });
  });

  it("ne génère jamais de tirets inutiles", () => {
    expect(buildCardTitle({ name: "Pikachu", rarity: "", number: "", setCode: "SV-P" })).toBe(
      "Pikachu - SV-P",
    );
    expect(formatSetCode("UPC", "")).toBe("Promo non numérotée");
  });
});
