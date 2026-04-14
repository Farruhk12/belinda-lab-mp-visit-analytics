
import React, { useState, useMemo, useEffect } from 'react';
import { GlobalState, Visit, SharedFilters, SharedFilterKey } from '../types';
import { normalizeDate, getVisitRepName, getVisitDoctor, getVisitLPUAbbr, getVisitLPUFull, isSameDay, isWeekend, toLocalISO, getVisitDate } from '../utils';
import { useSharedEmployeeFilters } from '../hooks/useSharedEmployeeFilters';
import { CustomMonthInput, CustomSelect } from './ui';
import ExportExcelButton from './ExportExcelButton';
import { exportCalendarExcel } from '../services/excelExport';

interface Props {
  data: GlobalState;
  excludedDates: string[];
  sharedFilters: SharedFilters;
  onSharedFilterChange: (key: SharedFilterKey, value: string) => void;
  onMonthChange: (month: string) => void;
  onOpenWeekendPicker: () => void;
}

const CalendarSection: React.FC<Props> = ({ data, excludedDates, sharedFilters, onSharedFilterChange, onMonthChange, onOpenWeekendPicker }) => {
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const { terr: selectedTerr, group: selectedGroup, rep: selectedRep, role: selectedRole, status: selectedStatus } = sharedFilters;
  
  const [modalData, setModalData] = useState<{ repName: string, date: string, visits: Visit[] } | null>(null);
  const [reasonModal, setReasonModal] = useState<{ repName: string, date: string, reason: string } | null>(null);

  const [year, month] = useMemo(() => selectedMonth.split('-').map(Number), [selectedMonth]);

  const {
    territories,
    groups,
    repsList,
    roles,
    statuses,
    groupedByTerritory: groupedData,
  } = useSharedEmployeeFilters(data.employees, sharedFilters);

  useEffect(() => onMonthChange(selectedMonth), [selectedMonth, onMonthChange]);

  const monthDays = useMemo(() => {
    const days: Date[] = [];
    const date = new Date(year, month - 1, 1);
    while (date.getMonth() === month - 1) {
      if (!isWeekend(toLocalISO(date), excludedDates)) days.push(new Date(date));
      date.setDate(date.getDate() + 1);
    }
    return days;
  }, [year, month, excludedDates]);

  const getDayVisitsList = (repName: string, date: Date) => data.visits.filter(v => normalizeDate(getVisitDate(v)) === toLocalISO(date) && getVisitRepName(v) === repName);
  const getAbsenceReason = (repName: string, date: Date) => {
    const fix = data.fixation.find(f => normalizeDate(f.Дата) === toLocalISO(date) && f.МП === repName);
    return fix ? (fix.Причина || fix.Причины || '') : null;
  };

  const getReasonVisual = (reason: string) => {
    const r = reason.toLowerCase();
    if (r.includes('больн')) return { char: 'Б', class: 'bg-red-100 text-red-700' };
    if (r.includes('отпуск')) return { char: 'О', class: 'bg-blue-100 text-blue-700' };
    if (r.includes('офис')) return { char: 'Оф', class: 'bg-indigo-100 text-indigo-700' };
    return { char: '!', class: 'bg-amber-100 text-amber-700' };
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-8 gap-3 bg-white p-6 rounded-[24px] border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] items-end">
        <CustomMonthInput label="Месяц" value={selectedMonth} onChange={setSelectedMonth} />
        <CustomSelect label="Территория" value={selectedTerr} options={territories} onChange={(val) => onSharedFilterChange('terr', val)} placeholder="Все территории" />
        <CustomSelect label="Группа" value={selectedGroup} options={groups} onChange={(val) => onSharedFilterChange('group', val)} placeholder="Все группы" />
        <CustomSelect label="Сотрудник" value={selectedRep} options={repsList} onChange={(val) => onSharedFilterChange('rep', val)} placeholder="Все сотрудники" />
        <CustomSelect label="Роль" value={selectedRole} options={roles} onChange={(val) => onSharedFilterChange('role', val)} placeholder="Все роли" />
        <CustomSelect label="Статус" value={selectedStatus} options={statuses} onChange={(val) => onSharedFilterChange('status', val)} placeholder="Все статусы" />
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Выходные</label>
          <button type="button" onClick={onOpenWeekendPicker} className="flex items-center justify-center gap-2 h-[42px] bg-brand-accent text-white rounded-[14px] font-black text-[10px] uppercase tracking-widest shadow-lg shadow-brand-accent/20 hover:brightness-110 transition-all w-full">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            Настройка
          </button>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Отчёт</label>
          <ExportExcelButton
            onExport={() =>
              exportCalendarExcel({
                selectedMonth,
                groupedData,
                monthDays,
                visits: data.visits,
                fixation: data.fixation,
              })
            }
          />
        </div>
      </div>

      <div className="bg-white rounded-[24px] border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-[11px] min-w-[1000px]">
            <thead className="bg-brand-primary text-white sticky top-0 z-10">
              <tr>
                <th className="px-6 py-5 text-left sticky left-0 bg-brand-primary z-20 w-48 shadow-md font-black">Мед Представитель</th>
                {monthDays.map(d => (
                  <th key={d.toISOString()} className={`px-1 py-4 text-center min-w-[36px] ${isSameDay(d, new Date()) ? 'bg-brand-accent' : ''}`}>
                    <div className="text-[9px] font-black uppercase opacity-70 leading-none mb-1.5">{['Вс','Пн','Вт','Ср','Чт','Пт','Сб'][d.getDay()]}</div>
                    <div className="font-black text-[13px]">{d.getDate()}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.keys(groupedData).sort().map(terr => (
                <React.Fragment key={terr}>
                  <tr className="bg-gray-50/80 font-black text-brand-primary uppercase tracking-widest">
                    <td colSpan={monthDays.length + 1} className="px-6 py-3 sticky left-0 bg-gray-50/80 z-10">{terr}</td>
                  </tr>
                  {groupedData[terr].map(emp => (
                    <tr key={emp.МП} className="border-b border-gray-100 hover:bg-gray-50/50">
                      <td className="px-6 py-2.5 font-bold sticky left-0 bg-white z-10 shadow-sm text-brand-primary">{emp.МП}</td>
                      {monthDays.map(d => {
                        const visits = getDayVisitsList(emp.МП, d);
                        const reason = getAbsenceReason(emp.МП, d);
                        return (
                          <td key={d.toISOString()} onClick={() => (visits.length > 0 || reason) && (visits.length > 0 ? setModalData({ repName: emp.МП, date: d.toLocaleDateString(), visits }) : setReasonModal({ repName: emp.МП, date: d.toLocaleDateString(), reason: reason! }))} className={`p-1 text-center border-l border-gray-100 ${visits.length > 0 || reason ? 'cursor-pointer hover:bg-gray-100' : ''}`}>
                            {visits.length > 0 ? <div className="bg-green-100 text-green-700 rounded-xl py-2 font-black text-xs">{visits.length}</div> : reason ? <div className={`rounded-xl py-2 text-[10px] font-black px-0.5 truncate ${getReasonVisual(reason).class}`}>{getReasonVisual(reason).char}</div> : <span className="text-gray-200">·</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {modalData && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-brand-primary/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden animate-slideUp">
            <div className="bg-brand-primary p-6 text-white flex justify-between">
              <div><h3 className="font-black text-xl">{modalData.repName}</h3><p className="text-xs text-white/60">{modalData.date}</p></div>
              <button type="button" onClick={() => setModalData(null)} className="p-2"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12"/></svg></button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[60vh] custom-scrollbar">
              <div className="grid gap-4 sm:grid-cols-2">
                {modalData.visits.map((v, i) => (
                  <div key={i} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                    <div className="font-black text-brand-primary mb-1">{getVisitDoctor(v)}</div>
                    <div className="text-brand-accent font-black text-[10px]">{getVisitLPUAbbr(v)}: <span className="text-gray-500 font-medium normal-case">{getVisitLPUFull(v)}</span></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {reasonModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-brand-primary/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white w-full max-w-sm rounded-[32px] shadow-2xl overflow-hidden flex flex-col animate-slideUp">
            <div className="bg-brand-primary p-6 text-white flex justify-between items-start shrink-0">
              <div>
                <h3 className="font-black text-lg tracking-tight mb-1">{reasonModal.repName}</h3>
                <p className="text-xs text-white/60 font-bold uppercase tracking-widest">{reasonModal.date}</p>
              </div>
              <button 
                type="button"
                onClick={() => setReasonModal(null)}
                className="p-2 hover:bg-white/10 rounded-full transition-colors text-white"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="p-8 flex flex-col items-center justify-center text-center">
              <div className={`w-20 h-20 rounded-3xl flex items-center justify-center text-3xl font-black mb-6 shadow-lg ${getReasonVisual(reasonModal.reason).class.replace('text-[10px]', '')}`}>
                {getReasonVisual(reasonModal.reason).char}
              </div>
              <h4 className="text-brand-primary font-black uppercase tracking-widest text-sm mb-2">Причина отсутствия</h4>
              <p className="text-gray-500 font-medium leading-relaxed">{reasonModal.reason}</p>
            </div>
            <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-center shrink-0">
              <button 
                type="button"
                onClick={() => setReasonModal(null)}
                className="w-full py-3 bg-brand-primary text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-brand-primary/20 hover:brightness-110 active:scale-95 transition-all"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarSection;
