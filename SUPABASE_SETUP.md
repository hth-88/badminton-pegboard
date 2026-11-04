# HƯỚNG DẪN THIẾT LẬP SUPABASE CHO PHÒNG ONLINE ĐỒNG BỘ (REALTIME)

Để kích hoạt tính năng **Đồng bộ Thời Gian Thực (Multi-Host / Viewer)** giữa nhiều điện thoại trên sân cầu lông, bạn chỉ cần thực hiện 3 bước đơn giản (hoàn toàn miễn phí trên Supabase Free Tier).

---

## BƯỚC 1: TẠO DỰ ÁN TRÊN SUPABASE (NẾU CHƯA CÓ)
1. Đăng ký/Đăng nhập tại [https://supabase.com](https://supabase.com).
2. Bấm **"New Project"**, nhập tên dự án (ví dụ: `badminton-app`), chọn mật khẩu database và khu vực gần Việt Nam nhất (ví dụ: `Southeast Asia - Singapore`).
3. Đợi khoảng 1-2 phút để Supabase khởi tạo dự án.

---

## BƯỚC 2: CHẠY SCRIPT SQL TẠO BẢNG `badminton_rooms`
1. Vào menu **SQL Editor** ở thanh menu bên trái của Supabase Dashboard.
2. Bấm **"New Query"**, dán toàn bộ đoạn mã SQL dưới đây và bấm **"Run"**:

```sql
-- 1. Tạo bảng lưu trữ phòng cầu lông
create table if not exists public.badminton_rooms (
  room_code text primary key,
  pin_code text not null default '1234',
  session_data jsonb not null,
  settlement_data jsonb,
  updated_at bigint not null,
  updated_by text not null
);

-- 2. Kích hoạt Row Level Security (RLS)
alter table public.badminton_rooms enable row level security;

-- 3. Tạo policy cho phép đọc và ghi tự do theo room_code
create policy "Allow public read and write by room_code"
  on public.badminton_rooms
  for all
  using (true)
  with check (true);

-- 4. Bật Realtime cho bảng badminton_rooms để đồng bộ tức thì
alter publication supabase_realtime add table public.badminton_rooms;
```

---

## BƯỚC 3: LẤY THÔNG TIN KẾT NỐI (URL & ANON KEY)
1. Vào menu **Project Settings** (icon Bánh răng góc dưới bên trái) -> Chọn mục **API**.
2. Sao chép 2 thông tin:
   - **Project URL** (dạng `https://xyz...supabase.co`)
   - **anon public API Key** (chuỗi dài bắt đầu bằng `eyJ...`)

3. **Cấu hình vào ứng dụng**:
   - **Cách 1 (Khuyên dùng khi dev / deploy Vercel)**: Tạo file `.env` ở thư mục gốc của dự án:
     ```env
     VITE_SUPABASE_URL=https://xyz...supabase.co
     VITE_SUPABASE_ANON_KEY=eyJ...
     ```
   - **Cách 2 (Tiện lợi nhất trên điện thoại)**: Mở web -> Bấm nút **"Phòng Online"** trên Header -> Vào tab **"Cấu hình Supabase"** -> Dán trực tiếp URL & Key vào và bấm **"Lưu cấu hình"**. Dữ liệu sẽ được lưu an toàn vào `localStorage` của trình duyệt.

