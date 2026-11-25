# Badminton Rotation — Design System (`DESIGN.md`)

> **Phong cách:** Apple-inspired Minimalism — ưu tiên khoảng trắng, bề mặt trung tính tĩnh lặng, **một màu nhấn duy nhất**, góc bo mềm lớn, thao tác một tay ngoài sân (nút bấm tối thiểu `44px`, chữ nội dung tối thiểu `14px`).
> **Nguồn token duy nhất:** [src/styles/tokens.css](../../src/styles/tokens.css) + [src/index.css](../../src/index.css) + [src/components/ui/Primitives.tsx](../../src/components/ui/Primitives.tsx).

---

## 1. Nguyên Tắc Thiết Kế (Tham Chiếu Apple HIG & Minimalist UI)

1. **Nội dung làm trung tâm (Deference & Clarity):** Giao diện lùi lại để tên người chơi, trận đang đánh, lượt kế tiếp và số liệu thu tiền nổi bật. Bỏ hoàn toàn viền phát sáng, bóng đổ nhiều lớp, nền lưới gradient trang trí, vân nhiễu (noise grain) và thẻ lồng thẻ (card-in-card).
2. **Một màu nhấn duy nhất (Single Accent Restraint):** Toàn bộ ứng dụng chỉ dùng **một màu nhấn Xanh Sân Cầu (`--color-accent`)** cho nút chính, tab đang chọn, trạng thái hoạt động, thanh tiến độ và vòng focus. Hơn 90% diện tích là các tầng trung tính (Canvas → Surface → Secondary Fill).
3. **Tín hiệu ngữ nghĩa tiết chế:** Đỏ (`--color-danger`) chỉ dùng cho xóa/chặn/lỗi/quá giờ; Vàng hổ phách (`--color-warning`) chỉ dùng cho cảnh báo/chờ duyệt/kèo độ; Xanh lam & Hồng (`--color-male` / `--color-female`) chỉ xuất hiện dưới dạng **chấm tròn 8px** nhận diện giới tính.
4. **Cầm một tay ngoài sân (Mobile-First Ergonomics):**
   - Mọi nút bấm, ô chọn, ô nhập liệu và thanh chuyển tab có chiều cao tối thiểu **`44px`** (`--touch-min: 44px`).
   - Văn bản đọc chính, tên người chơi, nhãn nút và input có cỡ tối thiểu **`14px`** (`--text-sm`). Cỡ `12px` (`--text-xs`) chỉ giới hạn cho nhãn phụ/chip ngắn (`Đội 1`, mã bậc trình trong ô hẹp).
   - Trên laptop/desktop: nội dung căn giữa trong khung tối đa **`1200px`** (`--container-max`), không kéo giãn quá khổ.

---

## 2. Bộ Biến Thiết Kế (`src/styles/tokens.css`)

### 2.1. Màu Sắc (Light & Dark — Đạt chuẩn tương phản WCAG AA ≥ 4.5:1)

| Token | Light Theme (Alabaster) | Dark Theme (Obsidian) | Mục đích |
| :--- | :--- | :--- | :--- |
| `--bg-canvas` | `#F5F5F7` | `#0A0A0C` | Nền tổng thể toàn trang |
| `--bg-surface` | `#FFFFFF` | `#161618` | Nền thẻ chính, modal, bottom sheet |
| `--bg-surface-secondary` | `#F2F2F7` | `#212125` | Ô người chơi, nút phụ, track segmented |
| `--bg-surface-hover` | `#E7E7EE` | `#2A2A2F` | Trạng thái hover của ô/nút phụ |
| `--bg-surface-elevated` | `#FFFFFF` | `#242429` | Nút trượt đang chọn, toast nổi |
| `--bg-input` | `#F2F2F7` | `#1E1E22` | Ô nhập liệu, select, textarea |
| `--border-subtle` | `rgba(0,0,0,0.08)` | `rgba(255,255,255,0.09)` | Viền mảnh 1px và đường kẻ ngăn cách |
| `--border-strong` | `rgba(0,0,0,0.16)` | `rgba(255,255,255,0.18)` | Viền nét đứt ô trống, thanh kéo sheet |
| `--text-primary` | `#1D1D1F` | `#F5F5F7` | Chữ chính, tên người chơi, tiêu đề |
| `--text-secondary` | `#515154` | `#AEAEB2` | Mô tả, thông số phụ |
| `--text-muted` | `#6E6E73` | `#8E8E93` | Placeholder, nhãn ít ưu tiên |
| `--color-accent` | `#1F7A35` | `#32D74B` | **Màu nhấn duy nhất** (CTA chính, trạng thái bật) |
| `--text-on-accent` | `#FFFFFF` | `#051B08` | Chữ trên nút màu nhấn |
| `--color-danger` | `#C81E1E` | `#FF6961` | Cảnh báo chặn, lỗi, nút xóa |
| `--color-warning` | `#A15200` | `#FFB340` | Cảnh báo mềm, chờ duyệt, kèo độ |
| `--color-male` / `--color-female` | `#0071E3` / `#D93860` | `#4DA6FF` / `#FF6482` | Chấm tròn 8px phân biệt Nam / Nữ |
| `--surface-qr` | `#FFFFFF` | `#FFFFFF` | Vùng trắng tĩnh cho mã QR dễ quét |

