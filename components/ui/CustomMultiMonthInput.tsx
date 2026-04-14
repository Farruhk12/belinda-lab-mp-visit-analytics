import React, { useMemo, useRef, useEffect, useState } from 'react';
import { RUSSIAN_MONTHS } from '../../utils';

function sortMonths(arr: string[]): string[] {
  return [...new Set(arr)].filter(Boolean).sort();
}

interface Props {
  label: string;
  value: string[];
  onChange: (months: string[]) => void;
}

const CustomMultiMonthInput: React.FC<Props> = ({ label, value, onChange }) => {
  const sorted = useMemo(() => sortMonths(value), [value]);
  const [open, setOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(() => {
    const y = sorted[sorted.length - 1] || new Date().toISOString().slice(0, 7);
    return parseInt(y.slice(0, 4), 10);
  });
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const summary = useMemo(() => {
    if (sorted.length === 0) return 'Выберите месяцы';
    if (sorted.length === 1) {
      const [y, m] = sorted[0].split('-');
      return `${RUSSIAN_MONTHS[parseInt(m, 10) - 1]} ${y}`;
    }
    return `${sorted.length} мес.: ${sorted.map(ym => {
      const [, m] = ym.split('-');
      return RUSSIAN_MONTHS[parseInt(m, 10) - 1].slice(0, 3);
    }).join(', ')}`;
  }, [sorted]);

  const toggleMonth = (monthIndex1to12: number) => {
    const m = String(monthIndex1to12).padStart(2, '0');
    const key = `${pickerYear}-${m}`;
    const set = new Set(sorted);
    if (set.has(key)) {
      if (set.size <= 1) return;
      set.delete(key);
    } else {
      set.add(key);
    }
    onChange(sortMonths([...set]));
  };

  return (
    <div className="flex flex-col gap-1.5 w-full group relative" ref={wrapRef}>
      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">{label}</label>
      <button
        type="button"
        onClick={() => {
          setOpen(v => !v);
          const last = sorted[sorted.length - 1];
          if (last) setPickerYear(parseInt(last.slice(0, 4), 10));
        }}
        className="relative h-[42px] w-full flex items-center justify-between bg-white border border-gray-200 rounded-[14px] px-4 text-sm font-semibold text-brand-primary transition-all duration-200 group-hover:border-brand-accent/40 group-hover:shadow-md text-left"
      >
        <span className="font-bold truncate pr-2">{summary}</span>
        <svg className="w-4 h-4 text-brand-accent shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-2xl border border-gray-200 bg-white shadow-xl p-3 text-brand-primary">
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              className="p-1 rounded-lg hover:bg-gray-100 text-lg font-bold"
              onClick={() => setPickerYear(y => y - 1)}
              aria-label="Предыдущий год"
            >
              ‹
            </button>
            <span className="text-sm font-black">{pickerYear}</span>
            <button
              type="button"
              className="p-1 rounded-lg hover:bg-gray-100 text-lg font-bold"
              onClick={() => setPickerYear(y => y + 1)}
              aria-label="Следующий год"
            >
              ›
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {RUSSIAN_MONTHS.map((name, i) => {
              const idx = i + 1;
              const key = `${pickerYear}-${String(idx).padStart(2, '0')}`;
              const sel = sorted.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleMonth(idx)}
                  className={`py-2 px-1 rounded-xl text-[11px] font-bold uppercase leading-tight border transition-colors ${
                    sel
                      ? 'bg-brand-accent text-white border-brand-accent'
                      : 'bg-gray-50 text-gray-700 border-gray-100 hover:border-brand-accent/30'
                  }`}
                >
                  {name.slice(0, 3)}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[10px] text-gray-400 leading-snug">
            Несколько месяцев: объединяют визиты за выбранный период. Данные за месяцы загружаются из кэша или с сервера при необходимости.
          </p>
        </div>
      )}
    </div>
  );
};

export default CustomMultiMonthInput;
