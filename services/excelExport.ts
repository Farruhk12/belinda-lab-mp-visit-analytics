/**
 * Экспорт отчётов в .xlsx (ExcelJS) — фирменные цвета Belinda Lab.
 */

import ExcelJS from 'exceljs';
import type { Employee, Visit, Fixation, MpAnalyticsStats, MpPlanFactVisitStats, Order } from '../types';
import {
  normalizeDate,
  getVisitRepName,
  getVisitDate,
  getVisitDoctor,
  getVisitSpec,
  getVisitLPUAbbr,
  getVisitLPUFull,
  getVisitComment,
  toLocalISO,
} from '../utils';

const COL_PRIMARY = 'FF424B52';
const COL_WHITE = 'FFFFFFFF';
const COL_TERR_BG = 'FFE8EAED';
const COL_BORDER = 'FFCBD5E1';

const WD = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

function thinBorder(): Partial<ExcelJS.Borders> {
  const e: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: COL_BORDER } };
  return { top: e, left: e, bottom: e, right: e };
}

async function saveWorkbook(wb: ExcelJS.Workbook, fileBase: string): Promise<void> {
  wb.created = new Date();
  wb.title = 'Belinda Lab';
  const safe = fileBase.replace(/[/\\?%*:|"<>]/g, '-').slice(0, 80);
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safe}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function setTitleRows(ws: ExcelJS.Worksheet, title: string, subtitle: string, mergeToCol: number): number {
  ws.mergeCells(1, 1, 1, mergeToCol);
  const c1 = ws.getCell(1, 1);
  c1.value = title;
  c1.font = { size: 16, bold: true, color: { argb: COL_PRIMARY } };
  c1.alignment = { vertical: 'middle', horizontal: 'left' };
  ws.getRow(1).height = 28;

  ws.mergeCells(2, 1, 2, mergeToCol);
  const c2 = ws.getCell(2, 1);
  c2.value = subtitle;
  c2.font = { size: 11, color: { argb: 'FF64748B' } };
  c2.alignment = { vertical: 'middle', horizontal: 'left' };
  ws.getRow(2).height = 20;
  return 3;
}

function styleHeaderRow(row: ExcelJS.Row, colCount: number): void {
  row.font = { bold: true, color: { argb: COL_WHITE }, size: 10 };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COL_PRIMARY } };
  row.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  row.height = 24;
  for (let c = 1; c <= colCount; c++) {
    row.getCell(c).border = thinBorder();
  }
}

function styleTerritoryRow(ws: ExcelJS.Worksheet, rowIdx: number, colCount: number, text: string): void {
  ws.mergeCells(rowIdx, 1, rowIdx, colCount);
  const cell = ws.getCell(rowIdx, 1);
  cell.value = text;
  cell.font = { bold: true, size: 11, color: { argb: COL_PRIMARY } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COL_TERR_BG } };
  cell.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(rowIdx).height = 22;
}

