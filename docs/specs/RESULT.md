# KẾT QUẢ THỰC HIỆN ĐỢT 2

Spec: [dot-2.md](file:///c:/Users/ADMIN/Documents/Chores/xep_nguoi_badminton/docs/specs/dot-2.md)  
Cổng kiểm tra cuối: `npm run check:harness` (`tsc -b` 0 lỗi, `vitest run` **177/177 tests pass** trên **21 test files**, `vite build` pass).

| ID | Xong/Bị chặn | commit hash | ghi chú 1 dòng |
| :---: | :---: | :---: | :--- |
| **A5** | Xong | `76af91c` | Reset `waitStreak = 0` và dọn người vừa vào sân khỏi `nextUp` sân khác + `readyQueue` khi `SWAP_PLAYERS`. |
| **A6** | Xong | `9792ed4` | Ánh xạ lại `slotSource` theo đúng `playerId` khi `REARRANGE_NEXT_UP` (`ROTATE`/`BALANCE`). |
| **A9** | Xong | `3a55577` | Trả `assignedPool` về `'ALL'` khi tắt sân ở `SPLIT_COURT` và đồng bộ bộ lọc pool + `noSingles` trong `canSuggestNextUp`. |
| **B4** | Xong | `16edfe6` | Tính lại `lastPlayedAt` từ `remainingHistory` (hoặc `0`) khi xóa trận trong `DELETE_HISTORY_MATCH`. |
| **B5** | Xong | `18a77f5` | Trả về `state` cũ không tạo undo snapshot rỗng khi no-op (trừ `EDIT_RANK` để giữ invariant test có sẵn ở `reducerAndUndo.test.ts`). |
| **B2** | Xong | `57f1222` | Không lưu `pinCode` vào state của `VIEWER` và xóa `pendingActionRef` khi đóng hộp thoại PIN. |
| **B3** | Xong | `b3d7d13` | Chỉ khử trùng `nextUp` trong nội bộ từng sân ở `migrateSessionState`, giữ nguyên người mượn giữa 2 sân khác nhau. |
| **B7** | Xong | `f03f1e5` | Lưu `pending_ts` khi pending debounce 250ms để F5 auto-reconnect giữ bản local mới hơn và đẩy lên Cloud (không sửa `CLAUDE.md`). |
| **A8** | Xong | `b0e5999` | Sắp xếp `secondaryAvailable` theo `waitPriority`, lọc `noSingles` cho Đơn, và fallback sang Đôi khi Đơn không xếp được (nếu không khóa cứng Đơn). |
| **B6** | Xong | `5eb9ea1` | Bổ sung cảnh báo `AVOID_PARTNER`/`AVOID_MATCH`, `noSingles` và chênh trình `SINGLES` trong `getSlotCandidateStatus` & `evaluateNextUp`. |
