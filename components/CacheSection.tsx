import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  listCachedSnapshotMeta,
  type CachedMonthMeta,
} from '../services/dataCache';
import {
  readDiscoverCache,
  writeDiscoverCache,
  isDiscoverCacheFresh,
} from '../services/monthDiscovery';
import { type CacheDownloadProgress } from '../services/bulkMonthDownload';

export type { CacheDownloadProgress };

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} КБ`;
  return `${(n / (1024 * 1024)).toFixed(2)} МБ`;
}

const RU_MONTH_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) return ym;
  return `${RU_MONTH_SHORT[m - 1]} ${y}`;
}

const LS_KEY_VISITS = 'belinda_last_load_visits';
const LS_KEY_PRESCRIPTIONS = 'belinda_last_load_prescriptions';
const LS_KEY_DOCTOR_BASE = 'belinda_last_load_doctor_base';

function readTimestamp(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeTimestamp(key: string): void {
  try { localStorage.setItem(key, new Date().toISOString()); } catch { /* */ }
}
function formatTimestamp(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return null; }
}

type CardKey = 'visits' | 'prescriptions' | 'doctorBase';

interface Props {
  currentMonth: string;
  offlineMode: boolean;
  onOfflineModeChange: (value: boolean) => void;
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
  onDiscoverMonths: (signal?: AbortSignal) => Promise<string[]>;
  onDownloadMonthsToCache: (opts: {
    months: string[];
    signal: AbortSignal;
    onProgress: (p: CacheDownloadProgress) => void;
    onMonthSaved?: () => void;
  }) => Promise<void>;
}

interface CardStyle {
  bg: string;
  hover: string;
  ring: string;
  icon: string;
  iconBg: string;
  progress: string;
  accentText: string;
  iconPath: string;
}

const CARD_STYLES: Record<CardKey, CardStyle> = {
  visits: {
    bg: 'bg-brand-accent',
    hover: 'hover:brightness-95',
    ring: 'border-brand-accent/20',
    icon: 'text-brand-accent',
    iconBg: 'bg-brand-accent/10',
    progress: 'bg-gradient-to-r from-red-400 to-brand-accent',
    accentText: 'text-brand-accent',
    iconPath: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4',
  },
  prescriptions: {
    bg: 'bg-brand-primary',
    hover: 'hover:brightness-110',
    ring: 'border-brand-primary/20',
    icon: 'text-brand-primary',
    iconBg: 'bg-brand-primary/10',
    progress: 'bg-gradient-to-r from-blue-400 to-brand-primary',
    accentText: 'text-brand-primary',
    iconPath: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  },
  doctorBase: {
    bg: 'bg-slate-700',
    hover: 'hover:bg-slate-600',
    ring: 'border-slate-200',
    icon: 'text-slate-600',
    iconBg: 'bg-slate-100',
    progress: 'bg-gradient-to-r from-slate-400 to-slate-700',
    accentText: 'text-slate-700',
    iconPath: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
  },
};

interface MonthListProps {
  months: string[];
  selected: Set<string>;
  cachedMap: Map<string, string>;
  disabled: boolean;
  onToggle: (m: string) => void;
}

const MonthList: React.FC<MonthListProps> = ({ months, selected, cachedMap, disabled, onToggle }) => (
  <div className="max-h-56 overflow-y-auto custom-scrollbar -mx-1 px-1">
    <ul className="space-y-0.5">
      {months.map(m => {
        const isCached = cachedMap.has(m);
        const isSel = selected.has(m);
        return (
          <li key={m}>
            <label
              className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                disabled
                  ? 'opacity-50 cursor-not-allowed'
                  : `cursor-pointer ${isSel ? 'bg-gray-100' : 'hover:bg-gray-50'}`
              }`}
            >
              <span className="flex items-center gap-2 min-w-0">
                <input
                  type="checkbox"
                  className="rounded border-gray-300 text-brand-accent focus:ring-brand-accent shrink-0"
                  checked={isSel}
                  disabled={disabled}
                  onChange={() => onToggle(m)}
                />
                <span className="font-mono text-gray-700 shrink-0">{m}</span>
                <span className="text-gray-400 truncate">{formatMonthLabel(m)}</span>
              </span>
              {isCached && (
                <span className="flex items-center gap-1 text-green-600 shrink-0">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <span className="text-[9px] uppercase tracking-wider">в кэше</span>
                </span>
              )}
            </label>
          </li>
        );
      })}
    </ul>
  </div>
);

