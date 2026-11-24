import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  pendingPaymentsCount?: number;
  isViewer?: boolean;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onSelectTab,
  waitingCount,
  conflictCount,
  pendingPaymentsCount = 0,
  isViewer = false,
}) => {
  const dockRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [pillStyle, setPillStyle] = useState<{ left: number; width: number; ready: boolean }>({
    left: 0,
    width: 0,
    ready: false,
  });

  const tabs = useMemo(() => {
    const allTabs = [
      {
        id: 'courts' as const,
        label: 'Sân',
        icon: LayoutDashboard,
        badge: 0,
        badgeTone: 'lime' as const,
      },
      {
        id: 'queue' as const,
        label: 'Hàng chờ',
        icon: Users,
        badge: waitingCount,
        badgeTone: 'lime' as const,
      },
      {
        id: 'rules' as const,
        label: 'Luật cặp',
        icon: Scale,
        badge: conflictCount,
        badgeTone: 'rose' as const,
      },
      {
        id: 'history' as const,
        label: 'Lịch sử',
        icon: History,
        badge: 0,
        badgeTone: 'lime' as const,
      },
      {
        id: 'settlement' as const,
        label: 'Tính tiền',
        icon: Calculator,
        badge: pendingPaymentsCount,
        badgeTone: 'amber' as const,
      },
    ];

    // Ẩn hoàn toàn tab "Luật cặp" ở chế độ Chỉ xem (VIEWER) vì nội dung nhạy cảm
    return isViewer ? allTabs.filter((t) => t.id !== 'rules') : allTabs;
  }, [waitingCount, conflictCount, pendingPaymentsCount, isViewer]);

  const measureActivePill = useCallback(() => {
    const dock = dockRef.current;
    const activeBtn = itemRefs.current[activeTab];
    if (!dock || !activeBtn) return;
    const dockRect = dock.getBoundingClientRect();
    const btnRect = activeBtn.getBoundingClientRect();
    setPillStyle({
      left: btnRect.left - dockRect.left,
      width: btnRect.width,
      ready: true,
    });
  }, [activeTab]);

  useLayoutEffect(() => {
    measureActivePill();
    const dock = dockRef.current;
    if (!dock) return;

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measureActivePill) : null;
    ro?.observe(dock);
    window.addEventListener('resize', measureActivePill);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measureActivePill);
    };
  }, [measureActivePill, isViewer]);

  return (
    <nav
      aria-label="Điều hướng chính"
      className="fixed bottom-0 left-0 right-0 z-40 pointer-events-none px-3 safe-area-bottom flex justify-center"
    >
      <div
        ref={dockRef}
        className={`pointer-events-auto relative w-full max-w-md grid p-1.5 rounded-[24px] vo-dock ${
          isViewer ? 'grid-cols-4' : 'grid-cols-5'
        }`}
      >
        {/* Lucian Spring Sliding Glass Pill */}
        {pillStyle.ready && (
          <div
            aria-hidden="true"
            className="vo-dock-pill"
            style={{
              width: `${pillStyle.width}px`,
              transform: `translate3d(${pillStyle.left}px, 0, 0)`,
            }}
          />
        )}

        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              ref={(el) => {
                itemRefs.current[tab.id] = el;
              }}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              className="relative z-10 flex flex-col items-center justify-center gap-0.5 h-[52px] rounded-[18px] select-none transition-transform active:scale-95"
              style={{
                color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
            >
              <div className="relative">
                <Icon
                  className={`w-[19px] h-[19px] transition-transform duration-200 ${
                    isActive ? '-translate-y-0.5' : ''
                  }`}
                  style={isActive ? { color: 'var(--accent-lime)' } : undefined}
                />
                {tab.badge > 0 && (
                  <span
                    className={`absolute -top-1.5 -right-2.5 px-1 min-w-[17px] h-[17px] flex items-center justify-center rounded-full text-[10px] font-extrabold font-mono-tabular ${
                      tab.badgeTone === 'rose'
                        ? 'bg-rose-500 text-white animate-pulse'
                        : tab.badgeTone === 'amber'
                        ? 'bg-amber-400 text-slate-950'
                        : 'vo-cta-lime'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </div>
              <span
                className={`text-[10.5px] leading-none tracking-[-0.01em] ${
                  isActive ? 'font-bold' : 'font-semibold'
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
