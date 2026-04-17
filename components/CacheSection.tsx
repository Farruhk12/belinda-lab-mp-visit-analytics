import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  listCachedSnapshotMeta,
  type CachedMonthMeta,
} from '../services/dataCache';
import { type CacheDownloadProgress } from '../services/bulkMonthDownload';

export type { CacheDownloadProgress };

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} КБ`;
  return `${(n / (1024 * 1024)).toFixed(2)} МБ`;
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
}

interface LoadCardProps {
  title: string;
  subtitle: string;
  lastLoaded: string | null;
  loading: boolean;
  disabled: boolean;
  color: 'accent' | 'primary' | 'slate';
  onLoad: () => void;
}

const colorMap = {
  accent: {
    bg: 'bg-brand-accent',
    hover: 'hover:brightness-95',
    ring: 'border-brand-accent/20',
    icon: 'text-brand-accent',
    iconBg: 'bg-brand-accent/10',
  },
  primary: {
    bg: 'bg-brand-primary',
    hover: 'hover:brightness-110',
    ring: 'border-brand-primary/20',
    icon: 'text-brand-primary',
    iconBg: 'bg-brand-primary/10',
  },
  slate: {
    bg: 'bg-slate-700',
    hover: 'hover:bg-slate-600',
    ring: 'border-slate-200',
    icon: 'text-slate-600',
    iconBg: 'bg-slate-100',
  },
};

const progressBarColors = {
  accent: 'from-red-400 to-brand-accent',
  primary: 'from-blue-400 to-brand-primary',
  slate: 'from-slate-400 to-slate-700',
};

const LoadCard: React.FC<LoadCardProps> = ({ title, subtitle, lastLoaded, loading, disabled, color, onLoad }) => {
  const c = colorMap[color];
  const formatted = formatTimestamp(lastLoaded);
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (loading) {
      setProgress(0);
      let current = 0;
      intervalRef.current = window.setInterval(() => {
        const remaining = 92 - current;
        const step = Math.max(0.3, remaining * 0.04);
        current = Math.min(92, current + step);
        setProgress(Math.round(current));
      }, 200);
    } else {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (progress > 0) {
        setProgress(100);
        const t = window.setTimeout(() => setProgress(0), 600);
        return () => window.clearTimeout(t);
      }
    }
    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [loading]);

  return (
    <div className={`bg-white rounded-2xl border ${c.ring} shadow-sm p-5 flex flex-col gap-4 relative overflow-hidden`}>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 ${c.iconBg} rounded-xl flex items-center justify-center shrink-0`}>
          {loading ? (
            <svg className={`w-5 h-5 ${c.icon} animate-spin`} fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className={`w-5 h-5 ${c.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-black text-gray-900">{title}</h3>
          <p className="text-[11px] text-gray-400 font-medium mt-0.5">{subtitle}</p>
        </div>
        {loading && (
          <span className={`text-lg font-black ${c.icon} tabular-nums`}>{progress}%</span>
        )}
      </div>

      {loading && (
        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full bg-gradient-to-r ${progressBarColors[color]} rounded-full transition-[width] duration-300 ease-out`}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          disabled={disabled || loading}
          onClick={onLoad}
          className={`px-5 py-2.5 rounded-xl ${c.bg} text-white text-[10px] font-black uppercase tracking-wider ${c.hover} disabled:opacity-50 transition-all`}
        >
          {loading ? 'Загрузка…' : 'Загрузить'}
        </button>
        <div className="text-right shrink-0">
          {formatted ? (
            <p className="text-[10px] text-green-600 font-bold">{formatted}</p>
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
  onSaveCurrentMonthToCache,
  onClearDeviceCache,
}) => {
  const [metaList, setMetaList] = useState<CachedMonthMeta[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);

  const [tsVisits, setTsVisits] = useState(() => readTimestamp(LS_KEY_VISITS));
  const [tsPrescriptions, setTsPrescriptions] = useState(() => readTimestamp(LS_KEY_PRESCRIPTIONS));
  const [tsDoctorBase, setTsDoctorBase] = useState(() => readTimestamp(LS_KEY_DOCTOR_BASE));

  const [loadingCard, setLoadingCard] = useState<'visits' | 'prescriptions' | 'doctorBase' | null>(null);

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

  const totalBytes = metaList.reduce((s, r) => s + r.approxBytes, 0);
  const busy = dataLoading || cacheBusy || loadingCard !== null;

  const handleLoadVisits = async () => {
    setLoadingCard('visits');
    try {
      await onSaveCurrentMonthToCache();
      await refreshMeta();
      writeTimestamp(LS_KEY_VISITS);
      setTsVisits(readTimestamp(LS_KEY_VISITS));
    } finally {
      setLoadingCard(null);
    }
  };

  const handleLoadPrescriptions = async () => {
    setLoadingCard('prescriptions');
    try {
      await onSaveCurrentMonthToCache();
      await refreshMeta();
      writeTimestamp(LS_KEY_PRESCRIPTIONS);
      setTsPrescriptions(readTimestamp(LS_KEY_PRESCRIPTIONS));
    } finally {
      setLoadingCard(null);
    }
  };

  const handleLoadDoctorBase = async () => {
    setLoadingCard('doctorBase');
    try {
      await onSaveCurrentMonthToCache();
      await refreshMeta();
      writeTimestamp(LS_KEY_DOCTOR_BASE);
      setTsDoctorBase(readTimestamp(LS_KEY_DOCTOR_BASE));
    } finally {
      setLoadingCard(null);
    }
  };

  return (
    <section className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <LoadCard
          title="Загрузить визиты"
          subtitle="Рекомендуется ежедневно"
          lastLoaded={tsVisits}
          loading={loadingCard === 'visits'}
          disabled={busy}
          color="accent"
          onLoad={() => void handleLoadVisits()}
        />
        <LoadCard
          title="Загрузить выписку врача"
          subtitle="Раз в месяц"
          lastLoaded={tsPrescriptions}
          loading={loadingCard === 'prescriptions'}
          disabled={busy}
          color="primary"
          onLoad={() => void handleLoadPrescriptions()}
        />
        <LoadCard
          title="Загрузить базу врачей"
          subtitle="Раз в год"
          lastLoaded={tsDoctorBase}
          loading={loadingCard === 'doctorBase'}
          disabled={busy}
          color="slate"
          onLoad={() => void handleLoadDoctorBase()}
        />
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
