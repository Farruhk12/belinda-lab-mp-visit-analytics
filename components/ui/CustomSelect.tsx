import React, { useState, useRef, useEffect } from 'react';

interface Props {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  placeholder?: string;
}

const CustomSelect: React.FC<Props> = ({ label, value, options, onChange, placeholder = 'Все' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="flex flex-col gap-1.5 w-full" ref={containerRef}>
      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">{label}</label>
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`w-full flex items-center justify-between bg-gray-50 border ${isOpen ? 'border-brand-accent/40 ring-4 ring-brand-accent/5' : 'border-gray-200'} rounded-[14px] px-4 py-2.5 text-sm font-semibold text-brand-primary transition-all duration-200 hover:bg-white hover:border-gray-300 shadow-sm text-left h-[42px]`}
        >
          <span className="truncate">{value || placeholder}</span>
          <svg className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-brand-accent' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {isOpen && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 py-2 z-[210] animate-slideDown max-h-64 overflow-y-auto custom-scrollbar">
            <button
              type="button"
              onClick={() => { onChange(''); setIsOpen(false); }}
              className={`w-full px-4 py-2 text-left text-sm transition-colors ${!value ? 'bg-brand-accent/5 text-brand-accent font-bold' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              {placeholder}
            </button>
            {options.map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => { onChange(opt); setIsOpen(false); }}
                className={`w-full px-4 py-2 text-left text-sm transition-colors ${value === opt ? 'bg-brand-accent/5 text-brand-accent font-bold' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                {opt}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomSelect;
