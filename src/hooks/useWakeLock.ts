import { useCallback, useEffect, useState } from 'react';

/**
 * Hook quản lý Screen Wake Lock API
 * Giữ màn hình điện thoại luôn sáng khi sử dụng ngoài sân cầu lông
 */
export function useWakeLock() {
  const [isSupported] = useState(
    () => typeof navigator !== 'undefined' && 'wakeLock' in navigator
  );
  const [isActive, setIsActive] = useState(false);
  const [sentinel, setSentinel] = useState<any>(null);

  const requestWakeLock = useCallback(async () => {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    try {
      const lock = await (navigator as any).wakeLock.request('screen');
      setSentinel(lock);
      setIsActive(true);

      lock.addEventListener('release', () => {
        setIsActive(false);
        setSentinel(null);
      });
    } catch (err) {
      console.warn('Wake Lock không thể kích hoạt:', err);
      setIsActive(false);
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    if (sentinel) {
      try {
        await sentinel.release();
      } catch {
        // Ignored
      }
      setSentinel(null);
      setIsActive(false);
    }
  }, [sentinel]);

  const toggleWakeLock = useCallback(() => {
    if (isActive) {
      releaseWakeLock();
    } else {
      requestWakeLock();
    }
  }, [isActive, releaseWakeLock, requestWakeLock]);

  // Tự động xin lại lock khi quay lại tab nếu đang bật
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isActive && !sentinel) {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isActive, sentinel, requestWakeLock]);

  return {
    isSupported,
    isActive,
    toggleWakeLock,
    requestWakeLock,
    releaseWakeLock,
  };
}
