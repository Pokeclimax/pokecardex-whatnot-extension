export interface ParsedCsv {
  delimiter: string;
  rows: string[][];
  hasBom: boolean;
}

export interface WhatnotTemplate {
  headers: string[];
  templateRow: string[];
  delimiter: string;
  hasBom: boolean;
  hasTemplateRow: boolean;
}

function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  let commas = 0;
  let semicolons = 0;
  let quoted = false;

  for (let index = 0; index < firstLine.length; index += 1) {
    const char = firstLine[index];
    if (char === '"') {
      if (quoted && firstLine[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && char === ",") commas += 1;
    else if (!quoted && char === ";") semicolons += 1;
  }
  return semicolons > commas ? ";" : ",";
}

export function parseCsv(rawText: string): ParsedCsv {
  const hasBom = rawText.startsWith("\uFEFF");
  const text = hasBom ? rawText.slice(1) : rawText;
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
      continue;
    }

    if (char === '"' && field.length === 0) quoted = true;
    else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\r" || char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      if (char === "\r" && text[index + 1] === "\n") index += 1;
    } else field += char;
  }

  if (field.length > 0 || row.length > 0 || text.endsWith(delimiter)) {
    row.push(field);
    rows.push(row);
  }

  return { delimiter, rows, hasBom };
}

export function parseWhatnotTemplate(rawText: string): WhatnotTemplate {
  const parsed = parseCsv(rawText);
  const headers = parsed.rows[0] ?? [];
  if (!headers.length) throw new Error("Le modèle CSV ne contient aucun en-tête.");

  const sourceRow = parsed.rows[1];
  const templateRow = Array.from({ length: headers.length }, (_, index) => sourceRow?.[index] ?? "");
  return {
    headers,
    templateRow,
    delimiter: parsed.delimiter,
    hasBom: parsed.hasBom,
    hasTemplateRow: Boolean(sourceRow),
  };
}
