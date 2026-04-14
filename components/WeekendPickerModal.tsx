
import React, { useState, useMemo } from 'react';
import { RUSSIAN_MONTHS, toLocalISO } from '../utils';

interface WeekendPickerModalProps {
  currentMonth: string; // YYYY-MM
  excludedDates: string[];
  onSave: (dates: string[]) => void;
  onClose: () => void;
}

const WeekendPickerModal: React.FC<WeekendPickerModalProps> = ({ currentMonth, excludedDates, onSave, onClose }) => {
  const [selected, setSelected] = useState<string[]>(excludedDates);

  const days = useMemo(() => {
    const [year, month] = currentMonth.split('-').map(Number);
    const date = new Date(year, month - 1, 1);
    const result: { dateStr: string; label: string; dayName: string; dayIdx: number; dateNum: number }[] = [];
    const dayNames = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

    while (date.getMonth() === month - 1) {
      const d = date.getDate();
      const m = date.getMonth() + 1;
      const dayIdx = date.getDay();
      
      result.push({
        dateStr: toLocalISO(date),
        label: `${d}.${String(m).padStart(2, '0')}`,
        dayName: dayNames[dayIdx],
        dayIdx,
        dateNum: d
      });
      date.setDate(date.getDate() + 1);
    }
    return result;
  }, [currentMonth]);

  const toggleDate = (dateStr: string) => {
    setSelected(prev => 
      prev.includes(dateStr) ? prev.filter(d => d !== dateStr) : [...prev, dateStr]
    );
  };

  const handleAutoFill = () => {
    // Logic: All Sundays (dayIdx 0) + Even Saturdays (2nd and 4th of the month)
    let saturdayCounter = 0;
    const autoSelected = days.filter(day => {
      if (day.dayIdx === 0) return true; // Sunday
      if (day.dayIdx === 6) { // Saturday
        saturdayCounter++;
        return saturdayCounter === 2 || saturdayCounter === 4; // 2nd or 4th Saturday
      }
      return false;
    }).map(day => day.dateStr);

    // Filter out current month from existing selection and add new auto-filled dates
    const otherMonths = selected.filter(d => {
      const [y, m] = d.split('-');
      return `${y}-${m}` !== currentMonth;
    });
    
    setSelected([...otherMonths, ...autoSelected]);
  };

  const [y, m] = currentMonth.split('-');
  const monthName = RUSSIAN_MONTHS[parseInt(m) - 1];

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-brand-primary/70 backdrop-blur-md animate-fadeIn">
      <div className="bg-white w-full max-w-5xl rounded-[32px] shadow-2xl overflow-hidden animate-slideUp border border-gray-100">
        <div className="p-8 md:p-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">
              Отметьте выходные дни (<span className="text-brand-primary">{monthName} {y}</span>):
            </h3>
            <button
              onClick={handleAutoFill}
              className="px-6 py-2.5 bg-gray-100 hover:bg-brand-accent/10 hover:text-brand-accent text-gray-500 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all border border-gray-200 hover:border-brand-accent/20"
            >
              Вс + Четные Сб (2-я и 4-я)
            </button>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 mb-10 max-h-[50vh] overflow-y-auto custom-scrollbar pr-2">
            {days.map((day) => {
              const isChecked = selected.includes(day.dateStr);
              const isSunday = day.dayIdx === 0;
              const isSaturday = day.dayIdx === 6;

              return (
                <label 
                  key={day.dateStr}
                  className={`flex items-center gap-3 p-4 rounded-3xl border cursor-pointer transition-all duration-200 select-none group ${
                    isChecked 
                      ? 'bg-brand-accent/5 border-brand-accent/30 ring-4 ring-brand-accent/5' 
                      : (isSunday || isSaturday) ? 'bg-gray-50/50 border-gray-100 hover:bg-gray-50' : 'bg-white border-gray-100 hover:border-gray-200'
                  }`}
                >
                  <div className={`w-6 h-6 rounded-xl border-2 flex items-center justify-center transition-all ${
                    isChecked ? 'bg-brand-accent border-brand-accent shadow-[0_0_12px_rgba(223,59,32,0.3)]' : 'border-gray-300 group-hover:border-gray-400 bg-white'
                  }`}>
                    {isChecked && (
                      <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <input 
                    type="checkbox" 
                    checked={isChecked}
                    onChange={() => toggleDate(day.dateStr)}
                    className="hidden"
                  />
                  <span className={`text-[11px] font-black uppercase tracking-tight flex flex-col ${isChecked ? 'text-brand-accent' : 'text-gray-600'}`}>
                    <span className="leading-tight">{day.label}</span>
                    <span className="opacity-40 text-[9px] font-bold">{day.dayName}</span>
                  </span>
                </label>
              );
            })}
          </div>

          <div className="flex items-center gap-4 pt-6 border-t border-gray-100">
            <button
              onClick={() => onSave(selected)}
              className="px-10 py-4 bg-brand-accent text-white rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] shadow-xl shadow-brand-accent/20 hover:brightness-110 active:scale-95 transition-all"
            >
              Применить
            </button>
            <button
              onClick={onClose}
              className="px-10 py-4 bg-gray-400 text-white rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] shadow-xl shadow-gray-400/20 hover:brightness-110 active:scale-95 transition-all"
            >
              Отмена
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WeekendPickerModal;
