import { NavLink, Route, Routes, useLocation } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"
import ValueLedger from "@/components/ValueLedger"
import ErrorBoundary from "@/components/ErrorBoundary"
import AlertBell from "@/components/AlertBell"
import Landing from "@/pages/Landing"
import FleetBoard from "@/pages/FleetBoard"
import AssetPanel from "@/pages/AssetPanel"
import Scan from "@/pages/Scan"
import Settings from "@/pages/Settings"

const NAV = [
  { to: "/fleet", label: "Fleet" },
  { to: "/scan", label: "Scan" },
  { to: "/settings", label: "Settings" },
]

function Chrome({ children }: { children: React.ReactNode }) {
  const { data: ledger } = useQuery({ queryKey: ["ledger"], queryFn: api.ledger })
  const { data: health } = useQuery({ queryKey: ["health"], queryFn: api.health })
  const { data: alerts } = useQuery({ queryKey: ["alerts"], queryFn: api.alerts })

  return (
    <div className="min-h-screen bg-ground">
      {/* Keyboard users otherwise tab through the whole nav on every screen before
          reaching the board. Visually hidden until focused. */}
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:border focus:border-hazard focus:bg-ground focus:px-4 focus:py-2 focus:font-mono focus:text-[12px] focus:text-hazard"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-hairline bg-ground/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3">
          <NavLink to="/" className="flex items-baseline gap-2.5">
            <span className="text-[15px] font-bold tracking-tight text-chalk">
              SMART RENTAL
            </span>
            <span className="h-3 w-px bg-hairline-bright" />
            <span className="label">dealer console</span>
          </NavLink>

          <nav className="flex items-center gap-1">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  cn(
                    "border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors",
                    isActive
                      ? "border-hazard/60 bg-hazard/10 text-hazard"
                      : "border-transparent text-slate hover:border-hairline-bright hover:text-chalk",
                  )
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-5">
            <span className="label hidden sm:inline">
              clock <span className="text-steel">{health?.now ?? "—"}</span>
            </span>
            <AlertBell alerts={alerts} />
            <ValueLedger ledger={ledger} compact />
          </div>
        </div>
      </header>

      <main id="content" tabIndex={-1} className="mx-auto max-w-[1400px] px-5 py-7">
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>

      <footer className="border-t border-hairline px-5 py-5">
        <div className="mx-auto flex max-w-[1400px] flex-wrap justify-between gap-3">
          <span className="label">
            status is projected from an append-only event log — never stored
          </span>
          <span className="label">{api.base}</span>
        </div>
      </footer>
    </div>
  )
}

export default function App() {
  const { pathname } = useLocation()
  if (pathname === "/") return (
    <ErrorBoundary label="Landing">
      <Landing />
    </ErrorBoundary>
  )

  return (
    <Chrome>
      <Routes>
        <Route path="/fleet" element={<FleetBoard />} />
        <Route path="/asset/:id" element={<AssetPanel />} />
        <Route path="/scan" element={<Scan />} />
        <Route path="/settings" element={<Settings />} />
        <Route
          path="*"
          element={<p className="label py-20 text-center">no such screen</p>}
        />
      </Routes>
    </Chrome>
  )
}
