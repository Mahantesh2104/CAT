import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { Html5Qrcode } from "html5-qrcode"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"
import StatusPill from "@/components/StatusPill"

const READER_ID = "qr-reader"

/**
 * The phone view. Camera reads a printed tag, two taps to check in or out.
 *
 * Manual entry sits directly beside the camera rather than behind a fallback link -
 * venue wifi and camera permissions fail often enough that the demo must not depend
 * on either.
 */
export default function Scan() {
  const nav = useNavigate()
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const [scanning, setScanning] = useState(false)
  const [code, setCode] = useState("")
  const [manual, setManual] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: detail, refetch } = useQuery({
    queryKey: ["asset", code],
    queryFn: () => api.asset(code),
    enabled: code.length > 0,
    retry: false,
  })

  /**
   * html5-qrcode throws SYNCHRONOUSLY ("Cannot stop, scanner is not running or paused")
   * when stop() is called on a scanner that never started — and a synchronous throw is
   * not caught by .catch(). Unmounting this page after only viewing it therefore crashed
   * the entire React tree, blanking every screen navigated to from here. Always stop
   * through this helper.
   */
  function safeStop() {
    const scanner = scannerRef.current
    if (!scanner) return
    try {
      const result = scanner.stop()
      if (result && typeof result.catch === "function") result.catch(() => {})
    } catch {
      /* never started — nothing to stop */
    }
  }

  useEffect(() => safeStop, [])

  async function startCamera() {
    setError(null)
    try {
      const scanner = new Html5Qrcode(READER_ID)
      scannerRef.current = scanner
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 230, height: 230 } },
        (decoded) => {
          setCode(decoded.trim())
          safeStop()
          setScanning(false)
        },
        () => {},
      )
      setScanning(true)
    } catch {
      setError("Camera unavailable. Use manual entry below — it does the same thing.")
    }
  }

  async function act(kind: "IN" | "OUT") {
    if (!code) return
    setBusy(kind)
    setError(null)
    try {
      if (kind === "OUT") {
        await api.checkout(code, "scan")
        setMessage(`${code} checked out`)
      } else {
        await api.checkin(code, detail?.asset.condition_grade ?? "B", "scan", "Returned via QR scan")
        setMessage(`${code} checked in — condition recorded`)
      }
      await refetch()
    } catch (err) {
      setError(err instanceof Error ? err.message : "action failed")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto flex max-w-[560px] flex-col gap-5">
      <header>
        <h1 className="text-[24px] font-bold tracking-tight text-chalk">Scan a machine</h1>
        <p className="mt-1.5 text-[14px] text-steel">
          Point the camera at a printed tag, or type the ID. Two taps to check in or out.
        </p>
      </header>

      <div className="relative overflow-hidden border border-hairline bg-surface">
        <div id={READER_ID} className="min-h-[240px] w-full [&_video]:w-full [&_video]:object-cover" />
        {!scanning && (
          <div className="blueprint absolute inset-0 flex flex-col items-center justify-center gap-4">
            <p className="label">camera idle</p>
            <button
              onClick={startCamera}
              className="border border-hazard bg-hazard px-5 py-2.5 font-mono text-[12px] font-semibold uppercase tracking-[0.14em] text-ground"
            >
              Start camera
            </button>
          </div>
        )}
        {scanning && (
          <div className="pointer-events-none absolute inset-0">
            <div
              className="absolute inset-x-0 h-px bg-hazard/70"
              style={{ animation: "scan-sweep 2.2s ease-in-out infinite" }}
            />
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <input
          value={manual}
          onChange={(e) => setManual(e.target.value.toUpperCase())}
          placeholder="EQX1007"
          className="w-full border border-hairline bg-ground px-3 py-2.5 font-mono text-[14px] text-chalk outline-none focus:border-hazard"
        />
        <button
          onClick={() => setCode(manual.trim())}
          className="shrink-0 border border-hairline-bright px-5 py-2.5 font-mono text-[12px] uppercase tracking-[0.14em] text-chalk hover:border-hazard hover:text-hazard"
        >
          Look up
        </button>
      </div>

      {error && (
        <p className="border border-critical/40 bg-critical/10 px-4 py-3 text-[12.5px] text-critical">{error}</p>
      )}
      {message && (
        <p className="border border-nominal/40 bg-nominal/10 px-4 py-3 text-[12.5px] text-nominal">{message}</p>
      )}

      {detail && (
        <section className="border border-hairline bg-surface">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-4">
            <div>
              <p className="num text-[20px] font-bold text-chalk">{detail.asset.equipment_id}</p>
              <p className="mt-1 text-[13px] text-steel">
                {detail.asset.type} · {detail.asset.model}
              </p>
            </div>
            <StatusPill status={detail.status} />
          </header>

          <div className="grid grid-cols-2 gap-px bg-hairline">
            <button
              onClick={() => act("OUT")}
              disabled={busy !== null}
              className={cn(
                "bg-surface px-4 py-5 text-[15px] font-semibold text-chalk transition-colors",
                "hover:bg-raised hover:text-hazard disabled:opacity-40",
              )}
            >
              {busy === "OUT" ? "working…" : "Check out"}
            </button>
            <button
              onClick={() => act("IN")}
              disabled={busy !== null}
              className={cn(
                "bg-surface px-4 py-5 text-[15px] font-semibold text-chalk transition-colors",
                "hover:bg-raised hover:text-hazard disabled:opacity-40",
              )}
            >
              {busy === "IN" ? "working…" : "Check in"}
            </button>
          </div>

          {detail.signals.length > 0 && (
            <p className="border-t border-hairline px-5 py-3 text-[12.5px] text-critical">
              {detail.signals.length} rule{detail.signals.length > 1 ? "s" : ""} firing on this
              machine.{" "}
              <button
                onClick={() => nav(`/asset/${detail.asset.equipment_id}`)}
                className="underline underline-offset-2 hover:text-hazard"
              >
                Open the full panel
              </button>
            </p>
          )}
        </section>
      )}

      <p className="label leading-relaxed">
        every scan writes one event to the append-only log — simple, but traceable
      </p>
    </div>
  )
}
