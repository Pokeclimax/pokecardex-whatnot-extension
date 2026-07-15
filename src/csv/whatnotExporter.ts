import type { CardRecord } from "../shared/types";
import {
  GENERATED_COLUMN_INDEXES,
  INCLUDE_UTF8_BOM,
  WHATNOT_IMAGE_COLUMN,
  WHATNOT_TITLE_COLUMN,
} from "./whatnotColumns";
import type { WhatnotTemplate } from "./templateParser";

function escapeCell(value: string, delimiter: string): string {
  const text = String(value ?? "");
  return text.includes(delimiter) || /["\r\n]/.test(text)
    ? `"${text.replace(/"/g, '""')}"`
    : text;
}

export function getCommonHeaders(template: WhatnotTemplate): string[] {
  return template.headers.filter((_, index) => !GENERATED_COLUMN_INDEXES.has(index));
}

export function getTemplateDefaults(template: WhatnotTemplate): Record<string, string> {
  return Object.fromEntries(
    template.headers
      .map((header, index) => ({ header, index }))
      .filter(({ index }) => !GENERATED_COLUMN_INDEXES.has(index))
      .map(({ header, index }) => [header, template.templateRow[index] ?? ""]),
  );
}

export function buildWhatnotRows(
  template: WhatnotTemplate,
  cards: CardRecord[],
  commonValues: Record<string, string>,
): string[][] {
  if (template.headers[WHATNOT_TITLE_COLUMN.index] !== WHATNOT_TITLE_COLUMN.header) {
    throw new Error("La colonne C du modèle n’est pas « Titre ».");
  }
  if (template.headers[WHATNOT_IMAGE_COLUMN.index] !== WHATNOT_IMAGE_COLUMN.header) {
    throw new Error("La colonne N du modèle n’est pas « Image URL 1 ».");
  }

  return cards.map((card) => {
    const row = [...template.templateRow];
    row[WHATNOT_TITLE_COLUMN.index] = card.title;
    row[WHATNOT_IMAGE_COLUMN.index] = card.imageUrl;

    template.headers.forEach((header, index) => {
      if (!GENERATED_COLUMN_INDEXES.has(index) && Object.hasOwn(commonValues, header)) {
        row[index] = commonValues[header] ?? "";
      }
    });
    return row;
  });
}

export function exportWhatnotCsv(
  template: WhatnotTemplate,
  cards: CardRecord[],
  commonValues: Record<string, string>,
): string {
  const rows = [template.headers, ...buildWhatnotRows(template, cards, commonValues)];
  const body = rows
    .map((row) => row.map((cell) => escapeCell(cell ?? "", template.delimiter)).join(template.delimiter))
    .join("\r\n");
  return `${INCLUDE_UTF8_BOM ? "\uFEFF" : ""}${body}`;
}

export function createExportFilename(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `whatnot-cartes-${year}-${month}-${day}.csv`;
}
