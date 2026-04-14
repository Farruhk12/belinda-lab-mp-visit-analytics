
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { GlobalState, Visit, Fixation, User, Order } from '../types';
import {
  normalizeDate,
  getVisitRepName,
  getVisitDate,
  getVisitDoctor,
  getVisitLPUFull,
  getVisitSpec,
  getVisitComment,
  isWeekend,
  toLocalISO,
  RUSSIAN_MONTHS,
} from '../utils';

interface Props {
  data: GlobalState;
  excludedDates: string[];
  currentUser: User;
  onLogout: () => void;
  onMonthChange: (month: string) => void;
}

const MPDashboard: React.FC<Props> = ({ data, excludedDates, currentUser, onLogout, onMonthChange }) => {
  const mpName = currentUser.mpName || currentUser.fullName || currentUser.username;
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerYear, setPickerYear] = useState(new Date().getFullYear());
  const pickerRef = useRef<HTMLDivElement>(null);
  const dayDetailRef = useRef<HTMLDivElement>(null);
  const [expandedFreq, setExpandedFreq] = useState<number | null>(null);
  const [activeSection, setActiveSection] = useState<'dashboard' | 'doctors' | 'contracts'>('dashboard');

  const [year, month] = selectedMonth.split('-').map(Number);

  useEffect(() => {
    if (!showPicker) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPicker]);

  // Визиты МП за выбранный месяц
  const monthVisits = useMemo(() => {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0);
    return data.visits.filter(v => {
      if (getVisitRepName(v) !== mpName) return false;
      const d = new Date(normalizeDate(getVisitDate(v)));
      return !isNaN(d.getTime()) && d >= start && d <= end;
    });
  }, [data.visits, mpName, year, month]);

  // Фиксации (причины отсутствия) за месяц
  const monthFixations = useMemo(() => {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0);
    return data.fixation.filter(f => {
      if (f.МП !== mpName) return false;
      const d = new Date(normalizeDate(f.Дата));
      return !isNaN(d.getTime()) && d >= start && d <= end;
    });
  }, [data.fixation, mpName, year, month]);

  // Карта дней: дата → { визиты, фиксация }
  const dayMap = useMemo(() => {
    const map: Record<string, { visits: Visit[]; fixation: Fixation | null }> = {};
    monthVisits.forEach(v => {
      const d = normalizeDate(getVisitDate(v));
      if (!map[d]) map[d] = { visits: [], fixation: null };
      map[d].visits.push(v);
    });
    monthFixations.forEach(f => {
      const d = normalizeDate(f.Дата);
      if (!map[d]) map[d] = { visits: [], fixation: null };
      map[d].fixation = f;
    });
    return map;
  }, [monthVisits, monthFixations]);

  // Расчёт Плана/Факта
  const planFact = useMemo(() => {
    const PLAN = 288;
    const today = toLocalISO(new Date());
    const daysInMonth = new Date(year, month, 0).getDate();
    let workingDays = 0;
    let workingDaysDone = 0;
    let daysWithVisits = 0;
    let daysWithoutVisits = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (!isWeekend(dateStr, excludedDates)) {
        workingDays++;
        if (dateStr <= today) {
          workingDaysDone++;
          const dayData = dayMap[dateStr];
          if (dayData && dayData.visits.length > 0) daysWithVisits++;
          else daysWithoutVisits++;
        }
      }
    }

    const fact = monthVisits.filter(v => !isWeekend(normalizeDate(getVisitDate(v)), excludedDates)).length;
    const pct = Math.round((fact / PLAN) * 100);
    const uniqueDoctors = new Set(monthVisits.map(v => getVisitDoctor(v))).size;
    const avgPerDay = workingDaysDone > 0 ? (fact / workingDaysDone).toFixed(1) : '—';

    return { plan: PLAN, fact, pct, workingDays, workingDaysDone, daysWithVisits, daysWithoutVisits, uniqueDoctors, avgPerDay };
  }, [monthVisits, excludedDates, year, month, dayMap]);

  // Дни для календаря
  const calendarDays = useMemo(() => {
    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDay = new Date(year, month - 1, 1).getDay();
    const offset = firstDay === 0 ? 6 : firstDay - 1;
    const today = toLocalISO(new Date());
    const days: (null | {
      dateStr: string; d: number;
      dayData: { visits: Visit[]; fixation: Fixation | null };
      excluded: boolean; isFuture: boolean; isToday: boolean;
    })[] = [];

    for (let i = 0; i < offset; i++) days.push(null);

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayData = dayMap[dateStr] || { visits: [], fixation: null };
      const excluded = isWeekend(dateStr, excludedDates);
      const isFuture = dateStr > today;
      const isToday = dateStr === today;
      days.push({ dateStr, d, dayData, excluded, isFuture, isToday });
    }
    return days;
  }, [year, month, dayMap, excludedDates]);

  // Распределение врачей по количеству визитов
  const doctorFreq = useMemo(() => {
    const doctorCount: Record<string, number> = {};
    monthVisits.forEach(v => {
      const doc = getVisitDoctor(v);
      if (doc && doc !== '—') doctorCount[doc] = (doctorCount[doc] || 0) + 1;
    });
    const freqGroup: Record<number, string[]> = {};
    Object.entries(doctorCount).forEach(([doc, count]) => {
      if (!freqGroup[count]) freqGroup[count] = [];
      freqGroup[count].push(doc);
    });
    return { doctorCount, freqGroup };
  }, [monthVisits]);

  const selectedDayData = selectedDay ? (dayMap[selectedDay] || { visits: [], fixation: null }) : null;

  // ── Логика подключений ──

  // Группа МП (из справочника сотрудников)
  const mpGroup = useMemo(() => {
    const emp = data.allEmployees.find(e => e.МП === mpName);
    return emp?.Группа || '';
  }, [data.allEmployees, mpName]);

  // Врачи, посещённые этим МП ДО текущего месяца — из серверных oldDoctorKeys (ключи "rep:ИмяМП|ИмяВрача")
  const prevMonthDoctors = useMemo(() => {
    const set = new Set<string>();
    const prefix = "rep:" + mpName + "|";
    data.oldDoctorKeys.forEach(key => {
      if (key.startsWith(prefix)) {
        set.add(key.substring(prefix.length));
      }
    });
    return set;
  }, [data.oldDoctorKeys, mpName]);

  // Новые врачи этого месяца = были в визитах месяца, но не встречались ранее
  const newDoctorsThisMonth = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    monthVisits.forEach(v => {
      const doc = getVisitDoctor(v);
      if (doc && doc !== '—' && !prevMonthDoctors.has(doc) && !seen.has(doc)) {
        seen.add(doc);
        result.push(doc);
      }
    });
    return result;
  }, [monthVisits, prevMonthDoctors]);

  // Заказы за текущий месяц по группе МП
  const monthOrdersForGroup = useMemo((): Order[] => {
    if (!data.orders?.length || !mpGroup) return [];
    const start = new Date(year, month - 1, 1);
    const end   = new Date(year, month, 0);
    return data.orders.filter(o => {
      const d = new Date(normalizeDate(o["Дата отгрузки"]));
      if (isNaN(d.getTime()) || d < start || d > end) return false;
      const g = (o["Группа товара"] || '').toLowerCase().trim();
      return g === mpGroup.toLowerCase().trim();
    });
  }, [data.orders, year, month, mpGroup]);

  // Карта: имя врача → его заказы
  const ordersByDoctor = useMemo(() => {
    const map: Record<string, Order[]> = {};
    monthOrdersForGroup.forEach(o => {
      const buyer = o["Покупатель"];
      if (!buyer) return;
      if (!map[buyer]) map[buyer] = [];
      map[buyer].push(o);
    });
    return map;
  }, [monthOrdersForGroup]);

  // Подключения = новый врач + есть заказ
  const connections = useMemo(() => {
    return newDoctorsThisMonth.filter(doc => !!ordersByDoctor[doc]);
  }, [newDoctorsThisMonth, ordersByDoctor]);

  const PLAN_CONTRACTS = 5;

  const prevMonth = () => {
    const d = new Date(year, month - 2, 1);
    const m = d.toISOString().slice(0, 7);
    setSelectedMonth(m);
    setSelectedDay(null);
    onMonthChange(m);
  };
  const nextMonth = () => {
    const d = new Date(year, month, 1);
    const m = d.toISOString().slice(0, 7);
    setSelectedMonth(m);
    setSelectedDay(null);
    onMonthChange(m);
  };

  const fixationLabel = (fixation: Fixation | null): string => {
    if (!fixation) return '';
    const r = (fixation.Причина || fixation.Причины || '').toLowerCase();
    if (r.includes('болез')) return 'Б';
    if (r.includes('отпуск')) return 'О';
    if (r.includes('офис')) return 'Оф';
    return 'П';
  };

  const getDayClasses = (day: typeof calendarDays[0]) => {
    if (!day) return '';
    if (day.excluded) return 'bg-gray-100 text-gray-300 cursor-default';
    if (day.isFuture) return 'bg-gray-50 text-gray-300 cursor-default border border-gray-100';
    const isSelected = selectedDay === day.dateStr;
    const base = isSelected ? 'ring-2 ring-brand-accent scale-105 shadow-md ' : '';
    if (day.dayData.visits.length > 0) return base + 'bg-green-50 border border-green-200 text-green-700 cursor-pointer active:scale-95';
    if (day.dayData.fixation) return base + 'bg-amber-50 border border-amber-200 text-amber-700 cursor-pointer active:scale-95';
    return base + 'bg-red-50 border border-red-200 text-red-600 cursor-pointer active:scale-95';
  };

  const pluralVisit = (n: number) => n === 1 ? 'визит' : n < 5 ? 'визита' : 'визитов';
  const pluralDoctor = (n: number) => n === 1 ? 'врач' : n < 5 ? 'врача' : 'врачей';

  const pctColor = planFact.pct >= 100 ? 'text-green-500' : planFact.pct >= 70 ? 'text-amber-500' : 'text-brand-accent';
  const barColor = planFact.pct >= 100 ? 'bg-green-500' : planFact.pct >= 70 ? 'bg-amber-500' : 'bg-brand-accent';

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="max-w-lg mx-auto px-4 py-4 space-y-4 pb-10 animate-fadeIn">

        {/* Header */}
        <header className="bg-brand-primary text-white p-4 rounded-[24px] flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-3">
            <img src="https://belinda.tj/img/main-logo.svg" alt="Belinda" className="h-7 brightness-0 invert opacity-80" />
            <div>
              <p className="text-white/60 text-[9px] font-black uppercase tracking-widest leading-none mb-0.5">Мой кабинет</p>
              <p className="font-black text-sm leading-none">{mpName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Month nav */}
            <button onClick={prevMonth} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center font-black text-lg transition-all">‹</button>

            {/* Clickable month/year → opens picker */}
            <div className="relative" ref={pickerRef}>
              <button
                onClick={() => { setShowPicker(v => !v); setPickerYear(year); }}
                className="text-center min-w-[76px] px-2 py-1 rounded-xl hover:bg-white/10 transition-all"
              >
                <div className="text-xs font-black leading-none">{RUSSIAN_MONTHS[month - 1]}</div>
                <div className="text-white/50 text-[10px] font-bold flex items-center justify-center gap-0.5">
                  {year} <span className="text-[8px]">▾</span>
                </div>
              </button>

              {/* Month picker dropdown */}
              {showPicker && (
                <div className="absolute top-full right-1/2 translate-x-1/2 mt-2 z-50 bg-white rounded-2xl shadow-2xl border border-gray-100 p-3 w-64 animate-slideDown">
                  {/* Year selector */}
                  <div className="flex items-center justify-between mb-3">
                    <button
                      onClick={() => setPickerYear(y => y - 1)}
                      className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center font-black text-gray-600 transition-all"
                    >‹</button>
                    <span className="font-black text-brand-primary text-sm">{pickerYear}</span>
                    <button
                      onClick={() => setPickerYear(y => y + 1)}
                      className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center font-black text-gray-600 transition-all"
                    >›</button>
                  </div>
                  {/* Month grid */}
                  <div className="grid grid-cols-3 gap-1.5">
                    {RUSSIAN_MONTHS.map((m, i) => {
                      const val = `${pickerYear}-${String(i + 1).padStart(2, '0')}`;
                      const isActive = val === selectedMonth;
                      return (
                        <button
                          key={m}
                          onClick={() => {
                            setSelectedMonth(val);
                            setSelectedDay(null);
                            setShowPicker(false);
                            onMonthChange(val);
                          }}
                          className={`py-1.5 rounded-xl text-[11px] font-black transition-all ${
                            isActive
                              ? 'bg-brand-accent text-white shadow-sm'
                              : 'text-gray-600 hover:bg-brand-accent/10 hover:text-brand-accent'
                          }`}
                        >
                          {m.slice(0, 3)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <button onClick={nextMonth} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center font-black text-lg transition-all">›</button>
            <div className="w-px h-6 bg-white/20 mx-1" />
            <button onClick={onLogout} className="text-white/50 hover:text-white text-[10px] font-black uppercase tracking-wider transition-colors">Выход</button>
          </div>
        </header>

        {/* Section tabs */}
        <div className="flex bg-white rounded-2xl border border-gray-100 shadow-sm p-1 gap-1">
          <button
            onClick={() => setActiveSection('dashboard')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wide transition-all ${
              activeSection === 'dashboard'
                ? 'bg-brand-primary text-white shadow-sm'
                : 'text-gray-400 hover:text-brand-primary'
            }`}
          >
            📊 Мой месяц
          </button>
          <button
            onClick={() => setActiveSection('doctors')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wide transition-all ${
              activeSection === 'doctors'
                ? 'bg-brand-primary text-white shadow-sm'
                : 'text-gray-400 hover:text-brand-primary'
            }`}
          >
            🩺 Врачи
          </button>
          <button
            onClick={() => setActiveSection('contracts')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wide transition-all ${
              activeSection === 'contracts'
                ? 'bg-brand-primary text-white shadow-sm'
                : 'text-gray-400 hover:text-brand-primary'
            }`}
          >
            📋 Договоры
          </button>
        </div>

        {/* ── РАЗДЕЛ: МОЙ МЕСЯЦ ── */}
        {activeSection === 'dashboard' && (
          <>
            {/* Plan / Fact */}
            <div className="bg-white rounded-[24px] border border-gray-100 shadow-sm p-4">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">План / Факт на месяц</p>
              <div className="flex items-end justify-between mb-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl font-black text-brand-accent">{planFact.fact}</span>
                  <span className="text-2xl font-bold text-gray-200">/ {planFact.plan}</span>
                </div>
                <span className={`text-4xl font-black ${pctColor}`}>{planFact.pct}%</span>
              </div>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden mb-2">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                  style={{ width: `${Math.min(planFact.pct, 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] font-bold text-gray-400">
                <span>Рабочих дней: {planFact.workingDaysDone} из {planFact.workingDays}</span>
                <span>Цель в день: 12</span>
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-[20px] border border-gray-100 shadow-sm p-3 text-center">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Дней с визитами</p>
                <p className="text-2xl font-black text-green-600">{planFact.daysWithVisits}</p>
                <p className="text-[9px] text-gray-400 font-bold">из {planFact.workingDaysDone}</p>
              </div>
              <div className="bg-white rounded-[20px] border border-gray-100 shadow-sm p-3 text-center">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Врачи</p>
                <p className="text-2xl font-black text-brand-primary">{planFact.uniqueDoctors}</p>
                <p className="text-[9px] text-gray-400 font-bold">уникальных</p>
              </div>
              <div className="bg-white rounded-[20px] border border-gray-100 shadow-sm p-3 text-center">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Среднее/день</p>
                <p className="text-2xl font-black text-brand-primary">{planFact.avgPerDay}</p>
                <p className="text-[9px] text-gray-400 font-bold">визитов</p>
              </div>
            </div>

            {/* Calendar */}
            <div className="bg-white rounded-[24px] border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 pt-4 pb-3 border-b border-gray-50">
                <h3 className="text-sm font-black text-brand-primary uppercase tracking-wide mb-2">Календарь визитов</h3>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  <span className="flex items-center gap-1 text-[10px] font-bold text-green-600">
                    <span className="w-2.5 h-2.5 rounded bg-green-100 border border-green-200 inline-block" />
                    Выполнено
                  </span>
                  <span className="flex items-center gap-1 text-[10px] font-bold text-red-500">
                    <span className="w-2.5 h-2.5 rounded bg-red-50 border border-red-200 inline-block" />
                    Нет визитов
                  </span>
                  <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600">
                    <span className="w-2.5 h-2.5 rounded bg-amber-50 border border-amber-200 inline-block" />
                    Причина (Б/О/Оф)
                  </span>
                  <span className="flex items-center gap-1 text-[10px] font-bold text-gray-400">
                    <span className="w-2.5 h-2.5 rounded bg-gray-100 inline-block" />
                    Выходной
                  </span>
                </div>
              </div>
              <div className="p-3">
                <div className="grid grid-cols-7 mb-1.5">
                  {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => (
                    <div key={d} className="text-center text-[9px] font-black text-gray-400 uppercase tracking-wider py-1">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {calendarDays.map((day, idx) => (
                    <div
                      key={idx}
                      onClick={() => {
                        if (!day || day.excluded || day.isFuture) return;
                        const next = selectedDay === day.dateStr ? null : day.dateStr;
                        setSelectedDay(next);
                        if (next) {
                          setTimeout(() => {
                            dayDetailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }, 50);
                        }
                      }}
                      className={`relative aspect-square rounded-xl flex flex-col items-center justify-center transition-all duration-150 select-none ${
                        day?.isToday ? 'ring-2 ring-brand-accent ' : ''
                      }${getDayClasses(day)}`}
                    >
                      {day && (
                        <>
                          <span className="text-[11px] font-black leading-none">{day.d}</span>
                          {day.dayData.visits.length > 0 && (
                            <span className="text-[8px] font-black text-green-600 leading-none mt-0.5">{day.dayData.visits.length}</span>
                          )}
                          {day.dayData.visits.length === 0 && day.dayData.fixation && (
                            <span className="text-[8px] font-black text-amber-600 leading-none mt-0.5">{fixationLabel(day.dayData.fixation)}</span>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Selected Day Detail */}
            {selectedDay && selectedDayData && (
              <div ref={dayDetailRef} className="bg-white rounded-[24px] border border-gray-100 shadow-sm overflow-hidden animate-slideDown">
                <div className="bg-brand-primary/5 px-4 py-3 flex items-center justify-between border-b border-gray-100">
                  <h3 className="text-sm font-black text-brand-primary capitalize">
                    {new Date(selectedDay + 'T12:00:00').toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </h3>
                  <button onClick={() => setSelectedDay(null)} className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 font-black text-lg leading-none transition-all">×</button>
                </div>
                {selectedDayData.visits.length === 0 ? (
                  <div className="p-6 text-center">
                    {selectedDayData.fixation ? (
                      <>
                        <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto mb-3">
                          <span className="text-2xl">📋</span>
                        </div>
                        <p className="font-black text-amber-600 text-sm">{selectedDayData.fixation.Причина || selectedDayData.fixation.Причины}</p>
                        <p className="text-[11px] text-gray-400 font-bold mt-1">Причина отсутствия</p>
                      </>
                    ) : (
                      <>
                        <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-3">
                          <span className="text-2xl">❌</span>
                        </div>
                        <p className="font-black text-red-500 text-sm">Нет визитов</p>
                        <p className="text-[11px] text-gray-400 font-bold mt-1">Визиты не зафиксированы</p>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    <div className="px-4 py-2 bg-green-50/50">
                      <p className="text-[10px] font-black text-green-600 uppercase tracking-widest">{selectedDayData.visits.length} {pluralVisit(selectedDayData.visits.length)}</p>
                    </div>
                    {selectedDayData.visits.map((v, i) => {
                      const comment = getVisitComment(v);
                      return (
                        <div key={i} className="px-4 py-3 flex items-start gap-3">
                          <div className="w-7 h-7 rounded-full bg-brand-accent/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span className="text-[10px] font-black text-brand-accent">{i + 1}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-black text-sm text-brand-primary truncate">{getVisitDoctor(v)}</p>
                            <p className="text-[11px] text-gray-400 font-medium truncate">{getVisitSpec(v)}</p>
                            <p className="text-[11px] text-gray-500 font-bold mt-0.5 truncate">{getVisitLPUFull(v)}</p>
                            {comment && (
                              <p className="text-[11px] text-indigo-600 font-bold mt-1 bg-indigo-50 rounded-lg px-2 py-1">
                                💬 {comment}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Empty state */}
            {data.loading && (
              <div className="bg-white rounded-[24px] border border-gray-100 shadow-sm p-8 text-center">
                <div className="w-8 h-8 border-2 border-brand-accent border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm font-bold text-gray-400">Загрузка данных...</p>
              </div>
            )}
            {!data.loading && monthVisits.length === 0 && (
              <div className="bg-white rounded-[24px] border border-gray-100 shadow-sm p-8 text-center">
                <div className="text-4xl mb-3">📊</div>
                <p className="font-black text-brand-primary text-sm">Нет данных за этот месяц</p>
                <p className="text-[11px] text-gray-400 font-bold mt-1">Визиты пока не зафиксированы</p>
              </div>
            )}
          </>
        )}

        {/* ── РАЗДЕЛ: ВРАЧИ ── */}
        {activeSection === 'doctors' && (
          <>
            {Object.keys(doctorFreq.freqGroup).length === 0 ? (
              <div className="bg-white rounded-[24px] border border-gray-100 shadow-sm p-8 text-center">
                <div className="text-4xl mb-3">🩺</div>
                <p className="font-black text-brand-primary text-sm">Нет данных за этот месяц</p>
              </div>
            ) : (
              <div className="bg-white rounded-[24px] border border-gray-100 shadow-sm p-4">
                <h3 className="text-sm font-black text-brand-primary uppercase tracking-wide mb-1">Частота визитов</h3>
                <p className="text-[11px] text-gray-400 font-bold mb-4">Сколько раз посетили каждого врача</p>

                <div className="space-y-2">
                  {Object.entries(doctorFreq.freqGroup)
                    .sort(([a], [b]) => Number(b) - Number(a))
                    .map(([count, doctors]) => {
                      const n = Number(count);
                      const maxCount = Math.max(...Object.values(doctorFreq.freqGroup).map(d => d.length));
                      const barWidth = Math.round((doctors.length / maxCount) * 100);
                      const isOpen = expandedFreq === n;
                      return (
                        <div key={count}>
                          <div
                            className="flex items-center gap-3 cursor-pointer group"
                            onClick={() => setExpandedFreq(isOpen ? null : n)}
                          >
                            <div className="w-24 flex-shrink-0 text-right">
                              <span className="font-black text-brand-primary text-sm">{count}</span>
                              <span className="text-gray-400 text-[10px] font-bold ml-1">{pluralVisit(n)}</span>
                            </div>
                            <div className="flex-1 relative h-8 bg-gray-50 rounded-xl overflow-hidden border border-gray-100 group-hover:border-brand-accent/30 transition-colors">
                              <div
                                className="absolute inset-y-0 left-0 bg-brand-accent/10 rounded-xl transition-all duration-500"
                                style={{ width: `${barWidth}%` }}
                              />
                              <div className="absolute inset-0 flex items-center justify-between px-3">
                                <span className="font-black text-brand-accent text-xs">
                                  {doctors.length} {pluralDoctor(doctors.length)}
                                </span>
                                <span className={`text-gray-400 text-[10px] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>▾</span>
                              </div>
                            </div>
                          </div>

                          {isOpen && (
                            <div className="mt-1.5 ml-[6.5rem] bg-gray-50 rounded-xl border border-gray-100 overflow-hidden animate-slideDown">
                              {doctors.sort().map((doc, i) => {
                                const docVisits = monthVisits.filter(v => getVisitDoctor(v) === doc);
                                const lpu = docVisits[0] ? getVisitLPUFull(docVisits[0]) : '';
                                const spec = docVisits[0] ? getVisitSpec(docVisits[0]) : '';
                                const dates = docVisits
                                  .map(v => normalizeDate(getVisitDate(v)))
                                  .filter(Boolean)
                                  .sort()
                                  .map(d => new Date(d + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }));
                                return (
                                  <div key={doc} className={`flex items-start gap-2.5 px-3 py-2 ${i > 0 ? 'border-t border-gray-100' : ''}`}>
                                    <span className="w-5 h-5 rounded-full bg-brand-accent/10 flex items-center justify-center flex-shrink-0 mt-0.5 text-[9px] font-black text-brand-accent">{i + 1}</span>
                                    <div className="min-w-0 flex-1">
                                      <p className="text-xs font-black text-brand-primary truncate">{doc}</p>
                                      <p className="text-[10px] text-gray-400 font-medium truncate">{spec}</p>
                                      <p className="text-[10px] text-gray-500 font-bold truncate">{lpu}</p>
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {dates.map(d => (
                                          <span key={d} className="px-1.5 py-0.5 bg-white border border-gray-200 rounded-md text-[9px] font-black text-gray-500">{d}</span>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>

                <div className="mt-4 pt-3 border-t border-gray-50 grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Всего визитов</p>
                    <p className="text-2xl font-black text-brand-primary">{monthVisits.length}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Уникальных врачей</p>
                    <p className="text-2xl font-black text-brand-primary">{Object.keys(doctorFreq.doctorCount).length}</p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── РАЗДЕЛ: ДОГОВОРЫ / ПОДКЛЮЧЕНИЯ ── */}
        {activeSection === 'contracts' && (
          <>
            {/* Plan / Fact card */}
            {(() => {
              const fact    = connections.length;
              const pct     = Math.round((fact / PLAN_CONTRACTS) * 100);
              const barClr  = pct >= 100 ? 'bg-green-500' : pct >= 60 ? 'bg-amber-500' : 'bg-brand-accent';
              const txtClr  = pct >= 100 ? 'text-green-500' : pct >= 60 ? 'text-amber-500' : 'text-brand-accent';
              return (
                <div className="bg-white rounded-[24px] border border-gray-100 shadow-sm p-4">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Подключения на месяц</p>
                  <div className="flex items-end justify-between mb-3">
                    <div className="flex items-baseline gap-2">
                      <span className={`text-5xl font-black ${txtClr}`}>{fact}</span>
                      <span className="text-2xl font-bold text-gray-200">/ {PLAN_CONTRACTS}</span>
                    </div>
                    <span className={`text-4xl font-black ${txtClr}`}>{pct}%</span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden mb-2">
                    <div className={`h-full rounded-full transition-all duration-700 ${barClr}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-bold text-gray-400">
                    <span>Новых врачей в месяце: {newDoctorsThisMonth.length}</span>
                    <span>Цель: {PLAN_CONTRACTS}</span>
                  </div>
                </div>
              );
            })()}

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-[20px] border border-gray-100 shadow-sm p-3 text-center">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Подключено</p>
                <p className="text-2xl font-black text-green-600">{connections.length}</p>
                <p className="text-[9px] text-gray-400 font-bold">выписали</p>
              </div>
              <div className="bg-white rounded-[20px] border border-gray-100 shadow-sm p-3 text-center">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Новых врачей</p>
                <p className="text-2xl font-black text-brand-primary">{newDoctorsThisMonth.length}</p>
                <p className="text-[9px] text-gray-400 font-bold">в этом месяце</p>
              </div>
              <div className="bg-white rounded-[20px] border border-gray-100 shadow-sm p-3 text-center">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Ожидание</p>
                <p className="text-2xl font-black text-amber-500">{newDoctorsThisMonth.length - connections.length}</p>
                <p className="text-[9px] text-gray-400 font-bold">ещё не выписали</p>
              </div>
            </div>

            {/* Doctor list */}
            {newDoctorsThisMonth.length === 0 ? (
              <div className="bg-white rounded-[24px] border border-gray-100 shadow-sm p-8 text-center">
                <div className="text-4xl mb-3">🩺</div>
                <p className="font-black text-brand-primary text-sm">Новых врачей нет</p>
                <p className="text-[11px] text-gray-400 font-bold mt-1">В этом месяце все врачи уже посещались ранее</p>
              </div>
            ) : (
              <div className="bg-white rounded-[24px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-50">
                  <h3 className="text-sm font-black text-brand-primary uppercase tracking-wide">Новые врачи месяца</h3>
                  <p className="text-[11px] text-gray-400 font-bold mt-0.5">
                    Группа: <span className="text-brand-primary">{mpGroup || '—'}</span>
                  </p>
                </div>
                <div className="divide-y divide-gray-50">
                  {newDoctorsThisMonth.map((doc, i) => {
                    const isConnected = !!ordersByDoctor[doc];
                    const docOrders   = ordersByDoctor[doc] || [];
                    const totalSum    = docOrders.reduce((s, o) => s + (Number(o["Сумма"]) || 0), 0);

                    // Все визиты к этому врачу в этом месяце
                    const docVisits = monthVisits.filter(v => getVisitDoctor(v) === doc);
                    const spec      = docVisits[0] ? getVisitSpec(docVisits[0]) : '';
                    const lpu       = docVisits[0] ? getVisitLPUFull(docVisits[0]) : '';
                    const visitDates = docVisits
                      .map(v => normalizeDate(getVisitDate(v)))
                      .filter(Boolean)
                      .sort()
                      .map(d => new Date(d + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }));

                    return (
                      <div key={doc} className="px-4 py-3">
                        <div className="flex items-start gap-3">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-black ${
                            isConnected ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'
                          }`}>
                            {isConnected ? '✓' : i + 1}
                          </div>
                          <div className="flex-1 min-w-0">

                            {/* Имя + статус */}
                            <div className="flex items-center justify-between gap-2 mb-0.5">
                              <p className="font-black text-sm text-brand-primary truncate">{doc}</p>
                              <span className={`flex-shrink-0 px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider ${
                                isConnected ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                              }`}>
                                {isConnected ? '✅ Подключён' : '⏳ Ожидание'}
                              </span>
                            </div>

                            {/* Специальность + ЛПУ */}
                            <p className="text-[11px] text-gray-400 font-medium truncate">{spec}</p>
                            <p className="text-[11px] text-gray-500 font-bold truncate">{lpu}</p>

                            {/* Дата(ы) визита */}
                            {visitDates.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider mr-0.5">Визит:</span>
                                {visitDates.map(d => (
                                  <span key={d} className="px-1.5 py-0.5 bg-brand-primary/5 border border-brand-primary/10 rounded-md text-[9px] font-black text-brand-primary">{d}</span>
                                ))}
                              </div>
                            )}

                            {/* Выписанные продукты */}
                            {isConnected && (
                              <div className="mt-2 bg-green-50 rounded-xl p-2.5 space-y-1.5">
                                <p className="text-[9px] font-black text-green-600 uppercase tracking-wider mb-1">Выписанные препараты</p>
                                {docOrders.map((o, oi) => (
                                  <div key={oi} className="flex items-start justify-between gap-2">
                                    <p className="text-[10px] font-bold text-green-800 flex-1 leading-tight">{o["Номенклатура"] || '—'}</p>
                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                      <span className="text-[10px] text-green-600 font-bold">{o["Количество"]} шт.</span>
                                      {o["Сумма"] ? (
                                        <span className="text-[10px] text-green-700 font-black">{Number(o["Сумма"]).toLocaleString('ru')} сум</span>
                                      ) : null}
                                    </div>
                                  </div>
                                ))}
                                {docOrders.length > 1 && (
                                  <div className="pt-1 border-t border-green-200 flex justify-end">
                                    <span className="text-[10px] font-black text-green-700">Итого: {totalSum.toLocaleString('ru')} сум</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        <footer className="text-center text-gray-400 text-[10px] pb-2">
          &copy; {new Date().getFullYear()} Belinda Lab
        </footer>
      </div>
    </div>
  );
};

export default MPDashboard;
