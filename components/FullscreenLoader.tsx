import React from 'react';

const FullscreenLoader: React.FC = () => (
  <div className="fixed inset-0 z-[9999] bg-brand-bg flex flex-col items-center justify-center">
    <div className="mb-8 animate-fadeIn">
      <img src="https://belinda.tj/img/main-logo.svg" alt="Belinda" className="h-16 opacity-80" />
    </div>
    <div className="flex items-center gap-3 mb-8">
      <div className="loading-dot w-3 h-3 rounded-full bg-brand-accent" style={{ animationDelay: '0s' }} />
      <div className="loading-dot w-3 h-3 rounded-full bg-brand-accent" style={{ animationDelay: '0.15s' }} />
      <div className="loading-dot w-3 h-3 rounded-full bg-brand-accent" style={{ animationDelay: '0.3s' }} />
    </div>
    <div className="w-64 h-1 bg-gray-200 rounded-full overflow-hidden mb-6">
      <div className="loading-bar h-full bg-brand-accent rounded-full" />
    </div>
    <div className="text-center animate-fadeIn">
      <p className="text-brand-primary font-bold text-sm mb-1">Загрузка данных</p>
      <p className="text-gray-400 text-xs">Подготавливаем аналитику за текущий месяц...</p>
    </div>
  </div>
);

export default FullscreenLoader;
