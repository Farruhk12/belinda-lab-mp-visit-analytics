/**
 * Локальный кэш полного ответа API за месяц (визиты + oldDoctorKeys и т.д.) в IndexedDB.
 */

import type { ApiResponse } from '../types';

/** Имя базы в IndexedDB (видно в DevTools → Application) */
export const CACHE_DB_NAME = 'belinda-lab-analytics-cache';
const DB_VERSION = 1;
/** Хранилище объектов со снимками месяцев */
export const CACHE_OBJECT_STORE = 'monthly_snapshots';

const DB_NAME = CACHE_DB_NAME;
const STORE = CACHE_OBJECT_STORE;

export interface CachedSnapshotRecord {
  month: string;
  savedAt: string;
  /** Приблизительный размер JSON снимка (байты), для статистики без повторной сериализации */
  approxBytes?: number;
  data: ApiResponse;
}

const FULL_CACHE_TIME_KEY = 'belinda_full_cache_at';

export function readFullCacheExportTime(): string | null {
  try {
    return localStorage.getItem(FULL_CACHE_TIME_KEY);
  } catch {
    return null;
  }
}

export function writeFullCacheExportTime(iso: string): void {
  try {
    localStorage.setItem(FULL_CACHE_TIME_KEY, iso);
  } catch {
    /* ignore */
  }
}

export function clearFullCacheExportTime(): void {
  try {
    localStorage.removeItem(FULL_CACHE_TIME_KEY);
  } catch {
    /* ignore */
  }
}

export interface CachedMonthMeta {
  month: string;
  savedAt: string;
  approxBytes: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'month' });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

export async function saveMonthSnapshot(month: string, data: ApiResponse): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
    const raw = JSON.stringify(data);
    const cloned = JSON.parse(raw) as ApiResponse;
    const rec: CachedSnapshotRecord = {
      month,
      savedAt: new Date().toISOString(),
      approxBytes: new TextEncoder().encode(raw).length,
      data: cloned,
    };
    tx.objectStore(STORE).put(rec);
  });
}

export async function loadMonthSnapshot(month: string): Promise<CachedSnapshotRecord | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(month);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result ?? null);
  });
}

export async function deleteMonthSnapshot(month: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
    tx.objectStore(STORE).delete(month);
  });
}

export async function clearAllSnapshots(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => {
      clearFullCacheExportTime();
      resolve();
    };
    tx.objectStore(STORE).clear();
  });
}

function snapshotApproxBytes(v: CachedSnapshotRecord): number {
  if (typeof v.approxBytes === 'number' && v.approxBytes > 0) return v.approxBytes;
  try {
    return new TextEncoder().encode(JSON.stringify(v.data)).length;
  } catch {
    return 0;
  }
}

/** Список сохранённых месяцев с датой выгрузки и примерным размером */
export async function listCachedSnapshotMeta(): Promise<CachedMonthMeta[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).openCursor();
    const rows: CachedMonthMeta[] = [];
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) {
        rows.sort((a, b) => a.month.localeCompare(b.month));
        resolve(rows);
        return;
      }
      const v = cursor.value as CachedSnapshotRecord;
      rows.push({
        month: v.month,
        savedAt: v.savedAt,
        approxBytes: snapshotApproxBytes(v),
      });
      cursor.continue();
    };
  });
}

export async function getTotalCachedBytes(): Promise<number> {
  const list = await listCachedSnapshotMeta();
  return list.reduce((s, r) => s + r.approxBytes, 0);
}
