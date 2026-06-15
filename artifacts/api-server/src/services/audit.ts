import { db, adminAuditLogsTable } from "@workspace/db";

export interface AuditEntry {
  adminId: number;
  adminUsername: string;
  action: string;
  targetType: "user" | "transaction" | "tournament" | "platform" | "system";
  targetId?: number;
  oldValue?: unknown;
  newValue?: unknown;
  ip?: string;
  note?: string;
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await db.insert(adminAuditLogsTable).values({
      adminId: entry.adminId,
      adminUsername: entry.adminUsername,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId ?? null,
      oldValue: entry.oldValue != null ? JSON.stringify(entry.oldValue) : null,
      newValue: entry.newValue != null ? JSON.stringify(entry.newValue) : null,
      ip: entry.ip ?? null,
      note: entry.note ?? null,
    });
  } catch {
    // Audit log failure must NEVER break the primary operation
  }
}
