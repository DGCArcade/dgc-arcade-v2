import type { Request } from "express";

export interface RequestContext {
  ip: string;
  userAgent: string;
  fingerprint?: string;
}

export function getRequestContext(req: Request): RequestContext {
  const forwarded = req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim();
  const ip = (forwarded || req.ip || "unknown").replace(/^::ffff:/, "");
  const userAgent = req.headers["user-agent"]?.toString() || "unknown";
  const fingerprint =
    req.headers["x-visitor-fingerprint"]?.toString() ||
    req.headers["x-device-fingerprint"]?.toString() ||
    undefined;
  return { ip, userAgent, fingerprint };
}
