import type { ExtractedCard } from "../shared/types";

// Conservé depuis l’extracteur Tampermonkey :
// 112/081, 026/081, 001/PCG-P, 001/SV-P et 001/XY-P.
export const CARD_NUMBER_PATTERN = "[A-Z]?\\d{1,4}[a-z]?\\/[A-Z0-9][A-Z0-9-]{1,12}";

export function normalizeText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function removeAccents(value: string): string {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function isVisible(element: Element | null): boolean {
  if (!element) return false;
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    rect.width > 0 &&
    rect.height > 0
  );
}

function cleanCardName(value: string): string {
  return normalizeText(value).replace(/[\s–—-]+$/g, "").trim();
}

export function normalizeRarity(rawRarity: string | null | undefined): string {
  const rarity = normalizeText(rawRarity);
  if (!rarity) return "";

  const comparable = removeAccents(rarity).toUpperCase();
  const emptyRarities = new Set([
    "SANS RARETE",
    "NO RARITY",
    "NONE",
    "AUCUNE",
    "AUCUNE RARETE",
    "INEXISTANTE",
    "INEXISTANT",
    "NON EXISTANTE",
    "NON EXISTANT",
    "N'EXISTE PAS",
    "N EXISTE PAS",
    "NOT APPLICABLE",
    "N/A",
    "NA",
    "-",
  ]);
  return emptyRarities.has(comparable) ? "" : rarity.toUpperCase();
}

export function isNativeAddButton(button: Element | null): button is HTMLButtonElement {
  return button instanceof HTMLButtonElement && normalizeText(button.textContent) === "Ajouter";
}

function imageSource(image: HTMLImageElement | null): string {
  if (!image) return "";
  return (
    image.currentSrc ||
    image.getAttribute("src") ||
    image.getAttribute("data-src") ||
    image.getAttribute("data-lazy-src") ||
    ""
  );
}

export function getActiveCardContainer(addButton: HTMLButtonElement | null): ParentNode {
  if (!addButton) return document;
  let element: Element | null = addButton.parentElement;
  let fallback: Element | null = null;

  while (element && element !== document.body) {
    const hasOwnButton = element.contains(addButton);
    const hasScan = Boolean(
      element.querySelector('img[src*="pokecardex-scans.b-cdn.net"], img[data-src*="pokecardex-scans.b-cdn.net"]'),
    );
    const hasHeader = Boolean(element.querySelector("header h2, h2"));
    const hasCloseButton = Boolean(
      element.querySelector('button[aria-label="Fermer"], button[aria-label="Close"], [role="dialog"]'),
    );

    if (hasOwnButton && hasScan && hasHeader && !fallback) fallback = element;
    if (hasOwnButton && hasScan && (hasCloseButton || element.querySelector("header h2"))) {
      return element;
    }
    element = element.parentElement;
  }
  return fallback ?? document;
}

export function getCardScanImg(scope: ParentNode): HTMLImageElement | null {
  const scans = [
    ...scope.querySelectorAll<HTMLImageElement>(
      'img[src*="pokecardex-scans.b-cdn.net"], img[data-src*="pokecardex-scans.b-cdn.net"], img[data-lazy-src*="pokecardex-scans.b-cdn.net"]',
    ),
  ].filter((image) => {
    const src = imageSource(image).toLowerCase();
    return src && !src.includes("placeholder");
  });
  if (!scans.length) return null;

  const numberRegex = new RegExp(CARD_NUMBER_PATTERN, "i");
  const numbered = scans.filter((image) =>
    numberRegex.test(normalizeText(image.getAttribute("alt"))),
  );
  const preferred = numbered.length ? numbered : scans;
  const hd = preferred.find((image) => /(?:[?&]|%3f)class=hd(?:&|$)/i.test(imageSource(image)) || imageSource(image).includes("class=hd"));
  if (hd) return hd;

  const visible = preferred.filter(isVisible);
  const candidates = visible.length ? visible : preferred;
  return (
    candidates
      .map((image) => ({
        image,
        area:
          (image.naturalWidth || image.width || 0) *
          (image.naturalHeight || image.height || 0),
      }))
      .sort((left, right) => right.area - left.area)[0]?.image ?? null
  );
}

