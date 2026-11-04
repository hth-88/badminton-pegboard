import React from 'react';
import {
  LayoutDashboard,
  Users,
  Scale,
  History,
  Calculator,
} from 'lucide-react';

export type NavTab = 'courts' | 'queue' | 'rules' | 'history' | 'settlement';

interface BottomNavProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  waitingCount: number;
  conflictCount: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onSelectTab,
  waitingCount,
  conflictCount,
}) => {
  const tabs = [
    {
      id: 'courts' as const,
      label: 'Sân',
      icon: LayoutDashboard,
      badge: 0,
      badgeColor: '',
    },
    {
      id: 'queue' as const,
      label: 'Hàng chờ',
      icon: Users,
      badge: waitingCount,
      badgeColor: 'bg-emerald-500 text-slate-950 font-bold',
    },
    {
      id: 'rules' as const,
      label: 'Luật cặp',
      icon: Scale,
      badge: conflictCount,
      badgeColor: 'bg-rose-500 text-white font-bold animate-pulse',
    },
    {
      id: 'history' as const,
      label: 'Lịch sử',
      icon: History,
      badge: 0,
      badgeColor: '',
    },
    {
      id: 'settlement' as const,
      label: 'Tính tiền',
      icon: Calculator,
      badge: 0,
      badgeColor: '',
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 dark:bg-slate-950/95 backdrop-blur border-t border-slate-800 safe-area-bottom">
      <div className="max-w-md mx-auto grid grid-cols-5 h-16">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className={`relative flex flex-col items-center justify-center gap-1 transition-all min-h-[48px] select-none ${
                isActive
                  ? 'text-emerald-400 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110' : ''}`} />
                {tab.badge > 0 && (
                  <span
                    className={`absolute -top-1.5 -right-2.5 px-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] ${tab.badgeColor}`}
                  >
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className="text-[11px] leading-none tracking-tight">{tab.label}</span>
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-emerald-400 rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};

