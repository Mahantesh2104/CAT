import { Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { cn, inr, shortDate } from "@/lib/utils"
import StatusPill from "@/components/StatusPill"
import UtilisationBar from "@/components/UtilisationBar"
import AvailabilityAsk from "@/components/AvailabilityAsk"
import ValueLedger from "@/components/ValueLedger"

const RANK: Record<string, number> = {
  OVERDUE: 0, UNASSIGNED: 1, IDLE: 2, IN_SERVICE: 3, ACTIVE: 4, AT_YARD: 5,
}

export default function FleetBoard() {
  const { data: assets, isLoading, error } = useQuery({ queryKey: ["assets"], queryFn: api.assets })
  const { data: config } = useQuery({ queryKey: ["config"], queryFn: api.config, refetchInterval: false })
  const { data: ledger } = useQuery({ queryKey: ["ledger"], queryFn: api.ledger })
  const { data: usage } = useQuery({ queryKey: ["usage"], queryFn: api.usage })
  const { data: maintenance } = useQuery({ queryKey: ["maintenance"], queryFn: api.maintenance })

  // Red rows first. A board that sorts alphabetically makes the operator do the triage.
  const rows = [...(assets ?? [])].sort(
    (a, b) =>
      (RANK[a.status] ?? 9) - (RANK[b.status] ?? 9) ||
      b.flags_count - a.flags_count ||
      a.utilization_pct - b.utilization_pct,
  )

  const warn = (config?.idle_utilisation_warn ?? 0.35) * 100
  const crit = (config?.idle_utilisation_crit ?? 0.2) * 100

  if (error) {
    return (
      <div className="border border-critical/40 bg-critical/10 px-6 py-8">
        <p className="font-mono text-[13px] text-critical">Cannot reach the API at {api.base}</p>
        <p className="mt-2 text-[13px] text-steel">{String(error)}</p>
        <p className="label mt-4">start it with: uvicorn main:app --port 8000 --app-dir api</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-7">
      {/* fleet-level readout */}
      <section className="grid gap-px bg-hairline sm:grid-cols-2 lg:grid-cols-4">
        {[
          { k: "machines on the board", v: String(assets?.length ?? "—") },
          { k: "fleet utilisation", v: usage ? `${usage.fleet.utilisation_pct}%` : "—" },
          { k: "downtime hours", v: usage ? usage.fleet.downtime_hours.toLocaleString("en-IN") : "—" },
          { k: "open exposure", v: ledger ? inr(ledger.exposure.total_exposure_inr) : "—" },
        ].map((s) => (
          <div key={s.k} className="bg-surface px-5 py-4">
            <p className="label">{s.k}</p>
            <p className="num mt-1.5 text-[27px] font-semibold leading-none text-chalk">{s.v}</p>
          </div>
        ))}
      </section>

      {maintenance?.map((m) => (
        <Link
          key={m.equipment_id}
          to={`/asset/${m.equipment_id}`}
          className="flex flex-wrap items-center gap-x-5 gap-y-2 border border-critical/40 bg-critical/[0.07] px-5 py-3.5 transition-colors hover:bg-critical/[0.12]"
        >
          <span className="font-mono text-[11px] font-semibold tracking-[0.14em] text-critical">
            SPN {m.spn} / FMI {m.fmi}
          </span>
          <span className="num text-[14px] font-semibold text-chalk">{m.equipment_id}</span>
          <span className="text-[13px] text-steel">{m.part}</span>
          <span className="num ml-auto text-[13px] text-critical">
            {m.current_temp_c.toFixed(1)}°C · {m.days_to_failure.toFixed(1)} operating days left
          </span>
        </Link>
      ))}

      <div className="grid gap-7 xl:grid-cols-[1.6fr_1fr]">
        {/* ------------------------- the board -------------------------- */}
        <section className="border border-hairline bg-surface">
          <header className="flex items-baseline justify-between gap-4 border-b border-hairline px-5 py-3.5">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-steel">Fleet board</h2>
            <span className="label">worst first · polls every 5s</span>
          </header>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-hairline">
                  {["asset", "type", "status", "site", "operator", "utilisation", "idle h/d", "due back", "flags"].map(
                    (h) => (
                      <th key={h} className="label px-4 py-2.5 font-normal whitespace-nowrap">{h}</th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={9} className="label px-4 py-10 text-center">reading the fleet…</td>
                  </tr>
                )}
                {rows.map((a) => {
                  const hot = a.status === "OVERDUE" || a.status === "UNASSIGNED"
                  return (
                    <tr
                      key={a.equipment_id}
                      className={cn(
                        "border-b border-hairline/60 transition-colors last:border-0 hover:bg-raised",
                        hot && "bg-critical/[0.045]",
                      )}
                    >
                      <td className="px-4 py-2.5">
                        <Link
                          to={`/asset/${a.equipment_id}`}
                          className="num text-[13px] font-semibold text-chalk hover:text-hazard"
                        >
                          {a.equipment_id}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-[13px] text-steel whitespace-nowrap">{a.type}</td>
                      <td className="px-4 py-2.5"><StatusPill status={a.status} /></td>
                      <td className="num px-4 py-2.5 text-[12.5px] whitespace-nowrap">
                        {a.site_id ? (
                          <span className="text-steel">
                            {a.site_id}
                            {a.branch_id && <span className="ml-1.5 text-slate">{a.branch_id}</span>}
                          </span>
                        ) : (
                          <span className="text-critical">NULL</span>
                        )}
                      </td>
                      <td className="num px-4 py-2.5 text-[12.5px] whitespace-nowrap">
                        {a.operator_id ?? <span className="text-critical">NULL</span>}
                      </td>
                      <td className="px-4 py-2.5 min-w-[150px]">
                        <UtilisationBar value={a.utilization_pct} warn={warn} crit={crit} />
                      </td>
                      <td className="num px-4 py-2.5 text-[12.5px] text-steel">{a.idle_hours_day}</td>
                      <td className="num px-4 py-2.5 text-[12.5px] text-steel whitespace-nowrap">
                        {shortDate(a.due_back)}
                      </td>
                      <td className="px-4 py-2.5">
                        {a.flags_count > 0 ? (
                          <span className="inline-flex min-w-[22px] justify-center border border-critical/50 bg-critical/15 px-1.5 py-px font-mono text-[11px] font-semibold text-critical">
                            {a.flags_count}
                          </span>
                        ) : (
                          <span className="label">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        <div className="flex flex-col gap-7">
          <AvailabilityAsk config={config} />
          <ValueLedger ledger={ledger} />
        </div>
      </div>

      {/* ------------------------- usage per site -------------------------- */}
      <section className="border border-hairline bg-surface">
        <header className="flex items-baseline justify-between gap-4 border-b border-hairline px-5 py-3.5">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-steel">
            Usage per site
          </h2>
          <span className="label">lowest utilisation first — where to redeploy</span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-hairline">
                {["site", "branch", "assets", "rented days", "engine h", "idle h", "utilisation", "idle cost"].map(
                  (h) => (
                    <th key={h} className="label px-4 py-2.5 font-normal whitespace-nowrap">{h}</th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {usage?.by_site.map((s) => (
                <tr
                  key={s.site_id}
                  className={cn(
                    "border-b border-hairline/60 last:border-0",
                    s.site_id === "UNASSIGNED" && "bg-critical/[0.05]",
                  )}
                >
                  <td className={cn("num px-4 py-2.5 text-[13px] font-medium",
                    s.site_id === "UNASSIGNED" ? "text-critical" : "text-chalk")}>
                    {s.site_id}
                  </td>
                  <td className="num px-4 py-2.5 text-[12.5px] text-slate">{s.branch_id ?? "—"}</td>
                  <td className="num px-4 py-2.5 text-[12.5px] text-steel">{s.assets}</td>
                  <td className="num px-4 py-2.5 text-[12.5px] text-steel">{s.rented_days}</td>
                  <td className="num px-4 py-2.5 text-[12.5px] text-steel">{s.engine_hours}</td>
                  <td className="num px-4 py-2.5 text-[12.5px] text-steel">{s.idle_hours}</td>
                  <td className="px-4 py-2.5 min-w-[150px]">
                    <UtilisationBar value={s.utilisation_pct} warn={warn} crit={crit} />
                  </td>
                  <td className="num px-4 py-2.5 text-[12.5px] text-hazard">{inr(s.idle_cost_inr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
