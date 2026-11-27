import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  canPerformClubAction,
  CLUB_MEMBER_PUBLIC_COLUMNS,
  CLUB_PERMISSION_MATRIX,
  CLUB_PUBLIC_COLUMNS,
  CLUB_RPC_ERROR_CODES,
  DAY_LABELS_VI,
  DEFAULT_CLUB_SETTINGS,
  MEMBER_SCHEDULE_PUBLIC_COLUMNS,
  SCHEDULE_DAYS,
  SCHEDULE_HOURS,
  SESSION_DURATION_OPTIONS,
  type ClubPermissionAction,
} from '../schedule';

describe('Phase 1 — Domain Types & Permission Matrix (src/types/schedule.ts)', () => {
  it('định nghĩa đúng lưới giờ 18 kíp 1 tiếng (6h–24h) × 7 ngày (T2..CN)', () => {
    expect(SCHEDULE_HOURS).toHaveLength(18);
    expect(SCHEDULE_HOURS[0]).toBe(6);
    expect(SCHEDULE_HOURS[SCHEDULE_HOURS.length - 1]).toBe(23);

    expect(SCHEDULE_DAYS).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(Object.values(DAY_LABELS_VI)).toEqual(['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']);
    expect(SESSION_DURATION_OPTIONS).toEqual([1, 1.5, 2, 3]);
    expect(DEFAULT_CLUB_SETTINGS.minPlayersPerShift).toBe(4);
  });

  it('danh sách cột công khai không bao giờ chứa pin_hash hoặc host_pin_hash', () => {
    expect(CLUB_PUBLIC_COLUMNS).not.toContain('host_pin_hash');
    expect(CLUB_PUBLIC_COLUMNS).not.toContain('pin_hash');

    expect(CLUB_MEMBER_PUBLIC_COLUMNS).not.toContain('pin_hash');
    expect(CLUB_MEMBER_PUBLIC_COLUMNS).toContain('has_pin');
    expect(CLUB_MEMBER_PUBLIC_COLUMNS).toContain('auth_user_id');

    expect(MEMBER_SCHEDULE_PUBLIC_COLUMNS).toContain('busy_slots');
    expect(MEMBER_SCHEDULE_PUBLIC_COLUMNS).toContain('week_key');
  });

  it('CLUB_HOST có toàn quyền trên mọi thao tác trong Permission Matrix', () => {
    const actions = Object.keys(CLUB_PERMISSION_MATRIX.CLUB_HOST) as ClubPermissionAction[];
    for (const action of actions) {
      expect(canPerformClubAction('CLUB_HOST', action, { allowSelfRegister: false })).toBe(true);
      expect(canPerformClubAction('CLUB_HOST', action, { allowSelfRegister: true })).toBe(true);
    }
  });

  it('CLUB_MEMBER chỉ được xem lịch, sửa lịch của mình, đặt PIN riêng và tự thêm tên theo allowSelfRegister', () => {
    expect(canPerformClubAction('CLUB_MEMBER', 'VIEW_CLUB_SCHEDULE')).toBe(true);
    expect(canPerformClubAction('CLUB_MEMBER', 'EDIT_OWN_SCHEDULE')).toBe(true);
    expect(canPerformClubAction('CLUB_MEMBER', 'SET_OWN_PIN')).toBe(true);

    expect(canPerformClubAction('CLUB_MEMBER', 'SELF_REGISTER_MEMBER', { allowSelfRegister: true })).toBe(true);
    expect(canPerformClubAction('CLUB_MEMBER', 'SELF_REGISTER_MEMBER', { allowSelfRegister: false })).toBe(false);

    const hostOnlyActions: ClubPermissionAction[] = [
      'EDIT_LOCKED_WEEK_SCHEDULE',
      'EDIT_OTHER_MEMBER_SCHEDULE',
      'EDIT_MEMBER_RANK_OR_PROFILE',
      'DELETE_OR_HIDE_MEMBER',
      'RESET_MEMBER_PIN',
      'LOCK_OR_UNLOCK_WEEK',
      'FINALIZE_BOOKING_AND_ROOMS',
      'UPDATE_CLUB_SETTINGS',
    ];
    for (const action of hostOnlyActions) {
      expect(canPerformClubAction('CLUB_MEMBER', action)).toBe(false);
    }
  });

  it('GUEST chỉ xem được lịch và tự đăng ký khi allowSelfRegister = true', () => {
    expect(canPerformClubAction('GUEST', 'VIEW_CLUB_SCHEDULE')).toBe(true);
    expect(canPerformClubAction('GUEST', 'SELF_REGISTER_MEMBER', { allowSelfRegister: true })).toBe(true);
    expect(canPerformClubAction('GUEST', 'SELF_REGISTER_MEMBER', { allowSelfRegister: false })).toBe(false);
    expect(canPerformClubAction('GUEST', 'EDIT_OWN_SCHEDULE')).toBe(false);
    expect(canPerformClubAction('GUEST', 'SET_OWN_PIN')).toBe(false);
    expect(canPerformClubAction('GUEST', 'LOCK_OR_UNLOCK_WEEK')).toBe(false);
  });
});

