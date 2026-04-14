
import React, { useState, useMemo, useEffect } from 'react';
import { GlobalState, Visit } from '../types';
import { normalizeDate, getVisitLPUAbbr, getVisitLPUFull, getVisitDoctor, getVisitSpec, getVisitRepName, getVisitDate, isWeekend, toLocalISO } from '../utils';
import { CustomMonthInput, CustomSelect } from './ui';
import DetailModal from './DetailModal';

interface Props {
  data: GlobalState;
  excludedDates: string[];
  onMonthChange: (month: string) => void;
  onOpenWeekendPicker: () => void;
}

const ReportsSection: React.FC<Props> = ({ data, excludedDates, onMonthChange, onOpenWeekendPicker }) => {
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedTerr, setSelectedTerr] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [selectedRep, setSelectedRep] = useState('');
  const [selectedRole, setSelectedRole] = useState('МП');
  const [selectedStatus, setSelectedStatus] = useState('');
  
  // Добавлено состояние grouping
  const [modalInfo, setModalInfo] = useState<{ 
    title: string; 
    subtitle: string; 
    items: Visit[]; 
    grouping?: 'default' | 'lpu' | 'doctor' 
  } | null>(null);

  useEffect(() => onMonthChange(selectedMonth), [selectedMonth, onMonthChange]);

  // Каскадная фильтрация опций
  const territories = useMemo(() => Array.from(new Set(data.allEmployees.map(e => e.Область))).sort(), [data.allEmployees]);
  const filteredByTerr = useMemo(() => selectedTerr ? data.allEmployees.filter(e => e.Область === selectedTerr) : data.allEmployees, [data.allEmployees, selectedTerr]);
  const groups = useMemo(() => Array.from(new Set(filteredByTerr.map(e => e.Группа))).sort(), [filteredByTerr]);
  const filteredByGroup = useMemo(() => selectedGroup ? filteredByTerr.filter(e => e.Группа === selectedGroup) : filteredByTerr, [filteredByTerr, selectedGroup]);
  const repsList = useMemo(() => Array.from(new Set(filteredByGroup.map(e => e.МП))).sort(), [filteredByGroup]);
  const roles = useMemo(() => Array.from(new Set(filteredByGroup.map(e => e.Роль))).sort(), [filteredByGroup]);
  const statuses = useMemo(() => Array.from(new Set(filteredByGroup.map(e => e.Статус))).sort(), [filteredByGroup]);

  // Визиты текущего месяца (сервер уже отфильтровал по месяцу) + фильтры сотрудников
  const monthVisits = useMemo(() => {
    return data.visits.filter(v => {
      const d = new Date(normalizeDate(getVisitDate(v)));
      if (isNaN(d.getTime())) return false;
      if (isWeekend(toLocalISO(d), excludedDates)) return false;

      const repName = getVisitRepName(v);
      const emp = data.allEmployees.find(e => e.МП === repName);

      if (selectedRep && repName !== selectedRep) return false;
      if (selectedTerr && emp?.Область !== selectedTerr) return false;
      if (selectedGroup && emp?.Группа !== selectedGroup) return false;
      if (selectedRole && emp?.Роль !== selectedRole) return false;
      if (selectedStatus && emp?.Статус !== selectedStatus) return false;

      return true;
    });
  }, [data.visits, data.allEmployees, selectedTerr, selectedGroup, selectedRep, selectedRole, selectedStatus, excludedDates]);

  // 1. Отчет по дням недели
  const weekdayAnalysis = useMemo(() => {
    const days = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
    const stats = days.map((name, index) => ({
      name,
      index,
      visits: 0,
      topLpu: { name: '—', count: 0 },
      topDoc: { name: '—', count: 0 },
      all: [] as Visit[]
    }));

    monthVisits.forEach(v => {
      const d = new Date(normalizeDate(getVisitDate(v)));
      const dayIdx = d.getDay();
      stats[dayIdx].visits++;
      stats[dayIdx].all.push(v);
    });

    stats.forEach(s => {
      if (s.all.length === 0) return;
      const lpuCounts: Record<string, number> = {};
      const docCounts: Record<string, number> = {};
      s.all.forEach(v => {
        const l = getVisitLPUAbbr(v);
        const d = getVisitDoctor(v);
        lpuCounts[l] = (lpuCounts[l] || 0) + 1;
        docCounts[d] = (docCounts[d] || 0) + 1;
      });
      const topL = Object.entries(lpuCounts).sort((a,b) => b[1] - a[1])[0];
      const topD = Object.entries(docCounts).sort((a,b) => b[1] - a[1])[0];
      s.topLpu = { name: topL[0], count: topL[1] };
      s.topDoc = { name: topD[0], count: topD[1] };
    });

    const reordered = [...stats.slice(1), stats[0]];
    return reordered;
  }, [monthVisits]);

  // 2. Отчет по ЛПУ
  const lpuReport = useMemo(() => {
    const res: Record<string, any> = {};
    monthVisits.forEach(v => {
      const abbr = getVisitLPUAbbr(v);
      const full = getVisitLPUFull(v);
      if(!res[abbr]) res[abbr] = { abbr, full, visits: 0, docs: new Set(), all: [] };
      res[abbr].visits++;
      res[abbr].docs.add(getVisitDoctor(v));
      res[abbr].all.push(v);
    });
    return Object.values(res).sort((a:any, b:any) => b.visits - a.visits);
  }, [monthVisits]);

  // 3. Отчет по специальностям
  const specReport = useMemo(() => {
    const res: Record<string, any> = {};
    monthVisits.forEach(v => {
      const spec = getVisitSpec(v);
      if(!res[spec]) res[spec] = { name: spec, visits: 0, docs: new Set(), all: [] };
      res[spec].visits++;
      res[spec].docs.add(getVisitDoctor(v));
      res[spec].all.push(v);
    });
    return Object.values(res).sort((a:any, b:any) => b.visits - a.visits);
  }, [monthVisits]);

  // 4. Отчет по "Новым врачам" — используем серверные oldDoctorKeys
  const newDoctorsReport = useMemo(() => {
    const oldDocs = new Set(data.oldDoctorKeys.filter(k => !k.startsWith('name:')));
    const newDocsData: Record<string, any> = {};

    monthVisits.forEach(v => {
      const docName = getVisitDoctor(v);
      const lpuAbbr = getVisitLPUAbbr(v);
      const id = `${docName}|${lpuAbbr}`;

      if (!oldDocs.has(id)) {
        if (!newDocsData[id]) {
          newDocsData[id] = {
            name: docName,
            spec: getVisitSpec(v),
            lpu: lpuAbbr,
            visits: 0,
            all: []
          };
        }
        newDocsData[id].visits++;
        newDocsData[id].all.push(v);
      }
    });

    return Object.values(newDocsData).sort((a:any, b:any) => b.visits - a.visits);
  }, [monthVisits, data.oldDoctorKeys]);

  return (
    <div className="space-y-10 pb-16">
      {/* Панель фильтров */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3 bg-white p-6 rounded-[24px] border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] items-end">
        <CustomMonthInput label="Месяц" value={selectedMonth} onChange={setSelectedMonth} />
        <CustomSelect label="Территория" value={selectedTerr} options={territories} onChange={(val) => { setSelectedTerr(val); setSelectedGroup(''); setSelectedRep(''); }} placeholder="Все территории" />
        <CustomSelect label="Группа" value={selectedGroup} options={groups} onChange={(val) => { setSelectedGroup(val); setSelectedRep(''); }} placeholder="Все группы" />
        <CustomSelect label="Сотрудник" value={selectedRep} options={repsList} onChange={setSelectedRep} placeholder="Все сотрудники" />
        <CustomSelect label="Роль" value={selectedRole} options={roles} onChange={setSelectedRole} placeholder="Все роли" />
        <CustomSelect label="Статус" value={selectedStatus} options={statuses} onChange={setSelectedStatus} placeholder="Все статусы" />
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Настройки</label>
          <button onClick={onOpenWeekendPicker} className="flex items-center justify-center h-[42px] bg-brand-accent text-white rounded-[14px] font-black text-[10px] uppercase tracking-widest shadow-lg shadow-brand-accent/20 hover:brightness-110 active:scale-95 transition-all w-full">
            Настройка
          </button>
        </div>
      </div>

      {/* Блок 1: Активность по дням недели */}
      <section className="bg-white rounded-[40px] border border-gray-100 shadow-sm p-10 animate-fadeIn">
        <div className="mb-10 text-center">
          <h2 className="text-xl font-black text-brand-primary uppercase tracking-[0.2em] mb-2">Активность по дням недели</h2>
          <p className="text-gray-400 text-sm font-medium">Распределение интенсивности визитов в течение месяца</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
          {weekdayAnalysis.map((day) => (
            <div 
              key={day.index} 
              className={`p-6 rounded-[28px] border-2 transition-all cursor-pointer group flex flex-col items-center text-center ${day.visits > 0 ? 'bg-white border-gray-50 hover:border-brand-accent/20 hover:shadow-xl' : 'bg-gray-50/30 border-transparent opacity-50 grayscale'}`}
              onClick={() => day.visits > 0 && setModalInfo({ title: day.name, subtitle: `${day.visits} визитов за месяц`, items: day.all })}
            >
              <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-6">{day.name}</div>
              <div className="text-4xl font-black text-brand-primary mb-1 group-hover:text-brand-accent transition-colors">{day.visits}</div>
              <div className="text-[9px] font-black text-gray-300 uppercase tracking-widest mb-6">Визитов</div>
              {day.visits > 0 && (
                <div className="w-full space-y-4 pt-4 border-t border-gray-50">
                  <div 
                    className="w-full group/item hover:bg-brand-primary/5 rounded-lg p-1 -mx-1 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      setModalInfo({ 
                        title: `Рейтинг ЛПУ: ${day.name}`, 
                        subtitle: `Статистика посещений учреждений`, 
                        items: day.all,
                        grouping: 'lpu'
                      });
                    }}
                  >
                    <div className="text-[8px] font-black text-gray-400 uppercase tracking-tighter mb-1">Топ ЛПУ</div>
                    <div className="text-[10px] font-black text-brand-primary truncate w-full group-hover/item:text-brand-accent transition-colors" title={day.topLpu.name}>{day.topLpu.name}</div>
                  </div>
                  <div 
                    className="w-full group/item hover:bg-brand-primary/5 rounded-lg p-1 -mx-1 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      setModalInfo({ 
                        title: `Рейтинг Врачей: ${day.name}`, 
                        subtitle: `Статистика посещений врачей`, 
                        items: day.all,
                        grouping: 'doctor'
                      });
                    }}
                  >
                    <div className="text-[8px] font-black text-gray-400 uppercase tracking-tighter mb-1">Топ Врач</div>
                    <div className="text-[10px] font-black text-brand-accent truncate w-full group-hover/item:underline" title={day.topDoc.name}>{day.topDoc.name}</div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Блок 2: Учреждения и Специальности */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {/* Таблица ЛПУ */}
        <section className="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden flex flex-col">
          <div className="px-8 py-6 border-b border-gray-50 flex justify-between items-center bg-white sticky top-0 z-10">
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Анализ по учреждениям</h3>
            <span className="bg-brand-accent/10 text-brand-accent px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">{lpuReport.length} ЛПУ</span>
          </div>
          <div className="overflow-x-auto custom-scrollbar max-h-[500px]">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-gray-50/50 text-[10px] uppercase font-black tracking-widest text-gray-400 border-b border-gray-50 sticky top-0 z-20">
                <tr>
                  <th className="px-4 py-2 text-left border-r border-gray-200 whitespace-nowrap w-1">АБ ЛПУ</th>
                  <th className="px-4 py-2 text-left border-r border-gray-200 whitespace-nowrap w-1">ЛПУ</th>
                  <th className="px-4 py-2 text-right border-r border-gray-200 whitespace-nowrap w-1">Визитов</th>
                  <th className="px-4 py-2 text-right whitespace-nowrap w-1">Врачи</th>
                  <th className="w-full bg-white border-l border-gray-50"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {lpuReport.length > 0 ? lpuReport.map((l:any, i) => (
                  <tr key={i} className="hover:bg-gray-50/80 transition-all cursor-pointer group border-b border-gray-50 last:border-0" onClick={() => setModalInfo({ title: l.abbr, subtitle: l.full, items: l.all })}>
                    <td className="px-4 py-1.5 border-r border-gray-100 whitespace-nowrap font-black text-brand-primary group-hover:text-brand-accent text-xs">{l.abbr}</td>
                    <td className="px-4 py-1.5 border-r border-gray-100 whitespace-nowrap text-gray-400 text-xs font-medium max-w-[200px] truncate">{l.full}</td>
                    <td className="px-4 py-1.5 border-r border-gray-100 whitespace-nowrap text-right font-black text-brand-accent text-sm">{l.visits}</td>
                    <td className="px-4 py-1.5 text-right whitespace-nowrap font-black text-gray-400 text-xs">{l.docs.size}</td>
                    <td className="w-full"></td>
                  </tr>
                )) : (
                  <tr><td colSpan={5} className="py-20 text-center text-gray-400 font-bold italic">Нет данных за этот период</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Таблица Специальностей */}
        <section className="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden flex flex-col">
          <div className="px-8 py-6 border-b border-gray-50 flex justify-between items-center bg-white sticky top-0 z-10">
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Анализ по специальностям</h3>
            <span className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">{specReport.length} направлений</span>
          </div>
          <div className="overflow-x-auto custom-scrollbar max-h-[500px]">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-gray-50/50 text-[10px] uppercase font-black tracking-widest text-gray-400 border-b border-gray-50 sticky top-0 z-20">
                <tr>
                  <th className="px-4 py-2 text-left border-r border-gray-200 whitespace-nowrap w-1">Специальность</th>
                  <th className="px-4 py-2 text-right border-r border-gray-200 whitespace-nowrap w-1">Визитов</th>
                  <th className="px-4 py-2 text-right whitespace-nowrap w-1">Врачи</th>
                  <th className="w-full bg-white border-l border-gray-50"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {specReport.length > 0 ? specReport.map((s:any, i) => (
                  <tr key={i} className="hover:bg-gray-50/80 transition-all cursor-pointer group border-b border-gray-50 last:border-0" onClick={() => setModalInfo({ title: s.name, subtitle: `${s.visits} визитов`, items: s.all })}>
                    <td className="px-4 py-1.5 border-r border-gray-100 whitespace-nowrap font-black text-brand-primary group-hover:text-indigo-600 text-xs">{s.name}</td>
                    <td className="px-4 py-1.5 border-r border-gray-100 whitespace-nowrap text-right font-black text-brand-accent text-sm">{s.visits}</td>
                    <td className="px-4 py-1.5 text-right whitespace-nowrap font-black text-gray-400 text-xs">{s.docs.size}</td>
                    <td className="w-full"></td>
                  </tr>
                )) : (
                  <tr><td colSpan={4} className="py-20 text-center text-gray-400 font-bold italic">Нет данных за этот период</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Блок 3: Новые врачи (с которыми ранее не работали) */}
      <section className="bg-white rounded-[40px] border border-gray-100 shadow-sm overflow-hidden flex flex-col">
        <div className="px-10 py-8 border-b border-gray-50 flex justify-between items-center bg-white sticky top-0 z-10">
          <div>
            <h3 className="text-sm font-black text-brand-primary uppercase tracking-[0.2em] mb-1">Новые врачи месяца</h3>
            <p className="text-[10px] text-gray-400 font-medium">Врачи, визиты к которым впервые зафиксированы в выбранном месяце</p>
          </div>
          <div className="bg-green-50 text-green-600 px-5 py-2 rounded-2xl text-xs font-black uppercase tracking-widest flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            {newDoctorsReport.length} новых контактов
          </div>
        </div>
        <div className="overflow-x-auto custom-scrollbar max-h-[600px]">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-50/50 text-[10px] uppercase font-black tracking-widest text-gray-400 border-b border-gray-50 sticky top-0 z-20">
              <tr>
                <th className="px-6 py-2 text-left border-r border-gray-200 whitespace-nowrap w-1">ФИО Врача</th>
                <th className="px-6 py-2 text-left border-r border-gray-200 whitespace-nowrap w-1">Специальность</th>
                <th className="px-6 py-2 text-left border-r border-gray-200 whitespace-nowrap w-1">АБ ЛПУ</th>
                <th className="px-6 py-2 text-right whitespace-nowrap w-1">Визитов в мес.</th>
                <th className="w-full bg-white border-l border-gray-50"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {newDoctorsReport.length > 0 ? newDoctorsReport.map((doc:any, i) => (
                <tr key={i} className="hover:bg-gray-50/80 transition-all cursor-pointer group border-b border-gray-50 last:border-0" onClick={() => setModalInfo({ title: doc.name, subtitle: `${doc.spec} • ${doc.lpu}`, items: doc.all })}>
                  <td className="px-6 py-1.5 border-r border-gray-100 whitespace-nowrap font-black text-brand-primary group-hover:text-green-600 text-xs">{doc.name}</td>
                  <td className="px-6 py-1.5 border-r border-gray-100 whitespace-nowrap">
                    <span className="text-[9px] px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-600 font-black uppercase tracking-wider">
                      {doc.spec}
                    </span>
                  </td>
                  <td className="px-6 py-1.5 border-r border-gray-100 whitespace-nowrap font-black text-gray-400 text-xs">{doc.lpu}</td>
                  <td className="px-6 py-1.5 text-right whitespace-nowrap font-black text-brand-accent text-sm">{doc.visits}</td>
                  <td className="w-full"></td>
                </tr>
              )) : (
                <tr><td colSpan={5} className="py-24 text-center text-gray-400 font-bold italic">В этом месяце новых врачей не обнаружено</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Модальное окно детализации */}
      {modalInfo && (
        <DetailModal 
          title={modalInfo.title}
          subtitle={modalInfo.subtitle}
          items={modalInfo.items}
          onClose={() => setModalInfo(null)}
          grouping={modalInfo.grouping}
        />
      )}
    </div>
  );
};

export default ReportsSection;
