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
drop policy if exists "Allow public read and write by room_code" on public.badminton_rooms;
create policy "Allow public read and write by room_code"
  on public.badminton_rooms
  for all
  using (true)
  with check (true);

-- 4. Bật Realtime cho bảng badminton_rooms để đồng bộ tức thì
alter publication supabase_realtime add table public.badminton_rooms;

-- 5. Tạo Storage bucket công khai lưu ảnh biên lai chuyển khoản (tính năng Alobo)
insert into storage.buckets (id, name, public)
values ('payment-receipts', 'payment-receipts', true)
on conflict (id) do update set public = true;

drop policy if exists "Public read receipts" on storage.objects;
create policy "Public read receipts"
  on storage.objects for select
  using (bucket_id = 'payment-receipts');

drop policy if exists "Public upload receipts" on storage.objects;
create policy "Public upload receipts"
  on storage.objects for insert
  with check (bucket_id = 'payment-receipts');

drop policy if exists "Public update receipts" on storage.objects;
create policy "Public update receipts"
  on storage.objects for update
  using (bucket_id = 'payment-receipts');

drop policy if exists "Public delete receipts" on storage.objects;
create policy "Public delete receipts"
  on storage.objects for delete
  using (bucket_id = 'payment-receipts');
```

---

## BƯỚC 2B: CHẠY MIGRATION SQL CHO LỊCH TUẦN CLB (`clubs`, `club_members`, `member_schedules`)
Để bật tính năng **Lịch tuần & Chốt sân CLB** (một link `?club=` duy nhất, lịch bận cố định + theo tuần, bảo mật PIN phía server bằng `pgcrypto`):

1. Mở file migration [supabase/migrations/001_club_schedule_schema.sql](supabase/migrations/001_club_schedule_schema.sql) trong dự án.
2. Trong Supabase Dashboard -> **SQL Editor** -> bấm **"New Query"**, dán toàn bộ nội dung file `001_club_schedule_schema.sql` và bấm **"Run"**.
3. Script sẽ tự động:
   - Bật `pgcrypto` trong schema `extensions`.
   - Tạo 3 bảng `public.clubs`, `public.club_members` (có `auth_user_id` nullable và cột sinh `has_pin`), `public.member_schedules` (unique `(club_code, week_key, member_id)`).
   - Bật RLS, thu hồi quyền `SELECT` cột `host_pin_hash` / `pin_hash` khỏi `anon` & `authenticated`, và bật Realtime cho cả 3 bảng.
   - Tạo đầy đủ các RPC `SECURITY DEFINER` (`SET search_path = public, extensions`) kiểm tra khóa tuần, Host PIN và PIN cá nhân trên server.

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

