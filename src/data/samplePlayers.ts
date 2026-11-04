import type { Player } from '../types/badminton';

export const SAMPLE_16_PLAYERS: Array<
  Omit<
    Player,
    'gamesPlayed' | 'virtualGamesOffset' | 'waitStreak' | 'lastPlayedAt' | 'singlesCount'
  >
> = [
    // 8 Nam (từ y- đến tbk)
    { id: 'm1', name: 'Đức Anh', sex: 'M', rank: 'y-', status: 'ACTIVE', assignedPool: 'ALL', noSingles: false, joinedAt: 1000 },
    { id: 'm2', name: 'Huy Hoàng', sex: 'M', rank: 'y+', status: 'ACTIVE', assignedPool: 'ALL', noSingles: false, joinedAt: 1000 },
    { id: 'm3', name: 'Minh Trí', sex: 'M', rank: 'tby', status: 'ACTIVE', assignedPool: 'ALL', noSingles: false, joinedAt: 1000 },
    { id: 'm4', name: 'Quốc Tuấn', sex: 'M', rank: 'tby+', status: 'ACTIVE', assignedPool: 'ALL', noSingles: false, joinedAt: 1000 },
    { id: 'm5', name: 'Bảo Long', sex: 'M', rank: 'tb-', status: 'ACTIVE', assignedPool: 'ALL', noSingles: false, joinedAt: 1000 },
    { id: 'm6', name: 'Tiến Đạt', sex: 'M', rank: 'tb', status: 'ACTIVE', assignedPool: 'ALL', noSingles: false, joinedAt: 1000 },
    { id: 'm7', name: 'Văn Nam', sex: 'M', rank: 'tb+', status: 'ACTIVE', assignedPool: 'ALL', noSingles: false, joinedAt: 1000 },
    { id: 'm8', name: 'Hải Đăng', sex: 'M', rank: 'tbk', status: 'ACTIVE', assignedPool: 'ALL', noSingles: false, joinedAt: 1000 },

    // 8 Nữ (từ newbie đến tb++)
    { id: 'f1', name: 'Thùy Linh', sex: 'F', rank: 'newbie', status: 'ACTIVE', assignedPool: 'ALL', noSingles: false, joinedAt: 1000 },
    { id: 'f2', name: 'Mai Anh', sex: 'F', rank: 'y-', status: 'ACTIVE', assignedPool: 'ALL', noSingles: false, joinedAt: 1000 },
    { id: 'f3', name: 'Ngọc Lan', sex: 'F', rank: 'y', status: 'ACTIVE', assignedPool: 'ALL', noSingles: false, joinedAt: 1000 },
    { id: 'f4', name: 'Phương Thảo', sex: 'F', rank: 'tby-', status: 'ACTIVE', assignedPool: 'ALL', noSingles: false, joinedAt: 1000 },
    { id: 'f5', name: 'Hồng Nhung', sex: 'F', rank: 'tby', status: 'ACTIVE', assignedPool: 'ALL', noSingles: false, joinedAt: 1000 },
    { id: 'f6', name: 'Khánh Vy', sex: 'F', rank: 'tby+', status: 'ACTIVE', assignedPool: 'ALL', noSingles: false, joinedAt: 1000 },
    { id: 'f7', name: 'Bích Ngọc', sex: 'F', rank: 'tb', status: 'ACTIVE', assignedPool: 'ALL', noSingles: false, joinedAt: 1000 },
    { id: 'f8', name: 'Thu Trang', sex: 'F', rank: 'tb++', status: 'ACTIVE', assignedPool: 'ALL', noSingles: false, joinedAt: 1000 },
  ];
