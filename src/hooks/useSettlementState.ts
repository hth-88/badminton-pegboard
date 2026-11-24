import { useCallback, useState } from 'react';
import {
  type CloudSettlementData,
  type PlayerPaymentRecord,
  type SettlementSettings,
} from '../engine/settlement';
import {
  clearPaymentRecords,
  getPaymentRecords,
  getSettlementSettings,
  savePaymentRecords,
  saveSettlementSettings,
} from '../engine/storage';

const STORAGE_KEY_BET_PAYMENTS = 'badminton_bet_payments';

function loadLocalBetPayments(): Record<string, boolean> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(STORAGE_KEY_BET_PAYMENTS);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const res: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (k && v === true) res[k] = true;
    }
    return res;
  } catch {
    return {};
  }
}

function saveLocalBetPayments(betPayments: Record<string, boolean>): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY_BET_PAYMENTS, JSON.stringify(betPayments));
  } catch {
    // Bỏ qua
  }
}

export function useSettlementState() {
  const [settlementData, setSettlementData] = useState<CloudSettlementData>(() => ({
    settings: getSettlementSettings(),
    payments: getPaymentRecords(),
    betPayments: loadLocalBetPayments(),
    updatedAt: 0,
  }));

  const updateSettlementSettings = useCallback((updates: Partial<SettlementSettings>) => {
    setSettlementData((prev) => {
      const nextSettings: SettlementSettings = {
        ...prev.settings,
        ...updates,
      };
      saveSettlementSettings(nextSettings);
      return {
        ...prev,
        settings: nextSettings,
        updatedAt: Date.now(),
      };
    });
  }, []);

  const toggleApprovePayment = useCallback((playerId: string) => {
    setSettlementData((prev) => {
      const nextPayments: Record<string, PlayerPaymentRecord> = { ...prev.payments };
      const existing = nextPayments[playerId];
      if (existing?.status === 'PAID') {
        delete nextPayments[playerId];
      } else {
        const now = Date.now();
        const approvedRec: PlayerPaymentRecord = {
          status: 'PAID',
          reportedAt: existing?.reportedAt,
          approvedAt: now,
        };
        if (existing?.receiptUrl) approvedRec.receiptUrl = existing.receiptUrl;
        if (existing?.receiptPath) approvedRec.receiptPath = existing.receiptPath;
        nextPayments[playerId] = approvedRec;
      }
      savePaymentRecords(nextPayments);
      return {
        ...prev,
        payments: nextPayments,
        updatedAt: Date.now(),
      };
    });
  }, []);

  const rejectPendingPayment = useCallback((playerId: string, reason?: string) => {
    setSettlementData((prev) => {
      const existing = prev.payments[playerId];
      const cleanReason = reason?.trim();
      if (!existing && !cleanReason) {
        return prev;
      }
      const nextPayments: Record<string, PlayerPaymentRecord> = { ...prev.payments };
      if (cleanReason) {
        nextPayments[playerId] = {
          status: 'REJECTED',
          reportedAt: existing?.reportedAt,
          rejectedAt: Date.now(),
          rejectionReason: cleanReason.slice(0, 160),
        };
      } else {
        delete nextPayments[playerId];
      }
      savePaymentRecords(nextPayments);
      return {
        ...prev,
        payments: nextPayments,
        updatedAt: Date.now(),
      };
    });
  }, []);

  const toggleBetPaid = useCallback((obligationId: string) => {
    setSettlementData((prev) => {
      const nextBetPayments: Record<string, boolean> = { ...(prev.betPayments || {}) };
      if (nextBetPayments[obligationId]) {
        delete nextBetPayments[obligationId];
      } else {
        nextBetPayments[obligationId] = true;
      }
      saveLocalBetPayments(nextBetPayments);
      return {
        ...prev,
        betPayments: nextBetPayments,
        updatedAt: Date.now(),
      };
    });
  }, []);

  const resetPaymentsForNewSession = useCallback(() => {
    clearPaymentRecords();
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY_BET_PAYMENTS);
      }
    } catch {
      // Bỏ qua
    }
    setSettlementData((prev) => ({
      ...prev,
      payments: {},
      betPayments: {},
      updatedAt: Date.now(),
    }));
  }, []);

  const applyCloudSettlement = useCallback(
    (remote: CloudSettlementData, persistToLocal: boolean) => {
      if (persistToLocal) {
        saveSettlementSettings(remote.settings);
        savePaymentRecords(remote.payments);
        saveLocalBetPayments(remote.betPayments || {});
      }
      setSettlementData({
        ...remote,
        betPayments: remote.betPayments || {},
      });
    },
    []
  );

  const reloadLocalSettlement = useCallback(() => {
    setSettlementData({
      settings: getSettlementSettings(),
      payments: getPaymentRecords(),
      betPayments: loadLocalBetPayments(),
      updatedAt: 0,
    });
  }, []);

  return {
    settlementData,
    updateSettlementSettings,
    toggleApprovePayment,
    rejectPendingPayment,
    toggleBetPaid,
    resetPaymentsForNewSession,
    applyCloudSettlement,
    reloadLocalSettlement,
  };
}
