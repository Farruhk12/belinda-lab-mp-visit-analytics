import React, { useState, useMemo } from 'react';
import { PotentialDoctor } from '../types';

type Mode = 'lpu' | 'territory';

interface Props {
  mpName: string;
  potentialInLPU: PotentialDoctor[];
  potentialTerritory: PotentialDoctor[];
  onClose: () => void;
}

const PotentialModal: React.FC<Props> = ({ mpName, potentialInLPU, potentialTerritory, onClose }) => {
  const [mode, setMode] = useState<Mode>('lpu');
  const [filterLPU, setFilterLPU] = useState('');
  const [filterSpec, setFilterSpec] = useState('');

  const source = mode === 'lpu' ? potentialInLPU : potentialTerritory;

  const lpuOptions = useMemo(
    () => Array.from(new Set(source.map(d => d.lpu))).sort((a, b) => a.localeCompare(b, 'ru')),
    [source]
  );

  const specOptions = useMemo(
    () => Array.from(new Set(source.map(d => d.spec).filter(s => s !== '—'))).sort((a, b) => a.localeCompare(b, 'ru')),
    [source]
  );

  const filtered = useMemo(() => {
    return source.filter(d => {
      if (filterLPU && d.lpu !== filterLPU) return false;
      if (filterSpec && d.spec !== filterSpec) return false;
      return true;
    });
  }, [source, filterLPU, filterSpec]);

  const grouped = useMemo(() => {
    const byLPU: Record<string, PotentialDoctor[]> = {};
    for (const d of filtered) {
      if (!byLPU[d.lpu]) byLPU[d.lpu] = [];
      byLPU[d.lpu].push(d);
    }
    return Object.entries(byLPU).sort((a, b) => b[1].length - a[1].length);
  }, [filtered]);

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-brand-primary/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white w-full max-w-5xl rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-slideUp">
        <div className="bg-brand-primary p-6 text-white shrink-0">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-black text-xl tracking-tight mb-1">Потенциал</h3>
              <p className="text-xs text-white/60 font-bold uppercase tracking-widest">
                {mpName} — {filtered.length} врачей{mode === 'lpu' ? ' в своих ЛПУ' : ' по территории'}
              </p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-white">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>

          <div className="flex gap-1 mt-4 bg-white/10 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => { setMode('lpu'); setFilterLPU(''); setFilterSpec(''); }}
              className={`flex-1 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                mode === 'lpu' ? 'bg-white text-brand-primary shadow' : 'text-white/70 hover:text-white'
              }`}
            >
              В своих ЛПУ
            </button>
            <button
              type="button"
              onClick={() => { setMode('territory'); setFilterLPU(''); setFilterSpec(''); }}
              className={`flex-1 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                mode === 'territory' ? 'bg-white text-brand-primary shadow' : 'text-white/70 hover:text-white'
              }`}
            >
              По территории
            </button>
          </div>
        </div>

        <div className="px-6 py-3 bg-white border-b border-gray-100 flex flex-wrap items-center gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">ЛПУ</label>
            <select
              value={filterLPU}
              onChange={e => setFilterLPU(e.target.value)}
              className="h-8 px-3 rounded-lg border border-gray-200 bg-gray-50 text-xs font-bold text-brand-primary min-w-[150px] focus:outline-none focus:border-brand-accent/40"
            >
              <option value="">Все ЛПУ ({lpuOptions.length})</option>
              {lpuOptions.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">Специальность</label>
            <select
              value={filterSpec}
              onChange={e => setFilterSpec(e.target.value)}
              className="h-8 px-3 rounded-lg border border-gray-200 bg-gray-50 text-xs font-bold text-brand-primary min-w-[150px] focus:outline-none focus:border-brand-accent/40"
            >
              <option value="">Все специальности ({specOptions.length})</option>
              {specOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {(filterLPU || filterSpec) && (
            <button
              onClick={() => { setFilterLPU(''); setFilterSpec(''); }}
              className="h-8 px-3 rounded-lg bg-brand-accent/10 text-brand-accent text-[10px] font-black uppercase tracking-wider hover:bg-brand-accent/20 transition-colors"
            >
              Сбросить
            </button>
          )}
          <div className="ml-auto text-[10px] font-black text-gray-400 uppercase tracking-widest">
            {filtered.length} врачей · {grouped.length} ЛПУ
          </div>
        </div>

        <div className="overflow-y-auto custom-scrollbar bg-gray-50/50 flex-1">
          {grouped.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {grouped.map(([lpu, doctors]) => (
                <div key={lpu}>
                  <div className="px-6 py-2 bg-gray-100/60 flex items-center justify-between sticky top-0 z-10">
                    <span className="text-[11px] font-black text-brand-primary uppercase tracking-widest">{lpu}</span>
                    <span className="text-[10px] font-bold text-gray-400">{doctors.length} врачей</span>
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      {doctors.sort((a, b) => a.spec.localeCompare(b.spec, 'ru') || a.doctor.localeCompare(b.doctor, 'ru')).map((d, i) => (
                        <tr key={`${d.doctor}-${d.lpu}-${i}`} className="border-b border-gray-50 hover:bg-white transition-colors">
                          <td className="px-6 py-2 text-xs font-bold text-brand-primary whitespace-nowrap">{d.doctor}</td>
                          <td className="px-4 py-2 text-xs text-gray-400 whitespace-nowrap">{d.spec}</td>
                          <td className="px-4 py-2 text-right">
                            <div className="flex flex-wrap gap-1 justify-end">
                              {d.visitedByReps.map(rep => (
                                <span key={rep} className="text-[9px] font-bold text-brand-accent bg-brand-accent/10 px-1.5 py-0.5 rounded whitespace-nowrap">
                                  {rep}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-20 text-gray-400 font-bold italic">
              {source.length === 0 ? 'Нет потенциальных врачей' : 'Нет данных по выбранным фильтрам'}
            </div>
          )}
        </div>

        <div className="p-6 bg-white border-t border-gray-100 flex justify-between items-center shrink-0">
          <p className="text-[10px] text-gray-400 font-medium max-w-md">
            {mode === 'lpu'
              ? 'Врачи в ЛПУ, куда МП уже ходит, но к этим врачам — нет. Их посещают другие МП.'
              : 'Врачи тех же специальностей по территории, к которым МП ещё не ходит.'}
          </p>
          <button
            onClick={onClose}
            className="px-10 py-3 bg-brand-primary text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-brand-primary/20 hover:brightness-110 active:scale-95 transition-all"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};

export default PotentialModal;
