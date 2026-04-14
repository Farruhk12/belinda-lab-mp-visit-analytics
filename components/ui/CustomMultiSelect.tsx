import React, { useState, useRef, useEffect, useMemo } from 'react';

interface Props {
  label: string;
  value: string[];
  options: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}

const CustomMultiSelect: React.FC<Props> = ({ label, value, options, onChange, placeholder = 'Все' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && searchRef.current) searchRef.current.focus();
  }, [isOpen]);

  const filtered = useMemo(() => {
    if (!search) return options;
    const q = search.toLowerCase();
    return options.filter(o => o.toLowerCase().includes(q));
  }, [options, search]);

  const toggle = (opt: string) => {
    if (value.includes(opt)) {
      onChange(value.filter(v => v !== opt));
    } else {
      onChange([...value, opt]);
    }
  };

  const displayText = value.length === 0
    ? placeholder
    : value.length === 1
      ? value[0]
      : `${value.length} выбрано`;

  const hasSelection = value.length > 0;

  return (
    <div className="flex flex-col gap-1.5 w-full" ref={containerRef}>
      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">{label}</label>
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`w-full flex items-center justify-between bg-gray-50 border ${
            isOpen ? 'border-brand-accent/40 ring-4 ring-brand-accent/5' : hasSelection ? 'border-brand-accent/30 bg-brand-accent/5' : 'border-gray-200'
          } rounded-[14px] px-4 py-2.5 text-sm font-semibold transition-all duration-200 hover:bg-white hover:border-gray-300 shadow-sm text-left h-[42px] ${
            hasSelection ? 'text-brand-accent' : 'text-brand-primary'
          }`}
        >
          <span className="truncate">{displayText}</span>
          <div className="flex items-center gap-1 shrink-0">
            {hasSelection && (
              <span
                onClick={(e) => { e.stopPropagation(); onChange([]); }}
                className="w-4 h-4 flex items-center justify-center rounded-full bg-brand-accent/20 text-brand-accent hover:bg-brand-accent/30 cursor-pointer"
              >
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"/></svg>
              </span>
            )}
            <svg className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-brand-accent' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>
        {isOpen && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 py-2 z-[210] animate-slideDown max-h-72 flex flex-col">
            {options.length > 8 && (
              <div className="px-3 pb-2 border-b border-gray-100">
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Поиск…"
                  className="w-full h-8 px-3 rounded-lg bg-gray-50 border border-gray-200 text-xs font-medium focus:outline-none focus:border-brand-accent/40 focus:ring-2 focus:ring-brand-accent/5"
                />
              </div>
            )}
            <div className="flex gap-1 px-3 py-1.5 border-b border-gray-100">
              <button
                type="button"
                onClick={() => onChange([...filtered])}
                className="text-[10px] font-black text-brand-accent uppercase tracking-wider hover:underline"
              >
                Выбрать все
              </button>
              <span className="text-gray-300">|</span>
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-[10px] font-black text-gray-400 uppercase tracking-wider hover:underline"
              >
                Сбросить
              </button>
            </div>
            <div className="overflow-y-auto custom-scrollbar flex-1">
              {filtered.map(opt => (
                <label
                  key={opt}
                  className={`flex items-center gap-2.5 px-4 py-2 cursor-pointer transition-colors ${
                    value.includes(opt) ? 'bg-brand-accent/5' : 'hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={value.includes(opt)}
                    onChange={() => toggle(opt)}
                    className="w-3.5 h-3.5 rounded border-gray-300 text-brand-accent focus:ring-brand-accent/30 cursor-pointer accent-[var(--brand-accent,#e85d4a)]"
                  />
                  <span className={`text-xs font-medium truncate ${value.includes(opt) ? 'text-brand-accent font-bold' : 'text-gray-700'}`}>{opt}</span>
                </label>
              ))}
              {filtered.length === 0 && (
                <div className="px-4 py-3 text-xs text-gray-400 italic text-center">Ничего не найдено</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomMultiSelect;