interface CardProps {
  cardKey: CardKey;
  title: string;
  subtitle: string;
  months: string[];
  selected: Set<string>;
  cachedMap: Map<string, string>;
  lastLoaded: string | null;
  busy: boolean;
  active: boolean;
  progress: { done: number; total: number; lastMonth?: string } | null;
  loadingMonths: boolean;
  monthsError: string | null;
  onToggle: (m: string) => void;
  onSelectAll: () => void;
  onSelectMissing: () => void;
  onClear: () => void;
  onLoad: () => void;
  onCancel: () => void;
}

const Card: React.FC<CardProps> = ({
  cardKey, title, subtitle, months, selected, cachedMap, lastLoaded,
  busy, active, progress, loadingMonths, monthsError,
  onToggle, onSelectAll, onSelectMissing, onClear, onLoad, onCancel,
}) => {
  const s = CARD_STYLES[cardKey];
  const formattedTs = formatTimestamp(lastLoaded);
  const selectedCount = selected.size;
  const totalMonths = months.length;
  const cachedCount = months.reduce((n, m) => (cachedMap.has(m) ? n + 1 : n), 0);
  const progressPct = progress && progress.total > 0
    ? Math.round((progress.done / progress.total) * 100)
    : 0;

  return (
    <div className={`bg-white rounded-2xl border ${s.ring} shadow-sm p-5 flex flex-col gap-4 relative overflow-hidden`}>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 ${s.iconBg} rounded-xl flex items-center justify-center shrink-0`}>
          {active ? (
            <svg className={`w-5 h-5 ${s.icon} animate-spin`} fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className={`w-5 h-5 ${s.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={s.iconPath} />
            </svg>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-black text-gray-900">{title}</h3>
          <p className="text-[11px] text-gray-400 font-medium mt-0.5">{subtitle}</p>
        </div>
        {active && (
          <span className={`text-lg font-black ${s.icon} tabular-nums`}>{progressPct}%</span>
        )}
      </div>

      {active && progress && (
        <div className="space-y-1">
          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full ${s.progress} rounded-full transition-[width] duration-300 ease-out`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="text-[10px] text-gray-500 font-medium tabular-nums">
            {progress.done} / {progress.total}{progress.lastMonth ? ` · ${progress.lastMonth}` : ''}
          </p>
        </div>
      )}

      {loadingMonths ? (
        <div className="py-6 flex items-center justify-center text-[11px] text-gray-400 font-medium">
          Получаем список месяцев…
        </div>
      ) : monthsError ? (
        <div className="py-3 text-[11px] text-red-500 font-medium">
          {monthsError}
        </div>
      ) : months.length === 0 ? (
        <div className="py-3 text-[11px] text-gray-400 font-medium">
          Нет доступных месяцев.
        </div>
      ) : (
        <>
          <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider">
            <button
              type="button"
              disabled={busy || active}
              onClick={onSelectMissing}
              className={`px-2 py-1 rounded-md ${s.accentText} hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent transition-colors`}
            >
              Только новые
            </button>
            <button
              type="button"
              disabled={busy || active}
              onClick={onSelectAll}
              className="px-2 py-1 rounded-md text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
            >
              Все
            </button>
            <button
              type="button"
              disabled={busy || active || selectedCount === 0}
              onClick={onClear}
              className="px-2 py-1 rounded-md text-gray-400 hover:bg-gray-50 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            >
              Снять
            </button>
            <span className="ml-auto text-[9px] text-gray-400 font-bold normal-case tracking-normal">
              {cachedCount}/{totalMonths} в кэше
            </span>
          </div>

          <MonthList
            months={months}
            selected={selected}
            cachedMap={cachedMap}
            disabled={busy || active}
            onToggle={onToggle}
          />
        </>
      )}

      <div className="flex items-center justify-between gap-3 mt-auto">
        {active ? (
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2.5 rounded-xl bg-gray-200 text-gray-700 text-[10px] font-black uppercase tracking-wider hover:bg-gray-300 transition-all"
          >
            Отмена
          </button>
        ) : (
          <button
            type="button"
            disabled={busy || selectedCount === 0 || loadingMonths || !!monthsError}
            onClick={onLoad}
            className={`px-5 py-2.5 rounded-xl ${s.bg} text-white text-[10px] font-black uppercase tracking-wider ${s.hover} disabled:opacity-50 transition-all`}
          >
            Загрузить{selectedCount > 0 ? ` (${selectedCount})` : ''}
          </button>
        )}
        <div className="text-right shrink-0">
          {formattedTs ? (
            <p className="text-[10px] text-green-600 font-bold">{formattedTs}</p>
          ) : (
            <p className="text-[10px] text-gray-300 font-medium">не загружалось</p>
          )}
        </div>
      </div>
    </div>
  );
};

const CacheSection: React.FC<Props> = ({
  currentMonth,
  offlineMode,
  onOfflineModeChange,
  dataLoading,
  cacheBusy,
  onClearDeviceCache,
  onDiscoverMonths,
  onDownloadMonthsToCache,
}) => {
  const [metaList, setMetaList] = useState<CachedMonthMeta[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);

  const [tsVisits, setTsVisits] = useState(() => readTimestamp(LS_KEY_VISITS));
  const [tsPrescriptions, setTsPrescriptions] = useState(() => readTimestamp(LS_KEY_PRESCRIPTIONS));
  const [tsDoctorBase, setTsDoctorBase] = useState(() => readTimestamp(LS_KEY_DOCTOR_BASE));

  const [months, setMonths] = useState<string[]>([]);
  const [monthsLoading, setMonthsLoading] = useState(true);
  const [monthsError, setMonthsError] = useState<string | null>(null);

  const [selVisits, setSelVisits] = useState<Set<string>>(new Set());
  const [selPrescriptions, setSelPrescriptions] = useState<Set<string>>(new Set());
  const [selDoctorBase, setSelDoctorBase] = useState<Set<string>>(new Set());

  const [activeCard, setActiveCard] = useState<CardKey | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; lastMonth?: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refreshMeta = useCallback(async () => {
    setStatsLoading(true);
    try {
      const list = await listCachedSnapshotMeta();
      setMetaList(list);
    } catch (e) {
      console.error(e);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => { void refreshMeta(); }, [refreshMeta]);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();

    const fromCache = readDiscoverCache();
    if (fromCache && fromCache.months.length > 0) {
      setMonths(fromCache.months);
      setMonthsLoading(false);
    } else {
      setMonthsLoading(true);
    }

    if (!fromCache || !isDiscoverCacheFresh(fromCache)) {
      setMonthsError(null);
      onDiscoverMonths(ctrl.signal)
        .then(list => {
          if (cancelled) return;
          setMonths(list);
          writeDiscoverCache(list);
          setMonthsError(null);
        })
        .catch(e => {
          if (cancelled) return;
          if (e instanceof DOMException && e.name === 'AbortError') return;
          console.error(e);
          if (!fromCache) {
            setMonthsError('Не удалось получить список месяцев. Проверьте подключение.');
          }
        })
        .finally(() => {
          if (cancelled) return;
          setMonthsLoading(false);
        });
    }

    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [onDiscoverMonths]);

  const cachedMap = useMemo(() => {
    const m = new Map<string, string>();
    metaList.forEach(r => m.set(r.month, r.savedAt));
    return m;
  }, [metaList]);

  const totalBytes = metaList.reduce((s, r) => s + r.approxBytes, 0);
  const busy = dataLoading || cacheBusy || activeCard !== null;

  const makeToggle = useCallback(
    (setter: React.Dispatch<React.SetStateAction<Set<string>>>) =>
      (m: string) => {
        setter(prev => {
          const next = new Set(prev);
          if (next.has(m)) next.delete(m);
          else next.add(m);
          return next;
        });
      },
    []
  );

  const handleLoad = useCallback(
    async (
      cardKey: CardKey,
      selected: Set<string>,
      lsKey: string,
      setTs: (v: string | null) => void
    ) => {
      const monthsToLoad = Array.from(selected).sort();
      if (monthsToLoad.length === 0) return;

      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setActiveCard(cardKey);
      setProgress({ done: 0, total: monthsToLoad.length });

      try {
        await onDownloadMonthsToCache({
          months: monthsToLoad,
          signal: ctrl.signal,
          onProgress: p => {
            setProgress({ done: p.completed, total: p.total, lastMonth: p.lastMonth });
          },
          onMonthSaved: () => { void refreshMeta(); },
        });
        writeTimestamp(lsKey);
        setTs(readTimestamp(lsKey));
        await refreshMeta();
      } catch (e) {
        if (!(e instanceof DOMException && e.name === 'AbortError')) {
          console.error(e);
        }
      } finally {
        setActiveCard(null);
        setProgress(null);
        abortRef.current = null;
      }
    },
    [onDownloadMonthsToCache, refreshMeta]
  );

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const cardConfigs: Array<{
    cardKey: CardKey;
    title: string;
    subtitle: string;
    selected: Set<string>;
    setSelected: React.Dispatch<React.SetStateAction<Set<string>>>;
    lastLoaded: string | null;
    setLastLoaded: (v: string | null) => void;
    lsKey: string;
  }> = [
    {
      cardKey: 'visits',
      title: 'Загрузить визиты',
      subtitle: 'Рекомендуется ежедневно',
      selected: selVisits,
      setSelected: setSelVisits,
      lastLoaded: tsVisits,
      setLastLoaded: setTsVisits,
      lsKey: LS_KEY_VISITS,
    },
    {
      cardKey: 'prescriptions',
      title: 'Загрузить выписку врача',
      subtitle: 'Раз в месяц',
      selected: selPrescriptions,
      setSelected: setSelPrescriptions,
      lastLoaded: tsPrescriptions,
      setLastLoaded: setTsPrescriptions,
      lsKey: LS_KEY_PRESCRIPTIONS,
    },
    {
      cardKey: 'doctorBase',
      title: 'Загрузить базу врачей',
      subtitle: 'Раз в год',
      selected: selDoctorBase,
      setSelected: setSelDoctorBase,
      lastLoaded: tsDoctorBase,
      setLastLoaded: setTsDoctorBase,
      lsKey: LS_KEY_DOCTOR_BASE,
    },
  ];

  return (
    <section className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {cardConfigs.map(cfg => (
          <Card
            key={cfg.cardKey}
            cardKey={cfg.cardKey}
            title={cfg.title}
            subtitle={cfg.subtitle}
            months={months}
            selected={cfg.selected}
            cachedMap={cachedMap}
            lastLoaded={cfg.lastLoaded}
            busy={busy && activeCard !== cfg.cardKey}
            active={activeCard === cfg.cardKey}
            progress={activeCard === cfg.cardKey ? progress : null}
            loadingMonths={monthsLoading}
            monthsError={monthsError}
            onToggle={makeToggle(cfg.setSelected)}
            onSelectAll={() => cfg.setSelected(new Set(months))}
            onSelectMissing={() => cfg.setSelected(new Set(months.filter(m => !cachedMap.has(m))))}
            onClear={() => cfg.setSelected(new Set())}
            onLoad={() => void handleLoad(cfg.cardKey, cfg.selected, cfg.lsKey, cfg.setLastLoaded)}
            onCancel={handleCancel}
          />
        ))}
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <label className="flex items-center gap-3 cursor-pointer select-none bg-white px-4 py-3 rounded-2xl border border-gray-200 shadow-sm">
          <input
            type="checkbox"
            className="rounded border-gray-300 text-brand-accent focus:ring-brand-accent"
            checked={offlineMode}
            onChange={e => onOfflineModeChange(e.target.checked)}
          />
          <span className="text-sm font-bold text-gray-800">Работать из кэша</span>
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onClearDeviceCache().then(() => refreshMeta())}
          className="px-5 py-3 rounded-2xl border border-gray-200 text-gray-500 text-[10px] font-bold uppercase tracking-wider hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-50 transition-all bg-white shadow-sm"
        >
          Очистить кэш
        </button>

        <div className="ml-auto bg-slate-900 text-slate-100 rounded-2xl px-5 py-4 border border-slate-700 shadow-sm">
          {statsLoading ? (
            <p className="text-sm text-slate-400">Считаем…</p>
          ) : (
            <div className="flex items-center gap-6">
              <div>
                <p className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Размер кэша</p>
                <p className="text-lg font-black text-white leading-tight">{formatBytes(totalBytes)}</p>
              </div>
              <div className="w-px h-8 bg-slate-700" />
              <div>
                <p className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Месяцев</p>
                <p className="text-lg font-black text-white leading-tight">{metaList.length}</p>
              </div>
              <div className="w-px h-8 bg-slate-700" />
              <div>
                <p className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Месяц</p>
                <p className="text-sm font-mono font-semibold text-slate-200 leading-tight">{currentMonth}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default CacheSection;
