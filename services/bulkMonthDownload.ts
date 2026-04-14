import type { ApiResponse } from '../types';
import { saveMonthSnapshot } from './dataCache';

/** Сколько месяцев запрашивать одновременно (ускорение ~в N раз при медленном сети/Apps Script) */
export const BULK_DOWNLOAD_CONCURRENCY = 4;

export interface CacheDownloadProgress {
  phase: 'discover' | 'month';
  /** Для discover: 0; для month: сколько снимков уже сохранено */
  completed: number;
  total: number;
  /** Последний завершённый месяц (подпись под прогрессом) */
  lastMonth?: string;
}

/**
 * Параллельная выгрузка месяцев в кэш (пул воркеров с общей очередью).
 * Быстрее последовательного цикла в 3–5 раз при типичных задержках Google Apps Script.
 */
export async function downloadMonthsToCacheParallel(params: {
  apiUrl: string;
  months: string[];
  signal: AbortSignal;
  concurrency?: number;
  onProgress: (p: CacheDownloadProgress) => void;
  onMonthSaved?: () => void;
}): Promise<void> {
  const { apiUrl, months, signal, onProgress, onMonthSaved } = params;
  const concurrency = Math.max(1, Math.min(params.concurrency ?? BULK_DOWNLOAD_CONCURRENCY, 8));
  const total = months.length;
  if (total === 0) return;

  let nextIndex = 0;
  let completed = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const i = nextIndex;
      nextIndex += 1;
      if (i >= months.length) return;

      const m = months[i];
      const response = await fetch(`${apiUrl}?month=${encodeURIComponent(m)}`, { signal });
      const data: ApiResponse = await response.json();
      await saveMonthSnapshot(m, data);
      completed += 1;
      onProgress({ phase: 'month', completed, total, lastMonth: m });
      onMonthSaved?.();
    }
  };

  const pool = Math.min(concurrency, total);
  await Promise.all(Array.from({ length: pool }, () => worker()));
}
