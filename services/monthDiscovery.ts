import type { ApiResponse } from '../types';

function collectMonthsFromRows(rows: Record<string, unknown>[]): Set<string> {
  const set = new Set<string>();
  for (const row of rows) {
    const dk = Object.keys(row).find(k => k.toLowerCase().includes('дата'));
    if (!dk) continue;
    const v = String(row[dk] ?? '');
    const ym = v.slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(ym)) set.add(ym);
  }
  return set;
}

/** Месяцы, встречающиеся в данных (без «дырок») */
export function collectMonthsFromApiResponse(data: ApiResponse): string[] {
  const set = new Set<string>();
  collectMonthsFromRows((data.visits || []) as Record<string, unknown>[]).forEach(m => set.add(m));
  collectMonthsFromRows((data.fixation || []) as Record<string, unknown>[]).forEach(m => set.add(m));
  collectMonthsFromRows((data.orders || []) as Record<string, unknown>[]).forEach(m => set.add(m));
  return Array.from(set).sort();
}

/**
 * С января текущего календарного года по текущий месяц (включительно).
 * Например, в марте 2026 → 2026-01, 2026-02, 2026-03.
 * Без запроса к API — только по дате на устройстве.
 */
export function getYearToDateMonthList(now: Date = new Date()): string[] {
  const y = now.getFullYear();
  const endM = now.getMonth() + 1;
  const out: string[] = [];
  for (let m = 1; m <= endM; m += 1) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
  }
  return out;
}

/** Все календарные месяцы от минимального к максимальному включительно */
export function fillMonthRangeFromBounds(months: string[]): string[] {
  if (months.length === 0) return [];
  const sorted = [...months].sort();
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const [y0, m0] = min.split('-').map(Number);
  const [y1, m1] = max.split('-').map(Number);
  const out: string[] = [];
  let y = y0;
  let m = m0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    if (y === y1 && m === m1) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/**
 * Полный диапазон по данным таблицы: от самой ранней до самой поздней даты
 * (все календарные месяцы между ними). Может быть 20+ месяцев — долго.
 */
export async function discoverFullTableMonthRange(
  apiUrl: string,
  signal?: AbortSignal
): Promise<string[]> {
  const r = await fetch(apiUrl, { signal });
  const data: ApiResponse = await r.json();
  const found = collectMonthsFromApiResponse(data);
  if (found.length > 0) return fillMonthRangeFromBounds(found);
  const now = new Date();
  return [`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`];
}
