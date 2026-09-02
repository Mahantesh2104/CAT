import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import type { AssetRow, Config } from "@/lib/types"
import { api } from "@/lib/api"
import { useSession } from "@/lib/session"
import { useResilientQuery } from "@/lib/useResilientQuery"
import { cn, inr } from "@/lib/utils"
import MachineSilhouette from "@/components/MachineSilhouette"

/**
 * What the customer sees.
 *
 * This is the same data as the dealer's board and a completely different screen, on
 * purpose. Two rules shaped it:
 *
 *  1. SCOPE. A customer sees the machines at THEIR site and nothing else. The fleet
 *     ledger, the exposure buckets and the other sites' utilisation are not withheld to
 *     be coy - showing them would be showing this customer another customer's numbers.
 *
 *  2. LANGUAGE. Nobody renting an excavator wants to read "R2 fired at 0.35 utilisation
 *     threshold". They want to know what they are paying for, what is coming back when,
 *     and what is about to go wrong. Every line here is the answer to one of those, in
 *     words, with the number that supports it beside it.
 *
 * The one figure a customer genuinely needs and never gets from a dealer is the cost of
 * their own idle time - hours they are billed for while the machine produces nothing.
 * It is computed the same way the dealer's ledger computes it, so both parties are
 * looking at the same arithmetic.
 */

const DAY = 86_400_000

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY)
}

function Hire({ a, now, config }: { a: AssetRow; now: string; config?: Config }) {
  // A machine standing back in the yard is off hire. Its clock stopped when it was
  // returned, so measuring "days held" up to today would keep billing a customer for a
  // machine they gave back in April - the single worst thing this page could get wrong.
  const back = a.status === "AT_YARD"
  const until = back ? (a.due_back ?? now) : now
  const left = !back && a.due_back ? daysBetween(now, a.due_back) : null
  const held = a.on_hire_from ? Math.max(0, daysBetween(a.on_hire_from, until)) : null

  // The customer's own money, worked the way the dealer works it: the day rate spread
  // across the hours the machine is actually on, then charged for the idle ones.
  const hoursOn = a.engine_hours_day + a.idle_hours_day
  const idleCost = hoursOn > 0 && held
    ? Math.round((a.day_rate / hoursOn) * a.idle_hours_day * held)
    : 0

  const warn = (config?.idle_utilisation_warn ?? 0.35) * 100
  const weak = a.utilization_pct < warn

  const tone = back
    ? { line: "#6ea8ff", text: "text-info", say: `returned ${a.due_back ?? ""}`.trim() }
    : left !== null && left < 0 ? { line: "#ff5b45", text: "text-critical", say: `${-left} days past its return date` }
    : left !== null && left <= 3 ? { line: "#ffab2e", text: "text-warning", say: left === 0 ? "due back today" : `due back in ${left} days` }
    : { line: "#3ddc97", text: "text-nominal", say: left === null ? "no return date set" : `${left} days left on hire` }

  return (
    <article className="flex min-w-0 flex-col border border-hairline bg-surface">
      <div className="flex items-start gap-4 border-b border-hairline px-5 py-4">
        <div className="w-[86px] shrink-0">
          <MachineSilhouette type={a.type} tone={tone.line} className="h-auto w-full" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="num text-[18px] font-semibold leading-none text-chalk">{a.equipment_id}</p>
          <p className="mt-1.5 text-[13.5px] text-steel">{a.type}</p>
          <p className={cn("mt-2 text-[13px] font-medium", tone.text)}>{tone.say}</p>
        </div>
        <span className="label shrink-0">grade {a.condition_grade}</span>
      </div>

      <dl className="grid grid-cols-2 gap-px bg-hairline">
        <div className="bg-surface px-5 py-3">
          <dt className="label">on hire since</dt>
          <dd className="num mt-1 text-[14px] text-chalk">{a.on_hire_from ?? "—"}</dd>
        </div>
        <div className="bg-surface px-5 py-3">
          <dt className="label">{back ? "returned" : "due back"}</dt>
          <dd className="num mt-1 text-[14px] text-chalk">{a.due_back ?? "—"}</dd>
        </div>
        <div className="bg-surface px-5 py-3">
          <dt className="label">working / idle each day</dt>
          <dd className="num mt-1 text-[14px] text-chalk">
            {a.engine_hours_day}h <span className="text-slate">/</span>{" "}
            <span className={weak ? "text-warning" : "text-chalk"}>{a.idle_hours_day}h</span>
          </dd>
        </div>
        <div className="bg-surface px-5 py-3">
          <dt className="label">day rate</dt>
          <dd className="num mt-1 text-[14px] text-chalk">{inr(a.day_rate)}</dd>
        </div>
      </dl>

      {/* The line a customer never normally gets to see. */}
      {idleCost > 0 && (
        <p className={cn("border-t border-hairline px-5 py-3 text-[12.5px] leading-relaxed",
          weak ? "text-warning" : "text-steel")}>
          {back ? "Over its " : "This machine has been idling "}
          {back ? `${held}-day hire it idled ${a.idle_hours_day}h a day — ` : `${a.idle_hours_day}h a day for ${held} days — `}
          about <span className="num font-semibold">{inr(idleCost)}</span> of hire paid
          for hours it was switched on and producing nothing.
          {weak && " Worth moving it to a busier face, or sending it back early."}
        </p>
      )}
    </article>
  )
}

