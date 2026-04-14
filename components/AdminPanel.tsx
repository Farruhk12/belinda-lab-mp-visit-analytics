
import React, { useState, useMemo } from 'react';
import { User, GlobalState } from '../types';

interface AdminPanelProps {
  users: User[];
  data: GlobalState; // Чтобы получить список всех территорий и групп для выпадающих списков
  onCreateUser: (user: Omit<User, 'id'>) => void;
  onUpdateUser: (user: User) => void;
  onDeleteUser: (id: string) => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ users, data, onCreateUser, onUpdateUser, onDeleteUser }) => {
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'user' | 'mp'>('user');
  const [newMpName, setNewMpName] = useState('');
  const [selectedTerritories, setSelectedTerritories] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'create' | 'list'>('create');
  const [editingId, setEditingId] = useState<string | null>(null);

  // Получаем уникальные списки для селектов
  const allTerritories = useMemo(() => Array.from(new Set(data.allEmployees.map(e => e.Область))).sort(), [data.allEmployees]);
  const allGroups = useMemo(() => Array.from(new Set(data.allEmployees.map(e => e.Группа))).sort(), [data.allEmployees]);

  const toggleSelection = (list: string[], item: string, setList: (l: string[]) => void) => {
    if (item === '*') {
      // Если выбрали "Все", сбрасываем остальные или наоборот
      if (list.includes('*')) setList([]);
      else setList(['*']);
      return;
    }
    
    // Если выбрали конкретный, убираем "Все"
    let newList = list.filter(i => i !== '*');
    
    if (newList.includes(item)) {
      newList = newList.filter(i => i !== item);
    } else {
      newList.push(item);
    }
    setList(newList);
  };

  const resetForm = () => {
    setNewUsername('');
    setNewPassword('');
    setNewRole('user');
    setNewMpName('');
    setSelectedTerritories([]);
    setSelectedGroups([]);
    setEditingId(null);
  };

  const startEditing = (user: User) => {
    setEditingId(user.id);
    setNewUsername(user.username);
    setNewPassword(user.password || '');
    setNewRole((user.role === 'mp' ? 'mp' : 'user') as 'user' | 'mp');
    setNewMpName(user.mpName || '');
    setSelectedTerritories(user.permissions.territories);
    setSelectedGroups(user.permissions.groups);
    setActiveTab('create');
  };

  const cancelEditing = () => {
    resetForm();
    if (users.length > 0) setActiveTab('list');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername || !newPassword) return;
    if (newRole === 'mp' && !newMpName.trim()) return;

    const userData = newRole === 'mp'
      ? {
          username: newUsername,
          password: newPassword,
          role: 'mp' as const,
          permissions: { territories: ['*'], groups: ['*'] },
          fullName: newMpName.trim(),
          mpName: newMpName.trim(),
        }
      : {
          username: newUsername,
          password: newPassword,
          role: 'user' as const,
          permissions: {
            territories: selectedTerritories.length > 0 ? selectedTerritories : ['*'],
            groups: selectedGroups.length > 0 ? selectedGroups : ['*'],
          },
          fullName: newUsername,
        };

    if (editingId) {
      onUpdateUser({ ...userData, id: editingId });
    } else {
      onCreateUser(userData);
    }

    resetForm();
    setActiveTab('list');
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      <div className="bg-brand-primary text-white p-8 rounded-[32px] shadow-lg flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black uppercase tracking-tight mb-2">Администрирование доступа</h2>
          <p className="text-white/70 text-sm font-medium">Создание пользователей и настройка прав доступа к данным</p>
        </div>
        <div className="flex bg-black/20 p-1 rounded-xl">
          <button 
            onClick={() => { resetForm(); setActiveTab('create'); }}
            className={`px-6 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'create' ? 'bg-white text-brand-primary shadow-md' : 'text-white/60 hover:text-white'}`}
          >
            {editingId ? 'Редактирование' : 'Создать'}
          </button>
          <button 
            onClick={() => { resetForm(); setActiveTab('list'); }}
            className={`px-6 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'list' ? 'bg-white text-brand-primary shadow-md' : 'text-white/60 hover:text-white'}`}
          >
            Список ({users.filter(u => u.role !== 'admin').length})
          </button>
        </div>
      </div>

      {activeTab === 'create' && (
        <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm animate-fadeIn">
          <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
            <h3 className="text-lg font-black text-brand-primary uppercase tracking-wide">
              {editingId ? 'Редактирование пользователя' : 'Новый пользователь'}
            </h3>
            {editingId && (
              <button onClick={cancelEditing} className="text-xs font-bold text-gray-400 hover:text-brand-accent uppercase tracking-wider">
                Отменить
              </button>
            )}
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Тип пользователя */}
            <div className="space-y-3">
              <h3 className="text-sm font-black text-brand-primary uppercase tracking-widest border-b border-gray-100 pb-2">Тип пользователя</h3>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setNewRole('user')}
                  className={`flex-1 py-3 rounded-xl font-black text-sm border-2 transition-all ${newRole === 'user' ? 'bg-brand-primary text-white border-brand-primary' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}
                >
                  👔 Менеджер
                  <span className="block text-[10px] font-bold opacity-70 mt-0.5">Видит несколько МП</span>
                </button>
                <button
                  type="button"
                  onClick={() => setNewRole('mp')}
                  className={`flex-1 py-3 rounded-xl font-black text-sm border-2 transition-all ${newRole === 'mp' ? 'bg-brand-accent text-white border-brand-accent' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}
                >
                  🧑‍⚕️ Медпредставитель
                  <span className="block text-[10px] font-bold opacity-70 mt-0.5">Личный кабинет МП</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Учетные данные */}
              <div className="space-y-6">
                <h3 className="text-sm font-black text-brand-primary uppercase tracking-widest border-b border-gray-100 pb-2">1. Учетные данные</h3>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Логин</label>
                    <input
                      type="text"
                      value={newUsername}
                      onChange={e => setNewUsername(e.target.value)}
                      className="w-full h-12 px-4 rounded-xl bg-gray-50 border border-gray-200 font-bold focus:outline-none focus:border-brand-accent/50 focus:ring-2 focus:ring-brand-accent/20"
                      placeholder="Например: ismoil"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Пароль</label>
                    <input
                      type="text"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      className="w-full h-12 px-4 rounded-xl bg-gray-50 border border-gray-200 font-bold focus:outline-none focus:border-brand-accent/50 focus:ring-2 focus:ring-brand-accent/20"
                      placeholder="Придумайте пароль"
                      required
                    />
                  </div>
                  {newRole === 'mp' && (
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Имя МП (как в таблице визитов)</label>
                      <input
                        type="text"
                        value={newMpName}
                        onChange={e => setNewMpName(e.target.value)}
                        className="w-full h-12 px-4 rounded-xl bg-amber-50 border border-amber-200 font-bold focus:outline-none focus:border-brand-accent/50 focus:ring-2 focus:ring-brand-accent/20"
                        placeholder="Например: Иванов Иван"
                        required={newRole === 'mp'}
                      />
                      <p className="text-[10px] text-amber-600 font-bold ml-1">Должно точно совпадать с именем в столбце «Мед представитель»</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Права доступа — только для менеджера */}
              <div className="space-y-6">
                <h3 className="text-sm font-black text-brand-primary uppercase tracking-widest border-b border-gray-100 pb-2">2. Настройка доступа</h3>

                {newRole === 'mp' ? (
                  <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100">
                    <p className="text-xs font-black text-amber-700 mb-1">Личный кабинет МП</p>
                    <p className="text-[11px] text-amber-600 font-medium">МП видит только свои визиты по имени из поля «Мед представитель». Территории и группы не применяются.</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Доступные территории</label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => toggleSelection(selectedTerritories, '*', setSelectedTerritories)}
                          className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all ${selectedTerritories.includes('*') ? 'bg-brand-primary text-white border-brand-primary' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}
                        >
                          Все территории
                        </button>
                        {allTerritories.map(t => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => toggleSelection(selectedTerritories, t, setSelectedTerritories)}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all ${selectedTerritories.includes(t) ? 'bg-brand-accent text-white border-brand-accent' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Доступные группы</label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => toggleSelection(selectedGroups, '*', setSelectedGroups)}
                          className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all ${selectedGroups.includes('*') ? 'bg-brand-primary text-white border-brand-primary' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}
                        >
                          Все группы
                        </button>
                        {allGroups.map(g => (
                          <button
                            key={g}
                            type="button"
                            onClick={() => toggleSelection(selectedGroups, g, setSelectedGroups)}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all ${selectedGroups.includes(g) ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}
                          >
                            {g}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="pt-6 border-t border-gray-100 flex justify-end gap-3">
              {editingId && (
                 <button 
                  type="button"
                  onClick={cancelEditing}
                  className="px-6 py-3 bg-gray-100 text-gray-500 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-gray-200 transition-all"
                >
                  Отмена
                </button>
              )}
              <button 
                type="submit"
                className={`px-8 py-3 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg transition-all ${editingId ? 'bg-brand-primary shadow-brand-primary/20 hover:bg-brand-primary/90' : 'bg-brand-accent shadow-brand-accent/20 hover:brightness-110'}`}
              >
                {editingId ? 'Сохранить изменения' : 'Создать пользователя'}
              </button>
            </div>
          </form>
        </div>
      )}

      {activeTab === 'list' && (
        <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden animate-fadeIn">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[10px] uppercase font-black tracking-widest text-gray-400 text-left border-b border-gray-100">
              <tr>
                <th className="px-6 py-4">Пользователь</th>
                <th className="px-6 py-4">Пароль</th>
                <th className="px-6 py-4">Роль / Доступ</th>
                <th className="px-6 py-4 text-right">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users.filter(u => u.role !== 'admin').length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-gray-400 font-bold italic">
                    Пользователей пока нет. Создайте первого сотрудника.
                  </td>
                </tr>
              ) : (
                users.filter(u => u.role !== 'admin').map(user => (
                  <tr key={user.id} className="hover:bg-gray-50/50">
                    <td className="px-6 py-4">
                      <p className="font-black text-brand-primary">{user.username}</p>
                      {user.role === 'mp' && user.mpName && (
                        <p className="text-[10px] text-gray-400 font-bold mt-0.5">МП: {user.mpName}</p>
                      )}
                    </td>
                    <td className="px-6 py-4 font-mono text-gray-500">{user.password}</td>
                    <td className="px-6 py-4">
                      {user.role === 'mp' ? (
                        <span className="px-2 py-1 rounded-lg bg-amber-100 text-amber-700 text-[10px] font-black uppercase tracking-wider">🧑‍⚕️ МП Дашборд</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {user.permissions.territories.includes('*')
                            ? <span className="px-2 py-0.5 rounded bg-green-100 text-green-700 text-[10px] font-bold uppercase">Все тер.</span>
                            : user.permissions.territories.map(t => <span key={t} className="px-2 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px] font-bold">{t}</span>)
                          }
                          {user.permissions.groups.includes('*')
                            ? <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 text-[10px] font-bold uppercase">Все гр.</span>
                            : user.permissions.groups.map(g => <span key={g} className="px-2 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px] font-bold">{g}</span>)
                          }
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          onClick={() => startEditing(user)}
                          className="text-brand-accent hover:text-brand-primary font-bold text-[10px] uppercase tracking-wider hover:underline"
                        >
                          Редактировать
                        </button>
                        <button
                          onClick={() => onDeleteUser(user.id)}
                          className="text-red-400 hover:text-red-600 font-bold text-[10px] uppercase tracking-wider hover:underline"
                        >
                          Удалить
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
