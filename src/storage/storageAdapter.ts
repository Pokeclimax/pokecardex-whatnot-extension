import {
  appendCard,
  clearCards,
  createCardRecord,
  createEmptyState,
  deleteCard,
  migrateState,
  reorderCards,
  undoLastAdd,
  updateCardTitle,
} from "../shared/state";
import {
  DATA_SCHEMA_VERSION,
  type ExtensionState,
  type ExtractedCard,
} from "../shared/types";

export const STORAGE_KEY = "pokecardexWhatnotState";

export interface StorageDriver {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  subscribe?(listener: (value: unknown) => void): () => void;
}

export function createExtensionStorageDriver(): StorageDriver {
  if (typeof chrome === "undefined" || !chrome.storage?.local) {
    throw new Error("Stockage de l’extension indisponible");
  }

  return {
    get(key) {
      return new Promise((resolve, reject) => {
        chrome.storage.local.get([key], (items) => {
          const error = chrome.runtime.lastError;
          if (error) reject(new Error(error.message));
          else resolve(items[key]);
        });
      });
    },
    set(key, value) {
      return new Promise((resolve, reject) => {
        chrome.storage.local.set({ [key]: value }, () => {
          const error = chrome.runtime.lastError;
          if (error) reject(new Error(error.message));
          else resolve();
        });
      });
    },
    subscribe(listener) {
      const handler = (
        changes: Record<string, chrome.storage.StorageChange>,
        areaName: string,
      ) => {
        if (areaName === "local" && changes[STORAGE_KEY]) {
          listener(changes[STORAGE_KEY].newValue);
        }
      };
      chrome.storage.onChanged.addListener(handler);
      return () => chrome.storage.onChanged.removeListener(handler);
    },
  };
}

export async function loadState(
  driver: StorageDriver = createExtensionStorageDriver(),
): Promise<ExtensionState> {
  return migrateState(await driver.get(STORAGE_KEY));
}

let mutationTail: Promise<unknown> = Promise.resolve();

export function mutateState(
  updater: (state: ExtensionState) => ExtensionState,
  driver: StorageDriver = createExtensionStorageDriver(),
): Promise<ExtensionState> {
  const operation = mutationTail.then(async () => {
    const current = await loadState(driver);
    const updated = updater(current);
    const next = migrateState({ ...updated, revision: current.revision + 1 });
    await driver.set(STORAGE_KEY, next);
    return next;
  });
  mutationTail = operation.catch(() => undefined);
  return operation;
}

function createId(): string {
  return globalThis.crypto?.randomUUID?.() ??
    `card-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function addExtractedCard(
  extracted: ExtractedCard,
  driver?: StorageDriver,
): Promise<ExtensionState> {
  const card = createCardRecord(extracted, createId(), Date.now());
  if (!card.title) return Promise.reject(new Error("Titre de carte introuvable"));
  return mutateState((state) => appendCard(state, card), driver);
}

export function saveCardTitle(
  cardId: string,
  title: string,
  driver?: StorageDriver,
): Promise<ExtensionState> {
  return mutateState((state) => updateCardTitle(state, cardId, title), driver);
}

export function removeCard(
  cardId: string,
  driver?: StorageDriver,
): Promise<ExtensionState> {
  return mutateState((state) => deleteCard(state, cardId), driver);
}

export function saveCardOrder(
  orderedIds: string[],
  driver?: StorageDriver,
): Promise<ExtensionState> {
  return mutateState((state) => reorderCards(state, orderedIds), driver);
}

export function undoLastCard(driver?: StorageDriver): Promise<ExtensionState> {
  return mutateState(undoLastAdd, driver);
}

export function removeAllCards(driver?: StorageDriver): Promise<ExtensionState> {
  return mutateState(clearCards, driver);
}

export function saveCsvSettings(
  values: Record<string, string>,
  driver?: StorageDriver,
): Promise<ExtensionState> {
  return mutateState((state) => ({ ...state, csvSettings: { ...values } }), driver);
}

export function subscribeToState(
  listener: (state: ExtensionState) => void,
  driver: StorageDriver = createExtensionStorageDriver(),
): () => void {
  return driver.subscribe?.((value) => listener(migrateState(value))) ?? (() => undefined);
}

export async function ensureState(
  driver: StorageDriver = createExtensionStorageDriver(),
): Promise<ExtensionState> {
  const raw = await driver.get(STORAGE_KEY);
  const state = migrateState(raw);
  const sourceVersion = raw && typeof raw === "object"
    ? (raw as { schemaVersion?: unknown }).schemaVersion
    : undefined;
  if (sourceVersion !== DATA_SCHEMA_VERSION) {
    await driver.set(STORAGE_KEY, state);
  }
  return state;
}