/** --- Визиты (день) --- */
export async function exportVisitsExcel(params: {
  date: string;
  tableData: Record<string, Employee[]>;
  visits: Visit[];
  fixation: Fixation[];
}): Promise<void> {
  const { date, tableData, visits, fixation } = params;

  const getRepVisits = (repName: string) =>
    visits.filter(v => normalizeDate(getVisitDate(v)) === date && getVisitRepName(v) === repName);
  const getRepReason = (repName: string) => {
    const fix = fixation.find(f => normalizeDate(f.Дата) === date && f.МП === repName);
    return fix ? String(fix.Причина || fix.Причины || '') : '';
  };

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Визиты', {
    views: [{ showGridLines: true }],
    properties: { defaultRowHeight: 18 },
  });

  const headers = ['Территория', 'МП', 'Группа', 'ЛПУ (кол-во)', 'Врачи (кол-во)', 'Есть визиты', 'Причина отсутствия'];
  const nCol = headers.length;
  let r = setTitleRows(ws, 'Belinda Lab — Визиты', `Дата: ${date}`, nCol);
  const headerRow = ws.getRow(r);
  headers.forEach((h, i) => {
    headerRow.getCell(i + 1).value = h;
  });
  styleHeaderRow(headerRow, nCol);
  r++;

  Object.keys(tableData)
    .sort()
    .forEach(terr => {
      styleTerritoryRow(ws, r, nCol, terr);
      r++;
      tableData[terr].forEach(emp => {
        const v = getRepVisits(emp.МП);
        const reason = getRepReason(emp.МП);
        const lpu = new Set(v.map(x => getVisitLPUAbbr(x))).size;
        const doc = new Set(v.map(x => getVisitDoctor(x))).size;
        const row = ws.getRow(r);
        const vals = [
          terr,
          emp.МП,
          emp.Группа,
          v.length ? lpu : 0,
          v.length ? doc : 0,
          v.length > 0 ? 'Да' : 'Нет',
          reason || (v.length ? '' : '—'),
        ];
        vals.forEach((val, i) => {
          const cell = row.getCell(i + 1);
          cell.value = val as string | number;
          cell.border = thinBorder();
          cell.alignment = { vertical: 'middle', wrapText: true, horizontal: i >= 3 && i <= 4 ? 'center' : 'left' };
        });
        r++;
      });
    });

  ws.columns.forEach((col, idx) => {
    col.width = idx === 0 ? 18 : idx === 1 ? 28 : idx === 2 ? 14 : [12, 12, 14, 36][idx - 3] ?? 14;
  });

  const ws2 = wb.addWorksheet('Детали визитов');
  const h2 = ['Территория', 'МП', 'Врач', 'Специальность', 'ЛПУ (кратко)', 'ЛПУ полное', 'Комментарий', 'Дата визита'];
  let r2 = setTitleRows(ws2, 'Детализация визитов', `Дата: ${date}`, h2.length);
  const hr2 = ws2.getRow(r2);
  h2.forEach((h, i) => {
    hr2.getCell(i + 1).value = h;
  });
  styleHeaderRow(hr2, h2.length);
  r2++;

  Object.keys(tableData)
    .sort()
    .forEach(terr => {
      tableData[terr].forEach(emp => {
        getRepVisits(emp.МП).forEach(visit => {
          const row = ws2.getRow(r2);
          const vals = [
            terr,
            emp.МП,
            getVisitDoctor(visit),
            getVisitSpec(visit),
            getVisitLPUAbbr(visit),
            getVisitLPUFull(visit),
            getVisitComment(visit) || '—',
            normalizeDate(getVisitDate(visit)),
          ];
          vals.forEach((val, i) => {
            const c = row.getCell(i + 1);
            c.value = val as string;
            c.border = thinBorder();
            c.alignment = { vertical: 'middle', wrapText: true };
          });
          r2++;
        });
      });
    });
  ws2.columns.forEach((col, idx) => {
    col.width = [16, 24, 26, 18, 14, 32, 28, 12][idx] ?? 14;
  });

  await saveWorkbook(wb, `Belinda_Визиты_${date}`);
}

/** --- Календарь --- */
export async function exportCalendarExcel(params: {
  selectedMonth: string;
  groupedData: Record<string, Employee[]>;
  monthDays: Date[];
  visits: Visit[];
  fixation: Fixation[];
}): Promise<void> {
  const { selectedMonth, groupedData, monthDays, visits, fixation } = params;

  const getDayVisits = (repName: string, d: Date) => {
    const ds = toLocalISO(d);
    return visits.filter(v => normalizeDate(getVisitDate(v)) === ds && getVisitRepName(v) === repName);
  };
  const getAbsence = (repName: string, d: Date) => {
    const ds = toLocalISO(d);
    const fix = fixation.find(f => normalizeDate(f.Дата) === ds && f.МП === repName);
    return fix ? String(fix.Причина || fix.Причины || '') : '';
  };

  const wb = new ExcelJS.Workbook();
  const nCol = 1 + monthDays.length;
  const ws = wb.addWorksheet('Календарь', { views: [{ showGridLines: true, state: 'frozen', xSplit: 1, ySplit: 3 }] });

  let r = setTitleRows(ws, 'Belinda Lab — Календарь визитов', `Месяц: ${selectedMonth}`, nCol);
  const headerRow = ws.getRow(r);
  headerRow.getCell(1).value = 'Мед. представитель';
  monthDays.forEach((d, i) => {
    headerRow.getCell(i + 2).value = `${WD[d.getDay()]}\n${d.getDate()}`;
  });
  styleHeaderRow(headerRow, nCol);
  r++;

  Object.keys(groupedData)
    .sort()
    .forEach(terr => {
      styleTerritoryRow(ws, r, nCol, terr);
      r++;
      groupedData[terr].forEach(emp => {
        const row = ws.getRow(r);
        row.getCell(1).value = emp.МП;
        row.getCell(1).font = { bold: true };
        row.getCell(1).border = thinBorder();
        monthDays.forEach((d, i) => {
          const v = getDayVisits(emp.МП, d);
          const abs = getAbsence(emp.МП, d);
          const c = row.getCell(i + 2);
          if (v.length > 0) {
            c.value = v.length;
            c.fill = { type: 'pattern', pattern: 'solid', fgColor: 'FFDCFCE7' };
            c.font = { bold: true, color: { argb: 'FF166534' } };
          } else if (abs) {
            c.value = abs;
            c.fill = { type: 'pattern', pattern: 'solid', fgColor: 'FFFEF3C7' };
          } else {
            c.value = '—';
            c.font = { color: { argb: 'FFCBD5E1' } };
          }
          c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
          c.border = thinBorder();
        });
        r++;
      });
    });

  ws.getColumn(1).width = 28;
  monthDays.forEach((_, i) => {
    ws.getColumn(i + 2).width = 6;
  });

  await saveWorkbook(wb, `Belinda_Календарь_${selectedMonth}`);
}

