
import React, { useState, useMemo, useEffect } from 'react';
import { GlobalState, SharedFilters, SharedFilterKey } from '../types';
import { normalizeDate, getVisitRepName, getVisitLPUAbbr, getVisitDoctor, getVisitSpec, getVisitLPUFull, getVisitComment, isWeekend, toLocalISO, getVisitDate, groupEmployeesByTerritory } from '../utils';
import { useSharedEmployeeFilters } from '../hooks/useSharedEmployeeFilters';
import { CustomDateInput, CustomSelect } from './ui';
import ExportExcelButton from './ExportExcelButton';
import { exportVisitsExcel } from '../services/excelExport';

interface Props {
  data: GlobalState;
  excludedDates: string[];
  sharedFilters: SharedFilters;
  onSharedFilterChange: (key: SharedFilterKey, value: string) => void;
  onOpenWeekendPicker: () => void;
  onMonthChange?: (month: string) => void;
}

const VisitsSection: React.FC<Props> = ({ data, excludedDates, sharedFilters, onSharedFilterChange, onOpenWeekendPicker, onMonthChange }) => {
  const [date, setDate] = useState(toLocalISO(new Date()));
  const [expandedRep, setExpandedRep] = useState<string | null>(null);
  const { terr: selectedTerr, group: selectedGroup, rep: selectedRep, role: selectedRole, status: selectedStatus } = sharedFilters;

  const {
    territories,
    groups,
    repsList: reps,
    roles,
    statuses,
    filteredEmployees,
  } = useSharedEmployeeFilters(data.employees, sharedFilters);

  useEffect(() => {
    if (onMonthChange && date) {
      const month = date.slice(0, 7);
      onMonthChange(month);
    }
  }, [date, onMonthChange]);

  const isCurrentDayWeekend = useMemo(() => isWeekend(date, excludedDates), [date, excludedDates]);

  const tableData = useMemo(() => {
    if (isCurrentDayWeekend) return {};
    return groupEmployeesByTerritory(filteredEmployees);
  }, [filteredEmployees, isCurrentDayWeekend]);

  const getRepVisits = (repName: string) => data.visits.filter(v => normalizeDate(getVisitDate(v)) === date && getVisitRepName(v) === repName);
  const getRepReason = (repName: string) => {
    const fix = data.fixation.find(f => normalizeDate(f.Дата) === date && f.МП === repName);
    return fix ? (fix.Причина || fix.Причины) : null;
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-8 gap-3 bg-white p-6 rounded-[24px] border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] items-end">
        <CustomDateInput label="Дата" value={date} onChange={setDate} />
        <CustomSelect label="Территория" value={selectedTerr} options={territories} onChange={(val) => onSharedFilterChange('terr', val)} placeholder="Все территории" />
        <CustomSelect label="Группа" value={selectedGroup} options={groups} onChange={(val) => onSharedFilterChange('group', val)} placeholder="Все группы" />
        <CustomSelect label="Сотрудник" value={selectedRep} options={reps} onChange={(val) => onSharedFilterChange('rep', val)} placeholder="Все сотрудники" />
        <CustomSelect label="Роль" value={selectedRole} options={roles} onChange={(val) => onSharedFilterChange('role', val)} placeholder="Все роли" />
        <CustomSelect label="Статус" value={selectedStatus} options={statuses} onChange={(val) => onSharedFilterChange('status', val)} placeholder="Все статусы" />
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Выходные</label>
          <button type="button" onClick={onOpenWeekendPicker} className="flex items-center justify-center gap-2 h-[42px] bg-brand-accent text-white rounded-[14px] font-black text-[10px] uppercase tracking-widest shadow-lg shadow-brand-accent/20 hover:brightness-110 active:scale-95 transition-all w-full">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            Настройка
          </button>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Отчёт</label>
          <ExportExcelButton
            disabled={isCurrentDayWeekend}
            onExport={() =>
              exportVisitsExcel({
                date,
                tableData,
                visits: data.visits,
                fixation: data.fixation,
              })
            }
          />
        </div>
      </div>

      {isCurrentDayWeekend ? (
        <div className="bg-amber-50/50 border-2 border-amber-200/50 p-16 rounded-[48px] text-center backdrop-blur-sm">
          <div className="w-20 h-20 bg-amber-100 rounded-3xl flex items-center justify-center mx-auto mb-6 transform -rotate-3 border-2 border-amber-200">
             <svg className="w-10 h-10 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          </div>
          <div className="text-amber-800 font-black text-2xl mb-2 text-center uppercase tracking-tight">Нерабочий день</div>
          <p className="text-amber-700/80 text-sm font-medium max-w-sm mx-auto">Этот день отмечен как выходной или офисный в глобальном графике посещений.</p>
          <button type="button" onClick={onOpenWeekendPicker} className="mt-8 px-8 py-3 bg-amber-200/50 text-amber-800 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-amber-200 transition-all border border-amber-300/30">Изменить график</button>
        </div>
      ) : (
        <div className="bg-white rounded-[24px] border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-brand-primary text-white text-[10px] uppercase font-black tracking-widest text-left">
                <tr>
                  <th className="px-3 py-2 border-r border-white/20 whitespace-nowrap w-1">Представитель</th>
                  <th className="px-3 py-2 border-r border-white/20 whitespace-nowrap w-1">Группа</th>
                  <th className="px-3 py-2 border-r border-white/20 text-center whitespace-nowrap w-1">ЛПУ</th>
                  <th className="px-3 py-2 border-r border-white/20 text-center whitespace-nowrap w-1">Врачи</th>
                  <th className="px-3 py-2 border-r border-white/20 text-center whitespace-nowrap w-1">Статус</th>
                  <th className="px-3 py-2 border-r border-white/20 whitespace-nowrap w-1">Причины</th>
                  <th className="w-full bg-white border-l border-gray-100"></th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(tableData).sort().map(terr => (
                  <React.Fragment key={terr}>
                    <tr className="bg-gray-50/80 font-black text-[11px] text-brand-primary uppercase tracking-widest border-y border-gray-200">
                      <td colSpan={7} className="px-3 py-1.5 text-center bg-gray-100/50">{terr}</td>
                    </tr>
                    {tableData[terr].map(emp => {
                      const visits = getRepVisits(emp.МП);
                      const reason = getRepReason(emp.МП);
                      const hasVisits = visits.length > 0;
                      const lpuCount = new Set(visits.map(v => getVisitLPUAbbr(v))).size;
                      const docCount = new Set(visits.map(v => getVisitDoctor(v))).size;
                      const isExpanded = expandedRep === emp.МП;
                      return (
                        <React.Fragment key={emp.МП}>
                          <tr onClick={() => hasVisits && setExpandedRep(isExpanded ? null : emp.МП)} className={`border-b border-gray-200 transition-all cursor-pointer ${!hasVisits ? (reason ? 'bg-amber-50/50' : 'bg-red-50/30') : 'hover:bg-gray-50/80'}`}>
                            <td className="px-3 py-1.5 border-r border-gray-200 whitespace-nowrap font-bold flex items-center gap-2 text-brand-primary text-xs">
                              {hasVisits && <span className={`text-[10px] transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>}
                              {emp.МП}
                            </td>
                            <td className="px-3 py-1.5 border-r border-gray-200 whitespace-nowrap text-gray-500 font-medium text-xs">{emp.Группа}</td>
                            <td className="px-3 py-1.5 border-r border-gray-200 whitespace-nowrap text-center font-black text-brand-primary text-xs">{hasVisits ? lpuCount : 0}</td>
                            <td className="px-3 py-1.5 border-r border-gray-200 whitespace-nowrap text-center font-black text-brand-primary text-xs">{hasVisits ? docCount : 0}</td>
                            <td className="px-3 py-1.5 border-r border-gray-200 whitespace-nowrap text-center">
                              {hasVisits ? <div className="w-4 h-4 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto text-[9px] font-black">✓</div> : <div className="w-4 h-4 rounded-full bg-red-100 text-brand-accent flex items-center justify-center mx-auto text-[9px] font-black">✕</div>}
                            </td>
                            <td className="px-3 py-1.5 border-r border-gray-200 whitespace-nowrap text-xs text-brand-accent font-bold italic w-auto">{reason || (hasVisits ? '' : '—')}</td>
                            <td className="w-full"></td>
                          </tr>
                          {isExpanded && hasVisits && (
                            <tr>
                              <td colSpan={7} className="bg-gray-50/30 px-2 py-1.5 border-b border-gray-200 shadow-inner">
                                <div className="overflow-x-auto">
                                  <table className="w-full border-collapse text-[11px]">
                                    <tbody>
                                      {visits.map((v, i) => (
                                        <tr key={i} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50 transition-colors">
                                          <td className="px-2 py-1 font-black text-brand-primary whitespace-nowrap text-[11px]">{getVisitDoctor(v)}</td>
                                          <td className="px-2 py-1 text-gray-400 font-bold uppercase tracking-wider text-[9px] whitespace-nowrap">{getVisitSpec(v)}</td>
                                          <td className="px-2 py-1 text-brand-accent font-black text-[10px] max-w-[200px]">{getVisitLPUAbbr(v)}: <span className="text-gray-600 font-medium normal-case">{getVisitLPUFull(v)}</span></td>
                                          <td className="px-2 py-1 text-gray-500 text-[10px] max-w-[180px]">{getVisitComment(v) || '—'}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default VisitsSection;
