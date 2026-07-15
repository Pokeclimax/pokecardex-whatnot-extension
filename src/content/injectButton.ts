import { extractCard, isNativeAddButton } from "../extraction/cardExtractor";
import type { ExtensionState, ExtractedCard } from "../shared/types";

const INJECTED_ATTRIBUTE = "data-pcdx-list-button";
const LIST_BUTTON_ID = "pcdx-open-list-button";
const RESET_DELAY = 1_400;
const SCAN_DEBOUNCE = 110;

export interface ContentDependencies {
  addCard(card: ExtractedCard): Promise<ExtensionState>;
  loadState(): Promise<ExtensionState>;
  subscribe(listener: (state: ExtensionState) => void): () => void;
  openList(): void;
}

function setButtonState(
  button: HTMLButtonElement,
  label: string,
  disabled: boolean,
  state: string,
): void {
  button.textContent = label;
  button.disabled = disabled;
  button.dataset.state = state;
}

function countLabel(count: number): string {
  return `Ma liste · ${count}`;
}

export function installPokecardexContent(
  dependencies: ContentDependencies,
  doc: Document = document,
): () => void {
  const injected = new WeakMap<HTMLButtonElement, HTMLElement>();
  const pendingRoots = new Set<ParentNode>();
  let scanTimer: number | null = null;
  let stopped = false;

  const updateCount = (state: ExtensionState) => {
    const listButton = doc.getElementById(LIST_BUTTON_ID);
    if (listButton) listButton.textContent = countLabel(state.cards.length);
  };

  const ensureListButton = () => {
    if (!doc.body || doc.getElementById(LIST_BUTTON_ID)) return;
    const button = doc.createElement("button");
    button.id = LIST_BUTTON_ID;
    button.className = "pcdx-open-list";
    button.type = "button";
    button.textContent = countLabel(0);
    button.setAttribute("aria-label", "Ouvrir ma liste de cartes");
    button.addEventListener("click", dependencies.openList);
    doc.body.appendChild(button);
  };

  const resetLater = (button: HTMLButtonElement, delay = RESET_DELAY) => {
    window.setTimeout(() => {
      if (button.isConnected) {
        setButtonState(button, "Ajouter à ma liste", false, "idle");
        button.removeAttribute("title");
      }
    }, delay);
  };

  const createButton = (nativeButton: HTMLButtonElement): HTMLElement => {
    const wrapper = doc.createElement("span");
    wrapper.className = "pcdx-add-wrap";
    wrapper.setAttribute(INJECTED_ATTRIBUTE, "true");

    const button = doc.createElement("button");
    button.type = "button";
    button.className = "pcdx-add-button";
    setButtonState(button, "Ajouter à ma liste", false, "idle");

    button.addEventListener("click", async () => {
      if (button.disabled) return;
      setButtonState(button, "Ajout…", true, "adding");
      try {
        const card = extractCard(nativeButton);
        if (!card.title) throw new Error("Carte ouverte introuvable");
        const state = await dependencies.addCard(card);
        updateCount(state);
        setButtonState(button, "Ajouté ✓", true, "added");
        resetLater(button);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        button.title = message;
        setButtonState(button, "Erreur", true, "error");
        resetLater(button, 1_800);
      }
    });

    wrapper.appendChild(button);
    return wrapper;
  };

  const injectNear = (nativeButton: HTMLButtonElement) => {
    const current = injected.get(nativeButton);
    if (current?.isConnected) return;

    const adjacent = nativeButton.nextElementSibling;
    if (adjacent?.hasAttribute(INJECTED_ATTRIBUTE)) {
      injected.set(nativeButton, adjacent as HTMLElement);
      return;
    }

    const wrapper = createButton(nativeButton);
    nativeButton.insertAdjacentElement("afterend", wrapper);
    injected.set(nativeButton, wrapper);
  };

  const scanRoot = (root: ParentNode) => {
    const candidates: Element[] = [];
    if (root instanceof Element && root.matches("button")) candidates.push(root);
    candidates.push(...root.querySelectorAll?.("button") ?? []);
    candidates.filter(isNativeAddButton).forEach(injectNear);
  };

  const flushScans = () => {
    scanTimer = null;
    if (stopped) return;
    ensureListButton();
    for (const root of pendingRoots) scanRoot(root);
    pendingRoots.clear();
  };

  const scheduleScan = (root: ParentNode) => {
    pendingRoots.add(root);
    if (scanTimer !== null) return;
    scanTimer = window.setTimeout(flushScans, SCAN_DEBOUNCE);
  };

  ensureListButton();
  scanRoot(doc);
  dependencies.loadState().then(updateCount).catch(() => undefined);
  const unsubscribe = dependencies.subscribe(updateCount);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "attributes") {
        if (mutation.target instanceof Element) scheduleScan(mutation.target);
        continue;
      }
      if (mutation.addedNodes.length === 0) continue;
      for (const node of mutation.addedNodes) {
        if (node instanceof Element) scheduleScan(node);
        else if (node.parentElement) scheduleScan(node.parentElement);
      }
    }
  });

  observer.observe(doc.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "style", "aria-hidden", "open"],
  });

  return () => {
    stopped = true;
    observer.disconnect();
    unsubscribe();
    if (scanTimer !== null) window.clearTimeout(scanTimer);
  };
}
