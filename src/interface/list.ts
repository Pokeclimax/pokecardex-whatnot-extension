import {
  createExportFilename,
  exportWhatnotCsv,
  getCommonHeaders,
  getTemplateDefaults,
} from "../csv/whatnotExporter";
import {
  REQUIRED_COMMON_HEADERS,
} from "../csv/whatnotColumns";
import { parseWhatnotTemplate, type WhatnotTemplate } from "../csv/templateParser";
import { filterCards } from "../shared/state";
import type { CardRecord, ExtensionState } from "../shared/types";
import {
  DEFAULT_WHATNOT_SETTINGS,
  ESSENTIAL_COMMON_HEADERS,
  mergeWhatnotDefaults,
  WHATNOT_TYPE_OPTIONS,
  type WhatnotCatalog,
} from "../shared/whatnotSettings";
import {
  createExtensionStorageDriver,
  ensureState,
  removeAllCards,
  removeCard,
  saveCardOrder,
  saveCardTitle,
  saveCsvSettings,
  subscribeToState,
  undoLastCard,
} from "../storage/storageAdapter";

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Élément d’interface absent: ${selector}`);
  return element;
}

const elements = {
  headerCount: requiredElement<HTMLElement>("#header-count"),
  search: requiredElement<HTMLInputElement>("#search-input"),
  undo: requiredElement<HTMLButtonElement>("#undo-button"),
  clear: requiredElement<HTMLButtonElement>("#clear-button"),
  cardList: requiredElement<HTMLElement>("#card-list"),
  empty: requiredElement<HTMLElement>("#empty-state"),
  noResults: requiredElement<HTMLElement>("#no-results"),
  reorderHint: requiredElement<HTMLElement>("#reorder-hint"),
  essentialForm: requiredElement<HTMLFormElement>("#essential-form"),
  advancedForm: requiredElement<HTMLFormElement>("#csv-form"),
  resetCsv: requiredElement<HTMLButtonElement>("#reset-csv-button"),
  exportCount: requiredElement<HTMLElement>("#export-count"),
  requiredStatus: requiredElement<HTMLElement>("#required-status"),
  exportFilename: requiredElement<HTMLElement>("#export-filename"),
  export: requiredElement<HTMLButtonElement>("#export-button"),
  toast: requiredElement<HTMLElement>("#toast"),
};

const driver = createExtensionStorageDriver();
let state: ExtensionState;
let template: WhatnotTemplate;
let defaults: Record<string, string> = {};
let commonHeaders: string[] = [];
let catalog: WhatnotCatalog;
let editingId: string | null = null;
let draggingId: string | null = null;
let toastTimer: number | null = null;
let settingsTimer: number | null = null;

function pluralCards(count: number): string {
  return `${count} ${count > 1 ? "cartes" : "carte"}`;
}

function createSvg(paths: string[], className = ""): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  if (className) svg.setAttribute("class", className);
  for (const data of paths) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", data);
    svg.appendChild(path);
  }
  return svg;
}

function showToast(message: string): void {
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 2_200);
}

function createButton(
  label: string,
  className: string,
  iconPaths: string[],
  onClick: () => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.append(createSvg(iconPaths), document.createTextNode(label));
  button.addEventListener("click", onClick);
  return button;
}

function createThumbnail(card: CardRecord): HTMLElement {
  if (card.imageUrl) {
    const image = document.createElement("img");
    image.className = "card-thumbnail";
    image.src = card.imageUrl;
    image.alt = "";
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";
    image.addEventListener("error", () => image.replaceWith(createThumbnail({ ...card, imageUrl: "" })));
    return image;
  }
  const placeholder = document.createElement("div");
  placeholder.className = "thumbnail-placeholder";
  placeholder.appendChild(createSvg(["M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z", "m8 15 2.2-2.2 1.8 1.8 2.8-3 2.2 2.4"]));
  return placeholder;
}

function createMetadata(label: string, value: string): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "metadata-item";
  const term = document.createElement("dt");
  term.textContent = label;
  const description = document.createElement("dd");
  description.textContent = value || "—";
  wrapper.append(term, description);
  return wrapper;
}

function updateLocalState(next: ExtensionState): void {
  state = next;
  renderCards();
  renderSummary();
}

function renderEditForm(card: CardRecord, container: HTMLElement): void {
  const form = document.createElement("form");
  form.className = "edit-form";
  const input = document.createElement("input");
  input.type = "text";
  input.value = card.title;
  input.maxLength = 2_000;
  input.setAttribute("aria-label", `Modifier le titre de ${card.title}`);

  const save = createButton("Enregistrer", "button button-primary", ["M5 12.5 9.2 17 19 7"], () => {
    form.requestSubmit();
  });
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "button button-secondary";
  cancel.textContent = "Annuler";
  cancel.addEventListener("click", () => {
    editingId = null;
    renderCards();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const title = input.value.replace(/\s+/g, " ").trim();
    if (!title) {
      showToast("Le titre ne peut pas être vide.");
      input.focus();
      return;
    }
    updateLocalState(await saveCardTitle(card.id, title, driver));
    editingId = null;
    renderCards();
    showToast("Titre modifié.");
  });

  form.append(input, save, cancel);
  container.appendChild(form);
  window.setTimeout(() => input.focus(), 0);
}

function renderCard(card: CardRecord, index: number, canReorder: boolean): HTMLElement {
  const row = document.createElement("article");
  row.className = "card-row";
  row.dataset.cardId = card.id;
  row.setAttribute("role", "listitem");
  row.draggable = canReorder;

  const handle = document.createElement("button");
  handle.type = "button";
  handle.className = "drag-handle";
  handle.disabled = !canReorder;
  handle.title = canReorder ? "Faire glisser pour réorganiser" : "Effacez la recherche pour réorganiser";
  handle.setAttribute("aria-label", `Réorganiser ${card.title}`);
  const grip = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  grip.setAttribute("viewBox", "0 0 18 24");
  for (const [x, y] of [[5, 5], [13, 5], [5, 12], [13, 12], [5, 19], [13, 19]]) {
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", String(x));
    circle.setAttribute("cy", String(y));
    circle.setAttribute("r", "1.6");
    grip.appendChild(circle);
  }
  handle.appendChild(grip);

  const content = document.createElement("div");
  content.className = "card-content";
  if (editingId === card.id) renderEditForm(card, content);
  else {
    const title = document.createElement("h3");
    title.className = "card-title";
    title.textContent = card.title;
    const metadata = document.createElement("dl");
    metadata.className = "card-metadata";
    metadata.append(
      createMetadata("Numéro", card.number),
      createMetadata("Rareté", card.rarity),
      createMetadata("Set", card.setCode),
    );
    content.append(title, metadata);
  }

  const actions = document.createElement("div");
  actions.className = "card-actions";
  const edit = createButton("Modifier", "button button-secondary", ["m4 16-.8 4 4-.8L18 8.4 15.6 6Z", "m13.8 7.8 2.4 2.4"], () => {
    editingId = card.id;
    renderCards();
  });
  edit.disabled = editingId === card.id;
  const remove = createButton("", "button button-danger icon-button", ["M4 7h16", "m9 7 .6-2h4.8l.6 2", "m6.5 7 .8 13h9.4l.8-13", "M10 11v5M14 11v5"], async () => {
    updateLocalState(await removeCard(card.id, driver));
    showToast("Carte supprimée.");
  });
  remove.setAttribute("aria-label", `Supprimer ${card.title}`);
  remove.title = "Supprimer";
  actions.append(edit, remove);

  row.append(handle, createThumbnail(card), content, actions);

  row.addEventListener("dragstart", (event) => {
    if (!canReorder) return event.preventDefault();
    draggingId = card.id;
    row.classList.add("is-dragging");
    event.dataTransfer?.setData("text/plain", card.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  });
  row.addEventListener("dragover", (event) => {
    if (!draggingId || draggingId === card.id) return;
    event.preventDefault();
    row.classList.add("is-drag-over");
  });
  row.addEventListener("dragleave", () => row.classList.remove("is-drag-over"));
  row.addEventListener("drop", async (event) => {
    event.preventDefault();
    row.classList.remove("is-drag-over");
    if (!draggingId || draggingId === card.id) return;
    const ids = state.cards.map((item) => item.id);
    const from = ids.indexOf(draggingId);
    const to = ids.indexOf(card.id);
    if (from < 0 || to < 0) return;
    const [moved] = ids.splice(from, 1);
    if (moved) ids.splice(to, 0, moved);
    updateLocalState(await saveCardOrder(ids, driver));
    showToast("Ordre enregistré.");
  });
  row.addEventListener("dragend", () => {
    draggingId = null;
    document.querySelectorAll(".card-row").forEach((item) => item.classList.remove("is-dragging", "is-drag-over"));
  });

  row.style.setProperty("--row-index", String(index));
  return row;
}

function renderCards(): void {
  const query = elements.search.value;
  const cards = filterCards(state.cards, query);
  const canReorder = !query.trim();
  elements.cardList.replaceChildren(...cards.map((card, index) => renderCard(card, index, canReorder)));
  elements.empty.hidden = state.cards.length > 0;
  elements.noResults.hidden = state.cards.length === 0 || cards.length > 0;
  elements.cardList.hidden = cards.length === 0;
  elements.reorderHint.hidden = state.cards.length < 2 || !canReorder;
  elements.undo.disabled = !state.lastAddedCardId;
  elements.clear.disabled = state.cards.length === 0;
}

type CsvControl = HTMLInputElement | HTMLSelectElement;

function currentCommonValues(): Record<string, string> {
  return Object.fromEntries(
    commonHeaders.map((header) => {
      const control = document.querySelector<CsvControl>(`[data-header="${CSS.escape(header)}"]`);
      return [header, control?.value ?? state.csvSettings[header] ?? defaults[header] ?? ""];
    }),
  );
}

function settingValue(header: string): string {
  return Object.hasOwn(state.csvSettings, header)
    ? state.csvSettings[header] ?? ""
    : defaults[header] ?? "";
}

function replaceSelectOptions(
  select: HTMLSelectElement,
  options: readonly string[],
  currentValue: string,
  required: boolean,
  preserveUnknown = true,
  fallbackToFirst = false,
): void {
  const unique = [...new Set(options.filter(Boolean))];
  if (preserveUnknown && currentValue && !unique.includes(currentValue)) unique.unshift(currentValue);

  const nodes: HTMLOptionElement[] = [];
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = required ? "Choisir…" : "Non renseigné";
  nodes.push(placeholder);
  for (const value of unique) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    nodes.push(option);
  }
  select.replaceChildren(...nodes);

  if (unique.includes(currentValue)) select.value = currentValue;
  else if (fallbackToFirst && unique[0]) select.value = unique[0];
  else select.value = "";
}

function refreshDependentMenus(changedHeader: string): void {
  if (changedHeader === "Catégorie") {
    const category = document.querySelector<HTMLSelectElement>('[data-header="Catégorie"]')?.value ?? "";
    const subcategory = document.querySelector<HTMLSelectElement>('[data-header="Sous-catégorie"]');
    if (subcategory) {
      replaceSelectOptions(
        subcategory,
        catalog.subcategoriesByCategory[category] ?? [],
        subcategory.value,
        true,
        false,
        true,
      );
    }
  }

  if (changedHeader === "Catégorie" || changedHeader === "Sous-catégorie") {
    const subcategory = document.querySelector<HTMLSelectElement>('[data-header="Sous-catégorie"]')?.value ?? "";
    const condition = document.querySelector<HTMLSelectElement>('[data-header="État"]');
    if (condition) {
      replaceSelectOptions(
        condition,
        catalog.conditionsBySubcategory[subcategory] ?? [],
        condition.value,
        false,
        false,
      );
    }
  }
}

function commitControlChange(header: string): void {
  refreshDependentMenus(header);
  state = { ...state, csvSettings: currentCommonValues() };
  renderSummary();
  scheduleSettingsSave();
}

function createCsvField(header: string): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "field";
  if (header === "Description") wrapper.classList.add("field-wide");

  const id = `csv-field-${template.headers.indexOf(header)}`;
  const label = document.createElement("label");
  label.htmlFor = id;
  label.textContent = header;

  const value = settingValue(header);
  const required = REQUIRED_COMMON_HEADERS.includes(header);
  let control: CsvControl;

  if (["Catégorie", "Sous-catégorie", "Type", "Profil de livraison", "Matières dangereuses", "État"].includes(header)) {
    const select = document.createElement("select");
    let options: readonly string[] = [];
    if (header === "Catégorie") options = catalog.categories;
    if (header === "Sous-catégorie") {
      options = catalog.subcategoriesByCategory[settingValue("Catégorie")] ?? [];
    }
    if (header === "Type") options = WHATNOT_TYPE_OPTIONS;
    if (header === "Profil de livraison") options = catalog.shippingProfiles;
    if (header === "Matières dangereuses") options = catalog.hazmatValues;
    if (header === "État") {
      options = catalog.conditionsBySubcategory[settingValue("Sous-catégorie")] ?? [];
    }
    replaceSelectOptions(select, options, value, required);
    control = select;
  } else {
    const input = document.createElement("input");
    input.type = header === "Quantité" ? "number" : "text";
    input.value = value;
    if (input.type === "text") input.maxLength = 20_000;
    if (header === "Quantité") {
      input.min = "1";
      input.step = "1";
      input.inputMode = "numeric";
    }
    if (header === "Prix" || header === "Coût par article") input.inputMode = "decimal";
    control = input;
  }

  control.id = id;
  control.dataset.header = header;
  control.required = required;
  control.addEventListener(control instanceof HTMLSelectElement ? "change" : "input", () => {
    commitControlChange(header);
  });
  wrapper.append(label, control);
  return wrapper;
}

function scheduleSettingsSave(): void {
  if (settingsTimer !== null) window.clearTimeout(settingsTimer);
  settingsTimer = window.setTimeout(async () => {
    settingsTimer = null;
    try {
      state = await saveCsvSettings(currentCommonValues(), driver);
      renderSummary();
    } catch {
      showToast("Impossible d’enregistrer les informations du CSV.");
    }
  }, 280);
}

function renderCsvForms(): void {
  const essentialSet = new Set<string>(ESSENTIAL_COMMON_HEADERS);
  const essentialHeaders = commonHeaders.filter((header) => essentialSet.has(header));
  const advancedHeaders = commonHeaders.filter((header) => !essentialSet.has(header));
  elements.essentialForm.replaceChildren(...essentialHeaders.map(createCsvField));
  elements.advancedForm.replaceChildren(...advancedHeaders.map(createCsvField));
}

function renderSummary(): void {
  const count = state.cards.length;
  const values = elements.essentialForm.childElementCount ? currentCommonValues() : state.csvSettings;
  const missing = REQUIRED_COMMON_HEADERS.filter((header) => !(values[header] ?? "").trim());
  elements.headerCount.textContent = pluralCards(count);
  elements.exportCount.textContent = pluralCards(count);
  elements.requiredStatus.textContent = missing.length
    ? `${missing.length} réglage${missing.length > 1 ? "s" : ""} essentiel${missing.length > 1 ? "s" : ""} manquant${missing.length > 1 ? "s" : ""}`
    : "Tous les réglages essentiels sont renseignés";
  elements.exportFilename.textContent = createExportFilename();
  elements.export.disabled = count === 0 || missing.length > 0;
}

async function exportCsv(): Promise<void> {
  if (!state.cards.length) return;
  const csv = exportWhatnotCsv(template, state.cards, currentCommonValues());
  const filename = createExportFilename();
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  showToast(`${filename} exporté.`);
}

elements.search.addEventListener("input", renderCards);
elements.undo.addEventListener("click", async () => {
  updateLocalState(await undoLastCard(driver));
  showToast("Dernier ajout annulé.");
});
elements.clear.addEventListener("click", async () => {
  if (!window.confirm("Vider toute la liste ? Cette action est irréversible.")) return;
  updateLocalState(await removeAllCards(driver));
  showToast("Liste vidée.");
});
elements.resetCsv.addEventListener("click", async () => {
  state = await saveCsvSettings(defaults, driver);
  renderCsvForms();
  renderSummary();
  showToast("Valeurs d’origine restaurées.");
});
elements.export.addEventListener("click", () => void exportCsv());

async function bootstrap(): Promise<void> {
  const [templateResponse, valuesResponse, storedState] = await Promise.all([
    fetch("assets/template-whatnot.csv"),
    fetch("assets/whatnot-values.json"),
    ensureState(driver),
  ]);
  if (!templateResponse.ok) throw new Error("Modèle CSV introuvable dans l’extension.");
  if (!valuesResponse.ok) throw new Error("Listes Whatnot introuvables dans l’extension.");
  template = parseWhatnotTemplate(await templateResponse.text());
  catalog = await valuesResponse.json() as WhatnotCatalog;
  if (!Array.isArray(catalog.categories) || !Array.isArray(catalog.shippingProfiles)) {
    throw new Error("Listes Whatnot invalides.");
  }
  state = storedState;
  defaults = mergeWhatnotDefaults(getTemplateDefaults(template));
  commonHeaders = getCommonHeaders(template);
  state = {
    ...state,
    csvSettings: { ...defaults, ...DEFAULT_WHATNOT_SETTINGS, ...state.csvSettings },
  };
  renderCsvForms();
  renderCards();
  renderSummary();

  subscribeToState((next) => {
    const oldCards = state.cards.map((card) => `${card.id}:${card.title}`).join("|");
    const nextCards = next.cards.map((card) => `${card.id}:${card.title}`).join("|");
    state = next;
    if (oldCards !== nextCards) renderCards();
    renderSummary();
  }, driver);
}

bootstrap().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  elements.cardList.replaceChildren();
  elements.empty.hidden = false;
  elements.empty.querySelector("h3")!.textContent = "Impossible d’ouvrir la liste";
  elements.empty.querySelector("p")!.textContent = message;
  elements.export.disabled = true;
});