/** --- Аналитика --- */
export async function exportAnalyticsExcel(params: {
  groupedData: Record<string, Employee[]>;
  stats: Record<string, MpAnalyticsStats>;
  periodLabel: string;
}): Promise<void> {
  const { groupedData, stats, periodLabel } = params;
  const wb = new ExcelJS.Workbook();
  const headers = ['Территория', 'МП', 'Группа', 'Ср/д', 'Всего', '1', '2', '3', '4', '5+', 'Новые'];
  const nCol = headers.length;
  const ws = wb.addWorksheet('Аналитика');
  let r = setTitleRows(ws, 'Belinda Lab — Аналитика визитов', `Период: ${periodLabel}`, nCol);
  const headerRow = ws.getRow(r);
  headers.forEach((h, i) => headerRow.getCell(i + 1).value = h);
  styleHeaderRow(headerRow, nCol);
  r++;

  Object.keys(groupedData)
    .sort()
    .forEach(terr => {
      styleTerritoryRow(ws, r, nCol, terr);
      r++;
      groupedData[terr].forEach(emp => {
        const s = stats[emp.МП];
        const d1 = s?.dist?.['1'] ?? [];
        const d2 = s?.dist?.['2'] ?? [];
        const d3 = s?.dist?.['3'] ?? [];
        const d4 = s?.dist?.['4'] ?? [];
        const d5 = s?.dist?.['5+'] ?? [];
        const row = ws.getRow(r);
        const vals = [
          terr,
          emp.МП,
          emp.Группа,
          s?.avg ?? 0,
          s?.total ?? 0,
          new Set(d1.map(v => getVisitDoctor(v))).size || '—',
          new Set(d2.map(v => getVisitDoctor(v))).size || '—',
          new Set(d3.map(v => getVisitDoctor(v))).size || '—',
          new Set(d4.map(v => getVisitDoctor(v))).size || '—',
          new Set(d5.map(v => getVisitDoctor(v))).size || '—',
          s?.newCount ?? '—',
        ];
        vals.forEach((val, i) => {
          const c = row.getCell(i + 1);
          c.value = val as string | number;
          c.border = thinBorder();
          c.alignment = { vertical: 'middle', horizontal: i >= 3 ? 'center' : 'left' };
        });
        if ((s?.newCount ?? 0) > 0) {
          row.getCell(11).fill = { type: 'pattern', pattern: 'solid', fgColor: 'FFDCFCE7' };
          row.getCell(11).font = { bold: true, color: { argb: 'FF166534' } };
        }
        r++;
      });
    });

  ws.columns.forEach((col, idx) => {
    col.width = [18, 26, 14, 8, 10, 6, 6, 6, 6, 6, 10][idx] ?? 12;
  });

  await saveWorkbook(wb, `Belinda_Аналитика_${periodLabel.replace(/[,\s]+/g, '_')}`);
}

