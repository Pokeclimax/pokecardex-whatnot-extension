export const DATA_SCHEMA_VERSION = 2 as const;

export interface ExtractedCard {
  name: string;
  number: string;
  rarity: string;
  setCode: string;
  imageUrl: string;
  title: string;
}

export interface CardRecord extends ExtractedCard {
  id: string;
  createdAt: number;
}

export interface ExtensionState {
  schemaVersion: typeof DATA_SCHEMA_VERSION;
  revision: number;
  cards: CardRecord[];
  csvSettings: Record<string, string>;
  lastAddedCardId: string | null;
}
