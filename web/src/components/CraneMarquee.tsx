import { useEffect, useRef, useState } from "react"

/**
 * The four questions, carried around on a crane.
 *
 * A tower crane slews: the tower stays put and only the jib swings, which is exactly the
 * motion asked for here. Seen from slightly above, that sweep is a circle in plan and an
 * ELLIPSE on screen, so the banner travels wide and near at the front and small and far
 * at the back. That single piece of honesty is what makes it read as a crane rather than
 * a clock hand: everything else — the scale, the fade, whether the jib passes in front of
 * the tower or behind it — falls out of the same angle.
 *
 * The banner changes at the BACK of the sweep, at theta = 3pi/2, where the lettering has
 * already faded to nothing. The swap is never seen; a new question simply comes round.
 *
 * One rAF loop writes SVG attributes through refs. React owns the words and nothing else,
 * so a re-render cannot fight the animation for the geometry — the animated attributes
 * are deliberately absent from the JSX below, which is what keeps React's hands off them.
 */

export const ANSWERS = [
  {
    n: "01",
    tag: "ANOMALY DETECTION",
    h: "Where is my money leaking?",
    p: "Eight rules of three different kinds — a threshold, a cross-field contradiction, and a predictive trend. Every flag carries the field names, their values, and the threshold crossed.",
  },
  {
    n: "02",
    tag: "AVAILABILITY",
    h: "Can I commit this machine?",
    p: "A customer wants an excavator Monday. Some come back Friday. The engine ranks the whole fleet by when each machine is genuinely free and names one, with a confidence.",
  },
  {
    n: "03",
    tag: "SPN 110 / FMI 0",
    h: "What is about to break?",
    p: "A rolling coolant mean and a least-squares trend, resolving to a real SAE J1939 fault code, the part to replace, and the days of operation left before it fails.",
  },
  {
    n: "04",
    tag: "VALUE LEDGER",
    h: "What did acting on it save?",
    p: "Every action writes an event and a ledger row together. Waste, billable and avoided are kept apart, because adding them produces a number that does not survive a question.",
  },
]

// Plan geometry. A is the jib's reach, B the same circle foreshortened by the viewing
// angle — the ratio is the whole perspective, and nothing else needs to know about it.
const PX = 450, PY = 142      // slew pivot: top of the tower
const A = 240, B = 62         // sweep ellipse
const CJ = 100, CJB = 26      // counter-jib, same ellipse scaled down
const APEX = 88               // A-frame apex, where the tie bars anchor
const MAST_TOP = 150, MAST_FOOT = 500
const RAIL_L = 436, RAIL_R = 464
const CABLE = 46
const REVOLUTION_MS = 10_000

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/**
 * The crane's whole pose at one slew angle.
 *
 * One function, used twice: the loop calls it per frame, and the JSX below renders
 * pose(0) as its static attributes. So the crane is already a correct, legible crane
 * before a single frame has run - on a slow first paint, in a throttled background tab,
 * anywhere requestAnimationFrame is not being served. React never rewrites those
 * attributes afterwards because their JSX values are constants and never change.
 */
function pose(theta: number) {
  const c = Math.cos(theta), s = Math.sin(theta)
  const tx = PX + A * c, ty = PY + B * s
  const wx = PX - CJ * c, wy = PY - CJB * s
  const depth = (s + 1) / 2                       // 0 at the back, 1 at the front
  const scale = 0.66 + 0.34 * depth
  const drop = ty + CABLE * scale

  // The jib tapers from pivot to tip. Offsetting in y rather than truly perpendicular is
  // exact while the jib is horizontal and imperceptible when it is not - because that is
  // precisely when it is most foreshortened.
  const jib = `M${PX},${PY - 6} L${tx},${ty - 2.5} L${tx},${ty + 2.5} L${PX},${PY + 6} Z`

  let brace = ""
  for (let k = 0; k < 8; k++) {
    const u0 = k / 8, u1 = (k + 1) / 8
    const x0 = PX + (tx - PX) * u0, y0 = PY + (ty - PY) * u0
    const x1 = PX + (tx - PX) * u1, y1 = PY + (ty - PY) * u1
    const o0 = 6 - 3.5 * u0, o1 = 6 - 3.5 * u1
    brace += k % 2
      ? `M${x0},${y0 - o0} L${x1},${y1 + o1} `
      : `M${x0},${y0 + o0} L${x1},${y1 - o1} `
  }

  return {
    jib, brace,
    tie: `M${PX},${APEX} L${PX + (tx - PX) * 0.62},${PY + (ty - PY) * 0.62} M${PX},${APEX} L${wx},${wy}`,
    cjib: `M${PX},${PY} L${wx},${wy}`,
    weightX: wx - 17, weightY: wy - 10,
    trolleyX: tx - 9, trolleyY: ty - 7,
    cable: `M${tx},${ty} L${tx},${drop}`,
    banner: `translate(${tx},${drop}) scale(${scale})`,
    lit: 0.42 + 0.58 * depth,
    // Lettering is gone well before the swap, and back before it matters.
    legible: clamp01((s + 0.62) / 0.42),
    behind: s < 0,
  }
}

