# Xếp Sân Cầu Lông Thông Minh (Badminton Pegboard)

Ứng dụng điều phối sân cầu lông phong trào theo mô hình **Digital Pegboard** (mobile-first, offline-first, đồng bộ realtime đa thiết bị).

## Tính năng chính
- **Quản lý tối đa 3 sân độc lập:** Theo dõi trận đang đánh, gợi ý lượt kế tiếp (`Next Up`), cân kèo Đôi/Đơn, tôn trọng khóa tay (`MANUAL`), chế độ chung bể hoặc tách sân + giao lưu.
- **Hàng chờ thông minh:** Ưu tiên theo thời gian chờ và số trận đã đánh, hỗ trợ tạm nghỉ (`PAUSED`), luật cặp cố định (`FIXED_PAIR`) / né cặp (`AVOID_PARTNER`, `AVOID_MATCH`).
- **Chốt trận & Lịch sử:** Ghi tỉ số nhanh, kèo độ, nhận xét riêng từng người, theo dõi phong độ trong buổi (`sessionFormOffset`).
- **Tính tiền & VietQR:** Chia tiền sân (theo giờ/trọn gói), tiền cầu, phụ phí, tỷ lệ Nam/Nữ, giảm giá người đánh ít trận (trần bù +30%), sinh mã VietQR chuẩn NAPAS 247, xác nhận chuyển khoản & duyệt biên lai.
- **Phòng Online Realtime:** Đồng bộ nhiều máy qua Supabase Realtime với mã phòng và PIN phân quyền (`Host`/`Co-Host` vs `Viewer`).

## Tech Stack
- React 19 + TypeScript + Vite 8 + Tailwind CSS v4
- Vitest 5 + Oxlint
- Supabase (`@supabase/supabase-js`) + `qrcode`

## Cài đặt & Chạy Local
```bash
npm install
npm run dev
```

Để bật tính năng **Phòng Online (Supabase Realtime)**, xem hướng dẫn thiết lập bảng và biến môi trường tại [SUPABASE_SETUP.md](SUPABASE_SETUP.md).

## Kiểm tra chất lượng (Harness Gate)
```bash
npm run check:harness   # Chạy tsc -b, vitest run và vite build
npm run lint            # Chạy oxlint
```

## Tài liệu dự án
- [CLAUDE.md](CLAUDE.md) — Quy chuẩn bất biến (Harness Rules)
- [docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md) — Kiến trúc, quyết định nghiệp vụ & trạng thái hiện tại
- [docs/ui/DESIGN.md](docs/ui/DESIGN.md) — Hệ thiết kế & CSS tokens
