export const ESSENTIAL_COMMON_HEADERS = [
  "Catégorie",
  "Sous-catégorie",
  "Description",
  "Quantité",
  "Type",
  "Prix",
  "Profil de livraison",
] as const;

export const DEFAULT_WHATNOT_SETTINGS: Readonly<Record<string, string>> = Object.freeze({
  Catégorie: "Trading Card Games",
  "Sous-catégorie": "Cartes Pokémon",
  Description: "vu en live",
  Quantité: "1",
  Type: "Auction",
  Prix: "1",
  "Profil de livraison": "De 0 à <20\u00A0grammes",
});

export const WHATNOT_TYPE_OPTIONS = ["Auction", "Buy it Now", "Giveaway"] as const;

export interface WhatnotCatalog {
  categories: string[];
  shippingProfiles: string[];
  hazmatValues: string[];
  subcategoriesByCategory: Record<string, string[]>;
  conditionsBySubcategory: Record<string, string[]>;
}

export function mergeWhatnotDefaults(
  templateDefaults: Record<string, string>,
): Record<string, string> {
  return { ...templateDefaults, ...DEFAULT_WHATNOT_SETTINGS };
}