// The pose the crane holds when nothing is animating: jib fully extended to the side,
// where it reads as a crane rather than as a foreshortened stub.
const REST = pose(0)

/** The tower. Drawn twice — once under the rig, once over it — so the jib can pass
 *  behind it. Only one copy is ever visible; the frame loop decides which. */
function Mast() {
  const braces = []
  for (let y = MAST_TOP; y < MAST_FOOT; y += 35) {
    const down = ((y - MAST_TOP) / 35) % 2 === 0
    braces.push(
      down
        ? `M${RAIL_L},${y} L${RAIL_R},${Math.min(y + 35, MAST_FOOT)}`
        : `M${RAIL_R},${y} L${RAIL_L},${Math.min(y + 35, MAST_FOOT)}`,
    )
  }
  return (
    <g>
      {/* Solid, so the copy drawn last genuinely hides the jib rather than letting it
          show through the lattice. */}
      <path
        d={`M${RAIL_L},${MAST_TOP - 6} H${RAIL_R} V${MAST_FOOT} H${RAIL_L} Z`}
        fill="var(--color-ground)"
      />
      <path d={braces.join(" ")} stroke="#9aa5b6" strokeWidth={1} fill="none" />
      <path
        d={`M${RAIL_L},${MAST_TOP - 6} V${MAST_FOOT} M${RAIL_R},${MAST_TOP - 6} V${MAST_FOOT}`}
        stroke="#f2f4f8" strokeWidth={1.6} fill="none"
      />
      {/* base and ballast */}
      <path
        d={`M${RAIL_L - 26},${MAST_FOOT} L${RAIL_R + 26},${MAST_FOOT} L${RAIL_R + 44},${MAST_FOOT + 22} L${RAIL_L - 44},${MAST_FOOT + 22} Z`}
        fill="var(--color-ground)" stroke="#f2f4f8" strokeWidth={1.6} strokeLinejoin="round"
      />
      <path d={`M330,${MAST_FOOT + 22} H570`} stroke="#9aa5b6" strokeWidth={1} />
    </g>
  )
}

