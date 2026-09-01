import type { Briefing } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * The board in plain English, before the board.
 *
 * A dealer opening this at 7am wants a sentence, not a table. Every line is generated on
 * the server from the rules that already fired — there is no language model involved and
 * nothing is invented, so each sentence can be checked against a figure elsewhere on the
 * screen. That is the honest version of a "natural-language summary": it reads like prose
 * and it is arithmetic underneath.
 */
export default function FleetBriefing({ briefing }: { briefing?: Briefing }) {
  if (!briefing) {
    return (
      <section className="min-w-0 border border-hairline bg-surface px-5 py-8">
        <p className="label">preparing the morning briefing…</p>
      </section>
    )
  }

  const { counts } = briefing
  const calm = counts.critical === 0

  return (
    <section className="min-w-0 border border-hairline bg-surface">
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-hairline px-5 py-3.5">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[11px] text-hazard">F</span>
          <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-steel">
            Morning briefing
          </h3>
        </div>
        <span className="label">{briefing.as_of}</span>
      </header>

      <div className="px-5 py-5">
        <p className={cn("text-[22px] font-semibold leading-tight tracking-tight",
          calm ? "text-nominal" : "text-chalk")}>
          {briefing.headline}
        </p>

        <ul className="mt-4 flex flex-col gap-3">
          {briefing.lines.map((line, i) => (
            <li key={i} className="flex gap-3">
              <span className="num mt-[3px] shrink-0 text-[11px] text-hazard">
                {String(i + 1).padStart(2, "0")}
              </span>
              <p className="max-w-[70ch] text-[14px] leading-relaxed text-steel">{line}</p>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid grid-cols-2 gap-px border-t border-hairline bg-hairline sm:grid-cols-4">
        {[
          { k: "critical", v: counts.critical, tone: "text-critical" },
          { k: "overdue", v: counts.overdue, tone: "text-critical" },
          { k: "due soon", v: counts.due_soon, tone: "text-warning" },
          { k: "service risk", v: counts.maintenance, tone: "text-warning" },
        ].map((s) => (
          <div key={s.k} className="bg-surface px-5 py-3">
            <p className="label">{s.k}</p>
            <p className={cn("num mt-1 text-[20px] font-semibold leading-none",
              s.v === 0 ? "text-steel" : s.tone)}>{s.v}</p>
          </div>
        ))}
      </div>

      <p className="border-t border-hairline px-5 py-2.5 text-[11.5px] leading-relaxed text-slate">
        Generated from the rules, not by a language model. Every figure in these sentences
        appears somewhere else on this screen and can be checked against it.
      </p>
    </section>
  )
}
