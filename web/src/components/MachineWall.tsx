import type { AssetRow } from "@/lib/types"
import MachineSilhouette from "@/components/MachineSilhouette"
import { cn } from "@/lib/utils"

/**
 * A drifting wall of machines, filling the space beside the problem statement.
 *
 * The reference for this was a staggered photo collage. Photographs would have been
 * stock: generic yellow plant that belongs to nobody. These cards are the fleet on the
 * board right now - real ids, real statuses, real utilisation - so the panel argues the
 * same point the paragraph beside it does instead of decorating it.
 *
 * The motion is pure CSS: each card floats on its own duration and phase, so the group
 * never pulses in unison and never settles. It animates transform and nothing else, so
 * it runs on the compositor and costs no frame time. The global
 * prefers-reduced-motion rule in index.css stops it dead for anyone who asks.
 *
 * Depth comes from three staggered columns at different scales and opacities, the way
 * the reference layered its cards - not from shadows.
 */

const TONE: Record<string, { line: string; glow: string; label: string }> = {
  OVERDUE:    { line: "#ff5b45", glow: "rgba(255,91,69,0.16)",  label: "text-critical" },
  UNASSIGNED: { line: "#ff5b45", glow: "rgba(255,91,69,0.16)",  label: "text-critical" },
  IDLE:       { line: "#ffab2e", glow: "rgba(255,171,46,0.14)", label: "text-warning" },
  ACTIVE:     { line: "#3ddc97", glow: "rgba(61,220,151,0.12)", label: "text-nominal" },
  AT_YARD:    { line: "#6ea8ff", glow: "rgba(110,168,255,0.10)", label: "text-info" },
}

function Card({
  asset, i, dim,
}: { asset: AssetRow; i: number; dim?: boolean }) {
  const tone = TONE[asset.status] ?? TONE.AT_YARD
  // Prime-ish durations so the columns never fall into step with each other.
  const duration = 7.5 + (i % 4) * 1.7
  const delay = -(i * 1.3)

  return (
    <figure
      className={cn(
        "relative overflow-hidden border border-hairline bg-surface",
        dim && "opacity-[0.62]",
      )}
      style={{
        animation: `wall-float ${duration}s ease-in-out ${delay}s infinite`,
        willChange: "transform",
      }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(ellipse at 50% 40%, ${tone.glow}, transparent 68%)` }}
      />

      {/* Card heights vary a little so the wall staggers the way the reference did,
          and the padding pushes each card toward portrait rather than letterbox. */}
      <div
        className="relative flex items-center px-4"
        style={{ paddingBlock: `${26 + (i % 3) * 14}px` }}
      >
        <MachineSilhouette type={asset.type} tone={tone.line} className="h-auto w-full" />
      </div>

      <figcaption className="relative flex items-baseline justify-between gap-2 px-4 pb-3 pt-1">
        <span className="num text-[12px] font-semibold text-chalk">{asset.equipment_id}</span>
        <span className={cn("font-mono text-[9px] tracking-[0.14em]", tone.label)}>
          {asset.status === "UNASSIGNED" || asset.status === "OVERDUE"
            ? asset.status
            : `${asset.utilization_pct.toFixed(0)}%`}
        </span>
      </figcaption>
    </figure>
  )
}

export default function MachineWall({ assets }: { assets: AssetRow[] }) {
  if (assets.length < 3) return null

  // The story first: the machines nobody is watching, then the one about to break,
  // then the fleet that is actually earning. The wall says the same thing as the
  // headline beside it.
  const rank = (a: AssetRow) =>
    a.status === "UNASSIGNED" ? 0 : a.status === "OVERDUE" ? 1 : a.status === "IDLE" ? 2 : 3
  const chosen = [...assets]
    .sort((a, b) => rank(a) - rank(b) || b.flags_count - a.flags_count)
    .slice(0, 9)

  const columns: AssetRow[][] = [[], [], []]
  chosen.forEach((a, i) => columns[i % 3].push(a))

  return (
    <div aria-hidden className="relative select-none">
      <style>{`
        @keyframes wall-float {
          0%, 100% { transform: translate3d(0, 0, 0); }
          50%      { transform: translate3d(0, -14px, 0); }
        }
      `}</style>

      {/* The columns are offset and scaled differently so the wall reads as depth
          rather than a grid, and the outer two sit back behind the middle one. */}
      <div className="grid grid-cols-3 gap-3">
        {columns.map((col, ci) => (
          <div
            key={ci}
            className="flex flex-col gap-3"
            style={{
              marginTop: ci === 1 ? 0 : ci === 0 ? 34 : 18,
              transform: `scale(${ci === 1 ? 1 : 0.94})`,
              transformOrigin: "top center",
            }}
          >
            {col.map((a, i) => (
              <Card key={a.equipment_id} asset={a} i={ci * 3 + i} dim={ci !== 1} />
            ))}
          </div>
        ))}
      </div>

      {/* Fade the wall out at top and bottom so it reads as a continuing surface rather
          than a block that stops. */}
      <div
        className="pointer-events-none absolute inset-x-0 -top-1 h-12"
        style={{ background: "linear-gradient(to bottom, #05070d, transparent)" }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 -bottom-1 h-16"
        style={{ background: "linear-gradient(to top, #05070d, transparent)" }}
      />
    </div>
  )
}