### 2.2. Font Chữ & Phân Cấp

- **Font chính (`--font-sans`):** `'Plus Jakarta Sans', 'Be Vietnam Pro', -apple-system, BlinkMacSystemFont, sans-serif` — bo tròn nhẹ hiện đại, hỗ trợ hoàn hảo tiếng Việt có dấu.
- **Số liệu căn cột:** `tabular-nums` cho thời gian, điểm trình, số trận và tiền VNĐ; `--font-mono` (`JetBrains Mono`) chỉ dùng cho mã phòng, số tài khoản, JSON/SQL.
- **Thang cỡ chữ:**
  - `--text-xs`: `12px` (chip trình độ, nhãn `Đội 1`/`Đội 2`, nhãn nhỏ dưới icon)
  - `--text-sm`: `14px` (nội dung chuẩn, nút bấm, tên người chơi, input)
  - `--text-base`: `16px` (tiêu đề thẻ, tên sân, đề mục)
  - `--text-lg`: `18px` (tiêu đề phần)
  - `--text-xl`: `22px` (tiêu đề màn hình)
  - `--text-hero`: `32px` (tổng tiền thu)

### 2.3. Bo Góc, Khoảng Cách, Bóng Đổ & Chuyển Động

- **Bo góc:** `--radius-card: 22px`, `--radius-modal: 28px`, `--radius-tile: 14px`, `--radius-control: 12px`, `--radius-pill: 9999px`.
- **Nhịp khoảng cách:** Bội số 4/8px (`4, 8, 12, 16, 20, 24, 32px`).
- **Bóng đổ:** Tối đa 1 lớp rất nhẹ (`--shadow-sm`, `--shadow-md`, `--shadow-modal`), không dùng bóng phát sáng nhiều lớp.
- **Chuyển động:** `--ease-standard: cubic-bezier(0.22, 1, 0.36, 1)` (`140ms` chạm, `220ms` chuyển tab), tôn trọng `prefers-reduced-motion`.

---

## 3. Chuẩn Hóa Component Dùng Chung

### 3.1. Nhãn Trình Độ (`<RankBadge>`) & Giới Tính (`<GenderDot>`, `<GenderToggleButton>`)
- **Trình độ (`<RankBadge>`):** Không dùng bảng màu cầu vồng 12 màu cũ. Mọi bậc từ `Newbie`, `Y` đến `TB++`, `TBK` dùng chung một kiểu viên trung tính với **kích thước cố định** (`width: 58px; height: 24px`) để cột nút và thẻ không bao giờ xô lệch.
- **Stepper trình độ ở Hàng chờ:** Nút giữa cố định **`width: 118px; height: 44px`** chứa `Mã bậc · Điểm`, giúp nút `-` và `+` ở mọi dòng thẳng hàng tuyệt đối.
- **Giới tính:** Dùng chấm tròn cố định `8px × 8px` (`<GenderDot>`) cạnh tên; khi ở dạng nút chọn/đổi giới tính (`<GenderToggleButton>`) cố định **`width: 76px; height: 44px`**.

### 3.2. Thẻ Sân & Ô Người Chơi Cố Định Kích Thước
- Lưới sân dùng `items-stretch` kết hợp cấu trúc vùng cố định chiều cao bên trong mỗi thẻ sân:
  - Vùng **Đang đánh / Sân trống** luôn giữ cùng chiều cao cho cả trận 4 người (Đôi), 2 người (Đơn) và sân trống.
  - Dòng đánh giá cân kèo và dòng cảnh báo luôn cố định 1 dòng (`truncate`), không làm giãn chiều cao thẻ.
  - Vùng **Sắp vào sân (Next Up)** luôn giữ khung 2 hàng cố định chiều cao cho cả Đôi (4 ô) và Đơn (2 ô).
  - **Sân đang tắt** căng đầy bằng đúng chiều cao thẻ sân đang bật trong cùng lưới.
- **Ô người chơi (`h-[62px]` cố định):** Tên người chơi luôn trên 1 dòng với `truncate` (`...`), tuyệt đối không xuống dòng hay đẩy khung rộng/cao ra khi tên rất dài.

### 3.3. Quy Tắc Hiển Thị Chế Độ Người Xem (`VIEWER`)
- Chỉ xử lý ẩn ở tầng UI dựa trên `role === 'VIEWER'` / `isViewer` (không sửa dữ liệu sync, không sửa `useCloudRoom.ts`).
- `VIEWER` chỉ thấy 2 tab **Sân** (đội hình đang đánh + lượt kế tiếp chỉ đọc) và **Hàng chờ** (danh sách chờ chỉ đọc), cùng nút chuyển theme Sáng/Tối, giữ sáng màn hình và nút mở hộp thoại phòng/nhập PIN để nâng quyền Co-Host khi cần.
- Ẩn hoàn toàn với `VIEWER`: tab **Tính tiền**, tab **Luật cặp**, tab **Lịch sử**, nút Hoàn tác/Làm lại, nút Cài đặt Host, toàn bộ nút điều khiển sân/xếp kèo/chỉnh sửa hàng chờ, và tab cấu hình kỹ thuật Supabase.
