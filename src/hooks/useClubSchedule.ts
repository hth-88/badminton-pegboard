import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyCloudRosterSnapshot,
  getCachedCloudClubMembers,
  getHostPrivateMetaMap,
  migrateLocalRosterToCloud,
  removeHostMemberPrivateMeta,
  setActiveClubCode,
  upsertHostMemberPrivateMeta,
  mergeCloudMembersWithPrivateMeta,
  type ClubMember as LocalRosterClubMember,
  type MigrateLocalRosterResult,
} from '../engine/clubRosterStorage';
import {
  buildWeeklyScheduleView,
  computeHeatmap,
  copyFixedScheduleToWeek,
  copyFixedSlotsForMember,
  getIsoWeekKeyFromDate,
  getScheduleSubmissionSummary,
  isValidWeekKey,
  rankGoldenSlots,
  suggestTwoShifts,
  type CopyFixedMode,
  type ScheduleSubmissionSummary,
} from '../engine/scheduleEngine';
import {
  createClub,
  deleteClubMemberByHost,
  fetchClubMembers,
  fetchClubScheduleBundle,
  fetchWeekSchedules,
  mapClubMemberRecord,
  normalizeClubCode,
  registerClubMember,
  removeClubActiveRoom,
  setClubWeekLock,
  setMemberPin,
  subscribeToClubSchedule,
  updateClubMemberByHost,
  updateClubSettings,
  upsertClubActiveRoom,
  upsertMemberSchedule,
  verifyClubHostPin,
  verifyMemberPin,
  type ClubSyncResult,
} from '../services/clubScheduleSync';
import type { BadmintonRank, Sex } from '../types/badminton';
import {
  DEFAULT_CLUB_SETTINGS,
  SESSION_DURATION_OPTIONS,
  type Club,
  type ClubActiveRoom,
  type ClubMember,
  type ClubRole,
  type ClubSettings,
  type HeatmapSlot,
  type HostMemberPrivateMeta,
  type MemberScheduleEntry,
  type ScheduleSlotKey,
  type SessionDurationHours,
  type TwoShiftSuggestion,
  type WeekKey,
  type WeeklySchedule,
} from '../types/schedule';

export const STORAGE_KEY_CLUB_SCHEDULE_CONTEXT = 'badminton_club_schedule_ctx_v1';
export const STORAGE_PREFIX_CLUB_META_CACHE = 'badminton_club_meta_';
export const STORAGE_PREFIX_CLUB_WEEK_CACHE = 'badminton_club_week_sched_';
export const SESSION_KEY_CLUB_PINS = 'badminton_club_pins_v1';

export type ClubSyncState = 'IDLE' | 'LOADING' | 'SYNCED' | 'ERROR';

interface StoredClubScheduleContext {
  clubCode: string;
  selectedMemberId: string | null;
  weekKey: WeekKey;
  durationHours: SessionDurationHours;
}

interface SessionPinStore {
  hostPins: Record<string, string>;
  memberPins: Record<string, string>;
}

function readStoredContext(): StoredClubScheduleContext | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CLUB_SCHEDULE_CONTEXT);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredClubScheduleContext>;
    const clubCode = normalizeClubCode(parsed.clubCode);
    if (!clubCode) return null;
    const weekKey =
      typeof parsed.weekKey === 'string' && isValidWeekKey(parsed.weekKey)
        ? parsed.weekKey
        : getIsoWeekKeyFromDate(new Date());
    const durationCandidate = Number(parsed.durationHours);
    const durationHours: SessionDurationHours = (
      SESSION_DURATION_OPTIONS as readonly number[]
    ).includes(durationCandidate)
      ? (durationCandidate as SessionDurationHours)
      : DEFAULT_CLUB_SETTINGS.defaultDurationHours;

    return {
      clubCode,
      selectedMemberId:
        typeof parsed.selectedMemberId === 'string' && parsed.selectedMemberId
          ? parsed.selectedMemberId
          : null,
      weekKey,
      durationHours,
    };
  } catch {
    return null;
  }
}

function writeStoredContext(ctx: StoredClubScheduleContext | null): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (!ctx || !ctx.clubCode) {
      localStorage.removeItem(STORAGE_KEY_CLUB_SCHEDULE_CONTEXT);
    } else {
      localStorage.setItem(STORAGE_KEY_CLUB_SCHEDULE_CONTEXT, JSON.stringify(ctx));
    }
  } catch {
    // Bỏ qua lỗi quota
  }
}

function getCachedClubMeta(clubCode: string): Club | null {
  if (typeof localStorage === 'undefined') return null;
  const clean = normalizeClubCode(clubCode);
  if (!clean) return null;
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX_CLUB_META_CACHE}${clean}`);
    return raw ? (JSON.parse(raw) as Club) : null;
  } catch {
    return null;
  }
}

function saveCachedClubMeta(club: Club): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX_CLUB_META_CACHE}${club.clubCode}`, JSON.stringify(club));
  } catch {
    // Bỏ qua
  }
}