export default function CraneMarquee() {
  const [i, setI] = useState(0)
  const [still, setStill] = useState(false)

  // Every animated node. React never writes these attributes, the loop does.
  const jib = useRef<SVGPathElement>(null)
  const brace = useRef<SVGPathElement>(null)
  const tie = useRef<SVGPathElement>(null)
  const cjib = useRef<SVGPathElement>(null)
  const weight = useRef<SVGRectElement>(null)
  const trolley = useRef<SVGRectElement>(null)
  const cable = useRef<SVGPathElement>(null)
  const banner = useRef<SVGGElement>(null)
  const plate = useRef<SVGGElement>(null)
  const words = useRef<SVGTextElement>(null)
  const mastBack = useRef<SVGGElement>(null)
  const mastFront = useRef<SVGGElement>(null)

  // The loop reads these; changing one never restarts the effect, so clicking a pip
  // cannot tear down and rebuild the animation.
  const base = useRef(0)
  const spun = useRef(0)   // revolutions completed, accumulated
  const last = useRef(0)

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)")
    if (reduced.matches) { setStill(true); return }

    let raf = 0
    let shown = -1

    const frame = (now: number) => {
      // Accumulated, not now-minus-start: a backgrounded tab stops serving frames, and
      // on return a raw elapsed time would fling the crane through several revolutions
      // and several questions in one frame. Capping the step resumes it where it stopped.
      const step = last.current ? Math.min(now - last.current, 50) : 0
      last.current = now
      spun.current += step / REVOLUTION_MS
      const t = spun.current

      // Start at the back of the sweep, so a revolution both begins and ends where the
      // banner is invisible and the change of question costs nothing to look at.
      const theta = Math.PI * 1.5 + t * Math.PI * 2
      const next = (base.current + Math.floor(t)) % ANSWERS.length
      if (next !== shown) { shown = next; setI(next) }

      const q = pose(theta)
      jib.current?.setAttribute("d", q.jib)
      brace.current?.setAttribute("d", q.brace)
      tie.current?.setAttribute("d", q.tie)
      cjib.current?.setAttribute("d", q.cjib)
      weight.current?.setAttribute("x", String(q.weightX))
      weight.current?.setAttribute("y", String(q.weightY))
      trolley.current?.setAttribute("x", String(q.trolleyX))
      trolley.current?.setAttribute("y", String(q.trolleyY))
      cable.current?.setAttribute("d", q.cable)
      banner.current?.setAttribute("transform", q.banner)
      plate.current?.setAttribute("opacity", String(q.lit))
      words.current?.setAttribute("opacity", String(q.legible))

      // Behind the tower for the far half of the sweep: show whichever copy of the mast
      // sits on the correct side of the rig.
      mastFront.current?.setAttribute("opacity", q.behind ? "1" : "0")
      mastBack.current?.setAttribute("opacity", q.behind ? "0" : "1")

      raf = requestAnimationFrame(frame)
    }

    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Reduced motion gets the original grid. Nothing is lost, it simply does not move.
  if (still) {
    return (
      <div className="mt-12 grid gap-px bg-hairline sm:grid-cols-2">
        {ANSWERS.map((c) => (
          <article key={c.n} className="bg-surface px-8 py-10">
            <div className="flex items-baseline gap-4">
              <span className="num text-[13px] text-hazard">{c.n}</span>
              <span className="label">{c.tag}</span>
            </div>
            <h3 className="mt-4 text-[22px] font-semibold leading-tight tracking-tight text-chalk">
              {c.h}
            </h3>
            <p className="mt-3 max-w-[46ch] text-[14.5px] leading-relaxed text-steel">{c.p}</p>
          </article>
        ))}
      </div>
    )
  }

  const a = ANSWERS[i]

  return (
    <div className="mt-6">
      <svg
        viewBox="0 60 900 500"
        className="mx-auto block h-auto w-full max-w-[900px]"
        role="img"
        aria-label={`Crane carrying the question: ${a.h}`}
      >
        <g ref={mastBack}><Mast /></g>

        <g>
          {/* The slew circle in plan, foreshortened - the path the jib tip runs on. */}
          <ellipse cx={PX} cy={PY} rx={A} ry={B} fill="none" stroke="var(--color-hairline-bright)"
                   strokeWidth={1} strokeDasharray="2 7" />

          {/* A-frame, static: the crane's own outline never moves, only the arm does. */}
          <path d={`M${PX},${APEX} L${RAIL_L + 6},${PY} M${PX},${APEX} L${RAIL_R - 6},${PY}`}
                stroke="#9aa5b6" strokeWidth={1.1} fill="none" />
          <ellipse cx={PX} cy={PY} rx={17} ry={5} fill="none" stroke="#9aa5b6" strokeWidth={1.1} />

          <path ref={tie} d={REST.tie} stroke="#9aa5b6" strokeWidth={1} fill="none" />
          <path ref={cjib} d={REST.cjib} stroke="#f2f4f8" strokeWidth={1.6} fill="none" />
          <rect ref={weight} x={REST.weightX} y={REST.weightY} width={34} height={20} fill="var(--color-raised)"
                stroke="#9aa5b6" strokeWidth={1.1} />

          <path ref={jib} d={REST.jib} fill="var(--color-ground)" stroke="#f2f4f8" strokeWidth={1.6}
                strokeLinejoin="round" />
          <path ref={brace} d={REST.brace} stroke="#9aa5b6" strokeWidth={0.9} fill="none" />

          <rect ref={trolley} x={REST.trolleyX} y={REST.trolleyY} width={18} height={14} fill="var(--color-raised)"
                stroke="#ffcd11" strokeWidth={1.3} />
          <path ref={cable} d={REST.cable} stroke="#ffcd11" strokeWidth={1.2} fill="none" />

          <g ref={banner} transform={REST.banner}>
            <g ref={plate} opacity={REST.lit}>
              {/* Hanger lines, so the banner reads as slung from the hook rather than
                  stuck to the end of the cable. */}
              <path d="M0,0 L-168,12 M0,0 L168,12" stroke="#ffcd11" strokeWidth={1} fill="none" />
              <rect x={-200} y={12} width={400} height={72}
                    fill="var(--color-surface)" stroke="#ffcd11" strokeWidth={1.6} />
              <path d="M-200,20 H200 M-200,76 H200" stroke="#ffcd11" strokeWidth={0.7}
                    opacity={0.4} fill="none" />
              <text
                ref={words}
                opacity={REST.legible}
                x={0} y={57} textAnchor="middle"
                fill="#f2f4f8"
                style={{ font: '600 25px "IBM Plex Sans", system-ui, sans-serif' }}
              >
                {a.h}
              </text>
            </g>
          </g>
        </g>

        <g ref={mastFront} opacity={0}><Mast /></g>
      </svg>

      {/* The caption carries what the banner has no room for, and changes with it. */}
      <div key={i} className="rise-in mx-auto mt-2 max-w-[64ch] text-center">
        <p className="label">{a.n} — {a.tag}</p>
        <p className="mt-3 text-[15px] leading-relaxed text-steel">{a.p}</p>
      </div>

      <div className="mt-8 flex items-center justify-center gap-2">
        {ANSWERS.map((c, k) => (
          <button
            key={c.n}
            onClick={() => {
              // Restart the sweep from the back on the chosen question, so it rises into
              // view the same way it would have on its own.
              base.current = k
              spun.current = 0
              setI(k)
            }}
            aria-label={c.h}
            aria-current={k === i}
            className={`h-[3px] w-12 transition-colors ${
              k === i ? "bg-hazard" : "bg-hairline-bright hover:bg-steel"
            }`}
          />
        ))}
      </div>

      {/* Everything the animation says, for anyone who cannot watch it go round. */}
      <ul className="sr-only">
        {ANSWERS.map((c) => <li key={c.n}>{c.tag}. {c.h} {c.p}</li>)}
      </ul>
    </div>
  )
}
