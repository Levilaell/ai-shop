/**
 * Manual product ingestion (spec §12, T2): populate the candidate queue from a
 * CSV export of the TikTok Shop catalog (or a paste from a form). Pure parsing +
 * validation — no DB access. The caller (web/worker) turns the validated rows
 * into `products` inserts via `buildProductInsert`.
 *
 * Expected CSV header (order-independent, case-insensitive):
 *   external_ref, title, price_brl, commission_pct, category, affiliate_link,
 *   affiliate_platform (optional, default tiktok_shop)
 */

import { AFFILIATE_PLATFORMS, type AffiliatePlatform } from './state-machine.js';
import {
  scoreProduct,
  DEFAULT_SCORE_CONFIG,
  type ScoreConfig,
  type ScoreBreakdown,
} from './score.js';

export interface ProductImportRow {
  readonly external_ref: string | null;
  readonly title: string;
  readonly price_brl: number;
  readonly commission_pct: number;
  readonly category: string | null;
  readonly affiliate_link: string | null;
  readonly affiliate_platform: AffiliatePlatform;
}

export interface RowError {
  /** 1-based data row number (excludes the header). */
  readonly row: number;
  readonly message: string;
}

export interface ParseResult {
  readonly rows: readonly ProductImportRow[];
  readonly errors: readonly RowError[];
}

const REQUIRED_HEADERS = ['title', 'price_brl', 'commission_pct'] as const;
const KNOWN_HEADERS = [
  'external_ref',
  'title',
  'price_brl',
  'commission_pct',
  'category',
  'affiliate_link',
  'affiliate_platform',
] as const;

/**
 * Minimal RFC-4180-ish CSV tokenizer: handles quoted fields, escaped quotes
 * (`""`), and commas/newlines inside quotes. Good enough for catalog exports;
 * not a general CSV library.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;
  const pushField = (): void => {
    row.push(field);
    field = '';
  };
  const pushRow = (): void => {
    pushField();
    rows.push(row);
    row = [];
  };

  // Strip a UTF-8 BOM if present.
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  while (i < s.length) {
    const c = s[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ',') {
      pushField();
      i++;
      continue;
    }
    if (c === '\r') {
      i++;
      continue;
    }
    if (c === '\n') {
      pushRow();
      i++;
      continue;
    }
    field += c;
    i++;
  }
  // Flush the final field/row unless the input ended on a clean newline.
  if (field.length > 0 || row.length > 0) pushRow();
  return rows;
}

/** Parse a BRL/locale-flexible number: accepts "79,90", "1.234,56", "89.90". */
function parseNumber(raw: string): number | null {
  const t = raw.trim();
  if (t === '') return null;
  let normalized = t.replace(/[R$\s]/g, '');
  const hasComma = normalized.includes(',');
  const hasDot = normalized.includes('.');
  if (hasComma && hasDot) {
    // Assume '.' thousands + ',' decimal (pt-BR): 1.234,56 -> 1234.56
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    normalized = normalized.replace(',', '.');
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function emptyToNull(s: string): string | null {
  const t = s.trim();
  return t === '' ? null : t;
}

/**
 * Parse + validate a product CSV. Invalid rows are collected in `errors` (with
 * row numbers) and skipped; valid rows are returned. A structurally broken CSV
 * (missing required headers) yields a single error and no rows.
 */
export function parseProductsCsv(csv: string): ParseResult {
  const table = parseCsv(csv).filter((r) => r.some((c) => c.trim() !== '')); // drop blank lines
  if (table.length === 0) {
    return { rows: [], errors: [{ row: 0, message: 'CSV vazio.' }] };
  }

  const header = table[0]!.map((h) => h.trim().toLowerCase());
  const missing = REQUIRED_HEADERS.filter((h) => !header.includes(h));
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [{ row: 0, message: `Cabeçalhos obrigatórios ausentes: ${missing.join(', ')}.` }],
    };
  }

  const idx = (name: (typeof KNOWN_HEADERS)[number]): number => header.indexOf(name);
  const col = (cells: string[], name: (typeof KNOWN_HEADERS)[number]): string => {
    const at = idx(name);
    return at >= 0 && at < cells.length ? cells[at]! : '';
  };

  const rows: ProductImportRow[] = [];
  const errors: RowError[] = [];

  for (let r = 1; r < table.length; r++) {
    const cells = table[r]!;
    const dataRow = r; // 1-based data row number

    const title = col(cells, 'title').trim();
    if (title === '') {
      errors.push({ row: dataRow, message: 'title vazio.' });
      continue;
    }

    const price = parseNumber(col(cells, 'price_brl'));
    if (price === null || price < 0) {
      errors.push({ row: dataRow, message: `price_brl inválido: "${col(cells, 'price_brl')}".` });
      continue;
    }

    const commission = parseNumber(col(cells, 'commission_pct'));
    if (commission === null || commission < 0 || commission > 100) {
      errors.push({
        row: dataRow,
        message: `commission_pct inválido (0–100): "${col(cells, 'commission_pct')}".`,
      });
      continue;
    }

    let platform: AffiliatePlatform = 'tiktok_shop';
    const platformRaw = col(cells, 'affiliate_platform').trim().toLowerCase();
    if (platformRaw !== '') {
      if (!(AFFILIATE_PLATFORMS as readonly string[]).includes(platformRaw)) {
        errors.push({
          row: dataRow,
          message: `affiliate_platform inválida: "${platformRaw}" (use ${AFFILIATE_PLATFORMS.join('/')}).`,
        });
        continue;
      }
      platform = platformRaw as AffiliatePlatform;
    }

    rows.push({
      external_ref: emptyToNull(col(cells, 'external_ref')),
      title,
      price_brl: price,
      commission_pct: commission,
      category: emptyToNull(col(cells, 'category')),
      affiliate_link: emptyToNull(col(cells, 'affiliate_link')),
      affiliate_platform: platform,
    });
  }

  return { rows, errors };
}

/** A row ready to `insert` into `public.products`, with score precomputed. */
export interface ProductInsert {
  readonly account_id: string;
  readonly external_ref: string | null;
  readonly affiliate_platform: AffiliatePlatform;
  readonly title: string;
  readonly price_brl: number;
  readonly commission_pct: number;
  readonly category: string | null;
  readonly affiliate_link: string | null;
  readonly score: number;
  readonly score_breakdown: ScoreBreakdown;
  readonly status: 'product_candidate';
}

/**
 * Turn a validated import row into a `products` insert payload, scoring it so the
 * approval queue is ordered the moment the rows land (status `product_candidate`).
 */
export function buildProductInsert(
  row: ProductImportRow,
  accountId: string,
  config: ScoreConfig = DEFAULT_SCORE_CONFIG,
): ProductInsert {
  const { score, breakdown } = scoreProduct(row, config);
  return {
    account_id: accountId,
    external_ref: row.external_ref,
    affiliate_platform: row.affiliate_platform,
    title: row.title,
    price_brl: row.price_brl,
    commission_pct: row.commission_pct,
    category: row.category,
    affiliate_link: row.affiliate_link,
    score,
    score_breakdown: breakdown,
    status: 'product_candidate',
  };
}
