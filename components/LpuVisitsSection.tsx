
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { GlobalState, Visit } from '../types';
import {
  normalizeDate,
  getVisitRepName,
  getVisitLPUAbbr,
  getVisitLPUFull,
  getVisitDoctor,
  getVisitSpec,
  getVisitComment,
  getVisitDate,
  sortEmployees,
  isWeekend,
  toLocalISO,
  RUSSIAN_MONTHS,
} from '../utils';
import { CustomMultiSelect, CustomMultiMonthInput } from './ui';
import { loadMonthSnapshot } from '../services/dataCache';

const API_URL = (import.meta.env.VITE_API_URL ?? '').trim();

function sortYm(arr: string[]): string[] {
  return [...new Set(arr)].filter(Boolean).sort();
}

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split('-');
  const idx = parseInt(m, 10) - 1;
  return `${RUSSIAN_MONTHS[idx] ?? m} ${y}`;
}

interface Props {
  data: GlobalState;
  currentMonth: string;
  excludedDates: string[];
}

type ModalData = {
  title: string;
  subtitle: string;
  columns: { key: string; label: string }[];
  rows: Record<string, string>[];
} | null;

const LpuModal: React.FC<{ data: ModalData; onClose: () => void }> = ({ data: d, onClose }) => {
  if (!d) return null;
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-brand-primary/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white w-full max-w-4xl rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
        <div className="bg-brand-primary p-6 text-white flex justify-between items-start shrink-0">
          <div>
            <h3 className="font-black text-xl tracking-tight mb-1">{d.title}</h3>
            <p className="text-xs text-white/60 font-bold uppercase tracking-widest">{d.subtitle} — {d.rows.length} записей</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-white">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="overflow-y-auto custom-scrollbar bg-gray-50/50 flex-1">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-100 text-[10px] font-black uppercase tracking-widest text-left sticky top-0 z-10">
              <tr>
                <th className="px-4 py-2.5 text-gray-500 w-8">#</th>
                {d.columns.map(c => (
                  <th key={c.key} className="px-4 py-2.5 text-gray-500">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.rows.map((row, i) => (
                <tr key={i} className="border-b border-gray-100 hover:bg-white transition-colors">
                  <td className="px-4 py-2.5 text-gray-300 font-bold text-xs">{i + 1}</td>
                  {d.columns.map(c => (
                    <td key={c.key} className="px-4 py-2.5 text-xs font-medium text-brand-primary whitespace-nowrap">{row[c.key] || '—'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-6 bg-white border-t border-gray-100 flex justify-end shrink-0">
          <button onClick={onClose} className="px-10 py-3 bg-brand-primary text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-brand-primary/20 hover:brightness-110 active:scale-95 transition-all">
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};

const LpuVisitsSection: React.FC<Props> = ({ data, currentMonth, excludedDates }) => {
  const [modalData, setModalData] = useState<ModalData>(null);

  const [analyticsMonths, setAnalyticsMonths] = useState<string[]>([]);
  const [asyncMerged, setAsyncMerged] = useState<Visit[] | null>(null);
  const [monthsLoading, setMonthsLoading] = useState(false);

  const [selTerrs, setSelTerrs] = useState<string[]>([]);
  const [selGroups, setSelGroups] = useState<string[]>([]);
  const [selReps, setSelReps] = useState<string[]>([]);
  const [selRoles, setSelRoles] = useState<string[]>([]);
  const [selStatuses, setSelStatuses] = useState<string[]>([]);
  const [selLPUs, setSelLPUs] = useState<string[]>([]);
  const [selSpecs, setSelSpecs] = useState<string[]>([]);

  useEffect(() => {
    setAnalyticsMonths(prev => (prev.length > 0 ? prev : currentMonth ? [currentMonth] : []));
  }, [currentMonth]);

  useEffect(() => {
    let cancelled = false;
    const months = sortYm(analyticsMonths);
    if (months.length === 0) return undefined;

    const onlyCurrent = months.length === 1 && months[0] === currentMonth;
    if (onlyCurrent) {
      setAsyncMerged(null);
      setMonthsLoading(false);
      return undefined;
    }

    setMonthsLoading(true);
    (async () => {
      try {
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
              } catch { parts.push([]); }
            } else {
              parts.push([]);
            }
          }
        }
        if (!cancelled) setAsyncMerged(parts.flat());
      } finally {
        if (!cancelled) setMonthsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [analyticsMonths, currentMonth, data.visits]);

  const mergedVisits = useMemo(() => {
    const months = sortYm(analyticsMonths);
    if (months.length === 1 && months[0] === currentMonth) return data.visits;
    return asyncMerged ?? [];
  }, [analyticsMonths, currentMonth, data.visits, asyncMerged]);

  const workdayVisits = useMemo(
    () =>
      mergedVisits.filter(v => {
        const dStr = getVisitDate(v);
        if (!dStr) return false;
        const d = new Date(normalizeDate(dStr));
        if (isNaN(d.getTime())) return false;
        return !isWeekend(toLocalISO(d), excludedDates);
      }),
    [mergedVisits, excludedDates],
  );

  const onMonthsChange = useCallback((next: string[]) => {
    const s = sortYm(next);
    if (s.length === 0) return;
    setAnalyticsMonths(s);
  }, []);

  const allEmps = data.employees;

  const terrOptions = useMemo(
    () => Array.from(new Set(allEmps.map(e => e.Область))).sort((a, b) => a.localeCompare(b, 'ru')),
    [allEmps],
  );
  const afterTerr = useMemo(
    () => (selTerrs.length ? allEmps.filter(e => selTerrs.includes(e.Область)) : allEmps),
    [allEmps, selTerrs],
  );
  const groupOptions = useMemo(
    () => Array.from(new Set(afterTerr.map(e => e.Группа))).sort((a, b) => a.localeCompare(b, 'ru')),
    [afterTerr],
  );
  const afterGroup = useMemo(
    () => (selGroups.length ? afterTerr.filter(e => selGroups.includes(e.Группа)) : afterTerr),
    [afterTerr, selGroups],
  );
  const repOptions = useMemo(
    () => Array.from(new Set(afterGroup.map(e => e.МП))).sort((a, b) => a.localeCompare(b, 'ru')),
    [afterGroup],
  );
  const roleOptions = useMemo(
    () => Array.from(new Set(afterGroup.map(e => e.Роль))).sort((a, b) => a.localeCompare(b, 'ru')),
    [afterGroup],
  );
  const statusOptions = useMemo(
    () => Array.from(new Set(afterGroup.map(e => e.Статус))).sort((a, b) => a.localeCompare(b, 'ru')),
    [afterGroup],
  );

  const filteredEmployees = useMemo(
    () =>
      afterGroup
        .filter(e => {
          if (selReps.length && !selReps.includes(e.МП)) return false;
          if (selRoles.length && !selRoles.includes(e.Роль)) return false;
          if (selStatuses.length && !selStatuses.includes(e.Статус)) return false;
          return true;
        })
        .sort(sortEmployees),
    [afterGroup, selReps, selRoles, selStatuses],
  );

  const allowedMpNames = useMemo(() => new Set(filteredEmployees.map(e => e.МП)), [filteredEmployees]);

  const employeeFilteredVisits = useMemo(
    () => workdayVisits.filter(v => allowedMpNames.has(getVisitRepName(v))),
    [workdayVisits, allowedMpNames],
  );

  const lpuOptions = useMemo(
    () =>
      Array.from(new Set(employeeFilteredVisits.map(v => getVisitLPUAbbr(v)).filter(l => l !== '—'))).sort((a, b) =>
        a.localeCompare(b, 'ru'),
      ),
    [employeeFilteredVisits],
  );
  const specOptions = useMemo(
    () =>
      Array.from(new Set(employeeFilteredVisits.map(v => getVisitSpec(v)).filter(s => s !== '—'))).sort((a, b) =>
        a.localeCompare(b, 'ru'),
      ),
    [employeeFilteredVisits],
  );

  useEffect(() => { setSelGroups(prev => prev.filter(g => groupOptions.includes(g))); }, [groupOptions]);
  useEffect(() => { setSelReps(prev => prev.filter(r => repOptions.includes(r))); }, [repOptions]);
  useEffect(() => { setSelRoles(prev => prev.filter(r => roleOptions.includes(r))); }, [roleOptions]);
  useEffect(() => { setSelStatuses(prev => prev.filter(s => statusOptions.includes(s))); }, [statusOptions]);
  useEffect(() => { setSelLPUs(prev => prev.filter(l => lpuOptions.includes(l))); }, [lpuOptions]);
  useEffect(() => { setSelSpecs(prev => prev.filter(s => specOptions.includes(s))); }, [specOptions]);

  const filteredVisits = useMemo(() => {
    let visits = employeeFilteredVisits;
    if (selLPUs.length) visits = visits.filter(v => selLPUs.includes(getVisitLPUAbbr(v)));
    if (selSpecs.length) visits = visits.filter(v => selSpecs.includes(getVisitSpec(v)));
    return visits;
  }, [employeeFilteredVisits, selLPUs, selSpecs]);

  const hasLpuFilter = selLPUs.length > 0;

  const lpuFullName = useMemo(() => {
    if (selLPUs.length !== 1) return '';
    const v = workdayVisits.find(visit => getVisitLPUAbbr(visit) === selLPUs[0]);
    return v ? getVisitLPUFull(v) : '';
  }, [workdayVisits, selLPUs]);

  const baseDoctorsByLpu = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const row of data.doctorBase) {
      const lpu = row.lpuAbbr;
      if (!lpu) continue;
      let set = m.get(lpu);
      if (!set) { set = new Set(); m.set(lpu, set); }
      set.add(row.doctor);
    }
    return m;
  }, [data.doctorBase]);

  const visitsByMonth = useMemo(() => {
    const grouped: Record<string, Visit[]> = {};
    for (const v of filteredVisits) {
      const d = normalizeDate(getVisitDate(v));
      if (!d) continue;
      const ym = d.slice(0, 7);
      if (!grouped[ym]) grouped[ym] = [];
      grouped[ym].push(v);
    }
    return Object.entries(grouped).sort(([a], [b]) => b.localeCompare(a));
  }, [filteredVisits]);

  const stats = useMemo(() => {
    const reps = new Set<string>();
    const doctors = new Set<string>();
    const specs = new Set<string>();
    const lpus = new Set<string>();
    for (const v of filteredVisits) {
      reps.add(getVisitRepName(v));
      doctors.add(getVisitDoctor(v));
      specs.add(getVisitSpec(v));
      const l = getVisitLPUAbbr(v);
      if (l !== '—') lpus.add(l);
    }
    return {
      totalVisits: filteredVisits.length,
      totalMonths: visitsByMonth.length,
      totalReps: reps.size,
      totalDoctors: doctors.size,
      totalSpecs: specs.size,
      totalLPUs: lpus.size,
    };
  }, [filteredVisits, visitsByMonth]);

  const computeMonthDoctorStats = (visits: Visit[]) => {
    const visitedDoctorKeys = new Set<string>();
    const lpusInMonth = new Set<string>();
    for (const v of visits) {
      visitedDoctorKeys.add(`${getVisitDoctor(v)}|${getVisitLPUAbbr(v)}`);
      const l = getVisitLPUAbbr(v);
      if (l !== '—') lpusInMonth.add(l);
    }

    const uniqueVisited = new Set<string>();
    for (const v of visits) uniqueVisited.add(getVisitDoctor(v));

    const potentialDocs: { doctor: string; lpu: string; spec: string }[] = [];
    const targetLPUs = selLPUs.length ? selLPUs : Array.from(lpusInMonth);
    for (const lpu of targetLPUs) {
      const baseDocs = baseDoctorsByLpu.get(lpu);
      if (!baseDocs) continue;
      for (const doc of baseDocs) {
        if (!visitedDoctorKeys.has(`${doc}|${lpu}`)) {
          const row = data.doctorBase.find(r => r.lpuAbbr === lpu && r.doctor === doc);
          potentialDocs.push({ doctor: doc, lpu, spec: row?.spec ?? '—' });
        }
      }
    }

    return { visited: uniqueVisited.size, potential: potentialDocs.length, potentialDocs };
  };

  const openVisitsModal = (monthKey: string, visits: Visit[]) => {
    setModalData({
      title: 'Визиты',
      subtitle: formatMonthLabel(monthKey),
      columns: [
        { key: 'date', label: 'Дата' },
        { key: 'rep', label: 'МП' },
        { key: 'doctor', label: 'Врач' },
        { key: 'spec', label: 'Специальность' },
        { key: 'lpu', label: 'ЛПУ' },
        { key: 'comment', label: 'Комментарий' },
      ],
      rows: visits
        .slice()
        .sort((a, b) => normalizeDate(getVisitDate(b)).localeCompare(normalizeDate(getVisitDate(a))))
        .map(v => {
          const d = normalizeDate(getVisitDate(v));
          const [y, m, day] = d.split('-');
          return { date: `${day}.${m}.${y}`, rep: getVisitRepName(v), doctor: getVisitDoctor(v), spec: getVisitSpec(v), lpu: getVisitLPUAbbr(v), comment: getVisitComment(v) || '—' };
        }),
    });
  };

  const openRepsModal = (monthKey: string, visits: Visit[]) => {
    const repMap = new Map<string, { visits: number; doctors: Set<string>; lpus: Set<string> }>();
    for (const v of visits) {
      const rep = getVisitRepName(v);
      let e = repMap.get(rep);
      if (!e) { e = { visits: 0, doctors: new Set(), lpus: new Set() }; repMap.set(rep, e); }
      e.visits++;
      e.doctors.add(getVisitDoctor(v));
      const l = getVisitLPUAbbr(v);
      if (l !== '—') e.lpus.add(l);
    }
    setModalData({
      title: 'Медицинские представители',
      subtitle: formatMonthLabel(monthKey),
      columns: [
        { key: 'rep', label: 'МП' },
        { key: 'visits', label: 'Визитов' },
        { key: 'doctors', label: 'Врачей' },
        { key: 'lpus', label: 'ЛПУ' },
      ],
      rows: Array.from(repMap.entries())
        .sort((a, b) => b[1].visits - a[1].visits)
        .map(([rep, info]) => ({ rep, visits: String(info.visits), doctors: String(info.doctors.size), lpus: String(info.lpus.size) })),
    });
  };

  const openDoctorsModal = (monthKey: string, visits: Visit[]) => {
    const docMap = new Map<string, { spec: string; lpu: string; reps: Set<string>; count: number }>();
    for (const v of visits) {
      const doc = getVisitDoctor(v);
      let e = docMap.get(doc);
      if (!e) { e = { spec: getVisitSpec(v), lpu: getVisitLPUAbbr(v), reps: new Set(), count: 0 }; docMap.set(doc, e); }
      e.reps.add(getVisitRepName(v));
      e.count++;
    }
    setModalData({
      title: 'Наши врачи',
      subtitle: formatMonthLabel(monthKey),
      columns: [
        { key: 'doctor', label: 'Врач' },
        { key: 'spec', label: 'Специальность' },
        { key: 'lpu', label: 'ЛПУ' },
        { key: 'visits', label: 'Визитов' },
        { key: 'reps', label: 'МП' },
      ],
      rows: Array.from(docMap.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .map(([doc, info]) => ({ doctor: doc, spec: info.spec, lpu: info.lpu, visits: String(info.count), reps: Array.from(info.reps).join(', ') })),
    });
  };

  const openPotentialModal = (monthKey: string, potentialDocs: { doctor: string; lpu: string; spec: string }[]) => {
    setModalData({
      title: 'Потенциальные врачи',
      subtitle: formatMonthLabel(monthKey),
      columns: [
        { key: 'doctor', label: 'Врач' },
        { key: 'spec', label: 'Специальность' },
        { key: 'lpu', label: 'ЛПУ' },
      ],
      rows: potentialDocs.sort((a, b) => a.lpu.localeCompare(b.lpu, 'ru') || a.doctor.localeCompare(b.doctor, 'ru')),
    });
  };

  const cellClick = 'cursor-pointer hover:underline decoration-2 underline-offset-2';

  return (
    <div className="space-y-6">
      {monthsLoading && (
        <div className="text-xs font-bold text-brand-accent uppercase tracking-wider animate-pulse">
          Загрузка месяцев…
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
        {selLPUs.length === 1 && lpuFullName && (
          <div className="sm:col-span-2 lg:col-span-2 flex items-end">
            <div className="bg-gray-50 border border-gray-200 rounded-[14px] px-4 py-2.5 w-full h-[42px] flex items-center">
              <span className="text-xs text-gray-500 font-medium truncate">{lpuFullName}</span>
            </div>
          </div>
        )}
      </div>

      {filteredVisits.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Визитов', value: stats.totalVisits, color: 'text-brand-accent' },
            { label: 'Месяцев', value: stats.totalMonths, color: 'text-brand-primary' },
            { label: 'МП', value: stats.totalReps, color: 'text-brand-primary' },
            { label: 'Врачей', value: stats.totalDoctors, color: 'text-brand-primary' },
            { label: 'ЛПУ', value: stats.totalLPUs, color: 'text-brand-primary' },
            { label: 'Специальностей', value: stats.totalSpecs, color: 'text-brand-primary' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
              <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
              <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {!hasLpuFilter && filteredVisits.length === 0 ? (
        <div className="bg-gray-50/50 border-2 border-gray-200/50 p-16 rounded-[48px] text-center">
          <div className="w-20 h-20 bg-gray-100 rounded-3xl flex items-center justify-center mx-auto mb-6 transform -rotate-3 border-2 border-gray-200">
            <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <div className="text-gray-500 font-black text-2xl mb-2 uppercase tracking-tight">Выберите ЛПУ</div>
          <p className="text-gray-400 text-sm font-medium max-w-sm mx-auto">
            Выберите учреждение из фильтра «ЛПУ» или другие фильтры, чтобы увидеть визиты.
          </p>
        </div>
      ) : filteredVisits.length === 0 ? (
        <div className="bg-gray-50/50 border-2 border-gray-200/50 p-16 rounded-[48px] text-center">
          <div className="text-gray-500 font-black text-xl mb-2 uppercase tracking-tight">Нет визитов</div>
          <p className="text-gray-400 text-sm font-medium">По выбранным фильтрам визиты не найдены.</p>
        </div>
      ) : (
        <div className="bg-white rounded-[24px] border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-brand-primary text-white text-[10px] uppercase font-black tracking-widest text-left">
                <tr>
                  <th className="px-3 py-2 border-r border-white/20 whitespace-nowrap w-1">Месяц</th>
                  <th className="px-3 py-2 border-r border-white/20 text-center whitespace-nowrap w-1">Визитов</th>
                  <th className="px-3 py-2 border-r border-white/20 text-center whitespace-nowrap w-1">МП</th>
                  <th className="px-3 py-2 border-r border-white/20 text-center whitespace-nowrap w-1">Наши врачи</th>
                  <th className="px-3 py-2 border-r border-white/20 text-center whitespace-nowrap w-1">Потенциал</th>
                  <th className="w-full bg-white border-l border-gray-100"></th>
                </tr>
              </thead>
              <tbody>
                {visitsByMonth.map(([monthKey, visits]) => {
                  const monthReps = new Set(visits.map(v => getVisitRepName(v)));
                  const docStats = computeMonthDoctorStats(visits);
                  return (
                    <tr key={monthKey} className="border-b border-gray-200 hover:bg-gray-50/80">
                      <td className="px-3 py-2 border-r border-gray-200 whitespace-nowrap font-bold text-brand-primary text-xs">
                        {formatMonthLabel(monthKey)}
                      </td>
                      <td
                        className={`px-3 py-2 border-r border-gray-200 text-center font-black text-brand-accent text-xs ${cellClick}`}
                        onClick={() => openVisitsModal(monthKey, visits)}
                      >
                        {visits.length}
                      </td>
                      <td
                        className={`px-3 py-2 border-r border-gray-200 text-center font-black text-brand-primary text-xs ${cellClick}`}
                        onClick={() => openRepsModal(monthKey, visits)}
                      >
                        {monthReps.size}
                      </td>
                      <td
                        className={`px-3 py-2 border-r border-gray-200 text-center font-black text-green-600 text-xs bg-green-50/30 ${cellClick}`}
                        onClick={() => openDoctorsModal(monthKey, visits)}
                      >
                        {docStats.visited}
                      </td>
                      <td
                        className={`px-3 py-2 border-r border-gray-200 text-center font-black text-orange-600 text-xs bg-orange-50/30 ${docStats.potential > 0 ? cellClick : ''}`}
                        onClick={() => docStats.potential > 0 && openPotentialModal(monthKey, docStats.potentialDocs)}
                      >
                        {docStats.potential || '—'}
                      </td>
                      <td className="w-full"></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modalData && <LpuModal data={modalData} onClose={() => setModalData(null)} />}
    </div>
  );
};

export default LpuVisitsSection;
