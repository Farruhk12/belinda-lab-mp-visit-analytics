
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Visit } from '../types';
import { normalizeDate, getVisitDoctor, getVisitSpec, getVisitLPUAbbr, getVisitLPUFull, getVisitDate, getVisitRepName } from '../utils';

// Мульти-селект с чекбоксами
const MultiSelect: React.FC<{
  label: string;
  options: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}> = ({ label, options, selected, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = (val: string) => {
    const next = new Set(selected);
    if (next.has(val)) next.delete(val); else next.add(val);
    onChange(next);
  };

  const displayText = selected.size === 0
    ? 'Все'
    : selected.size <= 2
      ? Array.from(selected).join(', ')
      : `${selected.size} выбрано`;

  return (
    <div className="relative" ref={ref}>
      <div className="flex items-center gap-2">
        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">{label}</label>
        <button
          onClick={() => setOpen(v => !v)}
          className={`h-8 px-3 pr-7 rounded-lg border text-xs font-bold text-left min-w-[120px] max-w-[200px] truncate transition-colors cursor-pointer ${
            selected.size > 0
              ? 'bg-brand-accent/5 border-brand-accent/30 text-brand-accent'
              : 'bg-gray-50 border-gray-200 text-brand-primary'
          }`}
          style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
        >
          {displayText}
        </button>
      </div>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white rounded-xl shadow-2xl border border-gray-100 py-1 min-w-[200px] max-h-[280px] overflow-y-auto custom-scrollbar animate-slideDown">
          {/* Выбрать все / Сбросить */}
          <button
            onClick={() => onChange(new Set())}
            className="w-full px-3 py-1.5 text-left text-[10px] font-black text-gray-400 uppercase tracking-wider hover:bg-gray-50 transition-colors"
          >
            {selected.size > 0 ? 'Сбросить все' : 'Все выбраны'}
          </button>
          <div className="border-t border-gray-100 my-0.5" />
          {options.map(opt => (
            <label
              key={opt}
              className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 cursor-pointer transition-colors"
            >
              <input
                type="checkbox"
                checked={selected.has(opt)}
                onChange={() => toggle(opt)}
                className="w-3.5 h-3.5 rounded border-gray-300 text-brand-accent focus:ring-brand-accent/30 cursor-pointer"
              />
              <span className="text-xs font-medium text-brand-primary truncate">{opt}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
};

interface DetailModalProps {
  title: string;
  subtitle: string;
  items: Visit[];
  onClose: () => void;
  grouping?: 'default' | 'lpu' | 'doctor';
}

const DetailModal: React.FC<DetailModalProps> = ({ title, subtitle, items, onClose, grouping = 'default' }) => {
  const [filterSpecs, setFilterSpecs] = useState<Set<string>>(new Set());
  const [filterLpus, setFilterLpus] = useState<Set<string>>(new Set());

  // Уникальные значения для фильтров
  const specOptions = useMemo(() => {
    const set = new Set<string>();
    items.forEach(v => {
      const spec = getVisitSpec(v);
      if (spec && spec !== '—') set.add(spec);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [items]);

  const lpuOptions = useMemo(() => {
    const set = new Set<string>();
    items.forEach(v => {
      const lpu = getVisitLPUAbbr(v);
      if (lpu && lpu !== '—') set.add(lpu);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [items]);

  // Фильтрованные визиты
  const filteredItems = useMemo(() => {
    return items.filter(v => {
      if (filterSpecs.size > 0 && !filterSpecs.has(getVisitSpec(v))) return false;
      if (filterLpus.size > 0 && !filterLpus.has(getVisitLPUAbbr(v))) return false;
      return true;
    });
  }, [items, filterSpecs, filterLpus]);

  const groupedItems = useMemo(() => {
    const groups: Record<string, {
      mainTitle: string,
      subTitle: string,
      meta: string,
      dates: string[],
      mps: string[]
    }> = {};

    filteredItems.forEach(v => {
      const doc = getVisitDoctor(v);
      const lpuAbbr = getVisitLPUAbbr(v);
      const lpuFull = getVisitLPUFull(v);
      const spec = getVisitSpec(v);
      const repName = getVisitRepName(v);

      let key = '';
      let mainTitle = '';
      let subTitle = '';
      let meta = '';

      if (grouping === 'lpu') {
        key = lpuAbbr;
        mainTitle = lpuAbbr;
        subTitle = lpuFull;
        meta = 'Учреждение';
      } else if (grouping === 'doctor') {
        key = doc;
        mainTitle = doc;
        subTitle = spec;
        meta = `${lpuAbbr}`;
      } else {
        key = `${doc}-${lpuAbbr}`;
        mainTitle = doc;
        subTitle = spec;
        meta = `${lpuAbbr}: ${lpuFull}`;
      }

      if (!groups[key]) {
        groups[key] = {
          mainTitle,
          subTitle,
          meta,
          dates: [],
          mps: []
        };
      }

      const dateStr = normalizeDate(getVisitDate(v));
      if (dateStr && !groups[key].dates.includes(dateStr)) {
        groups[key].dates.push(dateStr);
      }

      if (repName && !groups[key].mps.includes(repName)) {
        groups[key].mps.push(repName);
      }
    });

    return Object.values(groups).sort((a, b) => {
        const diff = b.mps.length - a.mps.length;
        if (diff !== 0) return diff;
        return a.mainTitle.localeCompare(b.mainTitle, 'ru');
    });
  }, [filteredItems, grouping]);

  const hasActiveFilters = filterSpecs.size > 0 || filterLpus.size > 0;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-brand-primary/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white w-full max-w-5xl rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-slideUp">
        <div className="bg-brand-primary p-6 text-white flex justify-between items-start shrink-0">
          <div>
            <h3 className="font-black text-xl tracking-tight mb-1">{title}</h3>
            <p className="text-xs text-white/60 font-bold uppercase tracking-widest">{subtitle} — {filteredItems.length} визитов, {groupedItems.length} врачей</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-full transition-colors text-white"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Фильтры */}
        <div className="px-6 py-3 bg-white border-b border-gray-100 flex flex-wrap items-center gap-3 shrink-0">
          <MultiSelect label="Специальность" options={specOptions} selected={filterSpecs} onChange={setFilterSpecs} />
          <MultiSelect label="ЛПУ" options={lpuOptions} selected={filterLpus} onChange={setFilterLpus} />

          {hasActiveFilters && (
            <button
              onClick={() => { setFilterSpecs(new Set()); setFilterLpus(new Set()); }}
              className="h-8 px-3 rounded-lg bg-brand-accent/10 text-brand-accent text-[10px] font-black uppercase tracking-wider hover:bg-brand-accent/20 transition-colors"
            >
              Сбросить
            </button>
          )}
        </div>

        <div className="overflow-y-auto custom-scrollbar bg-gray-50/50 flex-1">
          {groupedItems.length > 0 ? (
            <table className="w-full text-sm border-collapse">
              <thead className="bg-gray-100 text-[10px] font-black uppercase tracking-widest text-left sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-2.5 text-gray-500 w-8">#</th>
                  <th className="px-4 py-2.5 text-gray-500">Врач</th>
                  <th className="px-4 py-2.5 text-gray-500">Специальность</th>
                  <th className="px-4 py-2.5 text-gray-500">ЛПУ</th>
                  <th className="px-4 py-2.5 text-gray-500 text-center">Визиты</th>
                  <th className="px-4 py-2.5 text-gray-500">Даты</th>
                </tr>
              </thead>
              <tbody>
                {groupedItems.map((group, i) => (
                  <tr key={i} className="border-b border-gray-100 hover:bg-white transition-colors">
                    <td className="px-4 py-2.5 text-gray-300 font-bold text-xs">{i + 1}</td>
                    <td className="px-4 py-2.5 font-bold text-brand-primary text-xs whitespace-nowrap">{group.mainTitle}</td>
                    <td className="px-4 py-2.5 text-gray-400 text-xs whitespace-nowrap">{group.subTitle}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs font-medium">{group.meta}</td>
                    <td className="px-4 py-2.5 text-center font-black text-xs text-brand-accent">{group.dates.length}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {group.dates.sort().map((date, idx) => (
                          <span key={idx} className="text-[10px] text-gray-500 font-medium bg-gray-100 px-1.5 py-0.5 rounded">
                            {date}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-20 text-gray-400 font-bold italic">Нет данных для отображения</div>
          )}
        </div>
        <div className="p-6 bg-white border-t border-gray-100 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-10 py-3 bg-brand-primary text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-brand-primary/20 hover:brightness-110 active:scale-95 transition-all"
          >
            Закрыть отчет
          </button>
        </div>
      </div>
    </div>
  );
};

export default DetailModal;
