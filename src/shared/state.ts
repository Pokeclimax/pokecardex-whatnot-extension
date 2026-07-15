import {
  DATA_SCHEMA_VERSION,
  type CardRecord,
  type ExtensionState,
  type ExtractedCard,
} from "./types";
import { DEFAULT_WHATNOT_SETTINGS } from "./whatnotSettings";

const MAX_TEXT_LENGTH = 2_000;
const MAX_URL_LENGTH = 20_000;

function cleanString(value: unknown, maxLength = MAX_TEXT_LENGTH): string {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

function cleanCard(value: unknown, index: number): CardRecord | null {
  if (!value || typeof value !== "object") return null;
  const card = value as Partial<CardRecord>;
  const title = cleanString(card.title).trim();
  if (!title) return null;

  return {
    id: cleanString(card.id).trim() || `legacy-${index}`,
    createdAt:
      typeof card.createdAt === "number" && Number.isFinite(card.createdAt)
        ? card.createdAt
        : 0,
    name: cleanString(card.name).trim(),
    number: cleanString(card.number).trim(),
    rarity: cleanString(card.rarity).trim(),
    setCode: cleanString(card.setCode).trim(),
    imageUrl: cleanString(card.imageUrl, MAX_URL_LENGTH).trim(),
    title,
  };
}

function cleanSettings(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, item]) => key.length <= 200 && typeof item === "string")
      .map(([key, item]) => [key, item.slice(0, MAX_URL_LENGTH)]),
  );
}

export function createEmptyState(): ExtensionState {
  return {
    schemaVersion: DATA_SCHEMA_VERSION,
    revision: 0,
    cards: [],
    csvSettings: { ...DEFAULT_WHATNOT_SETTINGS },
    lastAddedCardId: null,
  };
}

export function migrateState(value: unknown): ExtensionState {
  if (!value || typeof value !== "object") return createEmptyState();
  const source = value as Partial<ExtensionState>;
  const cards = Array.isArray(source.cards)
    ? source.cards
        .map((card, index) => cleanCard(card, index))
        .filter((card): card is CardRecord => card !== null)
    : [];
  const lastAdded = cleanString(source.lastAddedCardId).trim();

  const cleanedSettings = cleanSettings(source.csvSettings);
  const sourceSchema =
    typeof source.schemaVersion === "number" && Number.isInteger(source.schemaVersion)
      ? source.schemaVersion
      : 0;
  const legacySettings = { ...cleanedSettings };
  if (sourceSchema < DATA_SCHEMA_VERSION) {
    for (const [header, defaultValue] of Object.entries(DEFAULT_WHATNOT_SETTINGS)) {
      if (!(legacySettings[header] ?? "").trim()) legacySettings[header] = defaultValue;
    }
  }
  const csvSettings = sourceSchema < DATA_SCHEMA_VERSION ? legacySettings : cleanedSettings;

  return {
    schemaVersion: DATA_SCHEMA_VERSION,
    revision:
      typeof source.revision === "number" && Number.isInteger(source.revision)
        ? Math.max(0, source.revision)
        : 0,
    cards,
    csvSettings,
    lastAddedCardId: cards.some((card) => card.id === lastAdded) ? lastAdded : null,
  };
}

export function createCardRecord(
  extracted: ExtractedCard,
  id: string,
  createdAt: number,
): CardRecord {
  return {
    id,
    createdAt,
    name: cleanString(extracted.name).trim(),
    number: cleanString(extracted.number).trim(),
    rarity: cleanString(extracted.rarity).trim(),
    setCode: cleanString(extracted.setCode).trim(),
    imageUrl: cleanString(extracted.imageUrl, MAX_URL_LENGTH).trim(),
    title: cleanString(extracted.title).trim(),
  };
}

export function appendCard(state: ExtensionState, card: CardRecord): ExtensionState {
  return {
    ...state,
    cards: [...state.cards, card],
    lastAddedCardId: card.id,
  };
}

export function updateCardTitle(
  state: ExtensionState,
  cardId: string,
  title: string,
): ExtensionState {
  const cleanTitle = title.replace(/\s+/g, " ").trim();
  if (!cleanTitle) return state;
  return {
    ...state,
    cards: state.cards.map((card) =>
      card.id === cardId ? { ...card, title: cleanTitle } : card,
    ),
  };
}

export function deleteCard(state: ExtensionState, cardId: string): ExtensionState {
  return {
    ...state,
    cards: state.cards.filter((card) => card.id !== cardId),
    lastAddedCardId: state.lastAddedCardId === cardId ? null : state.lastAddedCardId,
  };
}

export function reorderCards(
  state: ExtensionState,
  orderedIds: string[],
): ExtensionState {
  const positions = new Map(orderedIds.map((id, index) => [id, index]));
  if (positions.size !== state.cards.length) return state;
  if (state.cards.some((card) => !positions.has(card.id))) return state;
  return {
    ...state,
    cards: [...state.cards].sort(
      (left, right) => positions.get(left.id)! - positions.get(right.id)!,
    ),
  };
}

export function undoLastAdd(state: ExtensionState): ExtensionState {
  if (!state.lastAddedCardId) return state;
  return {
    ...state,
    cards: state.cards.filter((card) => card.id !== state.lastAddedCardId),
    lastAddedCardId: null,
  };
}

export function clearCards(state: ExtensionState): ExtensionState {
  return { ...state, cards: [], lastAddedCardId: null };
}

export function filterCards(cards: CardRecord[], query: string): CardRecord[] {
  const needle = query.trim().toLocaleLowerCase("fr");
  if (!needle) return cards;
  return cards.filter((card) =>
    [card.title, card.name, card.number, card.rarity, card.setCode]
      .join(" ")
      .toLocaleLowerCase("fr")
      .includes(needle),
  );
}
