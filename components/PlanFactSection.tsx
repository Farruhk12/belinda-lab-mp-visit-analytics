
import React, { useState, useMemo, useEffect } from 'react';
import { GlobalState, Employee, Visit, Order, SharedFilters, SharedFilterKey, MpPlanFactVisitStats } from '../types';
import { normalizeDate, getVisitDate, getVisitDoctor, getVisitSpec, getVisitLPUFull, isWeekend, toLocalISO, indexVisitsByRep } from '../utils';
import { useSharedEmployeeFilters } from '../hooks/useSharedEmployeeFilters';
import { CustomMonthInput, CustomSelect } from './ui';
import DetailModal from './DetailModal';
import ExportExcelButton from './ExportExcelButton';
import { exportPlanFactExcel } from '../services/excelExport';

interface ContractDetail {
  doctor: string;
  spec: string;
  lpu: string;
  status: 'connected' | 'waiting';
  orders: Order[];
  visitDates: string[];
}

interface Props {
  data: GlobalState;
  excludedDates: string[];
  sharedFilters: SharedFilters;
  onSharedFilterChange: (key: SharedFilterKey, value: string) => void;
  onMonthChange: (month: string) => void;
  onOpenWeekendPicker: () => void;
}

const PlanFactSection: React.FC<Props> = ({ data, excludedDates, sharedFilters, onSharedFilterChange, onMonthChange, onOpenWeekendPicker }) => {
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const { terr: selectedTerr, group: selectedGroup, rep: selectedRep, role: selectedRole, status: selectedStatus } = sharedFilters;
  const [modalInfo, setModalInfo] = useState<{ title: string; subtitle: string; items: Visit[] } | null>(null);
  const [contractModal, setContractModal] = useState<{ mpName: string; details: ContractDetail[] } | null>(null);

  const {
    territories,
    groups,
    repsList,
    roles,
    statuses,
    groupedByTerritory: groupedData,
  } = useSharedEmployeeFilters(data.employees, sharedFilters);

  useEffect(() => onMonthChange(selectedMonth), [selectedMonth, onMonthChange]);

  const monthVisits = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0);
    return data.visits.filter(v => {
      const d = new Date(normalizeDate(getVisitDate(v)));
      return !isNaN(d.getTime()) && d >= start && d <= end && !isWeekend(toLocalISO(d), excludedDates);
    });
  }, [data.visits, selectedMonth, excludedDates]);

  const visitsByMp = useMemo(() => indexVisitsByRep(monthVisits), [monthVisits]);

  const PLAN_MONTH = 288;
  const PLAN_CONTRACTS = 5;

  const stats = useMemo(() => {
    const res: Record<string, MpPlanFactVisitStats> = {};
    for (const emp of Object.values(groupedData).flat() as Employee[]) {
      const vists = visitsByMp.get(emp.МП) || [];
      const fact = vists.length;
      res[emp.МП] = { fact, pct: Math.round((fact / PLAN_MONTH) * 100), all: vists };
    }
    return res;
  }, [groupedData, visitsByMp]);

  const contractStats = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const res: Record<string, { newDoctors: number; connections: number; pct: number; details: ContractDetail[] }> = {};

    const ordersByGroup: Record<string, Order[]> = {};
    if (data.orders?.length) {
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0);
      for (const o of data.orders) {
        const d = new Date(normalizeDate(o['Дата отгрузки']));
        if (isNaN(d.getTime()) || d < start || d > end) continue;
        const g = (o['Группа товара'] || '').toLowerCase().trim();
        if (!g) continue;
        if (!ordersByGroup[g]) ordersByGroup[g] = [];
        ordersByGroup[g].push(o);
      }
    }

    for (const emp of Object.values(groupedData).flat() as Employee[]) {
      const mpName = emp.МП;
      const mpGroup = (emp.Группа || '').toLowerCase().trim();
      const prefix = `rep:${mpName}|`;
      const oldDocs = new Set<string>();
      for (const key of data.oldDoctorKeys) {
        if (key.startsWith(prefix)) oldDocs.add(key.substring(prefix.length));
      }

      const mpVisits = visitsByMp.get(mpName) || [];
      const visitsByDoctor = new Map<string, Visit[]>();
      for (const v of mpVisits) {
        const doc = getVisitDoctor(v);
        let arr = visitsByDoctor.get(doc);
        if (!arr) {
          arr = [];
          visitsByDoctor.set(doc, arr);
        }
        arr.push(v);
      }

      const newDocs = new Set<string>();
      for (const v of mpVisits) {
        const doc = getVisitDoctor(v);
        if (doc && doc !== '—' && !oldDocs.has(doc)) newDocs.add(doc);
      }

      const groupOrders = mpGroup ? (ordersByGroup[mpGroup] || []) : [];
      const ordersByBuyer: Record<string, Order[]> = {};
      for (const o of groupOrders) {
        const buyer = o['Покупатель'];
        if (!buyer) continue;
        if (!ordersByBuyer[buyer]) ordersByBuyer[buyer] = [];
        ordersByBuyer[buyer].push(o);
      }

      let connections = 0;
      const details: ContractDetail[] = [];
      for (const doc of newDocs) {
        const isConnected = !!ordersByBuyer[doc];
        if (isConnected) connections++;
        const docVisits = visitsByDoctor.get(doc) || [];
        const first = docVisits[0];
        details.push({
          doctor: doc,
          spec: first ? getVisitSpec(first) : '',
          lpu: first ? getVisitLPUFull(first) : '',
          status: isConnected ? 'connected' : 'waiting',
          orders: ordersByBuyer[doc] || [],
          visitDates: [...new Set(docVisits.map(v => normalizeDate(getVisitDate(v))).filter(Boolean))].sort(),
        });
      }

      details.sort((a, b) => {
        if (a.status !== b.status) return a.status === 'connected' ? -1 : 1;
        return a.doctor.localeCompare(b.doctor, 'ru');
      });

      res[mpName] = {
        newDoctors: newDocs.size,
        connections,
        pct: Math.round((connections / PLAN_CONTRACTS) * 100),
        details,
      };
    }

    return res;
  }, [groupedData, visitsByMp, data.orders, data.oldDoctorKeys, selectedMonth]);

  return (
    <div className="space-y-6">
      <div className="bg-brand-primary text-white p-6 rounded-[32px] flex items-center justify-between border border-brand-primary/20">
        <div>
          <h2 className="text-xl font-black mb-1 tracking-tight uppercase">Целевые показатели</h2>
          <div className="flex gap-6 text-sm text-gray-300 font-bold">
            <p>План визитов: <span className="text-white text-lg ml-1">{PLAN_MONTH}</span></p>
            <p>Цель в день: <span className="text-white text-lg ml-1">12</span></p>
            <p>План договоров: <span className="text-white text-lg ml-1">{PLAN_CONTRACTS}</span></p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-8 gap-3 bg-white p-6 rounded-[24px] border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] items-end">
        <CustomMonthInput label="Месяц" value={selectedMonth} onChange={setSelectedMonth} />
        <CustomSelect label="Территория" value={selectedTerr} options={territories} onChange={(val) => onSharedFilterChange('terr', val)} placeholder="Все территории" />
        <CustomSelect label="Группа" value={selectedGroup} options={groups} onChange={(val) => onSharedFilterChange('group', val)} placeholder="Все группы" />
        <CustomSelect label="Сотрудник" value={selectedRep} options={repsList} onChange={(val) => onSharedFilterChange('rep', val)} placeholder="Все сотрудники" />
        <CustomSelect label="Роль" value={selectedRole} options={roles} onChange={(val) => onSharedFilterChange('role', val)} placeholder="Все роли" />
        <CustomSelect label="Статус" value={selectedStatus} options={statuses} onChange={(val) => onSharedFilterChange('status', val)} placeholder="Все статусы" />
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Выходные</label>
          <button type="button" onClick={onOpenWeekendPicker} className="flex items-center justify-center h-[42px] bg-brand-accent text-white rounded-[14px] font-black text-[10px] uppercase tracking-widest transition-all w-full">Настройка</button>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Отчёт</label>
          <ExportExcelButton
            onExport={() =>
              exportPlanFactExcel({
                selectedMonth,
                groupedData,
                stats,
                contractStats,
                planMonth: PLAN_MONTH,
                planContracts: PLAN_CONTRACTS,
              })
            }
          />
        </div>
      </div>
      <div className="bg-white rounded-[24px] border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-brand-primary text-white text-[10px] font-black uppercase tracking-widest text-left">
              <tr>
                 <th className="px-3 py-2 border-r border-white/20 whitespace-nowrap w-1">МП</th>
                 <th className="px-3 py-2 border-r border-white/20 whitespace-nowrap w-1">Группа</th>
                 <th className="px-3 py-2 border-r border-white/20 text-center whitespace-nowrap w-1">План визитов</th>
                 <th className="px-3 py-2 border-r border-white/20 text-center whitespace-nowrap w-1">Факт визитов</th>
                 <th className="px-3 py-2 border-r border-white/20 text-center whitespace-nowrap w-1">%</th>
                 <th className="px-3 py-2 border-r border-white/20 text-center whitespace-nowrap w-1">План договоров</th>
                 <th className="px-3 py-2 border-r border-white/20 text-center whitespace-nowrap w-1">Факт договоров</th>
                 <th className="px-3 py-2 text-center whitespace-nowrap w-1">%</th>
                 <th className="w-full bg-white border-l border-gray-100"></th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(groupedData).sort().map(terr => (
                <React.Fragment key={terr}>
                  <tr className="bg-gray-50/80 font-black text-brand-primary text-[11px] uppercase tracking-widest border-y border-gray-200"><td colSpan={9} className="px-3 py-1.5 text-center bg-gray-100/50">{terr}</td></tr>
                  {groupedData[terr].map(emp => {
                    const s = stats[emp.МП] || { fact: 0, pct: 0 };
                    const c = contractStats[emp.МП] || { newDoctors: 0, connections: 0, pct: 0 };
                    return (
                      <tr key={emp.МП} className="border-b border-gray-200 hover:bg-gray-50/50">
                        <td className="px-3 py-1.5 border-r border-gray-200 whitespace-nowrap font-bold text-brand-primary text-xs">{emp.МП}</td>
                        <td className="px-3 py-1.5 border-r border-gray-200 whitespace-nowrap text-gray-400 font-medium text-xs">{emp.Группа}</td>
                        <td className="px-3 py-1.5 border-r border-gray-200 whitespace-nowrap text-center font-black text-gray-400 text-xs">{PLAN_MONTH}</td>
                        <td className="px-3 py-1.5 border-r border-gray-200 whitespace-nowrap text-center font-black cursor-pointer hover:text-brand-accent text-xs" onClick={() => s.fact > 0 && setModalInfo({ title: "Все визиты", subtitle: emp.МП, items: s.all })}>{s.fact}</td>
                        <td className={`px-3 py-1.5 border-r border-gray-200 text-center font-black text-xs whitespace-nowrap ${s.pct >= 100 ? 'text-green-600' : 'text-brand-accent'}`}>{s.pct}%</td>
                        <td className="px-3 py-1.5 border-r border-gray-200 whitespace-nowrap text-center font-black text-gray-400 text-xs">{PLAN_CONTRACTS}</td>
                        <td className="px-3 py-1.5 border-r border-gray-200 whitespace-nowrap text-center font-black cursor-pointer hover:text-brand-accent text-xs" onClick={() => c.details.length > 0 && setContractModal({ mpName: emp.МП, details: c.details })}>{c.connections}</td>
                        <td className={`px-3 py-1.5 text-center font-black text-xs whitespace-nowrap ${c.pct >= 100 ? 'text-green-600' : 'text-brand-accent'}`}>{c.pct}%</td>
                        <td className="w-full"></td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {modalInfo && <DetailModal title={modalInfo.title} subtitle={modalInfo.subtitle} items={modalInfo.items} onClose={() => setModalInfo(null)} />}

      {/* Модалка договоров */}
      {contractModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-brand-primary/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white w-full max-w-5xl rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-slideUp">
            <div className="bg-brand-primary p-6 text-white flex justify-between items-start shrink-0">
              <div>
                <h3 className="font-black text-xl tracking-tight mb-1">Договоры / Подключения</h3>
                <p className="text-xs text-white/60 font-bold uppercase tracking-widest">
                  {contractModal.mpName} — {contractModal.details.filter(d => d.status === 'connected').length} подключений, {contractModal.details.length} новых врачей
                </p>
              </div>
              <button onClick={() => setContractModal(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors text-white">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            {/* Блоки статистики */}
            {(() => {
              const connected = contractModal.details.filter(d => d.status === 'connected').length;
              const waiting = contractModal.details.length - connected;
              const totalSum = contractModal.details.reduce((sum, d) => sum + d.orders.reduce((s, o) => s + (Number(o["Сумма"]) || 0), 0), 0);
              return (
                <div className="grid grid-cols-4 gap-3 px-6 py-4 bg-white border-b border-gray-100 shrink-0">
                  <div className="bg-gray-50 rounded-2xl p-3 text-center">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Новых врачей</p>
                    <p className="text-2xl font-black text-brand-primary">{contractModal.details.length}</p>
                  </div>
                  <div className="bg-green-50 rounded-2xl p-3 text-center">
                    <p className="text-[9px] font-black text-green-600 uppercase tracking-widest mb-1">Подключено</p>
                    <p className="text-2xl font-black text-green-600">{connected}</p>
                  </div>
                  <div className="bg-amber-50 rounded-2xl p-3 text-center">
                    <p className="text-[9px] font-black text-amber-600 uppercase tracking-widest mb-1">Ожидание</p>
                    <p className="text-2xl font-black text-amber-600">{waiting}</p>
                  </div>
                  <div className="bg-gray-50 rounded-2xl p-3 text-center">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Сумма заказов</p>
                    <p className="text-2xl font-black text-brand-primary">{totalSum > 0 ? totalSum.toLocaleString('ru') : '—'}</p>
                  </div>
                </div>
              );
            })()}

            <div className="overflow-y-auto custom-scrollbar bg-gray-50/50 flex-1">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-gray-100 text-[10px] font-black uppercase tracking-widest text-left sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2.5 text-gray-500 w-8">#</th>
                    <th className="px-3 py-2.5 text-gray-500">Врач</th>
                    <th className="px-3 py-2.5 text-gray-500">Спец.</th>
                    <th className="px-3 py-2.5 text-gray-500">ЛПУ</th>
                    <th className="px-3 py-2.5 text-gray-500 text-center">Статус</th>
                    <th className="px-3 py-2.5 text-gray-500">Препарат</th>
                    <th className="px-3 py-2.5 text-gray-500 text-right">Кол-во</th>
                    <th className="px-3 py-2.5 text-gray-500 text-right">Сумма</th>
                    <th className="px-3 py-2.5 text-gray-500">Визиты</th>
                  </tr>
                </thead>
                <tbody>
                  {contractModal.details.map((d, i) => {
                    const rowCount = Math.max(d.orders.length, 1);
                    return d.orders.length > 0 ? (
                      d.orders.map((o, oi) => (
                        <tr key={`${d.doctor}-${oi}`} className={`hover:bg-white transition-colors ${oi === rowCount - 1 ? 'border-b-2 border-gray-200' : 'border-b border-gray-50'}`}>
                          {oi === 0 && (
                            <>
                              <td rowSpan={rowCount} className="px-3 py-2 text-gray-300 font-bold text-xs align-top border-r border-gray-100">{i + 1}</td>
                              <td rowSpan={rowCount} className="px-3 py-2 font-bold text-brand-primary text-xs whitespace-nowrap align-top border-r border-gray-100">{d.doctor}</td>
                              <td rowSpan={rowCount} className="px-3 py-2 text-gray-400 text-xs whitespace-nowrap align-top border-r border-gray-100">{d.spec}</td>
                              <td rowSpan={rowCount} className="px-3 py-2 text-gray-500 text-xs font-medium align-top border-r border-gray-100 max-w-[180px]">{d.lpu}</td>
                              <td rowSpan={rowCount} className="px-3 py-2 text-center align-top border-r border-gray-100">
                                <span className={`inline-block px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider ${
                                  d.status === 'connected' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                                }`}>
                                  {d.status === 'connected' ? 'Подключён' : 'Ожидание'}
                                </span>
                              </td>
                            </>
                          )}
                          <td className="px-3 py-1.5 text-xs font-medium text-gray-700 border-r border-gray-50">{o["Номенклатура"] || '—'}</td>
                          <td className="px-3 py-1.5 text-xs text-gray-500 text-right whitespace-nowrap border-r border-gray-50">{o["Количество"]} шт.</td>
                          <td className="px-3 py-1.5 text-xs font-bold text-right whitespace-nowrap text-green-600 border-r border-gray-100">{o["Сумма"] && !isNaN(Number(o["Сумма"])) ? Number(o["Сумма"]).toLocaleString('ru') : '—'}</td>
                          {oi === 0 && (
                            <td rowSpan={rowCount} className="px-3 py-2 align-top">
                              <div className="flex flex-wrap gap-1">
                                {d.visitDates.map(date => (
                                  <span key={date} className="text-[10px] text-gray-500 font-medium bg-gray-100 px-1.5 py-0.5 rounded">{date}</span>
                                ))}
                              </div>
                            </td>
                          )}
                        </tr>
                      ))
                    ) : (
                      <tr key={d.doctor} className="border-b-2 border-gray-200 hover:bg-white transition-colors">
                        <td className="px-3 py-2 text-gray-300 font-bold text-xs border-r border-gray-100">{i + 1}</td>
                        <td className="px-3 py-2 font-bold text-brand-primary text-xs whitespace-nowrap border-r border-gray-100">{d.doctor}</td>
                        <td className="px-3 py-2 text-gray-400 text-xs whitespace-nowrap border-r border-gray-100">{d.spec}</td>
                        <td className="px-3 py-2 text-gray-500 text-xs font-medium border-r border-gray-100 max-w-[180px]">{d.lpu}</td>
                        <td className="px-3 py-2 text-center border-r border-gray-100">
                          <span className="inline-block px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-700">Ожидание</span>
                        </td>
                        <td className="px-3 py-2 text-gray-300 text-xs border-r border-gray-50">—</td>
                        <td className="px-3 py-2 text-gray-300 text-xs text-right border-r border-gray-50">—</td>
                        <td className="px-3 py-2 text-gray-300 text-xs text-right border-r border-gray-100">—</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {d.visitDates.map(date => (
                              <span key={date} className="text-[10px] text-gray-500 font-medium bg-gray-100 px-1.5 py-0.5 rounded">{date}</span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="p-6 bg-white border-t border-gray-100 flex justify-end shrink-0">
              <button onClick={() => setContractModal(null)} className="px-10 py-3 bg-brand-primary text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-brand-primary/20 hover:brightness-110 active:scale-95 transition-all">
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlanFactSection;
