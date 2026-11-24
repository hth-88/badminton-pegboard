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

export function useSettlementState() {
  const [settlementData, setSettlementData] = useState<CloudSettlementData>(() => ({
    settings: getSettlementSettings(),
    payments: getPaymentRecords(),
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

  const resetPaymentsForNewSession = useCallback(() => {
    clearPaymentRecords();
    setSettlementData((prev) => ({
      ...prev,
      payments: {},
      updatedAt: Date.now(),
    }));
  }, []);

  const applyCloudSettlement = useCallback(
    (remote: CloudSettlementData, persistToLocal: boolean) => {
      if (persistToLocal) {
        saveSettlementSettings(remote.settings);
        savePaymentRecords(remote.payments);
      }
      setSettlementData(remote);
    },
    []
  );

  const reloadLocalSettlement = useCallback(() => {
    setSettlementData({
      settings: getSettlementSettings(),
      payments: getPaymentRecords(),
      updatedAt: 0,
    });
  }, []);

  return {
    settlementData,
    updateSettlementSettings,
    toggleApprovePayment,
    rejectPendingPayment,
    resetPaymentsForNewSession,
    applyCloudSettlement,
    reloadLocalSettlement,
  };
}