function extractCardNameAndNumber(scope: ParentNode): { name: string; number: string } {
  const numberRegex = new RegExp(`(${CARD_NUMBER_PATTERN})`, "i");
  const scan = getCardScanImg(scope);
  const alt = normalizeText(scan?.getAttribute("alt"));

  if (alt) {
    const match = alt.match(
      new RegExp(`^(.*?)[\\s–—-]+(${CARD_NUMBER_PATTERN})$`, "i"),
    );
    if (match) {
      return { name: cleanCardName(match[1] ?? ""), number: normalizeText(match[2]) };
    }
  }

  const headings = [...scope.querySelectorAll<HTMLHeadingElement>("h2")];
  for (const heading of headings) {
    const raw = normalizeText(heading.textContent);
    const numberMatch = raw.match(numberRegex);
    if (!numberMatch) continue;
    const number = normalizeText(numberMatch[1]);
    const buttonName = normalizeText(heading.querySelector("button")?.textContent);
    if (buttonName) return { name: cleanCardName(buttonName), number };

    const fallback = raw.match(
      new RegExp(`^(.*?)[\\s–—-]*(${CARD_NUMBER_PATTERN})$`, "i"),
    );
    if (fallback) {
      return { name: cleanCardName(fallback[1] ?? ""), number: normalizeText(fallback[2]) };
    }
  }

  const title = headings.map((heading) => normalizeText(heading.textContent)).find(Boolean) ?? "";
  return { name: cleanCardName(title), number: "" };
}

function getCardHeaderScope(
  scope: ParentNode,
  card: { name: string; number: string },
): ParentNode {
  const headings = [...scope.querySelectorAll<HTMLHeadingElement>("h2")];
  for (const heading of headings) {
    const text = normalizeText(heading.textContent);
    if ((card.number && text.includes(card.number)) || (card.name && text.includes(card.name))) {
      const header = heading.closest("header");
      if (header?.querySelector('img[src*="/assets/images/rarete/ids/rarete_"]')) {
        return header;
      }
    }
  }

  return (
    [...scope.querySelectorAll("header")].find(
      (header) =>
        header.querySelector("h2") &&
        header.querySelector('img[src*="/assets/images/rarete/ids/rarete_"]'),
    ) ?? scope
  );
}

function extractRarity(
  scope: ParentNode,
  card: { name: string; number: string },
): string {
  const headerScope = getCardHeaderScope(scope, card);
  const findRarity = (root: ParentNode) =>
    [...root.querySelectorAll<HTMLImageElement>('img[alt][src*="/assets/images/rarete/ids/rarete_"]')].find(
      (image) => {
        const alt = normalizeText(image.getAttribute("alt"));
        return alt && !/^\d+$/.test(alt);
      },
    );
  return normalizeRarity(
    findRarity(headerScope)?.getAttribute("alt") ?? findRarity(scope)?.getAttribute("alt"),
  );
}

export function formatSetCode(rawCode: string, cardNumber: string): string {
  const code = normalizeText(rawCode);
  const number = normalizeText(cardNumber);
  if (!code) return "";

  const numberSet = number.match(/\/([A-Z0-9]+-[A-Z])$/i);
  if (numberSet?.[1]) return numberSet[1].toUpperCase();
  if (code.toUpperCase() === "UPC") return "Promo non numérotée";
  return code;
}

function decoded(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function extractSetCode(
  scope: ParentNode,
  card: { name: string; number: string },
): string {
  const scanSrc = imageSource(getCardScanImg(scope));
  const scanMatch = scanSrc.match(/\/sets(?:_[a-z]+)?\/([^/?#]+)\//i);
  if (scanMatch?.[1]) return formatSetCode(decoded(scanMatch[1]), card.number);

  const symbol = [...scope.querySelectorAll<HTMLImageElement>('img[src*="/assets/images/symboles"]')].find(
    (image) => /\/symboles(?:_[a-z]+)?\/[^/.?#]+\.png/i.test(imageSource(image)),
  );
  if (symbol) {
    const match = imageSource(symbol).match(/\/symboles(?:_[a-z]+)?\/([^/.?#]+)\.png/i);
    if (match?.[1]) return formatSetCode(decoded(match[1]), card.number);
  }

  for (const link of scope.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    const href = link.getAttribute("href") || link.href || "";
    const match = href.match(/\/series\/[a-z]{2}\/([A-Z0-9-]+)/i);
    if (match?.[1]) return formatSetCode(decoded(match[1]), card.number);
  }
  return "";
}

export function buildCardTitle(parts: {
  name: string;
  rarity: string;
  number: string;
  setCode: string;
}): string {
  return [parts.name, parts.rarity, parts.number, parts.setCode]
    .map(normalizeText)
    .filter(Boolean)
    .join(" - ");
}

export function extractCard(addButton: HTMLButtonElement): ExtractedCard {
  const scope = getActiveCardContainer(addButton);
  const basic = extractCardNameAndNumber(scope);
  const rarity = extractRarity(scope, basic);
  const setCode = extractSetCode(scope, basic);
  const imageUrl = imageSource(getCardScanImg(scope));
  const title = buildCardTitle({ ...basic, rarity, setCode });

  return {
    name: basic.name,
    number: basic.number,
    rarity,
    setCode,
    imageUrl,
    title,
  };
}
