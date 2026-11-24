import { useEffect, useState } from 'react';

export type ThemeMode = 'dark' | 'light' | 'system';

export function useTheme() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('badminton_theme') as ThemeMode;
      if (saved === 'dark' || saved === 'light' || saved === 'system') {
        return saved;
      }
    }
    // Mặc định là 'dark' theo yêu cầu thiết kế sân
    return 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = () => {
      let isDark = true;
      if (theme === 'system') {
        isDark = mediaQuery.matches;
      } else {
        isDark = theme === 'dark';
      }

      if (isDark) {
        root.classList.add('dark');
        root.classList.remove('light');
        root.dataset.theme = 'dark';
      } else {
        root.classList.remove('dark');
        root.classList.add('light');
        root.dataset.theme = 'light';
      }

      const metaTheme = document.querySelector('meta[name="theme-color"]');
      if (metaTheme) {
        metaTheme.setAttribute('content', isDark ? '#080A0F' : '#F2F5F0');
      }
    };

    applyTheme();
    localStorage.setItem('badminton_theme', theme);

    if (theme === 'system') {
      mediaQuery.addEventListener('change', applyTheme);
      return () => mediaQuery.removeEventListener('change', applyTheme);
    }
  }, [theme]);

  return { theme, setTheme };
}