describe('Phase 1 — SQL Migration Security & Schema Contract', () => {
  const migrationPath = resolve(
    process.cwd(),
    'supabase/migrations/001_club_schedule_schema.sql'
  );
  const sql = readFileSync(migrationPath, 'utf8');

  it('khởi tạo pgcrypto trong schema extensions và có đủ 3 bảng cốt lõi', () => {
    expect(sql).toMatch(/create extension if not exists pgcrypto with schema extensions;/i);
    expect(sql).toMatch(/create table if not exists public\.clubs\s*\(/i);
    expect(sql).toMatch(/create table if not exists public\.club_members\s*\(/i);
    expect(sql).toMatch(/create table if not exists public\.member_schedules\s*\(/i);
  });

  it('club_members có auth_user_id uuid null và cột sinh has_pin; member_schedules có unique (club_code, week_key, member_id)', () => {
    expect(sql).toMatch(/auth_user_id\s+uuid\s+null/i);
    expect(sql).toMatch(/has_pin\s+boolean\s+generated always as \(pin_hash is not null\) stored/i);
    expect(sql).toMatch(/unique\s*\(club_code,\s*week_key,\s*member_id\)/i);
  });

  it('thu hồi quyền đọc host_pin_hash & pin_hash khỏi anon/authenticated bằng column-level GRANT', () => {
    expect(sql).toMatch(/revoke all on table public\.clubs from public, anon, authenticated;/i);
    expect(sql).toMatch(/revoke all on table public\.club_members from public, anon, authenticated;/i);

    const clubsGrant = sql.match(/grant select \(([^)]+)\)\s+on table public\.clubs to anon, authenticated;/i);
    expect(clubsGrant).not.toBeNull();
    expect(clubsGrant?.[1]).not.toMatch(/host_pin_hash/i);

    const membersGrant = sql.match(/grant select \(([^)]+)\)\s+on table public\.club_members to anon, authenticated;/i);
    expect(membersGrant).not.toBeNull();
    expect(membersGrant?.[1]).not.toMatch(/\bpin_hash\b/i);
    expect(membersGrant?.[1]).toMatch(/\bhas_pin\b/i);
  });

  it('mọi RPC SECURITY DEFINER đều đặt SET search_path = public, extensions và không dùng crypt() trần', () => {
    const definerBlocks = sql.match(/security definer[\s\S]*?as \$\$/gi) ?? [];
    expect(definerBlocks.length).toBeGreaterThanOrEqual(10);
    for (const block of definerBlocks) {
      expect(block).toMatch(/set search_path = public, extensions/i);
    }

    // Đảm bảo mọi lời gọi crypt( hoặc gen_salt( đều có tiền tố extensions.
    const rawCryptCalls = sql.match(/(?<!extensions\.)\b(crypt|gen_salt)\s*\(/gi) ?? [];
    expect(rawCryptCalls).toEqual([]);
  });

  it('upsert_member_schedule kiểm tra khóa tuần, PIN cá nhân, định dạng busy_slots, trạng thái active và dùng ON CONFLICT ON CONSTRAINT', () => {
    expect(sql).toMatch(/raise exception 'WEEK_LOCKED';/);
    expect(sql).toMatch(/raise exception 'INVALID_MEMBER_PIN';/);
    expect(sql).toMatch(/raise exception 'MEMBER_INACTIVE';/);
    expect(sql).toMatch(/jsonb_array_length\(p_busy_slots\)\s*>\s*126/i);
    expect(sql).toContain("^[0-6]-(6|7|8|9|1[0-9]|2[0-3])$");
    expect(sql).toMatch(/on conflict on constraint uq_member_schedules_club_week_member/i);
  });

  it('publication supabase_realtime loại trừ host_pin_hash, pin_hash và cột sinh has_pin', () => {
    const clubsPub = sql.match(/alter publication supabase_realtime add table public\.clubs \(([^)]+)\)/i);
    expect(clubsPub).not.toBeNull();
    expect(clubsPub?.[1]).not.toMatch(/host_pin_hash/i);

    const membersPub = sql.match(/alter publication supabase_realtime add table public\.club_members \(([^)]+)\)/i);
    expect(membersPub).not.toBeNull();
    expect(membersPub?.[1]).not.toMatch(/\bpin_hash\b/i);
    expect(membersPub?.[1]).not.toMatch(/\bhas_pin\b/i);
  });

  it('mọi mã lỗi raise exception trong SQL khớp 1-1 với CLUB_RPC_ERROR_CODES trong TypeScript', () => {
    const sqlCodes = Array.from(
      new Set(Array.from(sql.matchAll(/raise exception '([A-Z0-9_]+)'/g), (m) => m[1]))
    ).sort();
    const tsCodes = [...CLUB_RPC_ERROR_CODES].sort();
    expect(sqlCodes).toEqual(tsCodes);
  });

  it('danh sách cột GRANT SELECT trong SQL khớp chính xác với hằng *_PUBLIC_COLUMNS trong TypeScript', () => {
    const normalizeCols = (raw: string) =>
      raw
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);

    const clubsGrant = sql.match(/grant select \(([^)]+)\)\s+on table public\.clubs to anon, authenticated;/i);
    const membersGrant = sql.match(/grant select \(([^)]+)\)\s+on table public\.club_members to anon, authenticated;/i);
    const schedulesGrant = sql.match(
      /grant select \(([^)]+)\)\s+on table public\.member_schedules to anon, authenticated;/i
    );

    expect(normalizeCols(clubsGrant?.[1] ?? '')).toEqual(normalizeCols(CLUB_PUBLIC_COLUMNS));
    expect(normalizeCols(membersGrant?.[1] ?? '')).toEqual(normalizeCols(CLUB_MEMBER_PUBLIC_COLUMNS));
    expect(normalizeCols(schedulesGrant?.[1] ?? '')).toEqual(normalizeCols(MEMBER_SCHEDULE_PUBLIC_COLUMNS));
  });
});
