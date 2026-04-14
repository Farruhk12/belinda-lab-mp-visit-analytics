import React, { useState } from 'react';

interface Props {
  onExport: () => void | Promise<void>;
  disabled?: boolean;
  label?: string;
}

const ExcelExportButton: React.FC<Props> = ({ onExport, disabled, label = 'В Excel' }) => {
  const [busy, setBusy] = useState(false);
  const handle = async () => {
    setBusy(true);
    try {
      await onExport();
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={() => void handle()}
      className="flex items-center justify-center gap-2 h-[42px] px-4 bg-emerald-700 hover:bg-emerald-800 text-white rounded-[14px] font-black text-[10px] uppercase tracking-widest shadow-md shadow-emerald-900/10 disabled:opacity-50 transition-all shrink-0"
      title="Скачать отчёт в Excel (.xlsx)"
    >
      <svg className="w-4 h-4 opacity-95" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 2l5 5h-5V4zM8.5 13H11v6H8.5v-6zm3.5 3.5h2v2.5H12v-2.5zm-3.5-6H14v2.5H8.5V10.5zm6.5 0h2.5V13H15v-2.5z" />
      </svg>
      {busy ? 'Файл…' : label}
    </button>
  );
};

export default ExcelExportButton;
