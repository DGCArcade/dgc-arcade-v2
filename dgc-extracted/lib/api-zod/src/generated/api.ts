/**
 * Zod schemas for DGC Arcade API
 */
import * as zod from "zod";

export const HealthCheckResponse = zod.object({
  status: zod.string(),
});

export const RegisterBody = zod.object({
  username: zod.string().min(3).max(24),
  password: zod.string().min(6),
});

export const LoginBody = zod.object({
  username: zod.string(),
  password: zod.string(),
});

export const BetBody = zod.object({
  gameId: zod.number().int(),
  amount: zod.number().positive(),
  clientSeed: zod.string().nullable().optional(),
  meta: zod.record(zod.unknown()).nullable().optional(),
});

export const InitiateDepositBody = zod.object({
  amount: zod.number().positive(),
  currency: zod.string().min(1),
});

export const OxapayCallbackBody = zod.object({
  trackId: zod.string().nullable().optional(),
  status: zod.string().nullable().optional(),
  amount: zod.number().nullable().optional(),
  currency: zod.string().nullable().optional(),
  orderId: zod.string().nullable().optional(),
});

export const RequestWithdrawalBody = zod.object({
  amount: zod.number().positive(),
  currency: zod.string().min(1),
  address: zod.string().min(1),
});

export const ListTransactionsQueryParams = zod.object({
  limit: zod.coerce.number().int().optional(),
});

export const ListBetsQueryParams = zod.object({
  limit: zod.coerce.number().int().optional(),
});