function getCachedWeekEntries(clubCode: string, weekKey: WeekKey): MemberScheduleEntry[] {
  if (typeof localStorage === 'undefined') return [];
  const clean = normalizeClubCode(clubCode);
  if (!clean) return [];
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX_CLUB_WEEK_CACHE}${clean}_${weekKey}`);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? (parsed as MemberScheduleEntry[]) : [];
  } catch {
    return [];
  }
}

function saveCachedWeekEntries(
  clubCode: string,
  weekKey: WeekKey,
  entries: readonly MemberScheduleEntry[]
): void {
  if (typeof localStorage === 'undefined') return;
  const clean = normalizeClubCode(clubCode);
  if (!clean) return;
  try {
    localStorage.setItem(
      `${STORAGE_PREFIX_CLUB_WEEK_CACHE}${clean}_${weekKey}`,
      JSON.stringify(entries)
    );
  } catch {
    // Bỏ qua
  }
}

function readSessionPins(): SessionPinStore {
  if (typeof sessionStorage === 'undefined') {
    return { hostPins: {}, memberPins: {} };
  }
  try {
    const raw = sessionStorage.getItem(SESSION_KEY_CLUB_PINS);
    if (!raw) return { hostPins: {}, memberPins: {} };
    const parsed = JSON.parse(raw) as Partial<SessionPinStore>;
    return {
      hostPins: parsed.hostPins && typeof parsed.hostPins === 'object' ? parsed.hostPins : {},
      memberPins:
        parsed.memberPins && typeof parsed.memberPins === 'object' ? parsed.memberPins : {},
    };
  } catch {
    return { hostPins: {}, memberPins: {} };
  }
}

function writeSessionPins(store: SessionPinStore): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(SESSION_KEY_CLUB_PINS, JSON.stringify(store));
  } catch {
    // Bỏ qua
  }
}

function toEntryMap(entries: readonly MemberScheduleEntry[]): Record<string, MemberScheduleEntry> {
  const map: Record<string, MemberScheduleEntry> = {};
  for (const e of entries) {
    map[e.memberId] = e;
  }
  return map;
}

function isNotOlderIso(
  incomingIso: string | undefined,
  existingIso: string | undefined
): boolean {
  if (!incomingIso || !existingIso) return true;
  const inMs = Date.parse(incomingIso);
  const exMs = Date.parse(existingIso);
  if (!Number.isFinite(inMs) || !Number.isFinite(exMs)) return true;
  return inMs >= exMs;
}

export interface UseClubScheduleOptions {
  initialClubCode?: string | null;
  initialWeekKey?: WeekKey;
  nowDate?: Date;
}

export function useClubSchedule(options: UseClubScheduleOptions = {}) {
  const [initialBoot] = useState(() => {
    const saved = readStoredContext();
    const urlClub =
      typeof window !== 'undefined'
        ? normalizeClubCode(new URLSearchParams(window.location.search).get('club'))
        : '';
    const resolvedCode =
      normalizeClubCode(options.initialClubCode) || urlClub || saved?.clubCode || null;
    const savedForClub = saved && resolvedCode && saved.clubCode === resolvedCode ? saved : null;
    const explicitInitialWeek =
      typeof options.initialWeekKey === 'string' && isValidWeekKey(options.initialWeekKey.trim())
        ? (options.initialWeekKey.trim() as WeekKey)
        : null;
    const defaultWeek =
      explicitInitialWeek ||
      savedForClub?.weekKey ||
      getIsoWeekKeyFromDate(options.nowDate ?? new Date());
    const cachedClub = resolvedCode ? getCachedClubMeta(resolvedCode) : null;
    const durationHours =
      savedForClub?.durationHours ??
      cachedClub?.settings.defaultDurationHours ??
      DEFAULT_CLUB_SETTINGS.defaultDurationHours;
    const cachedMembers = resolvedCode ? getCachedCloudClubMembers(resolvedCode) : [];
    const cachedWeek = resolvedCode ? getCachedWeekEntries(resolvedCode, defaultWeek) : [];
    const cachedFixed = resolvedCode
      ? defaultWeek === 'FIXED'
        ? cachedWeek
        : getCachedWeekEntries(resolvedCode, 'FIXED')
      : [];
    const pins = readSessionPins();

    return {
      clubCode: resolvedCode,
      weekKey: defaultWeek,
      durationHours,
      hasSavedDuration: Boolean(savedForClub),
      selectedMemberId: savedForClub?.selectedMemberId ?? null,
      club: cachedClub,
      members: cachedMembers,
      weekEntriesByMemberId: toEntryMap(cachedWeek),
      fixedEntriesByMemberId: toEntryMap(cachedFixed),
      privateMetaMap: resolvedCode ? getHostPrivateMetaMap(resolvedCode) : {},
      hostPin: resolvedCode ? (pins.hostPins[resolvedCode] ?? null) : null,
      memberPinsByKey: pins.memberPins,
    };
  });

  const [clubCode, setClubCode] = useState<string | null>(initialBoot.clubCode);
  const [weekKey, setWeekKey] = useState<WeekKey>(initialBoot.weekKey);
  const [durationHours, setDurationHoursState] = useState<SessionDurationHours>(
    initialBoot.durationHours
  );
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(
    initialBoot.selectedMemberId
  );

  const [club, setClub] = useState<Club | null>(initialBoot.club);
  const [members, setMembers] = useState<ClubMember[]>(initialBoot.members);
  const [weekEntriesByMemberId, setWeekEntriesByMemberId] = useState<
    Record<string, MemberScheduleEntry>
  >(initialBoot.weekEntriesByMemberId);
  const [fixedEntriesByMemberId, setFixedEntriesByMemberId] = useState<
    Record<string, MemberScheduleEntry>
  >(initialBoot.fixedEntriesByMemberId);
  const [privateMetaMap, setPrivateMetaMap] = useState<Record<string, HostMemberPrivateMeta>>(
    initialBoot.privateMetaMap
  );

  const [hostPin, setHostPin] = useState<string | null>(initialBoot.hostPin);
  const [memberPinsByKey, setMemberPinsByKey] = useState<Record<string, string>>(
    initialBoot.memberPinsByKey
  );
  const [syncState, setSyncState] = useState<ClubSyncState>(
    initialBoot.clubCode ? 'LOADING' : 'IDLE'
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const clubCodeRef = useRef(clubCode);
  const weekKeyRef = useRef(weekKey);
  const hasExplicitDurationRef = useRef<boolean>(initialBoot.hasSavedDuration);
  const skipInitialFetchForClubRef = useRef<string | null>(null);
  const memberPinRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    clubCodeRef.current = clubCode;
    weekKeyRef.current = weekKey;
  }, [clubCode, weekKey]);

  // Lưu ngữ cảnh CLB xuống localStorage & đồng bộ ?club=CODE trên URL khi CLB đã xác thực tồn tại
  // (hoàn toàn tách biệt với vòng đời ?room= của useCloudRoom)
  useEffect(() => {
    if (!clubCode || !club || club.clubCode !== clubCode) return;
    writeStoredContext({
      clubCode,
      selectedMemberId,
      weekKey,
      durationHours,
    });
    setActiveClubCode(clubCode);

    if (typeof window !== 'undefined' && window.history?.replaceState) {
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.get('club') !== clubCode) {
          url.searchParams.set('club', clubCode);
          const search = url.searchParams.toString();
          const nextUrl = url.pathname + (search ? `?${search}` : '') + url.hash;
          window.history.replaceState({}, '', nextUrl);
        }
      } catch {
        // Bỏ qua lỗi URL trong môi trường test
      }
    }
  }, [clubCode, club, selectedMemberId, weekKey, durationHours]);

  // Tải bundle ban đầu & mỗi khi đổi clubCode
  useEffect(() => {
    if (!clubCode) return;
    if (skipInitialFetchForClubRef.current === clubCode) {
      skipInitialFetchForClubRef.current = null;
      return;
    }
    const abortCtrl = new AbortController();
    const targetWeek = weekKeyRef.current;

    void fetchClubScheduleBundle(clubCode, targetWeek, {
      includeInactiveMembers: true,
      includeFixed: true,
    }).then((res) => {
      if (abortCtrl.signal.aborted || clubCodeRef.current !== clubCode) return;
      if (res.error || !res.data) {
        setSyncState('ERROR');
        setErrorMessage(res.error ?? 'Không thể tải dữ liệu CLB.');
        return;
      }

      const { club: remoteClub, members: remoteMembers, weekEntries, fixedEntries } = res.data;
      saveCachedClubMeta(remoteClub);
      applyCloudRosterSnapshot(clubCode, remoteMembers, { includeInactive: true });
      saveCachedWeekEntries(clubCode, targetWeek, weekEntries);
      saveCachedWeekEntries(clubCode, 'FIXED', fixedEntries);

      setClub(remoteClub);
      setMembers(remoteMembers);
      setSelectedMemberId((prev) =>
        prev && remoteMembers.some((m) => m.id === prev && m.isActive) ? prev : null
      );
      if (!hasExplicitDurationRef.current) {
        setDurationHoursState(remoteClub.settings.defaultDurationHours);
      }
      setPrivateMetaMap(getHostPrivateMetaMap(clubCode));
      if (weekKeyRef.current === targetWeek) {
        setWeekEntriesByMemberId(toEntryMap(weekEntries));
      }
      setFixedEntriesByMemberId(toEntryMap(fixedEntries));
      setSyncState('SYNCED');
      setErrorMessage(null);
    });

    return () => {
      abortCtrl.abort();
    };
  }, [clubCode]);

  // Subscribe Supabase Realtime cho clubs, club_members, member_schedules
  useEffect(() => {
    if (!clubCode) return;

    const schedulePinColumnRefresh = () => {
      if (memberPinRefreshTimerRef.current) {
        clearTimeout(memberPinRefreshTimerRef.current);
      }
      memberPinRefreshTimerRef.current = setTimeout(() => {
        const activeCode = clubCodeRef.current;
        if (!activeCode) return;
        void fetchClubMembers(activeCode, { includeInactive: true }).then((res) => {
          if (clubCodeRef.current !== activeCode || !res.data) return;
          applyCloudRosterSnapshot(activeCode, res.data, { includeInactive: true });
          setMembers(res.data);
        });
      }, 150);
    };

    const unsubscribe = subscribeToClubSchedule(clubCode, {
      onClubChange: (evt) => {
        if (evt.eventType === 'DELETE') {
          return;
        }
        setClub((prev) => {
          if (prev && !isNotOlderIso(evt.club.updatedAt, prev.updatedAt)) {
            return prev;
          }
          saveCachedClubMeta(evt.club);
          return evt.club;
        });
      },
      onMemberChange: (evt) => {
        if (evt.eventType === 'DELETE') {
          removeHostMemberPrivateMeta(clubCode, evt.memberId);
          setPrivateMetaMap(getHostPrivateMetaMap(clubCode));
          setSelectedMemberId((prev) => (prev === evt.memberId ? null : prev));
          setMembers((prev) => {
            const next = prev.filter((m) => m.id !== evt.memberId);
            applyCloudRosterSnapshot(clubCode, next, { includeInactive: true });
            return next;
          });
          setWeekEntriesByMemberId((prev) => {
            if (!prev[evt.memberId]) return prev;
            const next = { ...prev };
            delete next[evt.memberId];
            saveCachedWeekEntries(clubCode, weekKeyRef.current, Object.values(next));
            return next;
          });
          setFixedEntriesByMemberId((prev) => {
            if (!prev[evt.memberId]) return prev;
            const next = { ...prev };
            delete next[evt.memberId];
            saveCachedWeekEntries(clubCode, 'FIXED', Object.values(next));
            return next;
          });
          return;
        }

        setMembers((prev) => {
          const existing = prev.find((m) => m.id === evt.rawRecord.id);
          const mapped = mapClubMemberRecord(evt.rawRecord, existing?.hasPin ?? false);
          if (existing && !isNotOlderIso(mapped.updatedAt, existing.updatedAt)) {
            return prev;
          }
          if (!mapped.isActive) {
            setSelectedMemberId((sel) => (sel === mapped.id ? null : sel));
          }
          const next = existing
            ? prev.map((m) => (m.id === mapped.id ? mapped : m))
            : [...prev, mapped];
          applyCloudRosterSnapshot(clubCode, next, { includeInactive: true });
          return next;
        });

        // Cột sinh `has_pin` không đi qua publication PG 15-17 -> fetch nhẹ để đồng bộ chuẩn `has_pin`
        if (!evt.hasPinIncluded) {
          schedulePinColumnRefresh();
        }
      },
      onScheduleChange: (evt) => {
        if (evt.eventType === 'DELETE') {
          const matchesDelete = (entry: MemberScheduleEntry, targetWeek: WeekKey) => {
            if (evt.scheduleId && entry.id === evt.scheduleId) return true;
            if (!evt.scheduleId && evt.memberId && entry.memberId === evt.memberId) {
              return !evt.weekKey || evt.weekKey === targetWeek;
            }
            return false;
          };

          setWeekEntriesByMemberId((prev) => {
            const currentWeek = weekKeyRef.current;
            let changed = false;
            const next: Record<string, MemberScheduleEntry> = {};
            for (const [mId, entry] of Object.entries(prev)) {
              if (matchesDelete(entry, currentWeek)) {
                changed = true;
              } else {
                next[mId] = entry;
              }
            }
            if (!changed) return prev;
            saveCachedWeekEntries(clubCode, currentWeek, Object.values(next));
            return next;
          });

          setFixedEntriesByMemberId((prev) => {
            let changed = false;
            const next: Record<string, MemberScheduleEntry> = {};
            for (const [mId, entry] of Object.entries(prev)) {
              if (matchesDelete(entry, 'FIXED')) {
                changed = true;
              } else {
                next[mId] = entry;
              }
            }
            if (!changed) return prev;
            saveCachedWeekEntries(clubCode, 'FIXED', Object.values(next));
            return next;
          });
          return;
        }

        const { entry } = evt;
        if (entry.weekKey === weekKeyRef.current) {
          setWeekEntriesByMemberId((prev) => {
            const existing = prev[entry.memberId];
            if (existing && !isNotOlderIso(entry.updatedAt, existing.updatedAt)) {
              return prev;
            }
            const next = { ...prev, [entry.memberId]: entry };
            saveCachedWeekEntries(clubCode, entry.weekKey, Object.values(next));
            return next;
          });
        }
        if (entry.weekKey === 'FIXED') {
          setFixedEntriesByMemberId((prev) => {
            const existing = prev[entry.memberId];
            if (existing && !isNotOlderIso(entry.updatedAt, existing.updatedAt)) {
              return prev;
            }
            const next = { ...prev, [entry.memberId]: entry };
            saveCachedWeekEntries(clubCode, 'FIXED', Object.values(next));
            return next;
          });
        }
      },
    });

    return () => {
      if (memberPinRefreshTimerRef.current) {
        clearTimeout(memberPinRefreshTimerRef.current);
        memberPinRefreshTimerRef.current = null;
      }
      unsubscribe();
    };
  }, [clubCode]);

  // ===========================================================================
  // Các giá trị dẫn xuất thuần túy (Derived Pure Values)
  // ===========================================================================

  const activeMembers = useMemo(
    () => members.filter((m) => m.isActive),
    [members]
  );

  const selectedMember = useMemo(
    () => activeMembers.find((m) => m.id === selectedMemberId) ?? null,
    [activeMembers, selectedMemberId]
  );

  const role: ClubRole = useMemo(() => {
    if (hostPin) return 'CLUB_HOST';
    if (selectedMember) return 'CLUB_MEMBER';
    return 'GUEST';
  }, [hostPin, selectedMember]);

  const rosterWithPrivateMeta: LocalRosterClubMember[] = useMemo(
    () => mergeCloudMembersWithPrivateMeta(members, privateMetaMap),
    [members, privateMetaMap]
  );

  const weeklySchedule: WeeklySchedule | null = useMemo(() => {
    if (!club) return null;
    return buildWeeklyScheduleView({
      club,
      weekKey,
      weekEntries: Object.values(weekEntriesByMemberId),
      fixedEntries: Object.values(fixedEntriesByMemberId),
    });
  }, [club, weekKey, weekEntriesByMemberId, fixedEntriesByMemberId]);

  const submissionSummary: ScheduleSubmissionSummary = useMemo(
    () => getScheduleSubmissionSummary(members, weekEntriesByMemberId),
    [members, weekEntriesByMemberId]
  );

  const heatmapSlots: HeatmapSlot[] = useMemo(
    () =>
      computeHeatmap({
        members,
        entriesByMemberId: weekEntriesByMemberId,
        durationHours,
        minPlayersPerShift:
          club?.settings.minPlayersPerShift ?? DEFAULT_CLUB_SETTINGS.minPlayersPerShift,
      }),
    [members, weekEntriesByMemberId, durationHours, club]
  );

  const goldenSlots: HeatmapSlot[] = useMemo(
    () => rankGoldenSlots(heatmapSlots, { limit: 5, requireMinPlayers: true }),
    [heatmapSlots]
  );

  const twoShiftSuggestions: TwoShiftSuggestion[] = useMemo(
    () =>
      suggestTwoShifts({
        heatmapSlots,
        members,
        entriesByMemberId: weekEntriesByMemberId,
        minPlayersPerShift:
          club?.settings.minPlayersPerShift ?? DEFAULT_CLUB_SETTINGS.minPlayersPerShift,
        limit: 5,
      }),
    [heatmapSlots, members, weekEntriesByMemberId, club]
  );

  // ===========================================================================
  // Các thao tác (Actions)
  // ===========================================================================

  const evictStaleHostPin = useCallback((targetCode: string) => {
    const clean = normalizeClubCode(targetCode);
    if (clean) {
      const store = readSessionPins();
      if (store.hostPins[clean]) {
        delete store.hostPins[clean];
        writeSessionPins(store);
      }
    }
    if (clubCodeRef.current === clean) {
      setHostPin(null);
    }
  }, []);

  const evictStaleMemberPin = useCallback((targetCode: string, memberId: string) => {
    const clean = normalizeClubCode(targetCode);
    if (!clean || !memberId) return;
    const pinKey = `${clean}::${memberId}`;
    const store = readSessionPins();
    if (store.memberPins[pinKey]) {
      delete store.memberPins[pinKey];
      writeSessionPins(store);
    }
    setMemberPinsByKey((prev) => {
      if (!(pinKey in prev)) return prev;
      const next = { ...prev };
      delete next[pinKey];
      return next;
    });
  }, []);

  const connectClub = useCallback(
    async (
      targetCode: string,
      connectOpts: { weekKey?: WeekKey; hostPin?: string } = {}
    ): Promise<ClubSyncResult<Club>> => {
      const cleanCode = normalizeClubCode(targetCode);
      const prevCode = clubCodeRef.current;
      const explicitWeek =
        typeof connectOpts.weekKey === 'string' && isValidWeekKey(connectOpts.weekKey.trim())
          ? (connectOpts.weekKey.trim() as WeekKey)
          : null;
      const targetWeek = explicitWeek ?? weekKeyRef.current;

      setSyncState('LOADING');
      const bundleRes = await fetchClubScheduleBundle(cleanCode, targetWeek, {
        includeInactiveMembers: true,
        includeFixed: true,
      });

      if (bundleRes.error || !bundleRes.data) {
        setSyncState('ERROR');
        setErrorMessage(bundleRes.error ?? 'Không thể kết nối CLB.');
        return {
          data: null,
          error: bundleRes.error,
          errorCode: bundleRes.errorCode,
        };
      }

      let verifiedHostPin: string | null = null;
      if (connectOpts.hostPin?.trim()) {
        const pinRes = await verifyClubHostPin(cleanCode, connectOpts.hostPin.trim());
        const store = readSessionPins();
        if (pinRes.data === true) {
          verifiedHostPin = connectOpts.hostPin.trim();
          store.hostPins[cleanCode] = verifiedHostPin;
          writeSessionPins(store);
        } else if (store.hostPins[cleanCode]) {
          delete store.hostPins[cleanCode];
          writeSessionPins(store);
        }
      } else {
        const store = readSessionPins();
        verifiedHostPin = store.hostPins[cleanCode] ?? null;
      }

      const { club: remoteClub, members: remoteMembers, weekEntries, fixedEntries } =
        bundleRes.data;

      saveCachedClubMeta(remoteClub);
      applyCloudRosterSnapshot(cleanCode, remoteMembers, { includeInactive: true });
      saveCachedWeekEntries(cleanCode, targetWeek, weekEntries);
      saveCachedWeekEntries(cleanCode, 'FIXED', fixedEntries);
      setActiveClubCode(cleanCode);

      const isSwitchingClub = prevCode !== cleanCode;
      if (isSwitchingClub || !hasExplicitDurationRef.current) {
        hasExplicitDurationRef.current = false;
        setDurationHoursState(remoteClub.settings.defaultDurationHours);
      }

      clubCodeRef.current = cleanCode;
      weekKeyRef.current = targetWeek;
      skipInitialFetchForClubRef.current = cleanCode;
      setClubCode(cleanCode);
      setWeekKey(targetWeek);
      setClub(remoteClub);
      setMembers(remoteMembers);
      setSelectedMemberId((prev) =>
        !isSwitchingClub && prev && remoteMembers.some((m) => m.id === prev && m.isActive)
          ? prev
          : null
      );
      setPrivateMetaMap(getHostPrivateMetaMap(cleanCode));
      setWeekEntriesByMemberId(toEntryMap(weekEntries));
      setFixedEntriesByMemberId(toEntryMap(fixedEntries));
      setHostPin(verifiedHostPin);
      setSyncState('SYNCED');
      setErrorMessage(null);

      return { data: remoteClub, error: null, errorCode: null };
    },
    []
  );

  const createNewClub = useCallback(
    async (params: {
      clubCode: string;
      name: string;
      hostPin: string;
      settings?: Partial<ClubSettings>;
      autoMigrateLocalRoster?: boolean;
    }): Promise<ClubSyncResult<{ club: Club; migration?: MigrateLocalRosterResult }>> => {
      const cleanCode = normalizeClubCode(params.clubCode);
      const cleanPin = params.hostPin.trim();
      setSyncState('LOADING');

      const res = await createClub({
        clubCode: cleanCode,
        name: params.name,
        hostPin: cleanPin,
        settings: params.settings,
      });

      if (res.error || !res.data) {
        setSyncState('ERROR');
        setErrorMessage(res.error ?? 'Không thể tạo CLB mới.');
        return { data: null, error: res.error, errorCode: res.errorCode };
      }

      const createdClub = res.data;
      const store = readSessionPins();
      store.hostPins[cleanCode] = cleanPin;
      writeSessionPins(store);

      saveCachedClubMeta(createdClub);
      applyCloudRosterSnapshot(cleanCode, [], { includeInactive: true });
      setActiveClubCode(cleanCode);

      let migrationResult: MigrateLocalRosterResult | undefined;
      let initialMembers: ClubMember[] = [];
      if (params.autoMigrateLocalRoster !== false) {
        migrationResult = await migrateLocalRosterToCloud({
          clubCode: cleanCode,
          hostPin: cleanPin,
          force: true,
        });
        initialMembers = getCachedCloudClubMembers(cleanCode);
      }

      hasExplicitDurationRef.current = false;
      clubCodeRef.current = cleanCode;
      skipInitialFetchForClubRef.current = cleanCode;
      setClubCode(cleanCode);
      setClub(createdClub);
      setMembers(initialMembers);
      setSelectedMemberId(null);
      setPrivateMetaMap(getHostPrivateMetaMap(cleanCode));
      setWeekEntriesByMemberId({});
      setFixedEntriesByMemberId({});
      setHostPin(cleanPin);
      setDurationHoursState(createdClub.settings.defaultDurationHours);
      setSyncState('SYNCED');
      setErrorMessage(null);

      return {
        data: { club: createdClub, migration: migrationResult },
        error: null,
        errorCode: null,
      };
    },
    []
  );

  const disconnectClub = useCallback(() => {
    clubCodeRef.current = null;
    hasExplicitDurationRef.current = false;
    skipInitialFetchForClubRef.current = null;
    setActiveClubCode(null);
    writeStoredContext(null);
    setClubCode(null);
    setClub(null);
    setMembers([]);
    setWeekEntriesByMemberId({});
    setFixedEntriesByMemberId({});
    setPrivateMetaMap({});
    setSelectedMemberId(null);
    setHostPin(null);
    setSyncState('IDLE');
    setErrorMessage(null);

    if (typeof window !== 'undefined' && window.history?.replaceState) {
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.has('club')) {
          url.searchParams.delete('club');
          const search = url.searchParams.toString();
          const cleanUrl = url.pathname + (search ? `?${search}` : '') + url.hash;
          window.history.replaceState({}, '', cleanUrl);
        }
      } catch {
        // Bỏ qua lỗi URL trong môi trường test
      }
    }
  }, []);

  const selectWeek = useCallback(
    async (nextWeekKey: WeekKey): Promise<ClubSyncResult<MemberScheduleEntry[]>> => {
      const cleanWeek = (
        typeof nextWeekKey === 'string' ? nextWeekKey.trim() : ''
      ) as WeekKey;
      if (!isValidWeekKey(cleanWeek)) {
        return { data: null, error: 'Mã tuần không hợp lệ.', errorCode: 'INVALID_WEEK_KEY' };
      }
      weekKeyRef.current = cleanWeek;
      setWeekKey(cleanWeek);
      const activeCode = clubCodeRef.current;
      if (!activeCode) {
        return { data: [], error: null, errorCode: null };
      }

      // Nạp ngay từ cache local trước (Local-first)
      const cached = getCachedWeekEntries(activeCode, cleanWeek);
      setWeekEntriesByMemberId(toEntryMap(cached));

      const res = await fetchWeekSchedules(activeCode, cleanWeek);
      if (!res.error && res.data && clubCodeRef.current === activeCode) {
        saveCachedWeekEntries(activeCode, cleanWeek, res.data);
        if (weekKeyRef.current === cleanWeek) {
          setWeekEntriesByMemberId(toEntryMap(res.data));
        }
        if (cleanWeek === 'FIXED') {
          setFixedEntriesByMemberId(toEntryMap(res.data));
        }
      }
      return res;
    },
    []
  );

  const setDurationHours = useCallback((nextDuration: SessionDurationHours) => {
    if ((SESSION_DURATION_OPTIONS as readonly number[]).includes(nextDuration)) {
      hasExplicitDurationRef.current = true;
      setDurationHoursState(nextDuration);
    }
  }, []);

  const selectCurrentMember = useCallback((memberId: string | null) => {
    setSelectedMemberId(memberId);
  }, []);

  const unlockHostRole = useCallback(
    async (inputHostPin: string): Promise<ClubSyncResult<boolean>> => {
      const activeCode = clubCodeRef.current;
      if (!activeCode) {
        return { data: false, error: 'Chưa kết nối CLB.', errorCode: 'CLUB_NOT_FOUND' };
      }
      const cleanPin = inputHostPin.trim();
      const res = await verifyClubHostPin(activeCode, cleanPin);
      if (res.data === true) {
        const store = readSessionPins();
        store.hostPins[activeCode] = cleanPin;
        writeSessionPins(store);
        setHostPin(cleanPin);
        setErrorMessage(null);
        return { data: true, error: null, errorCode: null };
      }
      return {
        data: false,
        error: res.error ?? 'Mã PIN Host không chính xác.',
        errorCode: res.errorCode ?? 'INVALID_HOST_PIN',
      };
    },
    []
  );

  const lockHostRole = useCallback(() => {
    const activeCode = clubCodeRef.current;
    if (activeCode) {
      evictStaleHostPin(activeCode);
    } else {
      setHostPin(null);
    }
  }, [evictStaleHostPin]);

  const verifyAndCacheMemberPin = useCallback(
    async (memberId: string, pin: string): Promise<ClubSyncResult<boolean>> => {
      const activeCode = clubCodeRef.current;
      if (!activeCode) {
        return { data: false, error: 'Chưa kết nối CLB.', errorCode: 'CLUB_NOT_FOUND' };
      }
      const cleanPin = pin.trim();
      const res = await verifyMemberPin({
        clubCode: activeCode,
        memberId,
        pin: cleanPin,
      });
      if (res.data === true) {
        const pinKey = `${activeCode}::${memberId}`;
        const store = readSessionPins();
        store.memberPins[pinKey] = cleanPin;
        writeSessionPins(store);
        setMemberPinsByKey((prev) => ({ ...prev, [pinKey]: cleanPin }));
        return { data: true, error: null, errorCode: null };
      }
      return {
        data: false,
        error: res.error ?? 'Mã PIN cá nhân không chính xác.',
        errorCode: res.errorCode ?? 'INVALID_MEMBER_PIN',
      };
    },
    []
  );

  const saveScheduleEntry = useCallback(
    async (params: {
      memberId?: string;
      weekKey?: WeekKey;
      busySlots: readonly ScheduleSlotKey[];
      note?: string;
      memberPin?: string | null;
    }): Promise<ClubSyncResult<MemberScheduleEntry>> => {
      const activeCode = clubCodeRef.current;
      const targetMemberId = params.memberId ?? selectedMemberId;
      const rawWeek = params.weekKey ?? weekKeyRef.current;
      const targetWeek = (typeof rawWeek === 'string' ? rawWeek.trim() : '') as WeekKey;

      if (!activeCode || !targetMemberId) {
        return {
          data: null,
          error: 'Vui lòng chọn tên thành viên trước khi lưu lịch.',
          errorCode: 'MEMBER_NOT_FOUND',
        };
      }

      const pinKey = `${activeCode}::${targetMemberId}`;
      const explicitMemberPin = params.memberPin?.trim() ? params.memberPin.trim() : null;
      const resolvedMemberPin = explicitMemberPin ?? memberPinsByKey[pinKey] ?? null;

      let usedHostPin = hostPin;
      let res = await upsertMemberSchedule({
        clubCode: activeCode,
        weekKey: targetWeek,
        memberId: targetMemberId,
        busySlots: params.busySlots,
        note: params.note,
        memberPin: resolvedMemberPin,
        hostPin: usedHostPin,
      });

      // Nếu Host PIN lưu trong sessionStorage đã hết hạn (đổi từ máy khác), tự gỡ và thử lại như thành viên thường
      if (res.errorCode === 'INVALID_HOST_PIN' && usedHostPin) {
        evictStaleHostPin(activeCode);
        usedHostPin = null;
        res = await upsertMemberSchedule({
          clubCode: activeCode,
          weekKey: targetWeek,
          memberId: targetMemberId,
          busySlots: params.busySlots,
          note: params.note,
          memberPin: resolvedMemberPin,
          hostPin: null,
        });
      }

      if (res.errorCode === 'INVALID_MEMBER_PIN' && !explicitMemberPin && memberPinsByKey[pinKey]) {
        evictStaleMemberPin(activeCode, targetMemberId);
      }

      if (!res.error && res.data) {
        const saved = res.data;
        if (!usedHostPin && explicitMemberPin) {
          const store = readSessionPins();
          store.memberPins[pinKey] = explicitMemberPin;
          writeSessionPins(store);
          setMemberPinsByKey((prev) => ({ ...prev, [pinKey]: explicitMemberPin }));
        }
        if (targetWeek === weekKeyRef.current) {
          setWeekEntriesByMemberId((prev) => {
            const next = { ...prev, [saved.memberId]: saved };
            saveCachedWeekEntries(activeCode, targetWeek, Object.values(next));
            return next;
          });
        }
        if (targetWeek === 'FIXED') {
          setFixedEntriesByMemberId((prev) => {
            const next = { ...prev, [saved.memberId]: saved };
            saveCachedWeekEntries(activeCode, 'FIXED', Object.values(next));
            return next;
          });
        }
        setErrorMessage(null);
      } else if (res.error) {
        setErrorMessage(res.error);
      }

      return res;
    },
    [selectedMemberId, memberPinsByKey, hostPin, evictStaleHostPin, evictStaleMemberPin]
  );

  const copyMyFixedToCurrentWeek = useCallback(
    async (
      copyOpts: {
        memberId?: string;
        mode?: CopyFixedMode;
        copyNote?: boolean;
        memberPin?: string | null;
      } = {}
    ): Promise<ClubSyncResult<MemberScheduleEntry>> => {
      const targetMemberId = copyOpts.memberId ?? selectedMemberId;
      const targetWeek = weekKeyRef.current;
      if (!targetMemberId) {
        return {
          data: null,
          error: 'Chưa chọn thành viên để chép lịch cố định.',
          errorCode: 'MEMBER_NOT_FOUND',
        };
      }
      if (targetWeek === 'FIXED') {
        return {
          data: null,
          error: 'Đang ở tab Lịch cố định, vui lòng chọn một tuần cụ thể để áp dụng.',
          errorCode: 'INVALID_WEEK_KEY',
        };
      }

      const fixedEntry = fixedEntriesByMemberId[targetMemberId];
      if (!fixedEntry) {
        return {
          data: null,
          error: 'Thành viên này chưa lưu Lịch bận cố định (FIXED).',
          errorCode: null,
        };
      }

      const existingEntry = weekEntriesByMemberId[targetMemberId];
      const copied = copyFixedSlotsForMember(fixedEntry, {
        mode: copyOpts.mode ?? 'OVERWRITE',
        copyNote: copyOpts.copyNote ?? false,
        existingWeekEntry: existingEntry,
      });

      if (!copied.copied && existingEntry) {
        return {
          data: existingEntry,
          error: null,
          errorCode: null,
        };
      }

      return saveScheduleEntry({
        memberId: targetMemberId,
        weekKey: targetWeek,
        busySlots: copied.busySlots,
        note: copied.note,
        memberPin: copyOpts.memberPin,
      });
    },
    [selectedMemberId, fixedEntriesByMemberId, weekEntriesByMemberId, saveScheduleEntry]
  );

  const copyClubFixedToWeekAsHost = useCallback(
    async (
      opts: {
        targetWeekKey?: WeekKey;
        overwriteExisting?: boolean;
        copyNotes?: boolean;
      } = {}
    ): Promise<{
      appliedCount: number;
      skippedExistingCount: number;
      missingFixedCount: number;
      error: string | null;
    }> => {
      const activeCode = clubCodeRef.current;
      const rawTargetWeek = opts.targetWeekKey ?? weekKeyRef.current;
      const targetWeek = (
        typeof rawTargetWeek === 'string' ? rawTargetWeek.trim() : ''
      ) as WeekKey;

      if (!activeCode || !hostPin) {
        return {
          appliedCount: 0,
          skippedExistingCount: 0,
          missingFixedCount: 0,
          error: 'Chỉ Host mới có quyền chép lịch cố định hàng loạt cho cả CLB.',
        };
      }

      if (targetWeek === 'FIXED' || !isValidWeekKey(targetWeek)) {
        return {
          appliedCount: 0,
          skippedExistingCount: 0,
          missingFixedCount: 0,
          error: 'Mã tuần đích không hợp lệ.',
        };
      }

      let existingTargetEntries: Record<string, MemberScheduleEntry>;
      if (targetWeek === weekKeyRef.current) {
        existingTargetEntries = weekEntriesByMemberId;
      } else {
        const remoteWeekRes = await fetchWeekSchedules(activeCode, targetWeek);
        if (remoteWeekRes.error || !remoteWeekRes.data) {
          return {
            appliedCount: 0,
            skippedExistingCount: 0,
            missingFixedCount: 0,
            error: remoteWeekRes.error ?? 'Không thể tải lịch tuần đích từ Cloud để kiểm tra.',
          };
        }
        saveCachedWeekEntries(activeCode, targetWeek, remoteWeekRes.data);
        existingTargetEntries = toEntryMap(remoteWeekRes.data);
      }

      let plan;
      try {
        plan = copyFixedScheduleToWeek({
          clubCode: activeCode,
          targetWeekKey: targetWeek,
          fixedEntriesByMemberId,
          existingWeekEntriesByMemberId: existingTargetEntries,
          activeMemberIds: activeMembers.map((m) => m.id),
          overwriteExisting: opts.overwriteExisting ?? false,
          copyNotes: opts.copyNotes ?? false,
          nowIso: new Date().toISOString(),
        });
      } catch {
        return {
          appliedCount: 0,
          skippedExistingCount: 0,
          missingFixedCount: 0,
          error: 'Mã tuần đích không hợp lệ.',
        };
      }

      let appliedCount = 0;
      let firstError: string | null = null;
      const savedEntries: MemberScheduleEntry[] = [];

      for (const draft of plan.entriesToUpsert) {
        const res = await upsertMemberSchedule({
          clubCode: activeCode,
          weekKey: plan.targetWeekKey,
          memberId: draft.memberId,
          busySlots: draft.busySlots,
          note: draft.note,
          hostPin,
        });
        if (res.data && !res.error) {
          appliedCount++;
          savedEntries.push(res.data);
        } else {
          if (!firstError) {
            firstError = res.error ?? 'Lỗi khi chép lịch cố định sang tuần mới.';
          }
          if (res.errorCode === 'INVALID_HOST_PIN') {
            evictStaleHostPin(activeCode);
            break;
          }
        }
      }

      if (savedEntries.length > 0) {
        const mergedTarget = { ...existingTargetEntries };
        for (const e of savedEntries) {
          mergedTarget[e.memberId] = e;
        }
        saveCachedWeekEntries(activeCode, plan.targetWeekKey, Object.values(mergedTarget));

        if (plan.targetWeekKey === weekKeyRef.current) {
          setWeekEntriesByMemberId((prev) => {
            const next = { ...prev };
            for (const e of savedEntries) {
              next[e.memberId] = e;
            }
            saveCachedWeekEntries(activeCode, plan.targetWeekKey, Object.values(next));
            return next;
          });
        }
      }

      return {
        appliedCount,
        skippedExistingCount: plan.skippedExistingMemberIds.length,
        missingFixedCount: plan.missingFixedMemberIds.length,
        error: firstError,
      };
    },
    [hostPin, fixedEntriesByMemberId, weekEntriesByMemberId, activeMembers, evictStaleHostPin]
  );

  const registerMember = useCallback(
    async (params: {
      name: string;
      gender: Sex;
      rank?: BadmintonRank;
      noSingles?: boolean;
      memberPin?: string | null;
      notes?: string;
      tags?: string[];
    }): Promise<ClubSyncResult<ClubMember>> => {
      const activeCode = clubCodeRef.current;
      if (!activeCode) {
        return { data: null, error: 'Chưa kết nối CLB.', errorCode: 'CLUB_NOT_FOUND' };
      }

      let usedHostPin = hostPin;
      let res = await registerClubMember({
        clubCode: activeCode,
        name: params.name,
        gender: params.gender,
        rank: params.rank,
        noSingles: params.noSingles,
        memberPin: params.memberPin,
        hostPin: usedHostPin,
      });

      if (res.errorCode === 'INVALID_HOST_PIN' && usedHostPin) {
        evictStaleHostPin(activeCode);
        usedHostPin = null;
        res = await registerClubMember({
          clubCode: activeCode,
          name: params.name,
          gender: params.gender,
          rank: params.rank,
          noSingles: params.noSingles,
          memberPin: params.memberPin,
          hostPin: null,
        });
      }

      if (res.data && !res.error) {
        const created = res.data;
        if (params.memberPin?.trim()) {
          const pinKey = `${activeCode}::${created.id}`;
          const store = readSessionPins();
          store.memberPins[pinKey] = params.memberPin.trim();
          writeSessionPins(store);
          setMemberPinsByKey((prev) => ({ ...prev, [pinKey]: params.memberPin!.trim() }));
        }
        if (usedHostPin && (params.notes !== undefined || params.tags !== undefined)) {
          upsertHostMemberPrivateMeta(activeCode, created.id, {
            notes: params.notes,
            tags: params.tags,
          });
          setPrivateMetaMap(getHostPrivateMetaMap(activeCode));
        }
        setMembers((prev) => {
          const exists = prev.some((m) => m.id === created.id);
          const next = exists
            ? prev.map((m) => (m.id === created.id ? created : m))
            : [...prev, created];
          applyCloudRosterSnapshot(activeCode, next, { includeInactive: true });
          return next;
        });
      }

      return res;
    },
    [hostPin, evictStaleHostPin]
  );

  const updateMemberAsHost = useCallback(
    async (params: {
      memberId: string;
      name?: string | null;
      gender?: Sex | null;
      rank?: BadmintonRank | null;
      rankScore?: number | null;
      noSingles?: boolean | null;
      isActive?: boolean | null;
      notes?: string;
      tags?: string[];
    }): Promise<ClubSyncResult<ClubMember>> => {
      const activeCode = clubCodeRef.current;
      if (!activeCode || !hostPin) {
        return {
          data: null,
          error: 'Chỉ Host mới được chỉnh sửa thông tin thành viên.',
          errorCode: 'INVALID_HOST_PIN',
        };
      }

      const res = await updateClubMemberByHost({
        clubCode: activeCode,
        hostPin,
        memberId: params.memberId,
        name: params.name,
        gender: params.gender,
        rank: params.rank,
        rankScore: params.rankScore,
        noSingles: params.noSingles,
        isActive: params.isActive,
      });

      if (res.errorCode === 'INVALID_HOST_PIN') {
        evictStaleHostPin(activeCode);
      }

      if (res.data && !res.error) {
        const updated = res.data;
        if (!updated.isActive) {
          setSelectedMemberId((prev) => (prev === updated.id ? null : prev));
        }
        if (params.notes !== undefined || params.tags !== undefined) {
          upsertHostMemberPrivateMeta(activeCode, updated.id, {
            notes: params.notes,
            tags: params.tags,
          });
          setPrivateMetaMap(getHostPrivateMetaMap(activeCode));
        }
        setMembers((prev) => {
          const next = prev.map((m) => (m.id === updated.id ? updated : m));
          applyCloudRosterSnapshot(activeCode, next, { includeInactive: true });
          return next;
        });
      }

      return res;
    },
    [hostPin, evictStaleHostPin]
  );

  const deleteMemberAsHost = useCallback(
    async (params: {
      memberId: string;
      hardDelete?: boolean;
    }): Promise<ClubSyncResult<boolean>> => {
      const activeCode = clubCodeRef.current;
      if (!activeCode || !hostPin) {
        return {
          data: null,
          error: 'Chỉ Host mới được ẩn hoặc xóa thành viên.',
          errorCode: 'INVALID_HOST_PIN',
        };
      }

      const res = await deleteClubMemberByHost({
        clubCode: activeCode,
        hostPin,
        memberId: params.memberId,
        hardDelete: params.hardDelete,
      });

      if (res.errorCode === 'INVALID_HOST_PIN') {
        evictStaleHostPin(activeCode);
      }

      if (res.data === true) {
        setSelectedMemberId((prev) => (prev === params.memberId ? null : prev));
        if (params.hardDelete) {
          removeHostMemberPrivateMeta(activeCode, params.memberId);
          setPrivateMetaMap(getHostPrivateMetaMap(activeCode));
          setWeekEntriesByMemberId((prev) => {
            if (!prev[params.memberId]) return prev;
            const next = { ...prev };
            delete next[params.memberId];
            saveCachedWeekEntries(activeCode, weekKeyRef.current, Object.values(next));
            return next;
          });
          setFixedEntriesByMemberId((prev) => {
            if (!prev[params.memberId]) return prev;
            const next = { ...prev };
            delete next[params.memberId];
            saveCachedWeekEntries(activeCode, 'FIXED', Object.values(next));
            return next;
          });
        }
        setMembers((prev) => {
          const next = params.hardDelete
            ? prev.filter((m) => m.id !== params.memberId)
            : prev.map((m) => (m.id === params.memberId ? { ...m, isActive: false } : m));
          applyCloudRosterSnapshot(activeCode, next, { includeInactive: true });
          return next;
        });
      }

      return res;
    },
    [hostPin, evictStaleHostPin]
  );

  const updatePrivateMemberMeta = useCallback(
    (memberId: string, updates: { notes?: string; tags?: string[] }) => {
      const activeCode = clubCodeRef.current;
      if (!activeCode || !memberId) return null;
      const saved = upsertHostMemberPrivateMeta(activeCode, memberId, updates);
      setPrivateMetaMap(getHostPrivateMetaMap(activeCode));
      return saved;
    },
    []
  );

  const setMemberPersonalPin = useCallback(
    async (params: {
      memberId?: string;
      newPin: string | null;
      currentPin?: string | null;
      resetAsHost?: boolean;
    }): Promise<ClubSyncResult<boolean>> => {
      const activeCode = clubCodeRef.current;
      const targetId = params.memberId ?? selectedMemberId;
      if (!activeCode || !targetId) {
        return { data: null, error: 'Chưa chọn thành viên.', errorCode: 'MEMBER_NOT_FOUND' };
      }

      const res = await setMemberPin({
        clubCode: activeCode,
        memberId: targetId,
        newPin: params.newPin,
        currentPin: params.currentPin,
        hostPin: params.resetAsHost ? hostPin : null,
      });

      if (res.errorCode === 'INVALID_HOST_PIN' && params.resetAsHost) {
        evictStaleHostPin(activeCode);
      }

      if (res.data === true) {
        const nextHasPin = Boolean(params.newPin?.trim());
        const pinKey = `${activeCode}::${targetId}`;
        if (nextHasPin && !params.resetAsHost && params.newPin) {
          const cleanPin = params.newPin.trim();
          const store = readSessionPins();
          store.memberPins[pinKey] = cleanPin;
          writeSessionPins(store);
          setMemberPinsByKey((prev) => ({ ...prev, [pinKey]: cleanPin }));
        } else {
          evictStaleMemberPin(activeCode, targetId);
        }

        setMembers((prev) => {
          const next = prev.map((m) =>
            m.id === targetId ? { ...m, hasPin: nextHasPin } : m
          );
          applyCloudRosterSnapshot(activeCode, next, { includeInactive: true });
          return next;
        });
      }

      return res;
    },
    [selectedMemberId, hostPin, evictStaleHostPin, evictStaleMemberPin]
  );

  const toggleWeekLockAsHost = useCallback(
    async (locked: boolean, targetWeek?: WeekKey): Promise<ClubSyncResult<string[]>> => {
      const activeCode = clubCodeRef.current;
      const weekToLock = targetWeek ?? weekKeyRef.current;
      if (!activeCode || !hostPin) {
        return {
          data: null,
          error: 'Chỉ Host mới được khóa/mở khóa tuần lịch.',
          errorCode: 'INVALID_HOST_PIN',
        };
      }

      const res = await setClubWeekLock({
        clubCode: activeCode,
        hostPin,
        weekKey: weekToLock,
        locked,
      });

      if (res.errorCode === 'INVALID_HOST_PIN') {
        evictStaleHostPin(activeCode);
      }

      if (res.data && !res.error) {
        setClub((prev) => {
          if (!prev) return prev;
          const updated = { ...prev, lockedWeeks: res.data! };
          saveCachedClubMeta(updated);
          return updated;
        });
      }

      return res;
    },
    [hostPin, evictStaleHostPin]
  );

  const updateSettingsAsHost = useCallback(
    async (params: {
      name?: string | null;
      settings?: Partial<ClubSettings> | null;
      newHostPin?: string | null;
    }): Promise<ClubSyncResult<Club>> => {
      const activeCode = clubCodeRef.current;
      if (!activeCode || !hostPin) {
        return {
          data: null,
          error: 'Chỉ Host mới được cập nhật cài đặt CLB.',
          errorCode: 'INVALID_HOST_PIN',
        };
      }

      const res = await updateClubSettings({
        clubCode: activeCode,
        hostPin,
        name: params.name,
        settings: params.settings,
        newHostPin: params.newHostPin,
      });

      if (res.errorCode === 'INVALID_HOST_PIN') {
        evictStaleHostPin(activeCode);
      }

      if (res.data && !res.error) {
        saveCachedClubMeta(res.data);
        setClub(res.data);
        if (params.newHostPin?.trim()) {
          const nextPin = params.newHostPin.trim();
          const store = readSessionPins();
          store.hostPins[activeCode] = nextPin;
          writeSessionPins(store);
          setHostPin(nextPin);
        }
      }

      return res;
    },
    [hostPin, evictStaleHostPin]
  );

  const attachActiveRoomAsHost = useCallback(
    async (
      room: Omit<ClubActiveRoom, 'createdAt'> & { createdAt?: string }
    ): Promise<ClubSyncResult<ClubActiveRoom[]>> => {
      const activeCode = clubCodeRef.current;
      if (!activeCode || !hostPin) {
        return {
          data: null,
          error: 'Chỉ Host mới được gắn phòng sân cho CLB.',
          errorCode: 'INVALID_HOST_PIN',
        };
      }

      const res = await upsertClubActiveRoom({
        clubCode: activeCode,
        hostPin,
        room,
      });

      if (res.errorCode === 'INVALID_HOST_PIN') {
        evictStaleHostPin(activeCode);
      }

      if (res.data && !res.error) {
        setClub((prev) => {
          if (!prev) return prev;
          const updated = { ...prev, activeRooms: res.data! };
          saveCachedClubMeta(updated);
          return updated;
        });
      }

      return res;
    },
    [hostPin, evictStaleHostPin]
  );

  const detachActiveRoomAsHost = useCallback(
    async (roomCodeToRemove: string): Promise<ClubSyncResult<ClubActiveRoom[]>> => {
      const activeCode = clubCodeRef.current;
      if (!activeCode || !hostPin) {
        return {
          data: null,
          error: 'Chỉ Host mới được gỡ phòng sân khỏi CLB.',
          errorCode: 'INVALID_HOST_PIN',
        };
      }

      const res = await removeClubActiveRoom({
        clubCode: activeCode,
        hostPin,
        roomCode: roomCodeToRemove,
      });

      if (res.errorCode === 'INVALID_HOST_PIN') {
        evictStaleHostPin(activeCode);
      }

      if (res.data && !res.error) {
        setClub((prev) => {
          if (!prev) return prev;
          const updated = { ...prev, activeRooms: res.data! };
          saveCachedClubMeta(updated);
          return updated;
        });
      }

      return res;
    },
    [hostPin, evictStaleHostPin]
  );

  const migrateLegacyRosterAsHost = useCallback(
    async (opts: { force?: boolean; forceIncludeDefaultSample?: boolean } = {}) => {
      const activeCode = clubCodeRef.current;
      if (!activeCode) {
        return null;
      }
      const res = await migrateLocalRosterToCloud({
        clubCode: activeCode,
        hostPin,
        force: opts.force,
        forceIncludeDefaultSample: opts.forceIncludeDefaultSample,
      });

      if (res.status === 'MIGRATED' || res.status === 'PARTIAL_ERROR') {
        const refreshed = getCachedCloudClubMembers(activeCode);
        setMembers(refreshed);
        setPrivateMetaMap(getHostPrivateMetaMap(activeCode));
      }
      return res;
    },
    [hostPin]
  );

  const refreshSchedule = useCallback(async () => {
    const activeCode = clubCodeRef.current;
    const currentWeek = weekKeyRef.current;
    if (!activeCode) return null;

    setSyncState('LOADING');
    const res = await fetchClubScheduleBundle(activeCode, currentWeek, {
      includeInactiveMembers: true,
      includeFixed: true,
    });

    if (res.error || !res.data) {
      setSyncState('ERROR');
      setErrorMessage(res.error ?? 'Lỗi làm mới dữ liệu CLB.');
      return res;
    }

    const { club: remoteClub, members: remoteMembers, weekEntries, fixedEntries } = res.data;
    saveCachedClubMeta(remoteClub);
    applyCloudRosterSnapshot(activeCode, remoteMembers, { includeInactive: true });
    saveCachedWeekEntries(activeCode, currentWeek, weekEntries);
    saveCachedWeekEntries(activeCode, 'FIXED', fixedEntries);

    setClub(remoteClub);
    setMembers(remoteMembers);
    setSelectedMemberId((prev) =>
      prev && remoteMembers.some((m) => m.id === prev && m.isActive) ? prev : null
    );
    setPrivateMetaMap(getHostPrivateMetaMap(activeCode));
    if (weekKeyRef.current === currentWeek) {
      setWeekEntriesByMemberId(toEntryMap(weekEntries));
    }
    setFixedEntriesByMemberId(toEntryMap(fixedEntries));
    setSyncState('SYNCED');
    setErrorMessage(null);
    return res;
  }, []);

  return {
    clubCode,
    club,
    role,
    isHost: role === 'CLUB_HOST',
    weekKey,
    durationHours,
    selectedMemberId,
    selectedMember,
    members,
    activeMembers,
    rosterWithPrivateMeta,
    privateMetaMap,
    weeklySchedule,
    weekEntriesByMemberId,
    fixedEntriesByMemberId,
    submissionSummary,
    heatmapSlots,
    goldenSlots,
    twoShiftSuggestions,
    syncState,
    errorMessage,
    connectClub,
    createNewClub,
    disconnectClub,
    selectWeek,
    setDurationHours,
    selectCurrentMember,
    unlockHostRole,
    lockHostRole,
    verifyAndCacheMemberPin,
    saveScheduleEntry,
    copyMyFixedToCurrentWeek,
    copyClubFixedToWeekAsHost,
    registerMember,
    updateMemberAsHost,
    deleteMemberAsHost,
    updatePrivateMemberMeta,
    setMemberPersonalPin,
    toggleWeekLockAsHost,
    updateSettingsAsHost,
    attachActiveRoomAsHost,
    detachActiveRoomAsHost,
    migrateLegacyRosterAsHost,
    refreshSchedule,
  };
}
