import { ensureState } from "../storage/storageAdapter";
import { DEFAULT_WHATNOT_SETTINGS } from "../shared/whatnotSettings";

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Élément d’interface absent: ${selector}`);
  return element;
}

const elements = {
  count: requiredElement<HTMLElement>("#card-count"),
  status: requiredElement<HTMLElement>("#card-status"),
  category: requiredElement<HTMLElement>("#setting-category"),
  subcategory: requiredElement<HTMLElement>("#setting-subcategory"),
  description: requiredElement<HTMLElement>("#setting-description"),
  quantity: requiredElement<HTMLElement>("#setting-quantity"),
  type: requiredElement<HTMLElement>("#setting-type"),
  price: requiredElement<HTMLElement>("#setting-price"),
  shipping: requiredElement<HTMLElement>("#setting-shipping"),
  openList: requiredElement<HTMLButtonElement>("#open-list"),
  openPokecardex: requiredElement<HTMLButtonElement>("#open-pokecardex"),
};

function openTab(url: string): void {
  chrome.tabs.create({ url }, () => window.close());
}

elements.openList.addEventListener("click", () => openTab(chrome.runtime.getURL("list.html")));
elements.openPokecardex.addEventListener("click", () => openTab("https://www.pokecardex.com/"));

async function bootstrap(): Promise<void> {
  const state = await ensureState();
  const settings = { ...DEFAULT_WHATNOT_SETTINGS, ...state.csvSettings };
  const count = state.cards.length;
  elements.count.textContent = String(count);
  elements.status.textContent = count
    ? `${count} carte${count > 1 ? "s" : ""} prête${count > 1 ? "s" : ""}`
    : "Votre liste est vide";
  elements.category.textContent = settings.Catégorie || "—";
  elements.subcategory.textContent = settings["Sous-catégorie"] || "—";
  elements.description.textContent = settings.Description || "—";
  elements.quantity.textContent = settings.Quantité || "—";
  elements.type.textContent = settings.Type || "—";
  elements.price.textContent = settings.Prix || "—";
  elements.shipping.textContent = settings["Profil de livraison"] || "—";
}

bootstrap().catch(() => {
  elements.status.textContent = "Impossible de lire la liste";
});
