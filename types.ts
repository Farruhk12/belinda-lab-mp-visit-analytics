
export interface Visit {
  "Дата": string;
  "Дата визита"?: string;
  "Мед представитель": string;
  "Медицинский представитель"?: string;
  "Аб ЛПУ": string;
  "ЛПУ": string;
  "Название ЛПУ"?: string;
  "Имя доктора": string;
  "Врач"?: string;
  "Специальность": string;
  "Специальность врача"?: string;
  "Территория"?: string;
  "Комментарий"?: string;
  "Примечание"?: string;
  "Комментарии"?: string;
}

export interface Employee {
  "МП": string;
  "Роль": string;
  "Статус": string;
  "Область": string;
  "Территория"?: string;
  "Группа": string;
}

export interface Fixation {
  "Дата": string;
  "МП": string;
  "Причина": string;
  "Причины"?: string;
}

export interface Order {
  "Дата отгрузки": string;
  "Покупатель": string;
  "Вид и состояние"?: string;
  "Номенклатура"?: string;
  "Количество"?: number;
  "Цена"?: number;
  "Сумма"?: number;
  "Бонус"?: number;
  "Сумма бонуса"?: number;
  "Группа товара"?: string;
  "Менеджер"?: string;
  "Объект ЛПУ"?: string;
  "Регион"?: string;
  "Специальность"?: string;
}

export interface ApiResponse {
  visits: Visit[];
  employees: Employee[];
  allEmployees: Employee[];
  fixation: Fixation[];
  orders?: Order[];
  managers?: User[];
  oldDoctorKeys?: string[]; // Ключи врачей, посещённых ДО запрошенного месяца (формат: "врач|ЛПУ" и "name:врач")
}

export enum GroupSort {
  ALFA = 1,
  BETA = 2,
  GAMMA = 3,
  DELTA = 4,
  OTHER = 99
}

export type TabType = 'visits' | 'calendar' | 'analytics' | 'planfact' | 'admin' | 'cache';

/** Общие фильтры сотрудников (синхрон между разделами) */
export interface SharedFilters {
  terr: string;
  group: string;
  rep: string;
  role: string;
  status: string;
}

export type SharedFilterKey = keyof SharedFilters;

/** Статистика МП в разделе «Аналитика визитов» */
export interface MpVisitDistribution {
  '1': Visit[];
  '2': Visit[];
  '3': Visit[];
  '4': Visit[];
  '5+': Visit[];
}

export interface MpAnalyticsStats {
  total: number;
  avg: number;
  dist: MpVisitDistribution;
  all: Visit[];
  newCount: number;
  newVisits: Visit[];
  uniqueDoctors: number;
  uniqueDoctorVisits: Visit[];
  uniqueLPUs: number;
  uniqueLPUVisits: Visit[];
  uniqueSpecs: number;
  uniqueSpecVisits: Visit[];
  potentialInLPU: number;
  potentialTerritory: number;
}

/** Запись о враче, которого МП не посещает (потенциал) */
export interface PotentialDoctor {
  doctor: string;
  lpu: string;
  spec: string;
  visitedByReps: string[];
}

/** План/факт по визитам для одного МП */
export interface MpPlanFactVisitStats {
  fact: number;
  pct: number;
  all: Visit[];
}

export interface GlobalState {
  visits: Visit[];
  employees: Employee[];
  allEmployees: Employee[];
  fixation: Fixation[];
  orders: Order[];
  oldDoctorKeys: string[]; // Ключи "врач|ЛПУ" и "name:врач" — врачи, посещённые до текущего месяца (от сервера)
  loading: boolean;
  error: string | null;
}

export interface UserPermissions {
  territories: string[]; // Список названий территорий или ["*"] для всех
  groups: string[];      // Список названий групп или ["*"] для всех
}

export interface User {
  id: string;
  username: string;
  password?: string; // В реальном приложении пароли хешируются, здесь храним для сверки
  role: 'admin' | 'user' | 'mp';
  permissions: UserPermissions;
  fullName?: string;
  mpName?: string; // Точное имя МП как в таблице визитов (только для role === 'mp')
}
