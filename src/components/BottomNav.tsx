import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  LayoutDashboard,
  Users,
  History,
  Calculator,
} from 'lucide-react';
import type { AppNavTab } from '../types/schedule';

export type NavTab = AppNavTab;

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
    const hasRuleConflictAlert = !isViewer && conflictCount > 0;

    return [
      {
        id: 'schedule' as const,
        label: 'Lịch tuần',
        icon: CalendarDays,
        badge: 0,
        badgeTone: 'accent' as const,
      },
      {
        id: 'courts' as const,
        label: 'Sân',
        icon: LayoutDashboard,
        badge: 0,
        badgeTone: 'accent' as const,
      },
      {
        id: 'queue' as const,
        label: 'Hàng chờ',
        icon: Users,
        badge: hasRuleConflictAlert ? conflictCount : waitingCount,
        badgeTone: hasRuleConflictAlert ? ('danger' as const) : ('accent' as const),
      },
      {
        id: 'history' as const,
        label: 'Lịch sử',
        icon: History,
        badge: 0,
        badgeTone: 'accent' as const,
      },
      {
        id: 'settlement' as const,
        label: 'Tính tiền',
        icon: Calculator,
        badge: pendingPaymentsCount,
        badgeTone: 'warning' as const,
      },
    ];
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
  }, [measureActivePill]);

  return (
    <nav
      aria-label="Điều hướng chính"
      className="fixed bottom-0 left-0 right-0 z-40 pointer-events-none px-3 sm:px-4 safe-area-bottom flex justify-center"
    >
      <div
        ref={dockRef}
        className="pointer-events-auto relative w-full max-w-lg ui-dock p-1.5 grid grid-cols-5"
      >
        {pillStyle.ready && (
          <div
            aria-hidden="true"
            className="ui-dock-pill"
            style={{
              width: `${pillStyle.width}px`,
              transform: `translate3d(${pillStyle.left}px, 0, 0)`,
            }}
          />
        )}

        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          const badgeStyle: React.CSSProperties =
            tab.badgeTone === 'danger'
              ? {
                  backgroundColor: 'var(--color-danger-solid)',
                  color: 'var(--text-on-danger)',
                }
              : tab.badgeTone === 'warning'
              ? {
                  backgroundColor: 'var(--color-warning-solid)',
                  color: 'var(--text-on-warning)',
                }
              : {
                  backgroundColor: 'var(--color-accent)',
                  color: 'var(--text-on-accent)',
                };

          return (
            <button
              key={tab.id}
              ref={(el) => {
                itemRefs.current[tab.id] = el;
              }}
              type="button"
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onSelectTab(tab.id)}
              className="relative z-10 flex flex-col items-center justify-center gap-1 min-w-[44px] min-h-[44px] h-[54px] rounded-[20px] select-none transition-colors"
              style={{
                color: isActive ? 'var(--color-accent)' : 'var(--text-muted)',
              }}
            >
              <div className="relative">
                <Icon className="w-5 h-5" />
                {tab.badge > 0 && (
                  <span
                    className="absolute -top-1.5 -right-2.5 px-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-bold tabular-nums leading-none"
                    style={badgeStyle}
                  >
                    {tab.badge}
                  </span>
                )}
              </div>
              <span
                className="text-[11px] leading-none truncate max-w-full px-0.5"
                style={{ fontWeight: isActive ? 700 : 600 }}
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
