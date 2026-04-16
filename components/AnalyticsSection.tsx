
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { GlobalState, Visit, Employee, SharedFilters, SharedFilterKey, MpAnalyticsStats, MpVisitDistribution, PotentialDoctor } from '../types';
import { normalizeDate, getVisitRepName, getVisitDoctor, getVisitLPUAbbr, getVisitSpec, getVisitDate, isWeekend, toLocalISO, indexVisitsByRep, sortEmployees, groupEmployeesByTerritory, territoryMatchesEmployee } from '../utils';
import { CustomMultiMonthInput, CustomMultiSelect } from './ui';
import DetailModal from './DetailModal';
import PotentialModal from './PotentialModal';
import { loadMonthSnapshot } from '../services/dataCache';
import ExportExcelButton from './ExportExcelButton';
import { exportAnalyticsExcel } from '../services/excelExport';

interface Props {
  data: GlobalState;
  excludedDates: string[];
  sharedFilters: SharedFilters;
  onSharedFilterChange: (key: SharedFilterKey, value: string) => void;
  currentMonth: string;
  onOpenWeekendPicker: () => void;
}

const emptyDist = (): MpVisitDistribution => ({ '1': [], '2': [], '3': [], '4': [], '5+': [] });

function sortYm(arr: string[]): string[] {
  return [...new Set(arr)].filter(Boolean).sort();
}

const API_URL = (import.meta.env.VITE_API_URL ?? '').trim();

