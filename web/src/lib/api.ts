// The one fetch wrapper. Base URL from env, so localhost -> production is one variable.
import type {
  AssetRow, AssetDetail, Anomaly, Alert, MaintenanceRisk, AvailabilityAnswer,
  Ledger, Config, UsageSummary, Briefing,
} from "./types"

const BASE = (import.meta.env.VITE_API_URL ?? "http://localhost:8000").replace(/\/$/, "")
const ADMIN = import.meta.env.VITE_ADMIN_TOKEN as string | undefined

async function req<T>(path: string, init?: RequestInit, idempotencyKey?: string): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey
  // The API gates /reset and PUT /config behind this header when ADMIN_TOKEN is set
  // on the server. Unset locally, so development is unaffected.
  if (ADMIN) headers["X-Admin-Token"] = ADMIN

  const res = await fetch(`${BASE}${path}`, { ...init, headers: { ...headers, ...init?.headers } })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`${res.status} ${path}${body ? ` — ${body.slice(0, 160)}` : ""}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  base: BASE,
  health: () => req<{ ok: boolean; now: string; assets: number }>("/health"),
  assets: () => req<AssetRow[]>("/assets"),
  asset: (id: string) => req<AssetDetail>(`/assets/${id}`),
  anomalies: () => req<Anomaly[]>("/anomalies"),
  alerts: () => req<Alert[]>("/alerts"),
  maintenance: () => req<MaintenanceRisk[]>("/maintenance-risk"),
  usage: () => req<UsageSummary>("/usage-summary"),
  briefing: () => req<Briefing>("/briefing"),
  ledger: () => req<Ledger>("/ledger"),
  config: () => req<Config>("/config"),

  availability: (type: string, site: string, from: string, days = 10) =>
    req<AvailabilityAnswer>(
      `/availability?type=${encodeURIComponent(type)}&site=${encodeURIComponent(site)}` +
      `&from=${from}&days=${days}`),

  assign: (equipment_id: string, site_id: string, operator_id: string, actor: string) =>
    req(`/assign`, { method: "POST", body: JSON.stringify({ equipment_id, site_id, operator_id, actor }) }),
  checkout: (equipment_id: string, actor: string) =>
    req(`/checkout`, { method: "POST", body: JSON.stringify({ equipment_id, actor }) }),
  checkin: (equipment_id: string, condition_grade: string, actor: string, notes?: string) =>
    req(`/checkin`, { method: "POST", body: JSON.stringify({ equipment_id, condition_grade, actor, notes }) }),
  logUsage: (equipment_id: string, engine_hours: number, idle_hours: number, actor: string) =>
    req(`/log-usage`, { method: "POST", body: JSON.stringify({ equipment_id, engine_hours, idle_hours, actor }) }),

  addLedger: (equipment_id: string, action: string, est_value_inr: number,
              rule_id?: string, idempotencyKey?: string) =>
    req(`/ledger`,
        { method: "POST", body: JSON.stringify({ equipment_id, action, est_value_inr, rule_id }) },
        idempotencyKey),

  patchConfig: (patch: Record<string, unknown>) =>
    req<Config>(`/config`, { method: "PUT", body: JSON.stringify(patch) }),
  reset: () => req<{ ok: boolean }>(`/reset`, { method: "POST" }),
}
