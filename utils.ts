
import { GroupSort, Employee, Visit, SharedFilters, DoctorBaseRow } from './types';

export const toLocalISO = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const normalizeDate = (dateStr: string): string => {
  if (!dateStr) return '';
  const trimmed = dateStr.toString().trim();
  
  // Format: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  
  // Format: DD.MM.YYYY or DD/MM/YYYY
  const parts = trimmed.split(/[./-]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }
  
  try {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return toLocalISO(d);
  } catch(e) {}
  
  return trimmed;
};

/**
 * Checks if a date is considered a non-working day based on a manual list of date strings.
 */
export const isWeekend = (dateStr: string, excludedDates: string[] = []): boolean => {
  if (!dateStr) return false;
  const norm = normalizeDate(dateStr);
  return excludedDates.includes(norm);
};

export const getGroupSortValue = (group: string): number => {
  const g = group?.toLowerCase() || '';
  if (g.includes('альфа')) return GroupSort.ALFA;
  if (g.includes('бета')) return GroupSort.BETA;
  if (g.includes('гамма') || g.includes('gamma')) return GroupSort.GAMMA;
  if (g.includes('дельта') || g.includes('delta')) return GroupSort.DELTA;
  return GroupSort.OTHER;
};

export const sortEmployees = (a: Employee, b: Employee): number => {
  const groupA = getGroupSortValue(a.Группа);
  const groupB = getGroupSortValue(b.Группа);
  
  if (groupA !== groupB) return groupA - groupB;
  return a.МП.localeCompare(b.МП, 'ru');
};

export const employeeMatchesSharedFilters = (emp: Employee, f: SharedFilters): boolean => {
  if (f.terr && emp.Область !== f.terr) return false;
  if (f.group && emp.Группа !== f.group) return false;
  if (f.rep && emp.МП !== f.rep) return false;
  if (f.role && emp.Роль !== f.role) return false;
  if (f.status && emp.Статус !== f.status) return false;
  return true;
};

export const groupEmployeesByTerritory = (employees: Employee[]): Record<string, Employee[]> => {
  const grouped: Record<string, Employee[]> = {};
  for (const emp of employees) {
    const key = emp.Область;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(emp);
  }
  return grouped;
};

export const getVisitRepName = (v: Visit): string => 
  v["Мед представитель"] || v["Медицинский представитель"] || '';

/** Индекс визитов по имени МП — O(визиты) вместо повторных filter */
export const indexVisitsByRep = (visits: Visit[]): Map<string, Visit[]> => {
  const m = new Map<string, Visit[]>();
  for (const v of visits) {
    const mp = getVisitRepName(v);
    if (!mp) continue;
    let arr = m.get(mp);
    if (!arr) {
      arr = [];
      m.set(mp, arr);
    }
    arr.push(v);
  }
  return m;
};

export const getVisitLPUAbbr = (v: Visit): string => 
  v["Аб ЛПУ"] || '—';

export const getVisitLPUFull = (v: Visit): string => 
  v["ЛПУ"] || v["Название ЛПУ"] || '—';

export const getVisitDoctor = (v: Visit): string => 
  v["Имя доктора"] || v["Врач"] || '—';

export const getVisitSpec = (v: Visit): string => 
  v["Специальность"] || v["Специальность врача"] || '—';

export const getVisitDate = (v: Visit): string =>
  v["Дата"] || v["Дата визита"] || '';

export const getVisitComment = (v: Visit): string =>
  v["Комментарий"] || v["Примечание"] || v["Комментарии"] || '';

/** Сопоставление территории сотрудника (Область) и строки листа «База» */
export const territoryMatchesEmployee = (empTerritory: string, baseTerritory: string): boolean => {
  const a = empTerritory.trim().toLowerCase();
  const b = baseTerritory.trim().toLowerCase();
  if (!a || !b) return false;
  return a === b;
};

/**
 * Преобразует строки листа «База» (заголовки как в таблице) в унифицированный вид.
 */
export const parseDoctorBaseRows = (rows: Record<string, unknown>[]): DoctorBaseRow[] => {
  const out: DoctorBaseRow[] = [];
  for (const r of rows) {
    const territory = String(r["Территория"] ?? r["Область"] ?? "").trim();
    const lpuAbbr = String(r["Аб ЛПУ"] ?? r["Аб ЛПУ "] ?? "").trim();
    const doctor = String(r["Имя доктора"] ?? r["Врач"] ?? "").trim();
    const specRaw = String(r["Специальность"] ?? "").trim();
    if (!doctor || !lpuAbbr) continue;
    out.push({
      territory,
      lpuAbbr,
      doctor,
      spec: specRaw || '—',
    });
  }
  return out;
};

export const isSameDay = (d1: Date, d2: Date) => 
  d1.getFullYear() === d2.getFullYear() &&
  d1.getMonth() === d2.getMonth() &&
  d1.getDate() === d2.getDate();

export const formatMonthYear = (dateStr: string): string => {
  const [year, month] = dateStr.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleString('ru-RU', { month: 'long', year: 'numeric' });
};

export const RUSSIAN_MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];