const AnalyticsSection: React.FC<Props> = ({
  data,
  excludedDates,
  sharedFilters,
  onSharedFilterChange,
  currentMonth,
  onOpenWeekendPicker,
}) => {
  const [analyticsMonths, setAnalyticsMonths] = useState<string[]>([]);
  const [asyncMerged, setAsyncMerged] = useState<Visit[] | null>(null);
  const [asyncOldKeys, setAsyncOldKeys] = useState<string[] | null>(null);
  const [monthsLoading, setMonthsLoading] = useState(false);
  const [modalInfo, setModalInfo] = useState<{ title: string; subtitle: string; items: Visit[]; grouping?: 'default' | 'lpu' | 'doctor' } | null>(null);
  const [potentialModal, setPotentialModal] = useState<{ mpName: string; modeLabel: string; description: string; doctors: PotentialDoctor[] } | null>(null);

  const [selTerrs, setSelTerrs] = useState<string[]>([]);
  const [selGroups, setSelGroups] = useState<string[]>([]);
  const [selReps, setSelReps] = useState<string[]>([]);
  const [selRoles, setSelRoles] = useState<string[]>([]);
  const [selStatuses, setSelStatuses] = useState<string[]>([]);
  const [selLPUs, setSelLPUs] = useState<string[]>([]);
  const [selSpecs, setSelSpecs] = useState<string[]>([]);

  const allEmps = data.employees;

  const terrOptions = useMemo(
    () => Array.from(new Set(allEmps.map(e => e.Область))).sort((a, b) => a.localeCompare(b, 'ru')),
    [allEmps]
  );

  const afterTerr = useMemo(
    () => selTerrs.length ? allEmps.filter(e => selTerrs.includes(e.Область)) : allEmps,
    [allEmps, selTerrs]
  );

  const groupOptions = useMemo(
    () => Array.from(new Set(afterTerr.map(e => e.Группа))).sort((a, b) => a.localeCompare(b, 'ru')),
    [afterTerr]
  );

  const afterGroup = useMemo(
    () => selGroups.length ? afterTerr.filter(e => selGroups.includes(e.Группа)) : afterTerr,
    [afterTerr, selGroups]
  );

  const repOptions = useMemo(
    () => Array.from(new Set(afterGroup.map(e => e.МП))).sort((a, b) => a.localeCompare(b, 'ru')),
    [afterGroup]
  );

  const roleOptions = useMemo(
    () => Array.from(new Set(afterGroup.map(e => e.Роль))).sort((a, b) => a.localeCompare(b, 'ru')),
    [afterGroup]
  );

  const statusOptions = useMemo(
    () => Array.from(new Set(afterGroup.map(e => e.Статус))).sort((a, b) => a.localeCompare(b, 'ru')),
    [afterGroup]
  );

  const filteredEmployees = useMemo(() => {
    return afterGroup.filter(e => {
      if (selReps.length && !selReps.includes(e.МП)) return false;
      if (selRoles.length && !selRoles.includes(e.Роль)) return false;
      if (selStatuses.length && !selStatuses.includes(e.Статус)) return false;
      return true;
    }).sort(sortEmployees);
  }, [afterGroup, selReps, selRoles, selStatuses]);

  const groupedData = useMemo(
    () => groupEmployeesByTerritory(filteredEmployees),
    [filteredEmployees]
  );

  useEffect(() => {
    setSelGroups(prev => prev.filter(g => groupOptions.includes(g)));
  }, [groupOptions]);
  useEffect(() => {
    setSelReps(prev => prev.filter(r => repOptions.includes(r)));
  }, [repOptions]);
  useEffect(() => {
    setSelRoles(prev => prev.filter(r => roleOptions.includes(r)));
  }, [roleOptions]);
  useEffect(() => {
    setSelStatuses(prev => prev.filter(s => statusOptions.includes(s)));
  }, [statusOptions]);

  useEffect(() => {
    setAnalyticsMonths(prev => {
      if (prev.length > 0) return prev;
      return currentMonth ? [currentMonth] : [];
    });
  }, [currentMonth]);

  useEffect(() => {
    let cancelled = false;
    const months = sortYm(analyticsMonths);
    if (months.length === 0) return undefined;

    const onlyCurrent = months.length === 1 && months[0] === currentMonth;
    if (onlyCurrent) {
      setAsyncMerged(null);
      setAsyncOldKeys(null);
      setMonthsLoading(false);
      return undefined;
    }

    setMonthsLoading(true);
    (async () => {
      try {
        const earliest = months[0];
        const parts: Visit[][] = [];
        for (const m of months) {
          if (m === currentMonth) {
            parts.push(data.visits);
          } else {
            const snap = await loadMonthSnapshot(m);
            if (snap) {
              parts.push(snap.data.visits || []);
            } else if (API_URL) {
              try {
                const r = await fetch(`${API_URL}?month=${encodeURIComponent(m)}`);
                const j = await r.json();
                parts.push(j.visits || []);
              } catch {
                parts.push([]);
              }
            } else {
              parts.push([]);
            }
          }
        }

        let oldKeys: string[] = data.oldDoctorKeys || [];
        if (earliest !== currentMonth) {
          const es = await loadMonthSnapshot(earliest);
          if (es?.data.oldDoctorKeys?.length) oldKeys = es.data.oldDoctorKeys;
          else if (API_URL) {
            try {
              const r = await fetch(`${API_URL}?month=${encodeURIComponent(earliest)}`);
              const j = await r.json();
              if (j.oldDoctorKeys) oldKeys = j.oldDoctorKeys;
            } catch {
              /* keep */
            }
          }
        }

        if (!cancelled) {
          setAsyncMerged(parts.flat());
          setAsyncOldKeys(oldKeys);
        }
      } finally {
        if (!cancelled) setMonthsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [analyticsMonths, currentMonth, data.visits, data.oldDoctorKeys]);

  const mergedRawVisits = useMemo(() => {
    const months = sortYm(analyticsMonths);
    if (months.length === 1 && months[0] === currentMonth) return data.visits;
    return asyncMerged ?? [];
  }, [analyticsMonths, currentMonth, data.visits, asyncMerged]);

  const oldKeysForNew = useMemo(() => {
    const months = sortYm(analyticsMonths);
    if (months.length === 1 && months[0] === currentMonth) return data.oldDoctorKeys || [];
    return asyncOldKeys ?? (data.oldDoctorKeys || []);
  }, [analyticsMonths, currentMonth, data.oldDoctorKeys, asyncOldKeys]);

  const monthVisits = useMemo(() => {
    return mergedRawVisits.filter(v => {
      const dStr = getVisitDate(v);
      if (!dStr) return false;
      const d = new Date(normalizeDate(dStr));
      if (isNaN(d.getTime())) return false;
      return !isWeekend(toLocalISO(d), excludedDates);
    });
  }, [mergedRawVisits, excludedDates]);

  const onMonthsChange = useCallback((next: string[]) => {
    const s = sortYm(next);
    if (s.length === 0) return;
    setAnalyticsMonths(s);
  }, []);

  const globalDoctorIndex = useMemo(() => {
    const idx = new Map<string, { doctor: string; lpu: string; spec: string; reps: Set<string> }>();
    for (const v of monthVisits) {
      const doc = getVisitDoctor(v);
      const lpu = getVisitLPUAbbr(v);
      const spec = getVisitSpec(v);
      const rep = getVisitRepName(v);
      const key = `${doc}|${lpu}`;
      let entry = idx.get(key);
      if (!entry) {
        entry = { doctor: doc, lpu, spec, reps: new Set() };
        idx.set(key, entry);
      }
      entry.reps.add(rep);
    }
    return idx;
  }, [monthVisits]);

  /** Все пары «врач|ЛПУ», по которым в выбранном периоде был хотя бы один визит (любой МП) */
  const globalVisitedDoctorKeys = useMemo(() => {
    const s = new Set<string>();
    for (const v of monthVisits) {
      const doc = getVisitDoctor(v);
      const lpu = getVisitLPUAbbr(v);
      if (doc === '—' || !lpu || lpu === '—') continue;
      s.add(`${doc}|${lpu}`);
    }
    return s;
  }, [monthVisits]);

  const terrMpMap = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const e of allEmps) {
      let set = m.get(e.Область);
      if (!set) { set = new Set(); m.set(e.Область, set); }
      set.add(e.МП);
    }
    return m;
  }, [allEmps]);

  const allowedMpNames = useMemo(
    () => new Set(filteredEmployees.map(e => e.МП)),
    [filteredEmployees]
  );

  const employeeFilteredVisits = useMemo(
    () => monthVisits.filter(v => allowedMpNames.has(getVisitRepName(v))),
    [monthVisits, allowedMpNames]
  );

  const lpuOptions = useMemo(
    () => Array.from(new Set(employeeFilteredVisits.map(v => getVisitLPUAbbr(v)).filter(l => l !== '—'))).sort((a, b) => a.localeCompare(b, 'ru')),
    [employeeFilteredVisits]
  );

  const specOptions = useMemo(
    () => Array.from(new Set(employeeFilteredVisits.map(v => getVisitSpec(v)).filter(s => s !== '—'))).sort((a, b) => a.localeCompare(b, 'ru')),
    [employeeFilteredVisits]
  );

  useEffect(() => {
    setSelLPUs(prev => prev.filter(l => lpuOptions.includes(l)));
  }, [lpuOptions]);
  useEffect(() => {
    setSelSpecs(prev => prev.filter(s => specOptions.includes(s)));
  }, [specOptions]);

  const filteredVisits = useMemo(() => {
    if (!selLPUs.length && !selSpecs.length) return employeeFilteredVisits;
    return employeeFilteredVisits.filter(v => {
      if (selLPUs.length && !selLPUs.includes(getVisitLPUAbbr(v))) return false;
      if (selSpecs.length && !selSpecs.includes(getVisitSpec(v))) return false;
      return true;
    });
  }, [employeeFilteredVisits, selLPUs, selSpecs]);

  const visitsByMp = useMemo(() => indexVisitsByRep(filteredVisits), [filteredVisits]);

  const stats = useMemo(() => {
    const res: Record<string, MpAnalyticsStats> = {};
    const oldDocsGlobal = new Set(oldKeysForNew.filter(k => !k.startsWith('name:')));
    const flatEmps = Object.values(groupedData).flat() as Employee[];

    for (const emp of flatEmps) {
      const empMonthVisits = visitsByMp.get(emp.МП) || [];
      const days = new Set(empMonthVisits.map(v => normalizeDate(getVisitDate(v)))).size;
      const dist = emptyDist();
      const docVisits: Record<string, Visit[]> = {};
      const newDocsList: Visit[] = [];
      const visitedThisMonth = new Set<string>();

      for (const v of empMonthVisits) {
        const d = getVisitDoctor(v);
        const l = getVisitLPUAbbr(v);
        const id = `${d}|${l}`;

        if (!docVisits[d]) docVisits[d] = [];
        docVisits[d].push(v);

        if (!oldDocsGlobal.has(id) && !visitedThisMonth.has(id)) {
          newDocsList.push(v);
        }
        visitedThisMonth.add(id);
      }

      for (const vs of Object.values(docVisits)) {
        const c = vs.length;
        if (c === 1) dist['1'].push(...vs);
        else if (c === 2) dist['2'].push(...vs);
        else if (c === 3) dist['3'].push(...vs);
        else if (c === 4) dist['4'].push(...vs);
        else dist['5+'].push(...vs);
      }

      const uniqueDoctorNames = Object.keys(docVisits);
      const uniqueDoctorVisitsList: Visit[] = [];
      const seenDoctors = new Set<string>();
      const uniqueLPUVisitsList: Visit[] = [];
      const seenLPUs = new Set<string>();
      const uniqueSpecVisitsList: Visit[] = [];
      const seenSpecs = new Set<string>();

      for (const v of empMonthVisits) {
        const doc = getVisitDoctor(v);
        if (!seenDoctors.has(doc)) {
          seenDoctors.add(doc);
          uniqueDoctorVisitsList.push(v);
        }
        const lpu = getVisitLPUAbbr(v);
        if (lpu !== '—' && !seenLPUs.has(lpu)) {
          seenLPUs.add(lpu);
          uniqueLPUVisitsList.push(v);
        }
        const spec = getVisitSpec(v);
        if (spec !== '—' && !seenSpecs.has(spec)) {
          seenSpecs.add(spec);
          uniqueSpecVisitsList.push(v);
        }
      }

      const visitedDoctorKeys = new Set(
        empMonthVisits.map(v => `${getVisitDoctor(v)}|${getVisitLPUAbbr(v)}`)
      );

      let potInLPU = 0;
      let potTerr = 0;
      let potOurs = 0;
      let potMarket = 0;
      const terrReps = terrMpMap.get(emp.Область);
      for (const [key, info] of globalDoctorIndex) {
        if (visitedDoctorKeys.has(key)) continue;
        const visitedBySameTerrRep = terrReps && [...info.reps].some(r => terrReps.has(r));
        if (!visitedBySameTerrRep) continue;
        if (seenLPUs.has(info.lpu)) potInLPU++;
        if (seenSpecs.has(info.spec)) potTerr++;
        if (seenLPUs.has(info.lpu) && seenSpecs.has(info.spec)) potOurs++;
      }

      const baseInLPU = new Set<string>();
      const baseTerr = new Set<string>();
      const baseOurs = new Set<string>();
      for (const row of data.doctorBase) {
        if (!territoryMatchesEmployee(emp.Область, row.territory)) continue;
        const key = `${row.doctor}|${row.lpuAbbr}`;
        if (globalVisitedDoctorKeys.has(key)) continue;
        if (visitedDoctorKeys.has(key)) continue;
        if (seenLPUs.has(row.lpuAbbr)) baseInLPU.add(key);
        if (row.spec !== '—' && seenSpecs.has(row.spec)) baseTerr.add(key);
        if (seenLPUs.has(row.lpuAbbr) && row.spec !== '—' && seenSpecs.has(row.spec)) baseOurs.add(key);
      }
      potInLPU += baseInLPU.size;
      potTerr += baseTerr.size;
      potMarket += baseOurs.size;

      res[emp.МП] = {
        total: empMonthVisits.length,
        avg: days > 0 ? Math.round(empMonthVisits.length / days) : 0,
        dist,
        all: empMonthVisits,
        newCount: new Set(newDocsList.map(v => `${getVisitDoctor(v)}|${getVisitLPUAbbr(v)}`)).size,
        newVisits: newDocsList,
        uniqueDoctors: uniqueDoctorNames.length,
        uniqueDoctorVisits: uniqueDoctorVisitsList,
        uniqueLPUs: seenLPUs.size,
        uniqueLPUVisits: uniqueLPUVisitsList,
        uniqueSpecs: seenSpecs.size,
        uniqueSpecVisits: uniqueSpecVisitsList,
        potentialInLPU: potInLPU,
        potentialTerritory: potTerr,
        potentialOurs: potOurs,
        potentialMarket: potMarket,
      };
    }
    return res;
  }, [groupedData, visitsByMp, oldKeysForNew, globalDoctorIndex, terrMpMap, data.doctorBase, globalVisitedDoctorKeys]);

  const defaultStats: MpAnalyticsStats = {
    total: 0,
    avg: 0,
    dist: emptyDist(),
    all: [],
    newCount: 0,
    newVisits: [],
    uniqueDoctors: 0,
    uniqueDoctorVisits: [],
    uniqueLPUs: 0,
    uniqueLPUVisits: [],
    uniqueSpecs: 0,
    uniqueSpecVisits: [],
    potentialInLPU: 0,
    potentialTerritory: 0,
    potentialOurs: 0,
    potentialMarket: 0,
  };

  const openPotential = useCallback((emp: Employee, mode: 'ours' | 'market') => {
    const empVisits = visitsByMp.get(emp.МП) || [];
    const visitedKeys = new Set(empVisits.map(v => `${getVisitDoctor(v)}|${getVisitLPUAbbr(v)}`));
    const empLPUs = new Set(empVisits.map(v => getVisitLPUAbbr(v)).filter(l => l !== '—'));
    const empSpecs = new Set(empVisits.map(v => getVisitSpec(v)).filter(s => s !== '—'));

    if (mode === 'ours') {
      const terrReps = terrMpMap.get(emp.Область);
      const potentialOurs: PotentialDoctor[] = [];

      for (const [key, info] of globalDoctorIndex) {
        if (visitedKeys.has(key)) continue;
        const sameTerrReps = terrReps ? [...info.reps].filter(r => terrReps.has(r) && r !== emp.МП) : [];
        if (!sameTerrReps.length) continue;

        if (empLPUs.has(info.lpu) && empSpecs.has(info.spec)) {
          potentialOurs.push({ doctor: info.doctor, lpu: info.lpu, spec: info.spec, visitedByReps: sameTerrReps });
        }
      }

      setPotentialModal({
        mpName: emp.МП,
        modeLabel: 'Пот. наш',
        description: 'Врачи, которых посещают другие МП компании в тех же ЛПУ и с теми же специальностями, что у данного МП.',
        doctors: potentialOurs,
      });
      return;
    }

    const seenBaseMarket = new Set<string>();
    const potentialMarket: PotentialDoctor[] = [];
    for (const row of data.doctorBase) {
      if (!territoryMatchesEmployee(emp.Область, row.territory)) continue;
      const key = `${row.doctor}|${row.lpuAbbr}`;
      if (globalVisitedDoctorKeys.has(key)) continue;
      if (visitedKeys.has(key)) continue;
      if (empLPUs.has(row.lpuAbbr) && row.spec !== '—' && empSpecs.has(row.spec) && !seenBaseMarket.has(key)) {
        seenBaseMarket.add(key);
        potentialMarket.push({ doctor: row.doctor, lpu: row.lpuAbbr, spec: row.spec, visitedByReps: [], fromBase: true });
      }
    }

    setPotentialModal({
      mpName: emp.МП,
      modeLabel: 'Пот. рынка',
      description: 'Врачи из листа «База» в тех же ЛПУ и с теми же специальностями, что у данного МП. В периоде к ним не было визитов.',
      doctors: potentialMarket,
    });
  }, [visitsByMp, globalDoctorIndex, terrMpMap, data.doctorBase, globalVisitedDoctorKeys]);

  const periodHint =
    sortYm(analyticsMonths).length > 1
      ? `Период: ${sortYm(analyticsMonths).join(', ')}`
      : null;

  return (
    <div className="space-y-6">
      {monthsLoading && (
        <div className="text-xs font-bold text-brand-accent uppercase tracking-wider animate-pulse">
          Загрузка месяцев для аналитики…
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 bg-white p-6 rounded-[24px] border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] items-end">
        <CustomMultiMonthInput label="Месяцы" value={analyticsMonths} onChange={onMonthsChange} />
        <CustomMultiSelect label="Территория" value={selTerrs} options={terrOptions} onChange={setSelTerrs} placeholder="Все территории" />
        <CustomMultiSelect label="Группа" value={selGroups} options={groupOptions} onChange={setSelGroups} placeholder="Все группы" />
        <CustomMultiSelect label="Сотрудник" value={selReps} options={repOptions} onChange={setSelReps} placeholder="Все сотрудники" />
        <CustomMultiSelect label="Роль" value={selRoles} options={roleOptions} onChange={setSelRoles} placeholder="Все роли" />
        <CustomMultiSelect label="Статус" value={selStatuses} options={statusOptions} onChange={setSelStatuses} placeholder="Все статусы" />
        <CustomMultiSelect label="ЛПУ" value={selLPUs} options={lpuOptions} onChange={setSelLPUs} placeholder="Все ЛПУ" />
        <CustomMultiSelect label="Специальность" value={selSpecs} options={specOptions} onChange={setSelSpecs} placeholder="Все специальности" />
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Выходные</label>
          <button type="button" onClick={onOpenWeekendPicker} className="flex items-center justify-center h-[42px] bg-brand-accent text-white rounded-[14px] font-black text-[10px] uppercase tracking-widest transition-all w-full">Настройка</button>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Отчёт</label>
          <ExportExcelButton
            onExport={() => {
              const m = sortYm(analyticsMonths);
              const periodLabel = m.length > 1 ? m.join(', ') : m[0] || currentMonth;
              return exportAnalyticsExcel({ groupedData, stats, periodLabel });
            }}
          />
        </div>
      </div>
      {periodHint && (
        <p className="text-xs text-gray-500 font-medium px-1">{periodHint}. Месяцы вне текущей выгрузки подгружаются из кэша или по сети.</p>
      )}

      <div className="bg-white rounded-[24px] border border-gray-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-brand-primary text-white text-[10px] uppercase font-black tracking-widest text-left">
              <tr>
                <th className="px-3 py-2 border-r border-white/20 whitespace-nowrap w-1">МП</th>
                <th className="px-3 py-2 border-r border-white/20 whitespace-nowrap w-1">Группа</th>
                <th className="px-3 py-2 border-r border-white/20 text-center whitespace-nowrap w-1">Ср/д</th>
                <th className="px-3 py-2 border-r border-white/20 text-center whitespace-nowrap w-1">Всего</th>
                <th className="px-3 py-2 border-r border-white/20 text-center whitespace-nowrap w-1">Врачи</th>
                <th className="px-3 py-2 border-r border-white/20 text-center whitespace-nowrap w-1">ЛПУ</th>
                <th className="px-3 py-2 border-r border-white/20 text-center whitespace-nowrap w-1">Спец.</th>
                <th className="px-2 py-2 text-center border-r border-white/20 w-1">1</th>
                <th className="px-2 py-2 text-center border-r border-white/20 w-1">2</th>
                <th className="px-2 py-2 text-center border-r border-white/20 w-1">3</th>
                <th className="px-2 py-2 text-center border-r border-white/20 w-1">4</th>
                <th className="px-2 py-2 text-center border-r border-white/20 w-1">5+</th>
                <th className="px-3 py-2 text-center bg-brand-primary/90 whitespace-nowrap w-1">Новые</th>
                <th className="px-3 py-2 text-center bg-brand-primary/80 whitespace-nowrap w-1">Пот. наш</th>
                <th className="px-3 py-2 text-center bg-brand-primary/70 whitespace-nowrap w-1">Пот. рынка</th>
                <th className="w-full bg-white border-l border-gray-100"></th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(groupedData).sort().map(terr => (
                <React.Fragment key={terr}>
                  <tr className="bg-gray-50/80 font-black text-brand-primary text-[11px] uppercase tracking-widest border-y border-gray-200">
                    <td colSpan={16} className="px-3 py-1.5 text-center bg-gray-100/50">{terr}</td>
                  </tr>
                  {groupedData[terr].map(emp => {
                    const s = stats[emp.МП] ?? defaultStats;
                    return (
                      <tr key={emp.МП} className="border-b border-gray-200 hover:bg-gray-50/50">
                        <td className="px-3 py-1.5 border-r border-gray-200 whitespace-nowrap font-bold text-brand-primary text-xs">{emp.МП}</td>
                        <td className="px-3 py-1.5 border-r border-gray-200 whitespace-nowrap text-gray-400 font-medium text-xs">{emp.Группа}</td>
                        <td className="px-3 py-1.5 border-r border-gray-200 whitespace-nowrap text-center font-black text-xs">{s.avg}</td>
                        <td className="px-3 py-1.5 border-r border-gray-200 whitespace-nowrap text-center font-black cursor-pointer hover:text-brand-accent text-xs" onClick={() => setModalInfo({ title: "Все визиты", subtitle: emp.МП, items: s.all })}>{s.total}</td>
                        <td
                          className={`px-3 py-1.5 border-r border-gray-200 whitespace-nowrap text-center font-black text-xs ${s.uniqueDoctors > 0 ? 'text-blue-600 bg-blue-50/30 cursor-pointer hover:bg-blue-50' : 'text-gray-300'}`}
                          onClick={() => s.uniqueDoctors > 0 && setModalInfo({ title: "Уникальные врачи", subtitle: emp.МП, items: s.all })}
                        >
                          {s.uniqueDoctors || '—'}
                        </td>
                        <td
                          className={`px-3 py-1.5 border-r border-gray-200 whitespace-nowrap text-center font-black text-xs ${s.uniqueLPUs > 0 ? 'text-violet-600 bg-violet-50/30 cursor-pointer hover:bg-violet-50' : 'text-gray-300'}`}
                          onClick={() => s.uniqueLPUs > 0 && setModalInfo({ title: "Уникальные ЛПУ", subtitle: emp.МП, items: s.uniqueLPUVisits, grouping: 'lpu' })}
                        >
                          {s.uniqueLPUs || '—'}
                        </td>
                        <td
                          className={`px-3 py-1.5 border-r border-gray-200 whitespace-nowrap text-center font-black text-xs ${s.uniqueSpecs > 0 ? 'text-amber-600 bg-amber-50/30 cursor-pointer hover:bg-amber-50' : 'text-gray-300'}`}
                          onClick={() => s.uniqueSpecs > 0 && setModalInfo({ title: "Специальности врачей", subtitle: emp.МП, items: s.all, grouping: 'spec' })}
                        >
                          {s.uniqueSpecs || '—'}
                        </td>
                        {(['1','2','3','4','5+'] as const).map(k => {
                          const vs = s.dist[k];
                          const count = new Set(vs.map(v => getVisitDoctor(v))).size;
                          return <td key={k} className="px-2 py-1.5 border-r border-gray-200 text-center cursor-pointer hover:bg-gray-100 text-xs" onClick={() => count > 0 && setModalInfo({ title: `Кратность ${k}`, subtitle: emp.МП, items: vs })}>{count || '—'}</td>;
                        })}
                        <td
                          className={`px-3 py-1.5 text-center font-black text-xs whitespace-nowrap ${s.newCount > 0 ? 'text-green-600 bg-green-50/30 cursor-pointer hover:bg-green-50' : 'text-gray-300'}`}
                          onClick={() => s.newCount > 0 && setModalInfo({ title: "Новые врачи (период)", subtitle: emp.МП, items: s.newVisits })}
                        >
                          {s.newCount || '—'}
                        </td>
                        <td
                          className={`px-3 py-1.5 text-center font-black text-xs whitespace-nowrap ${s.potentialOurs > 0 ? 'text-orange-600 bg-orange-50/30 cursor-pointer hover:bg-orange-50' : 'text-gray-300'}`}
                          onClick={() => s.potentialOurs > 0 && openPotential(emp, 'ours')}
                        >
                          {s.potentialOurs || '—'}
                        </td>
                        <td
                          className={`px-3 py-1.5 text-center font-black text-xs whitespace-nowrap ${s.potentialMarket > 0 ? 'text-purple-600 bg-purple-50/30 cursor-pointer hover:bg-purple-50' : 'text-gray-300'}`}
                          onClick={() => s.potentialMarket > 0 && openPotential(emp, 'market')}
                        >
                          {s.potentialMarket || '—'}
                        </td>
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
      {modalInfo && <DetailModal title={modalInfo.title} subtitle={modalInfo.subtitle} items={modalInfo.items} grouping={modalInfo.grouping} onClose={() => setModalInfo(null)} />}
      {potentialModal && (
        <PotentialModal
          mpName={potentialModal.mpName}
          modeLabel={potentialModal.modeLabel}
          description={potentialModal.description}
          doctors={potentialModal.doctors}
          onClose={() => setPotentialModal(null)}
        />
      )}
    </div>
  );
};

export default AnalyticsSection;
