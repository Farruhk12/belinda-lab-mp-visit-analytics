
import React, { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { TabType, GlobalState, ApiResponse, User, Employee, SharedFilters, SharedFilterKey } from './types';
import { getVisitRepName, parseDoctorBaseRows } from './utils';
import VisitsSection from './components/VisitsSection';
import CalendarSection from './components/CalendarSection';
import AnalyticsSection from './components/AnalyticsSection';
import LpuVisitsSection from './components/LpuVisitsSection';
import WeekendPickerModal from './components/WeekendPickerModal';
import LoginPage from './components/LoginPage';
import FullscreenLoader from './components/FullscreenLoader';
import TabButton from './components/TabButton';
import { readOfflinePreference, writeOfflinePreference } from './components/CachePanel';
import CacheSection from './components/CacheSection';
import {
  saveMonthSnapshot,
  loadMonthSnapshot,
  clearAllSnapshots,
  writeFullCacheExportTime,
} from './services/dataCache';
import { discoverFullTableMonthRange, getYearToDateMonthList } from './services/monthDiscovery';
import {
  downloadMonthsToCacheParallel,
  type CacheDownloadProgress,
} from './services/bulkMonthDownload';

const PlanFactSection = lazy(() => import('./components/PlanFactSection'));
const AdminPanel = lazy(() => import('./components/AdminPanel'));
const MPDashboard = lazy(() => import('./components/MPDashboard'));

const API_URL = (import.meta.env.VITE_API_URL ?? '').trim();

function getEnvAdminUser(): User | null {
  const username = (import.meta.env.VITE_ADMIN_USERNAME ?? '').trim();
  const password = (import.meta.env.VITE_ADMIN_PASSWORD ?? '').trim();
  if (!username || !password) return null;
  return {
    id: 'admin',
    username,
    password,
    role: 'admin',
    permissions: { territories: ['*'], groups: ['*'] },
  };
}

const envAdminUser = getEnvAdminUser();

if (import.meta.env.DEV && !API_URL) {
  console.warn('[Belinda] Задайте VITE_API_URL в файле .env (см. .env.example)');
}

const SectionSuspenseFallback: React.FC = () => (
  <div className="flex flex-col items-center justify-center py-20 gap-3 text-brand-accent">
    <div className="flex gap-2">
      <div className="w-2 h-2 rounded-full bg-brand-accent animate-pulse" />
      <div className="w-2 h-2 rounded-full bg-brand-accent animate-pulse" style={{ animationDelay: '0.15s' }} />
      <div className="w-2 h-2 rounded-full bg-brand-accent animate-pulse" style={{ animationDelay: '0.3s' }} />
    </div>
    <p className="text-xs font-black uppercase tracking-widest">Загрузка раздела…</p>
  </div>
);

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [localUsers, setLocalUsers] = useState<User[]>([]);

  const [activeTab, setActiveTab] = useState<TabType>('visits');
  const [excludedDates, setExcludedDates] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('belinda_excluded_dates');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [isWeekendPickerOpen, setIsWeekendPickerOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date().toISOString().slice(0, 7));

  const [offlineMode, setOfflineMode] = useState(() => readOfflinePreference());
  const [cacheMeta, setCacheMeta] = useState<{ month: string; savedAt: string } | null>(null);
  const [cacheBusy, setCacheBusy] = useState(false);
  const [mpSubView, setMpSubView] = useState<'dashboard' | 'cache'>('dashboard');

  const fetchAbortRef = useRef<AbortController | null>(null);
  const offlineRef = useRef(offlineMode);
  offlineRef.current = offlineMode;

  const [sharedFilters, setSharedFilters] = useState<SharedFilters>(() => {
    const saved = localStorage.getItem('belinda_shared_filters');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          terr: parsed.terr || '',
          group: parsed.group || '',
          rep: parsed.rep || '',
          role: parsed.role || 'МП',
          status: parsed.status || ''
        };
      } catch { /* ignore */ }
    }
    return { terr: '', group: '', rep: '', role: 'МП', status: '' };
  });

  useEffect(() => {
    localStorage.setItem('belinda_shared_filters', JSON.stringify(sharedFilters));
  }, [sharedFilters]);

  const updateSharedFilter = useCallback((key: SharedFilterKey, value: string) => {
    setSharedFilters(prev => {
      const next = { ...prev, [key]: value };
      if (key === 'terr') {
        next.group = '';
        next.rep = '';
      }
      if (key === 'group') next.rep = '';
      return next;
    });
  }, []);

  const [state, setState] = useState<GlobalState>({
    visits: [],
    employees: [],
    allEmployees: [],
    fixation: [],
    orders: [],
    oldDoctorKeys: [],
    doctorBase: [],
    loading: true,
    error: null
  });

  const applyApiResponse = useCallback((data: ApiResponse) => {
    setState({
      visits: data.visits || [],
      employees: data.employees || [],
      allEmployees: data.allEmployees || data.employees || [],
      fixation: data.fixation || [],
      orders: data.orders || [],
      oldDoctorKeys: data.oldDoctorKeys || [],
      doctorBase: parseDoctorBaseRows(data.doctorBase ?? []),
      loading: false,
      error: null
    });
    if (data.managers && Array.isArray(data.managers)) {
      setLocalUsers(data.managers);
    }
  }, []);

  const refreshCacheMetaForMonth = useCallback(async (month: string) => {
    try {
      const rec = await loadMonthSnapshot(month);
      if (rec) setCacheMeta({ month: rec.month, savedAt: rec.savedAt });
      else setCacheMeta(null);
    } catch {
      setCacheMeta(null);
    }
  }, []);

  const tryLoadCacheForMonth = useCallback(async (month: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const snap = await loadMonthSnapshot(month);
      if (snap) {
        applyApiResponse(snap.data);
        setCacheMeta({ month: snap.month, savedAt: snap.savedAt });
        return true;
      }
      setState({
        visits: [],
        employees: [],
        allEmployees: [],
        fixation: [],
        orders: [],
        oldDoctorKeys: [],
        doctorBase: [],
        loading: false,
        error: `Нет сохранённых данных в кэше за ${month}. Снимите «Работать из кэша» или нажмите «Скачать в кэш» (нужен интернет).`,
      });
      setCacheMeta(null);
      return false;
    } catch (e) {
      console.error(e);
      setState(prev => ({
        ...prev,
        loading: false,
        error: 'Не удалось прочитать локальный кэш.',
      }));
      return false;
    }
  }, [applyApiResponse]);

  const fetchData = useCallback(async (month: string, options?: { saveToCache?: boolean }) => {
    fetchAbortRef.current?.abort();
    fetchAbortRef.current = new AbortController();
    const { signal } = fetchAbortRef.current;

    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const response = await fetch(`${API_URL}?month=${month}`, { signal });
      const data: ApiResponse = await response.json();
      applyApiResponse(data);
      if (options?.saveToCache) {
        await saveMonthSnapshot(month, data);
        await refreshCacheMetaForMonth(month);
      } else {
        await refreshCacheMetaForMonth(month);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      console.error('Fetch error:', err);
      setState(prev => ({ ...prev, loading: false, error: 'Ошибка загрузки данных. Пожалуйста, проверьте подключение.' }));
    }
  }, [applyApiResponse, refreshCacheMetaForMonth]);

  useEffect(() => {
    const savedSession = localStorage.getItem('belinda_session') || sessionStorage.getItem('belinda_session');
    if (savedSession) {
      try {
        setCurrentUser(JSON.parse(savedSession));
      } catch {
        localStorage.removeItem('belinda_session');
        sessionStorage.removeItem('belinda_session');
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('belinda_excluded_dates', JSON.stringify(excludedDates));
  }, [excludedDates]);

  useEffect(() => () => {
    fetchAbortRef.current?.abort();
  }, []);

  const handleMonthChange = useCallback((month: string) => {
    setCurrentMonth(prev => {
      if (prev === month) return prev;
      if (offlineRef.current) {
        queueMicrotask(() => void tryLoadCacheForMonth(month));
      } else {
        queueMicrotask(() => void fetchData(month));
      }
      return month;
    });
  }, [fetchData, tryLoadCacheForMonth]);

  useEffect(() => {
    if (!currentUser) return;
    const offline = readOfflinePreference();
    setOfflineMode(offline);
    if (offline) {
      void tryLoadCacheForMonth(currentMonth);
    } else {
      void fetchData(currentMonth);
    }
    // Только при входе пользователя
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  const handleOfflineModeChange = useCallback((v: boolean) => {
    writeOfflinePreference(v);
    setOfflineMode(v);
    if (v) {
      void tryLoadCacheForMonth(currentMonth);
    } else {
      void fetchData(currentMonth);
    }
  }, [currentMonth, fetchData, tryLoadCacheForMonth]);

  const handleSaveToCache = useCallback(async () => {
    setCacheBusy(true);
    try {
      await fetchData(currentMonth, { saveToCache: true });
    } finally {
      setCacheBusy(false);
    }
  }, [currentMonth, fetchData]);

  const handleDownloadAllMonthsToCache = useCallback(
    async (opts: {
      mode: 'ytd' | 'table_full';
      onProgress: (p: CacheDownloadProgress) => void;
      signal: AbortSignal;
      onMonthSaved?: () => void;
    }) => {
      const { mode, signal, onProgress, onMonthSaved } = opts;
      let months: string[];

      if (mode === 'ytd') {
        onProgress({ phase: 'discover', completed: 0, total: 1 });
        months = getYearToDateMonthList();
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      } else {
        onProgress({ phase: 'discover', completed: 0, total: 1 });
        months = await discoverFullTableMonthRange(API_URL, signal);
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      }

      await downloadMonthsToCacheParallel({
        apiUrl: API_URL,
        months,
        signal,
        onProgress,
        onMonthSaved,
      });
      writeFullCacheExportTime(new Date().toISOString());
      await refreshCacheMetaForMonth(currentMonth);
    },
    [currentMonth, refreshCacheMetaForMonth]
  );

  const handleClearDeviceCache = useCallback(async () => {
    setCacheBusy(true);
    try {
      await clearAllSnapshots();
      setCacheMeta(null);
      if (readOfflinePreference()) {
        await tryLoadCacheForMonth(currentMonth);
      }
    } finally {
      setCacheBusy(false);
    }
  }, [currentMonth, tryLoadCacheForMonth]);

  const handleRetryLoad = useCallback(() => {
    if (offlineMode) {
      void tryLoadCacheForMonth(currentMonth);
    } else {
      void fetchData(currentMonth);
    }
  }, [offlineMode, currentMonth, fetchData, tryLoadCacheForMonth]);

  const handleLogin = async (u: string, p: string): Promise<boolean> => {
    const login = u.trim();
    const pass = p.trim();

    if (envAdminUser) {
      const sameUser =
        login.toLowerCase() === envAdminUser.username.toLowerCase() && pass === envAdminUser.password;
      if (sameUser) {
        setCurrentUser(envAdminUser);
        localStorage.setItem('belinda_session', JSON.stringify(envAdminUser));
        return true;
      }
    }

    if (!API_URL || API_URL.includes('YOUR_DEPLOYMENT_ID')) {
      if (import.meta.env.DEV) {
        console.warn(
          '[Belinda] В .env укажите реальный VITE_API_URL (не YOUR_DEPLOYMENT_ID), иначе вход только по VITE_ADMIN_* из .env'
        );
      }
    }

    let usersToCheck = localUsers;
    if (localUsers.length === 0 && API_URL && !API_URL.includes('YOUR_DEPLOYMENT_ID')) {
      try {
        const response = await fetch(API_URL);
        const data: ApiResponse = await response.json();
        if (data.managers) {
          usersToCheck = data.managers;
          setLocalUsers(data.managers);
        }
      } catch (e) {
        console.error(e);
      }
    }

    const foundUser = usersToCheck.find(
      user => user.username.toLowerCase() === login.toLowerCase() && user.password === pass
    );
    if (foundUser) {
      setCurrentUser(foundUser);
      localStorage.setItem('belinda_session', JSON.stringify(foundUser));
      return true;
    }

    return false;
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('belinda_session');
    sessionStorage.removeItem('belinda_session');
  };

  const syncUserToSheet = async (action: 'create' | 'update' | 'delete', user?: User, id?: string) => {
    const payload = JSON.stringify({ action, user, id });
    if (import.meta.env.DEV) {
      console.log('Syncing to sheet:', payload);
    }

    try {
      await fetch(API_URL, {
        method: 'POST',
        mode: 'no-cors',
        cache: 'no-cache',
        redirect: 'follow',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: payload
      });
      if (import.meta.env.DEV) {
        console.log('Request sent (opaque response)');
      }
    } catch (e) {
      console.error('Sync error:', e);
      alert('Не удалось отправить данные в таблицу. Проверьте интернет.');
    }
  };

  const handleCreateUser = (newUser: Omit<User, 'id'>) => {
    const userWithId: User = { ...newUser, id: Date.now().toString() };
    setLocalUsers(prev => [...prev, userWithId]);
    syncUserToSheet('create', userWithId);
  };

  const handleUpdateUser = (updatedUser: User) => {
    setLocalUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
    syncUserToSheet('update', updatedUser);
  };

  const handleDeleteUser = (id: string) => {
    setLocalUsers(prev => prev.filter(u => u.id !== id));
    syncUserToSheet('delete', undefined, id);
  };

  const handleSaveWeekends = (dates: string[]) => {
    setExcludedDates(dates);
    setIsWeekendPickerOpen(false);
  };

  const filteredState = useMemo((): GlobalState => {
    if (!currentUser || state.loading || !state.allEmployees.length) return state;

    if (currentUser.role === 'admin') return state;

    if (currentUser.role === 'mp') {
      const mpName = currentUser.mpName || currentUser.fullName || currentUser.username;
      const mpVisits = state.visits.filter(v => getVisitRepName(v) === mpName);
      const mpFixations = state.fixation.filter(f => f.МП === mpName);
      const mpActiveEmployees = state.employees.filter(e => e.МП === mpName);
      const mpAllEmployees = state.allEmployees.filter(e => e.МП === mpName);
      return { ...state, visits: mpVisits, fixation: mpFixations, employees: mpActiveEmployees, allEmployees: mpAllEmployees, orders: state.orders };
    }

    const { territories, groups } = currentUser.permissions;
    const canSeeAllTerritories = territories.includes('*');
    const canSeeAllGroups = groups.includes('*');

    const permFilter = (emp: Employee) => {
      const terrMatch = canSeeAllTerritories || territories.includes(emp.Область);
      const groupMatch = canSeeAllGroups || groups.includes(emp.Группа);
      return terrMatch && groupMatch;
    };

    const allowedAllEmployees = state.allEmployees.filter(permFilter);
    const allowedActiveEmployees = state.employees.filter(permFilter);

    const allowedMpNames = new Set(allowedAllEmployees.map(e => e.МП));

    const allowedVisits = state.visits.filter(v => {
        const mpName = v['Мед представитель'] || v['Медицинский представитель'];
        return allowedMpNames.has(mpName);
    });

    const allowedFixations = state.fixation.filter(f => allowedMpNames.has(f.МП));

    return {
      ...state,
      visits: allowedVisits,
      employees: allowedActiveEmployees,
      allEmployees: allowedAllEmployees,
      fixation: allowedFixations
    };
  }, [state, currentUser]);

  const cacheSectionProps = {
    currentMonth,
    offlineMode,
    onOfflineModeChange: handleOfflineModeChange,
    cacheMeta,
    dataLoading: state.loading,
    cacheBusy,
    onSaveCurrentMonthToCache: handleSaveToCache,
    onDownloadAllMonthsToCache: handleDownloadAllMonthsToCache,
    onClearDeviceCache: handleClearDeviceCache,
  };

  if (!currentUser) {
    return <LoginPage onLogin={handleLogin} />;
  }

  if (state.loading && state.visits.length === 0 && state.employees.length === 0) {
    return <FullscreenLoader />;
  }

  if (currentUser.role === 'mp') {
    return (
      <Suspense fallback={<FullscreenLoader />}>
        <div className="min-h-screen bg-brand-bg text-gray-900">
          <div className="max-w-[1400px] mx-auto px-4 pt-4 md:px-6">
            <div className="flex flex-wrap items-center gap-2 mb-4 bg-white p-1.5 rounded-2xl border border-gray-200 shadow-sm">
              <button
                type="button"
                onClick={() => setMpSubView('dashboard')}
                className={`px-4 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl transition-colors ${
                  mpSubView === 'dashboard'
                    ? 'bg-brand-accent/10 text-brand-accent'
                    : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                Рабочий стол
              </button>
              <button
                type="button"
                onClick={() => setMpSubView('cache')}
                className={`px-4 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl transition-colors ${
                  mpSubView === 'cache'
                    ? 'bg-brand-accent/10 text-brand-accent'
                    : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                Локальный кэш
              </button>
              {offlineMode && (
                <span className="ml-auto text-[10px] font-black uppercase text-amber-700 bg-amber-100 px-2 py-1 rounded-lg">
                  Кэш
                </span>
              )}
            </div>
            {mpSubView === 'cache' ? (
              <CacheSection {...cacheSectionProps} />
            ) : (
              <MPDashboard
                data={filteredState}
                excludedDates={excludedDates}
                currentUser={currentUser}
                onLogout={handleLogout}
                onMonthChange={handleMonthChange}
              />
            )}
          </div>
        </div>
      </Suspense>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg text-gray-900">
      <div className="max-w-[1400px] mx-auto px-4 py-6 md:px-6">
        <header className="flex items-center justify-between mb-6 bg-white p-6 rounded-[32px] border border-gray-200 shadow-sm">
          <div className="flex flex-col">
            <h1 className="text-xl font-black text-brand-primary tracking-tight leading-none mb-1">
              Система анализа визитов МП
            </h1>
            <div className="flex items-center gap-2">
              {state.loading ? (
                <div className="flex items-center gap-1.5 text-brand-accent text-[10px] font-black uppercase tracking-widest animate-pulse">
                  <div className="w-1.5 h-1.5 rounded-full bg-brand-accent" />
                  Обновление данных...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Белинда Лаб • {currentUser.username}</div>
                  {currentUser.role !== 'admin' && (
                     <span className="bg-gray-100 text-gray-500 text-[9px] px-1.5 py-0.5 rounded font-bold uppercase">Ограниченный доступ</span>
                  )}
                  {offlineMode && (
                    <span className="bg-amber-100 text-amber-800 text-[9px] px-1.5 py-0.5 rounded font-black uppercase">Кэш</span>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
             <button type="button" onClick={handleLogout} className="text-gray-400 hover:text-brand-accent transition-colors text-sm font-bold uppercase tracking-wider">
               Выход
             </button>
             <img src="https://belinda.tj/img/main-logo.svg" alt="Belinda" className="h-10" />
          </div>
        </header>

        <nav className="flex items-center gap-1 overflow-x-auto custom-scrollbar mb-6 bg-white p-1.5 rounded-2xl border border-gray-200 shadow-sm">
          <TabButton id="visits" label="Визиты" activeTab={activeTab} onSelect={setActiveTab} />
          <TabButton id="calendar" label="Календарь визитов" activeTab={activeTab} onSelect={setActiveTab} />
          <TabButton id="analytics" label="Аналитика визитов" activeTab={activeTab} onSelect={setActiveTab} />
          <TabButton id="planfact" label="План/Факт" activeTab={activeTab} onSelect={setActiveTab} />
          <TabButton id="lpuVisits" label="Визиты по ЛПУ" activeTab={activeTab} onSelect={setActiveTab} />
          <TabButton id="cache" label="Локальный кэш" activeTab={activeTab} onSelect={setActiveTab} />
          {currentUser.role === 'admin' && (
             <TabButton id="admin" label="Администрирование" activeTab={activeTab} onSelect={setActiveTab} />
          )}
        </nav>

        <main className="min-h-[60vh]">
          {activeTab === 'cache' && <CacheSection {...cacheSectionProps} />}
          {activeTab !== 'cache' && state.error ? (
            <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-xl flex flex-col items-center gap-4">
              <p className="text-center max-w-lg">{state.error}</p>
              <button type="button" onClick={handleRetryLoad} className="bg-brand-accent text-white px-6 py-2 rounded-xl font-bold hover:brightness-90">
                Попробовать снова
              </button>
            </div>
          ) : activeTab !== 'cache' ? (
            <>
              {activeTab === 'visits' && (
                <VisitsSection
                  data={filteredState}
                  excludedDates={excludedDates}
                  sharedFilters={sharedFilters}
                  onSharedFilterChange={updateSharedFilter}
                  onOpenWeekendPicker={() => setIsWeekendPickerOpen(true)}
                  onMonthChange={handleMonthChange}
                />
              )}
              {activeTab === 'calendar' && (
                <CalendarSection
                  data={filteredState}
                  excludedDates={excludedDates}
                  sharedFilters={sharedFilters}
                  onSharedFilterChange={updateSharedFilter}
                  onMonthChange={handleMonthChange}
                  onOpenWeekendPicker={() => setIsWeekendPickerOpen(true)}
                />
              )}
              {activeTab === 'analytics' && (
                <AnalyticsSection
                  data={filteredState}
                  excludedDates={excludedDates}
                  sharedFilters={sharedFilters}
                  onSharedFilterChange={updateSharedFilter}
                  currentMonth={currentMonth}
                  onOpenWeekendPicker={() => setIsWeekendPickerOpen(true)}
                />
              )}
              {activeTab === 'planfact' && (
                <Suspense fallback={<SectionSuspenseFallback />}>
                  <PlanFactSection
                    data={filteredState}
                    excludedDates={excludedDates}
                    sharedFilters={sharedFilters}
                    onSharedFilterChange={updateSharedFilter}
                    onMonthChange={handleMonthChange}
                    onOpenWeekendPicker={() => setIsWeekendPickerOpen(true)}
                  />
                </Suspense>
              )}
              {activeTab === 'lpuVisits' && (
                <LpuVisitsSection
                  data={filteredState}
                  currentMonth={currentMonth}
                  excludedDates={excludedDates}
                />
              )}
              {activeTab === 'admin' && currentUser.role === 'admin' && (
                <Suspense fallback={<SectionSuspenseFallback />}>
                  <AdminPanel
                    users={localUsers}
                    data={state}
                    onCreateUser={handleCreateUser}
                    onUpdateUser={handleUpdateUser}
                    onDeleteUser={handleDeleteUser}
                  />
                </Suspense>
              )}
            </>
          ) : null}
        </main>

        <footer className="mt-12 text-center text-gray-400 text-xs pb-6">
          &copy; {new Date().getFullYear()} Belinda Lab. Все права защищены.
        </footer>
      </div>

      {isWeekendPickerOpen && (
        <WeekendPickerModal
          currentMonth={currentMonth}
          excludedDates={excludedDates}
          onSave={handleSaveWeekends}
          onClose={() => setIsWeekendPickerOpen(false)}
        />
      )}
    </div>
  );
};

export default App;