export default function CustomerView() {
  const session = useSession()
  const site = session?.site_id ?? null

  const { data: assets, isLoading, error, retry } = useResilientQuery(["assets"], api.assets)
  const { data: config } = useQuery({ queryKey: ["config"], queryFn: api.config, refetchInterval: false })
  const { data: health } = useQuery({ queryKey: ["health"], queryFn: api.health, refetchInterval: false })
  const { data: risk } = useQuery({ queryKey: ["maintenance"], queryFn: api.maintenance })

  const now = health?.now ?? ""

  const mine = useMemo(
    () => (assets ?? []).filter((a) => a.site_id === site),
    [assets, site],
  )
  const live = mine.filter((a) => a.status !== "AT_YARD")

  const summary = useMemo(() => {
    // Everything the headline says is about machines STILL OUT. Returned ones are
    // reported separately, with their final figures, and never added to a running cost.
    const onHire = mine.filter((a) => a.status !== "AT_YARD")
    const hoursOn = onHire.reduce((n, a) => n + a.engine_hours_day + a.idle_hours_day, 0)
    const engine = onHire.reduce((n, a) => n + a.engine_hours_day, 0)
    const dueSoon = onHire.filter((a) => {
      if (!a.due_back || !now) return false
      const d = daysBetween(now, a.due_back)
      return d >= 0 && d <= 3
    })
    const late = onHire.filter((a) => a.due_back && now && daysBetween(now, a.due_back) < 0)
    // Idle cost across every hire, each measured over its own period - live ones to
    // today, returned ones only to the day they went back.
    const idleCost = mine.reduce((n, a) => {
      const on = a.engine_hours_day + a.idle_hours_day
      const until = a.status === "AT_YARD" ? (a.due_back ?? now) : now
      const held = a.on_hire_from && now ? Math.max(0, daysBetween(a.on_hire_from, until)) : 0
      return n + (on > 0 ? Math.round((a.day_rate / on) * a.idle_hours_day * held) : 0)
    }, 0)
    return {
      count: onHire.length,
      returned: mine.filter((a) => a.status === "AT_YARD"),
      working: hoursOn > 0 ? Math.round((engine / hoursOn) * 1000) / 10 : 0,
      dueSoon, late, idleCost,
      // Only machines still out cost anything a day.
      dayCost: onHire.reduce((n, a) => n + a.day_rate, 0),
    }
  }, [mine, now])

  // A machine of theirs the dealer already knows will fail. Telling the customer
  // before it strands them on site is the whole point of predicting it.
  const theirRisk = (risk ?? []).filter((m) => mine.some((a) => a.equipment_id === m.equipment_id))

  if (error) {
    return (
      <section className="border border-critical/40 bg-critical/[0.06] px-6 py-10 text-center">
        <p className="text-[15px] text-critical">We could not reach the rental system.</p>
        <button onClick={retry}
                className="mt-4 border border-critical px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-critical hover:bg-critical hover:text-ground">
          Try again
        </button>
      </section>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="border border-hairline bg-surface px-6 py-6">
        <p className="label">your hire · site {site}</p>
        <h1 className="mt-2.5 text-[26px] font-bold tracking-tight text-chalk">
          {isLoading
            ? "Loading your machines…"
            : summary.count === 0
              ? "You have no machines on hire at this site."
              : `You have ${summary.count} machine${summary.count > 1 ? "s" : ""} on hire.`}
        </h1>
        <p className="mt-2.5 max-w-[70ch] text-[14px] leading-relaxed text-steel">
          {summary.count > 0 && (
            <>
              They are working {summary.working}% of the hours they are switched on, at{" "}
              <span className="num">{inr(summary.dayCost)}</span> a day in total.
              {summary.late.length > 0 && (
                <> <span className="text-critical">
                  {summary.late.length} {summary.late.length > 1 ? "are" : "is"} past the
                  agreed return date and still being billed.
                </span></>
              )}
              {summary.late.length === 0 && summary.dueSoon.length > 0 && (
                <> <span className="text-warning">
                  {summary.dueSoon.length} {summary.dueSoon.length > 1 ? "are" : "is"} due
                  back within three days — tell us if you need longer.
                </span></>
              )}
            </>
          )}
        </p>
      </header>

      {summary.idleCost > 0 && (
        <section className="border border-hazard/40 bg-hazard/[0.05] px-6 py-5">
          <p className="label">what your idle time has cost</p>
          <p className="num mt-2 text-[30px] font-semibold leading-none text-hazard">
            {inr(summary.idleCost)}
          </p>
          <p className="mt-3 max-w-[74ch] text-[13.5px] leading-relaxed text-steel">
            That is hire you have paid for hours the machines were running but not
            producing. It is worked out from each machine's own engine and idle hours —
            the same arithmetic your dealer uses, so there is nothing to reconcile.
            Redeploying or returning the weakest machine is the fastest way to bring it
            down.
          </p>
        </section>
      )}

      {theirRisk.length > 0 && (
        <section className="border border-critical/40 bg-critical/[0.06] px-6 py-5">
          <p className="label">we are getting ahead of a problem</p>
          {theirRisk.map((m) => (
            <p key={m.equipment_id} className="mt-2 max-w-[74ch] text-[13.5px] leading-relaxed text-chalk">
              <span className="num font-semibold">{m.equipment_id}</span> is running hot —
              its coolant is at {m.current_temp_c}°C and rising {m.slope}°C a day. On
              current use it has about{" "}
              <span className="num font-semibold text-critical">{m.days_to_failure} working days</span>{" "}
              before it would fail on site. We will arrange a swap before that happens;
              the part is the {m.part.toLowerCase()}.
            </p>
          ))}
        </section>
      )}

      {live.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {live.map((a) => <Hire key={a.equipment_id} a={a} now={now} config={config} />)}
        </div>
      )}

      {summary.returned.length > 0 && (
        <section className="flex flex-col gap-4">
          <p className="label">
            already returned — closed hires, no longer costing you anything
          </p>
          <div className="grid gap-4 opacity-70 lg:grid-cols-2">
            {summary.returned.map((a) => (
              <Hire key={a.equipment_id} a={a} now={now} config={config} />
            ))}
          </div>
        </section>
      )}

      <p className="label leading-relaxed">
        every figure here comes from the machine's own telemetry, not from an invoice —
        clock pinned to <span className="num">{now || "—"}</span>
      </p>
    </div>
  )
}
