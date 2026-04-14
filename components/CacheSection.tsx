import React, { useCallback, useEffect, useState } from 'react';
import {
  CACHE_DB_NAME,
  CACHE_OBJECT_STORE,
  listCachedSnapshotMeta,
  readFullCacheExportTime,
  type CachedMonthMeta,
} from '../services/dataCache';
import { BULK_DOWNLOAD_CONCURRENCY, type CacheDownloadProgress } from '../services/bulkMonthDownload';

export type { CacheDownloadProgress };

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} КБ`;
  return `${(n / (1024 * 1024)).toFixed(2)} МБ`;
}

interface Props {
  currentMonth: string;
  offlineMode: boolean;
  onOfflineModeChange: (value: boolean) => void;
  /** Мета снимка для выбранного в приложении месяца (если есть) */
  cacheMeta: { month: string; savedAt: string } | null;
  dataLoading: boolean;
  cacheBusy: boolean;
  onSaveCurrentMonthToCache: () => Promise<void>;
  onDownloadAllMonthsToCache: (opts: {
    mode: 'ytd' | 'table_full';
    onProgress: (p: CacheDownloadProgress) => void;
    signal: AbortSignal;
    onMonthSaved?: () => void;
  }) => Promise<void>;
  onClearDeviceCache: () => Promise<void>;
}

const CacheSection: React.FC<Props> = ({
  currentMonth,
  offlineMode,
  onOfflineModeChange,
  cacheMeta,
  dataLoading,
  cacheBusy,
  onSaveCurrentMonthToCache,
  onDownloadAllMonthsToCache,
  onClearDeviceCache,
}) => {
  const [metaList, setMetaList] = useState<CachedMonthMeta[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [fullExportAt, setFullExportAt] = useState<string | null>(() => readFullCacheExportTime());
  const [bulkProgress, setBulkProgress] = useState<CacheDownloadProgress | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const bulkAbortRef = React.useRef<AbortController | null>(null);

  const refreshMeta = useCallback(async () => {
    setStatsLoading(true);
    try {
      const list = await listCachedSnapshotMeta();
      setMetaList(list);
      setFullExportAt(readFullCacheExportTime());
    } catch (e) {
      console.error(e);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  /** Обновление таблицы месяцев без мигания «Считаем…» — во время полной выгрузки */
  const refreshMetaQuiet = useCallback(async () => {
    try {
      const list = await listCachedSnapshotMeta();
      setMetaList(list);
      setFullExportAt(readFullCacheExportTime());
    } catch (e) {
      console.error(e);
    }
  }, []);

  const metaDebounceRef = React.useRef<number | null>(null);
  const scheduleMetaRefreshDuringBulk = useCallback(() => {
    if (metaDebounceRef.current !== null) window.clearTimeout(metaDebounceRef.current);
    metaDebounceRef.current = window.setTimeout(() => {
      metaDebounceRef.current = null;
      void refreshMetaQuiet();
    }, 300);
  }, [refreshMetaQuiet]);

  useEffect(() => {
    void refreshMeta();
  }, [refreshMeta]);

  useEffect(
    () => () => {
      if (metaDebounceRef.current !== null) window.clearTimeout(metaDebounceRef.current);
    },
    []
  );

  const totalBytes = metaList.reduce((s, r) => s + r.approxBytes, 0);
  const busy = dataLoading || cacheBusy || bulkProgress !== null;

  const formattedFullExport = fullExportAt
    ? new Date(fullExportAt).toLocaleString('ru-RU', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  const formattedCurrentSnap = cacheMeta
    ? new Date(cacheMeta.savedAt).toLocaleString('ru-RU', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  const handleOfflineToggle = (checked: boolean) => {
    onOfflineModeChange(checked);
  };

  const handleCancelBulk = () => {
    bulkAbortRef.current?.abort();
  };

  const runBulkDownload = async (mode: 'ytd' | 'table_full') => {
    setBulkError(null);
    bulkAbortRef.current?.abort();
    bulkAbortRef.current = new AbortController();
    const { signal } = bulkAbortRef.current;
    setBulkProgress({ phase: 'discover', completed: 0, total: 1 });
    try {
      await onDownloadAllMonthsToCache({
        mode,
        signal,
        onProgress: p => setBulkProgress(p),
        onMonthSaved: scheduleMetaRefreshDuringBulk,
      });
      await refreshMeta();
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') {
        setBulkError('Загрузка остановлена.');
      } else {
        setBulkError(e instanceof Error ? e.message : 'Ошибка полной выгрузки.');
      }
    } finally {
      setBulkProgress(null);
      bulkAbortRef.current = null;
    }
  };

  const progressPct =
    bulkProgress && bulkProgress.phase === 'month' && bulkProgress.total > 0
      ? Math.round((bulkProgress.completed / bulkProgress.total) * 100)
      : bulkProgress?.phase === 'discover'
        ? null
        : 0;

  return (
    <section className="space-y-6">
      <div className="bg-white rounded-[28px] border border-gray-200 shadow-sm p-6 md:p-8">
        <h2 className="text-lg font-black text-brand-primary tracking-tight mb-1">Локальный кэш</h2>
        <p className="text-sm text-gray-500 mb-6 max-w-3xl">
          Сохраняйте выгрузки с сервера на это устройство (IndexedDB). В режиме «Работать из кэша» запросы к Google не
          выполняются, пока вы не обновите данные. По умолчанию кэшируется только <strong>текущий год с января по текущий
          месяц</strong> (в марте — январь, февраль, март). Отдельной кнопкой можно выгрузить{' '}
          <strong>весь период</strong> по датам в таблице — это может быть много месяцев и долго. Запросы идут параллельно
          ({BULK_DOWNLOAD_CONCURRENCY} одновременно).
        </p>

        <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-950">
          <p className="font-bold text-emerald-900 mb-2">Новые строки в таблице — нужно ли качать всё заново?</p>
          <p className="text-emerald-900/90 leading-relaxed mb-2">
            <strong>Отдельно «только обновления» (дельту) сервер не отдаёт</strong> — Google Apps Script при запросе месяца
            возвращает полный снимок за этот месяц. Но <strong>перекачивать весь кэш не обязательно</strong>.
          </p>
          <ul className="list-disc pl-5 space-y-1 text-emerald-900/90">
            <li>
              Изменили данные <strong>в одном месяце</strong> — в основном приложении выберите этот месяц (селектор
              месяца в визитах/календаре и т.д.), зайдите сюда и нажмите{' '}
              <strong>«Текущий месяц в кэш»</strong> — в IndexedDB обновится <strong>только он</strong>.
            </li>
            <li>
              Правки в <strong>нескольких месяцах</strong> — повторите для каждого месяца по очереди или нажмите{' '}
              <strong>«С начала года в кэш»</strong> (перезапишутся только месяцы текущего года, не вся история).
            </li>
            <li>
              Нужна вся история актуальной — <strong>«Весь период в таблице»</strong> (дольше всех).
            </li>
          </ul>
        </div>

        <details className="mb-6 group rounded-2xl border border-amber-200/80 bg-amber-50/50 px-4 py-3 text-sm text-amber-950">
          <summary className="cursor-pointer font-bold text-amber-900 list-none flex items-center gap-2 [&::-webkit-details-marker]:hidden">
            <span className="text-amber-600 group-open:rotate-90 transition-transform inline-block">▸</span>
            Где на компьютере лежит кэш (чтобы не удалить случайно)
          </summary>
          <div className="mt-3 space-y-3 text-amber-950/90 leading-relaxed pl-6">
            <p>
              Данные месяцев хранятся в <strong>IndexedDB</strong> внутри <strong>профиля браузера</strong>, а не в папке
              с проектом. Имя базы в браузере:{' '}
              <code className="rounded bg-white/80 px-1.5 py-0.5 text-xs font-mono text-amber-950">{CACHE_DB_NAME}</code>
              , хранилище:{' '}
              <code className="rounded bg-white/80 px-1.5 py-0.5 text-xs font-mono text-amber-950">
                {CACHE_OBJECT_STORE}
              </code>
              .
            </p>
            <p>
              <strong>Посмотреть в браузере:</strong> F12 → вкладка <strong>Приложение</strong> /{' '}
              <strong>Application</strong> → <strong>IndexedDB</strong> → выберите сайт →{' '}
              <code className="text-xs font-mono">{CACHE_DB_NAME}</code>.
            </p>
            <p>
              <strong>Файлы на диске (Windows):</strong> Chromium хранит IndexedDB в папке профиля, например:
            </p>
            <ul className="list-disc pl-5 space-y-1 font-mono text-xs break-all">
              <li>
                Chrome:{' '}
                <span className="text-amber-900">
                  %LOCALAPPDATA%\Google\Chrome\User Data\Default\IndexedDB\
                </span>
              </li>
              <li>
                Edge:{' '}
                <span className="text-amber-900">
                  %LOCALAPPDATA%\Microsoft\Edge\User Data\Default\IndexedDB\
                </span>
              </li>
            </ul>
            <p className="text-xs">
              Внутри — папки с техническими именами (по сайту), не трогайте их вручную, если не уверены. Профиль{' '}
              <strong>не Default</strong> (другой пользователь Chrome) — путь будет{' '}
              <code className="font-mono">User Data\Profile 1\IndexedDB\</code> и т.д.
            </p>
            <p>
              Дополнительно в <strong>localStorage</strong> того же сайта: флаги «работать из кэша» и дата полной выгрузки (
              ключи <code className="font-mono text-xs">belinda_offline_cache</code>,{' '}
              <code className="font-mono text-xs">belinda_full_cache_at</code>).
            </p>
            <p className="font-semibold text-amber-900">
              Очистка «кэша и cookie» для этого сайта или «удалить все данные сайтов» в настройках браузера может стереть
              IndexedDB и localStorage — кэш приложения пропадёт.
            </p>
          </div>
        </details>

        <div className="flex flex-col lg:flex-row lg:items-start gap-6">
          <div className="flex-1 space-y-4">
            <label className="flex items-center gap-3 cursor-pointer select-none bg-gray-50 px-4 py-3 rounded-2xl border border-gray-200 w-fit">
              <input
                type="checkbox"
                className="rounded border-gray-300 text-brand-accent focus:ring-brand-accent"
                checked={offlineMode}
                onChange={e => handleOfflineToggle(e.target.checked)}
              />
              <span className="text-sm font-bold text-gray-800">Работать из кэша</span>
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                title="Сохраняет в кэш тот месяц, который сейчас выбран в приложении (визиты, календарь и т.д.) — удобно обновить данные после правок в таблице"
                onClick={() => void onSaveCurrentMonthToCache().then(() => refreshMeta())}
                className="px-5 py-2.5 rounded-xl bg-brand-accent text-white text-xs font-black uppercase tracking-wider hover:brightness-95 disabled:opacity-50"
              >
                {cacheBusy && !bulkProgress ? 'Загрузка…' : 'Текущий месяц в кэш'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void runBulkDownload('ytd')}
                className="px-5 py-2.5 rounded-xl bg-slate-800 text-white text-xs font-black uppercase tracking-wider hover:bg-slate-700 disabled:opacity-50"
              >
                {bulkProgress ? 'Идёт выгрузка…' : 'С начала года в кэш'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void runBulkDownload('table_full')}
                className="px-5 py-2.5 rounded-xl bg-slate-600 text-white text-xs font-black uppercase tracking-wider border border-slate-500 hover:bg-slate-500 disabled:opacity-50"
                title="От первой до последней даты во всех листах — может быть 20+ месяцев"
              >
                {bulkProgress ? 'Идёт выгрузка…' : 'Весь период в таблице'}
              </button>
              {bulkProgress && (
                <button
                  type="button"
                  onClick={handleCancelBulk}
                  className="px-5 py-2.5 rounded-xl border border-red-200 text-red-700 text-xs font-bold uppercase tracking-wider hover:bg-red-50"
                >
                  Остановить
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => void onClearDeviceCache().then(() => refreshMeta())}
                className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-xs font-bold uppercase tracking-wider hover:bg-gray-50 disabled:opacity-50"
              >
                Очистить кэш
              </button>
            </div>
            <p className="text-xs text-gray-500">
              «Текущий месяц в кэш» относится к месяцу <span className="font-mono font-semibold text-gray-700">{currentMonth}</span> — переключите месяц в разделе «Визиты» / «Календарь», если нужен другой.
            </p>

            {bulkError && <p className="text-sm text-red-600">{bulkError}</p>}

            {bulkProgress && (
              <div className="space-y-2 max-w-xl">
                <div className="flex justify-between text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  <span>
                    {bulkProgress.phase === 'discover'
                      ? 'Определение диапазона месяцев…'
                      : `Сохранено ${bulkProgress.completed} из ${bulkProgress.total}`}
                  </span>
                  <span>{progressPct === null ? '…' : `${progressPct}%`}</span>
                </div>
                <div className="h-2.5 rounded-full bg-gray-200 overflow-hidden">
                  {progressPct === null ? (
                    <div className="h-full w-1/3 bg-gradient-to-r from-amber-400 to-brand-accent animate-pulse rounded-full" />
                  ) : (
                    <div
                      className="h-full bg-gradient-to-r from-amber-400 to-brand-accent transition-[width] duration-300 ease-out"
                      style={{ width: `${progressPct}%` }}
                    />
                  )}
                </div>
                {bulkProgress.phase === 'month' && bulkProgress.lastMonth && (
                  <p className="text-xs text-gray-500 font-mono">
                    Последний сохранённый: {bulkProgress.lastMonth}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="lg:w-[320px] shrink-0 space-y-3 bg-slate-900 text-slate-100 rounded-2xl p-5 border border-slate-700">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-400/90">Статистика</p>
            {statsLoading ? (
              <p className="text-sm text-slate-400">Считаем…</p>
            ) : (
              <>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-bold">Размер кэша (оценка)</p>
                  <p className="text-xl font-black text-white">{formatBytes(totalBytes)}</p>
                  <p className="text-[10px] text-slate-500 mt-1">Месяцев в кэше: {metaList.length}</p>
                </div>
                <div className="border-t border-slate-700 pt-3">
                  <p className="text-[10px] text-slate-500 uppercase font-bold">Дата полной выгрузки</p>
                  <p className="text-sm font-semibold text-emerald-300">
                    {formattedFullExport ?? '— ещё не выполнялась'}
                  </p>
                </div>
                <div className="border-t border-slate-700 pt-3">
                  <p className="text-[10px] text-slate-500 uppercase font-bold">Месяц в приложении</p>
                  <p className="text-sm font-mono text-slate-200">{currentMonth}</p>
                  {cacheMeta && cacheMeta.month === currentMonth ? (
                    <p className="text-xs text-slate-400 mt-1">Снимок: {formattedCurrentSnap}</p>
                  ) : (
                    <p className="text-xs text-amber-200/90 mt-1">
                      Нет снимка за {currentMonth} — сохраните этот месяц или полную выгрузку.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {!statsLoading && metaList.length > 0 && (
        <div className="bg-white rounded-[28px] border border-gray-200 shadow-sm p-6 md:p-8">
          <h3 className="text-sm font-black text-gray-800 uppercase tracking-wider mb-4">Сохранённые месяцы</h3>
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                  <th className="pb-2 pr-4">Месяц</th>
                  <th className="pb-2 pr-4">Дата выгрузки в кэш</th>
                  <th className="pb-2">Размер</th>
                </tr>
              </thead>
              <tbody>
                {metaList.map(row => (
                  <tr key={row.month} className="border-b border-gray-50">
                    <td className="py-2 pr-4 font-mono font-semibold">{row.month}</td>
                    <td className="py-2 pr-4 text-gray-600">
                      {new Date(row.savedAt).toLocaleString('ru-RU', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-2 text-gray-500">{formatBytes(row.approxBytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
};

export default CacheSection;
