import React from 'react';
import { TabType } from '../types';

interface Props {
  id: TabType;
  label: string;
  activeTab: TabType;
  onSelect: (id: TabType) => void;
}

const TabButton: React.FC<Props> = ({ id, label, activeTab, onSelect }) => (
  <button
    type="button"
    onClick={() => onSelect(id)}
    className={`px-4 py-3 text-sm font-semibold rounded-xl transition-all duration-200 whitespace-nowrap ${
      activeTab === id
        ? 'bg-brand-accent/10 text-brand-accent shadow-sm'
        : 'text-gray-500 hover:bg-gray-100 hover:text-brand-primary'
    }`}
  >
    {label}
  </button>
);

export default TabButton;