export interface PlanFactContractRow {
  newDoctors: number;
  connections: number;
  pct: number;
  details: Array<{
    doctor: string;
    spec: string;
    lpu: string;
    status: 'connected' | 'waiting';
    orders: Order[];
    visitDates: string[];
  }>;
}

/** --- План/Факт --- */
export async function exportPlanFactExcel(params: {
  selectedMonth: string;
  groupedData: Record<string, Employee[]>;
  stats: Record<string, MpPlanFactVisitStats>;
  contractStats: Record<string, PlanFactContractRow>;
  planMonth: number;
  planContracts: number;
}): Promise<void> {
  const { selectedMonth, groupedData, stats, contractStats, planMonth, planContracts } = params;

  const wb = new ExcelJS.Workbook();
  const headers = [
    'Территория',
    'МП',
    'Группа',
    'План визитов',
    'Факт визитов',
    '% визитов',
    'План договоров',
    'Факт договоров',
    '% договоров',
    'Новых врачей',
  ];
  const nCol = headers.length;
  const ws = wb.addWorksheet('План-Факт');
  let r = setTitleRows(ws, 'Belinda Lab — План / Факт', `Месяц: ${selectedMonth}`, nCol);
  const headerRow = ws.getRow(r);
  headers.forEach((h, i) => headerRow.getCell(i + 1).value = h);
  styleHeaderRow(headerRow, nCol);
  r++;

  Object.keys(groupedData)
    .sort()
    .forEach(terr => {
      styleTerritoryRow(ws, r, nCol, terr);
      r++;
      groupedData[terr].forEach(emp => {
        const s = stats[emp.МП] || { fact: 0, pct: 0, all: [] };
        const c = contractStats[emp.МП] || { newDoctors: 0, connections: 0, pct: 0, details: [] };
        const row = ws.getRow(r);
        const vals = [
          terr,
          emp.МП,
          emp.Группа,
          planMonth,
          s.fact,
          `${s.pct}%`,
          planContracts,
          c.connections,
          `${c.pct}%`,
          c.newDoctors,
        ];
        vals.forEach((val, i) => {
          const cell = row.getCell(i + 1);
          cell.value = val as string | number;
          cell.border = thinBorder();
          cell.alignment = { vertical: 'middle', horizontal: i >= 3 ? 'center' : 'left' };
        });
        r++;
      });
    });

  ws.columns.forEach((col, idx) => {
    col.width = [16, 24, 14, 12, 12, 10, 14, 14, 12, 12][idx] ?? 12;
  });

  const ws2 = wb.addWorksheet('Договоры и врачи');
  const h2 = [
    'Территория',
    'МП',
    'Врач',
    'Специальность',
    'ЛПУ',
    'Статус',
    'Даты визитов',
    'Сумма заказов',
  ];
  let r2 = setTitleRows(ws2, 'Новые врачи и подключения', `Месяц: ${selectedMonth}`, h2.length);
  const hr2 = ws2.getRow(r2);
  h2.forEach((h, i) => hr2.getCell(i + 1).value = h);
  styleHeaderRow(hr2, h2.length);
  r2++;

  Object.keys(groupedData)
    .sort()
    .forEach(terr => {
      groupedData[terr].forEach(emp => {
        const cstat = contractStats[emp.МП];
        if (!cstat?.details?.length) return;
        cstat.details.forEach(d => {
          const row = ws2.getRow(r2);
          const sum = d.orders.reduce((s, o) => s + (Number(o['Сумма']) || 0), 0);
          const vals = [
            terr,
            emp.МП,
            d.doctor,
            d.spec,
            d.lpu,
            d.status === 'connected' ? 'Подключён' : 'Ожидание',
            d.visitDates.join(', '),
            sum || '—',
          ];
          vals.forEach((val, i) => {
            const cell = row.getCell(i + 1);
            cell.value = val as string | number;
            cell.border = thinBorder();
            cell.alignment = { vertical: 'middle', wrapText: true };
          });
          if (d.status === 'connected') {
            row.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: 'FFDCFCE7' };
          }
          r2++;
        });
      });
    });
  ws2.columns.forEach((col, idx) => {
    col.width = [14, 22, 26, 18, 30, 14, 22, 14][idx] ?? 14;
  });

  await saveWorkbook(wb, `Belinda_ПланФакт_${selectedMonth}`);
}
