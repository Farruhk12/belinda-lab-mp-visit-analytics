import React from 'react';

const OFFLINE_KEY = 'belinda_offline_cache';

export function readOfflinePreference(): boolean {
  try {
    return localStorage.getItem(OFFLINE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeOfflinePreference(value: boolean): void {
  try {
    localStorage.setItem(OFFLINE_KEY, value ? '1' : '0');
  } catch {
    /* ignore */
  }
}

interface Props {
  currentMonth: string;
  offlineMode: boolean;
  onOfflineModeChange: (value: boolean) => void;
  cacheMeta: { month: string; savedAt: string } | null;
  busy: boolean;
  onSaveToDevice: () => void;
  onRefreshFromServer: () => void;
  onClearDeviceCache: () => void;
}

const CachePanel: React.FC<Props> = ({
  currentMonth,
  offlineMode,
  onOfflineModeChange,
  cacheMeta,
  busy,
  onSaveToDevice,
  onRefreshFromServer,
  onClearDeviceCache,
}) => {
  const formattedSaved = cacheMeta
    ? new Date(cacheMeta.savedAt).toLocaleString('ru-RU', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <section className="mb-4 bg-gradient-to-r from-slate-800 to-slate-900 text-white rounded-2xl border border-slate-700 shadow-lg overflow-hidden">
      <div className="px-4 py-3 md:px-5 md:py-3.5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="flex items-start sm:items-center gap-2 shrink-0">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-400/90 pt-0.5">Кэш</span>
          <p className="text-xs text-slate-300 leading-snug max-w-xl">
            Сохраните выгрузку за выбранный месяц на этот компьютер. В режиме «Работать из кэша» запросы к Google не выполняются, пока вы не обновите данные.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          <label className="flex items-center gap-2 cursor-pointer select-none bg-slate-700/60 px-3 py-2 rounded-xl border border-slate-600/80 hover:bg-slate-700 transition-colors">
            <input
              type="checkbox"
              className="rounded border-slate-500 text-amber-500 focus:ring-amber-500"
              checked={offlineMode}
              onChange={(e) => onOfflineModeChange(e.target.checked)}
            />
            <span className="text-[11px] font-bold text-slate-200">Работать из кэша</span>
          </label>

          <button
            type="button"
            disabled={busy}
            onClick={onSaveToDevice}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-900 text-[10px] font-black uppercase tracking-wider disabled:opacity-50 transition-colors"
          >
            {busy ? 'Загрузка…' : 'Скачать в кэш'}
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={onRefreshFromServer}
            className="px-4 py-2 rounded-xl bg-slate-600 hover:bg-slate-500 text-white text-[10px] font-black uppercase tracking-wider border border-slate-500 disabled:opacity-50 transition-colors"
          >
            С сервера + в кэш
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={onClearDeviceCache}
            className="px-3 py-2 rounded-xl text-slate-400 hover:text-red-300 text-[10px] font-bold uppercase tracking-wider border border-transparent hover:border-red-900/50 transition-colors"
          >
            Очистить
          </button>
        </div>
      </div>

      <div className="px-4 py-2 bg-slate-950/40 border-t border-slate-700/80 text-[10px] text-slate-400 font-medium flex flex-wrap gap-x-6 gap-y-1">
        <span>
          Месяц в приложении: <strong className="text-slate-200">{currentMonth}</strong>
        </span>
        {cacheMeta ? (
          <span>
            В кэше: <strong className="text-emerald-400">{cacheMeta.month}</strong>
            {formattedSaved ? ` · сохранено ${formattedSaved}` : ''}
          </span>
        ) : (
          <span className="text-amber-200/80">
            На этом ПК нет снимка за <strong className="text-amber-100">{currentMonth}</strong> — нажмите «Скачать в кэш».
          </span>
        )}
      </div>
    </section>
  );
};

export default CachePanel;
