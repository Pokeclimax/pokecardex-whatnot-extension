export const WHATNOT_TITLE_COLUMN = {
  letter: "C",
  index: 2,
  header: "Titre",
} as const;

export const WHATNOT_IMAGE_COLUMN = {
  letter: "N",
  index: 13,
  header: "Image URL 1",
} as const;

export const GENERATED_COLUMN_INDEXES = new Set<number>([
  WHATNOT_TITLE_COLUMN.index,
  WHATNOT_IMAGE_COLUMN.index,
]);

export const REQUIRED_COMMON_HEADERS: readonly string[] = ESSENTIAL_COMMON_HEADERS;

// Le fichier source est UTF-8 sans BOM. L’export conserve ce choix.
export const INCLUDE_UTF8_BOM = false;
import { ESSENTIAL_COMMON_HEADERS } from "../shared/whatnotSettings";
