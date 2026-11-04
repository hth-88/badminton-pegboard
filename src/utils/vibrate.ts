/**
 * Tiện ích rung phản hồi (Haptic Feedback) trên thiết bị di động
 */
export function vibrateSuccess(): void {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(50);
    } catch {
      // Bỏ qua nếu thiết bị không hỗ trợ hoặc chặn quyền rung
    }
  }
}

export function vibrateWarning(): void {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate([50, 100, 50]);
    } catch {
      // Bỏ qua nếu thiết bị không hỗ trợ
    }
  }
}

