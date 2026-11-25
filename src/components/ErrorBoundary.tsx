import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Trash2, Copy, Check } from 'lucide-react';
import { clearSession } from '../engine/storage';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      copied: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Lỗi ứng dụng được bắt bởi ErrorBoundary:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    if (
      window.confirm(
        'Bạn có chắc chắn muốn làm mới toàn bộ phiên chơi không? Dữ liệu lưu trong máy sẽ được khôi phục về mặc định.'
      )
    ) {
      clearSession();
      try {
        localStorage.clear();
      } catch {
        // Bỏ qua
      }
      window.location.reload();
    }
  };

  handleCopyError = () => {
    const errorDetails = `${this.state.error?.name}: ${this.state.error?.message}\n\nStack:\n${this.state.error?.stack || ''}\n\nComponent Stack:\n${this.state.errorInfo?.componentStack || ''}`;
    navigator.clipboard
      .writeText(errorDetails)
      .then(() => {
        this.setState({ copied: true });
        setTimeout(() => this.setState({ copied: false }), 2000);
      })
      .catch(() => {});
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="ui-app-shell flex items-center justify-center p-4">
          <div className="ui-card max-w-md w-full p-6 text-center space-y-5">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto"
              style={{
                backgroundColor: 'var(--color-danger-soft)',
                color: 'var(--color-danger)',
              }}
            >
              <AlertTriangle className="w-7 h-7" />
            </div>

            <div className="space-y-2">
              <h1
                className="text-[20px] font-bold tracking-[-0.02em]"
                style={{ color: 'var(--text-primary)' }}
              >
                Đã xảy ra sự cố hiển thị
              </h1>
              <p
                className="text-[14px] leading-relaxed"
                style={{ color: 'var(--text-secondary)' }}
              >
                Ứng dụng gặp lỗi ngoài dự kiến khi xử lý dữ liệu. Vui lòng thử tải lại trang hoặc làm mới phiên chơi.
              </p>
            </div>

            {this.state.error && (
              <div
                className="ui-tile text-left p-3.5 text-[12px] font-mono-tabular break-words max-h-32 overflow-y-auto"
                style={{ color: 'var(--color-danger)' }}
              >
                {this.state.error.message}
              </div>
            )}

            <div className="space-y-2.5 pt-1">
              <button
                type="button"
                onClick={this.handleReload}
                className="ui-btn ui-btn-primary w-full rounded-full"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Tải lại trang</span>
              </button>

              <button
                type="button"
                onClick={this.handleReset}
                className="ui-btn ui-btn-danger-soft w-full"
              >
                <Trash2 className="w-4 h-4" />
                <span>Xóa dữ liệu &amp; Làm mới</span>
              </button>

              <button
                type="button"
                onClick={this.handleCopyError}
                className="ui-btn ui-btn-ghost w-full text-[13px]"
              >
                {this.state.copied ? (
                  <>
                    <Check
                      className="w-4 h-4"
                      style={{ color: 'var(--color-accent)' }}
                    />
                    <span style={{ color: 'var(--color-accent)' }}>
                      Đã sao chép mã lỗi
                    </span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Sao chép chi tiết lỗi</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
