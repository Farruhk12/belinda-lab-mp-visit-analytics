import React, { useMemo, useRef } from 'react';

interface Props {
  label: string;
  value: string;
  onChange: (v: string) => void;
}

const CustomDateInput: React.FC<Props> = ({ label, value, onChange }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const formattedDate = useMemo(() => {
    if (!value) return 'Выберите дату';
    const parts = value.split('-');
    if (parts.length < 3) return value;
    const [y, m, d] = parts;
    return `${d}.${m}.${y}`;
  }, [value]);

  const handleContainerClick = () => {
    if (inputRef.current) {
      try {
        inputRef.current.showPicker();
      } catch {
        inputRef.current.focus();
        inputRef.current.click();
      }
    }
  };

  return (
    <div className="flex flex-col gap-1.5 w-full group">
      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">{label}</label>
      <div className="relative h-[42px] cursor-pointer" onClick={handleContainerClick}>
        <div className="absolute inset-0 flex items-center justify-between bg-white border border-gray-200 rounded-[14px] px-4 text-sm font-semibold text-brand-primary transition-all duration-200 group-hover:border-brand-accent/40 group-hover:shadow-md pointer-events-none z-0">
          <span className="font-bold">{formattedDate}</span>
          <svg className="w-4 h-4 text-brand-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <input
          ref={inputRef}
          type="date"
          value={value}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 appearance-none outline-none"
        />
      </div>
    </div>
  );
};

export default CustomDateInput;
