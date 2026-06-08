import React, { useEffect, useState, useRef } from 'react'
import { Server, Bot, ArrowRight, AlertTriangle, Activity, TrendingUp, TrendingDown,
         Wifi, Clock, Zap, Shield, Cloud, DollarSign, RefreshCw, ChevronRight,
         Database, GitBranch, Cpu, HardDrive } from 'lucide-react'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
         ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts'
import useStore from '@/store/useStore'
import useCloudStore from '@/store/useCloudStore'
import { getProviderColor, getCpuColor } from '@/utils/helpers'

// ── Animated counter ──────────────────────────────────────────────────────────
function AnimatedNumber({ value, prefix = '', suffix = '', decimals = 0 }) {
  const [display, setDisplay] = useState(0)
  const ref = useRef(null)
  useEffect(() => {
    const target = parseFloat(value) || 0
    const start  = display
    const diff   = target - start
    const duration = 600
    const startTime = performance.now()
    const tick = (now) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(start + diff * eased)
      if (progress < 1) ref.current = requestAnimationFrame(tick)
    }
    ref.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(ref.current)
  }, [value])
  return <span>{prefix}{decimals > 0 ? display.toFixed(decimals) : Math.round(display)}{suffix}</span>
}

// ── Sparkline ──────────────────────────────────────────────────────────────────
function Sparkline({ data, dataKey, color, height = 36 }) {
  if (!data?.length) return <div style={{ height }} />
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ── Gauge arc (SVG) ───────────────────────────────────────────────────────────
function GaugeArc({ value, color, label, size = 90 }) {
  const pct   = Math.min(100, Math.max(0, value))
  const r     = (size - 14) / 2
  const cx    = size / 2
  const cy    = size / 2
  const circ  = 2 * Math.PI * r
  const dash  = (pct / 100) * circ
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e293b" strokeWidth={10} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={10}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dasharray 0.9s cubic-bezier(0.4,0,0.2,1)' }} />
        <text x="50%" y="48%" dominantBaseline="middle" textAnchor="middle"
          fontSize={size < 80 ? 13 : 16} fontWeight="700" fill={color}>
          {Math.round(pct)}%
        </text>
        <text x="50%" y="65%" dominantBaseline="middle" textAnchor="middle"
          fontSize={9} fill="#64748b">{label}</text>
      </svg>
    </div>
  )
}

// ── KPI card with sparkline ───────────────────────────────────────────────────
function KpiCard({ label, value, sub, color, icon: Icon, sparkData, sparkKey, prefix = '', suffix = '', decimals = 0, onClick }) {
  return (
    <div onClick={onClick}
      className={`bg-bg-secondary border border-white/10 rounded-2xl p-4 flex flex-col gap-2 relative overflow-hidden ${onClick ? 'cursor-pointer hover:border-white/20' : ''} transition-all group`}>
      {/* Glow */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none rounded-2xl"
        style={{ background: `radial-gradient(ellipse at top left, ${color}12 0%, transparent 60%)` }} />
      <div className="flex items-center justify-between relative">
        <span className="text-xs text-slate-400">{label}</span>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${color}20` }}>
          <Icon size={13} style={{ color }} />
        </div>
      </div>
      <div className="relative">
        <div className="text-2xl font-bold" style={{ color }}>
          <AnimatedNumber value={typeof value === 'number' ? value : parseFloat(value) || 0}
            prefix={prefix} suffix={suffix} decimals={decimals} />
        </div>
        {sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}
      </div>
      {sparkData?.length > 0 && (
        <div className="opacity-50">
          <Sparkline data={sparkData} dataKey={sparkKey || 'value'} color={color} height={32} />
        </div>
      )}
    </div>
  )
}

// ── Provider pill ─────────────────────────────────────────────────────────────
function ProviderPill({ provider, count, healthy, critical }) {
  const color = getProviderColor(provider)
  const pct   = count > 0 ? Math.round((healthy / count) * 100) : 0
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-bg-primary rounded-xl border border-white/5 hover:border-white/15 transition-colors">
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
      <span className="text-xs font-medium text-white">{provider}</span>
      <span className="text-[10px] text-slate-500 ml-1">{count}</span>
      <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden mx-1 min-w-[40px]">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
      </div>
      {critical > 0 && (
        <span className="text-[9px] font-mono text-red-400 bg-red-500/10 px-1 rounded">{critical}!</span>
      )}
    </div>
  )
}

// ── Live server row ───────────────────────────────────────────────────────────
function ServerRow({ server, source }) {
  const sc = { healthy:'#00d68f', warning:'#ffcc00', critical:'#ff3d71', stopped:'#6b7280', fluctuating:'#ff8c00' }
  const color = sc[server.status] || '#6b7280'
  const pc    = getProviderColor(server.provider)
  return (
    <tr className="border-b border-white/5 hover:bg-white/[0.03] transition-colors group">
      <td className="py-2.5 px-4">
        <div className="flex items-center gap-2.5">
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color, boxShadow: server.status === 'critical' ? `0 0 6px ${color}` : 'none' }} />
          <div>
            <p className="text-xs font-medium text-white group-hover:text-accent transition-colors">{server.name}</p>
            {server.public_ip
              ? <p className="text-[10px] font-mono text-slate-500">{server.public_ip}</p>
              : <p className="text-[10px] text-slate-600">{server.type}</p>}
          </div>
        </div>
      </td>
      <td className="py-2.5 px-2">
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border"
          style={{ color: pc, borderColor: `${pc}40`, background: `${pc}12` }}>{server.provider}</span>
      </td>
      <td className="py-2.5 px-2 text-[10px] text-slate-500 max-w-[90px] truncate">{server.region}</td>
      <td className="py-2.5 px-2 w-28">
        <div className="flex items-center gap-1.5">
          <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${Math.min(100,server.cpu||0)}%`, background: getCpuColor(server.cpu) }} />
          </div>
          <span className="text-[10px] font-mono w-7 text-right" style={{ color: getCpuColor(server.cpu) }}>{Math.round(server.cpu||0)}%</span>
        </div>
      </td>
      <td className="py-2.5 px-2 w-28">
        <div className="flex items-center gap-1.5">
          <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${Math.min(100,server.mem||0)}%`, background: getCpuColor(server.mem) }} />
          </div>
          <span className="text-[10px] font-mono w-7 text-right" style={{ color: getCpuColor(server.mem) }}>{Math.round(server.mem||0)}%</span>
        </div>
      </td>
      <td className="py-2.5 px-2">
        <span className="text-[10px] font-mono text-slate-500">{server.disk||0}%</span>
      </td>
      <td className="py-2.5 px-2">
        <span className="text-[10px]" style={{ color }}>
          {source === 'cloud' ? '☁' : '⬡'} {server.service || server.type || '—'}
        </span>
      </td>
      <td className="py-2.5 px-4">
        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border"
          style={{ color, borderColor: `${color}40`, background: `${color}12` }}>
          {server.status}
        </span>
      </td>
    </tr>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ setActiveNav }) {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center gap-8">
      <div className="text-center">
        <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-accent/20 to-blue-500/10 border border-accent/20 flex items-center justify-center mx-auto mb-6">
          <Cloud size={40} className="text-accent" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">No infrastructure connected</h2>
        <p className="text-slate-400 text-sm max-w-md">
          Connect a cloud account or deploy an agent to start monitoring your infrastructure in real time.
        </p>
      </div>
      <div className="flex items-center gap-4">
        <button onClick={() => setActiveNav('cloud-accounts')}
          className="flex items-center gap-2.5 px-5 py-3 bg-orange-600 hover:bg-orange-500 text-white rounded-xl font-medium text-sm transition-all hover:scale-105">
          <Cloud size={16} /> Connect AWS Account <ChevronRight size={14} />
        </button>
        <span className="text-slate-600 text-sm">or</span>
        <button onClick={() => setActiveNav('agents')}
          className="flex items-center gap-2.5 px-5 py-3 bg-bg-secondary border border-white/10 hover:border-accent/40 text-white rounded-xl font-medium text-sm transition-all hover:scale-105">
          <Bot size={16} /> Deploy Agent <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
export default function OverviewPage() {
  const { servers, alerts, trendData, incidents, getStats, setActiveNav, wsConnected, fetchAll, initialized } = useStore()
  const { accounts, getAllResources, getTotalCosts, getAllSecurity, getAllOptimisations, loadAllAccountData } = useCloudStore()

  const [history,  setHistory]  = useState([])
  const [loading,  setLoading]  = useState(false)
  const [lastRefresh, setLastRefresh] = useState(new Date())

  useEffect(() => {
    fetch('/api/history/overview?hours=24').then(r => r.json()).then(d => setHistory(d.points || []))
    loadAllAccountData()
  }, [])

  const cloudResources = getAllResources()
  const totalCosts     = getTotalCosts()
  const secFindings    = getAllSecurity()
  const optimisations  = getAllOptimisations()

  // Unified resource list: agent servers + cloud resources
  const allResources = [
    ...servers.map(s => ({ ...s, _source: 'agent' })),
    ...cloudResources.map(r => ({ ...r, _source: 'cloud' })),
  ]

  const hasData = allResources.length > 0

  const stats    = getStats()
  const active   = allResources.filter(r => r.status !== 'stopped' && r.status !== 'offline')
  const avgCpu   = active.length ? active.reduce((a, r) => a + (r.cpu || 0), 0) / active.length : 0
  const avgMem   = active.length ? active.reduce((a, r) => a + (r.mem || 0), 0) / active.length : 0
  const avgDisk  = active.length ? active.reduce((a, r) => a + (r.disk || 0), 0) / active.length : 0
  const critical = allResources.filter(r => r.status === 'critical')
  const warning  = allResources.filter(r => r.status === 'warning')
  const sla      = allResources.length > 0
    ? ((allResources.filter(r => r.status === 'healthy').length / allResources.length) * 100)
    : 100

  const openInc = incidents.filter(i => ['open','investigating'].includes(i.status)).length

  // Providers from all sources
  const providers = [...new Set(allResources.map(r => r.provider))]
  const providerGroups = providers.map(p => {
    const ps = allResources.filter(r => r.provider === p)
    return { provider: p, count: ps.length, healthy: ps.filter(r => r.status === 'healthy').length, critical: ps.filter(r => r.status === 'critical').length }
  })

  // Status pie data
  const statusPie = [
    { name: 'Healthy',     value: allResources.filter(r => r.status === 'healthy').length,     color: '#00d68f' },
    { name: 'Warning',     value: allResources.filter(r => r.status === 'warning').length,     color: '#ffcc00' },
    { name: 'Critical',    value: allResources.filter(r => r.status === 'critical').length,    color: '#ff3d71' },
    { name: 'Fluctuating', value: allResources.filter(r => r.status === 'fluctuating').length, color: '#ff8c00' },
    { name: 'Stopped',     value: allResources.filter(r => r.status === 'stopped').length,     color: '#6b7280' },
  ].filter(d => d.value > 0)

  // Service breakdown
  const serviceGroups = [...new Set(cloudResources.map(r => r.service || r.type).filter(Boolean))].map(svc => ({
    name: svc,
    count: cloudResources.filter(r => (r.service || r.type) === svc).length,
  }))

  // Chart data — prefer history, fall back to trendData
  const chartData = history.length > 0 ? history : trendData

  const refresh = async () => {
    setLoading(true)
    await Promise.all([fetchAll(), loadAllAccountData()])
    setLastRefresh(new Date())
    setLoading(false)
  }

  // Show empty state only after initial load completes — prevents flicker
  if (initialized && !hasData) return <EmptyState setActiveNav={setActiveNav} />
  if (!initialized && !hasData) return (
    <div className="flex items-center justify-center py-24">
      <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-4 animate-fade-in">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-white">Global Operations</h1>
          <span className="text-[10px] font-mono text-slate-500 bg-bg-secondary px-2 py-1 rounded-lg border border-white/10">
            {allResources.length} resources · {providers.length} providers
          </span>
          {accounts.filter(a => a.status === 'active').length > 0 && (
            <span className="text-[10px] text-orange-400 bg-orange-500/10 border border-orange-500/20 px-2 py-1 rounded-lg font-medium">
              ☁ {accounts.filter(a => a.status === 'active').length} cloud account{accounts.filter(a => a.status === 'active').length > 1 ? 's' : ''}
            </span>
          )}
          {servers.length > 0 && (
            <span className="text-[10px] text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-1 rounded-lg font-medium">
              ⬡ {servers.length} agent{servers.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-slate-500 font-mono">
            Refreshed {lastRefresh.toLocaleTimeString()}
          </span>
          <button onClick={refresh} disabled={loading}
            className="p-2 rounded-xl border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-40">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── Row 1: KPI strip (7 cards) ── */}
      <div className="grid grid-cols-7 gap-3">
        <KpiCard label="Total Resources"  value={allResources.length} color="#00b4d8" icon={Server}
          sub={`${cloudResources.length} cloud · ${servers.length} agent`}
          sparkData={chartData} sparkKey="cpu" />
        <KpiCard label="Healthy"          value={allResources.filter(r=>r.status==='healthy').length} color="#00d68f" icon={Activity}
          sub={`${sla.toFixed(1)}% SLA`} sparkData={chartData} sparkKey="cpu" />
        <KpiCard label="Critical"         value={critical.length} color="#ff3d71" icon={Zap}
          sub="immediate action" sparkData={chartData} sparkKey="critical" />
        <KpiCard label="Warnings"         value={warning.length}  color="#ffcc00" icon={AlertTriangle}
          sub="needs attention" sparkData={chartData} sparkKey="warning" />
        <KpiCard label="Active Alerts"    value={alerts.length}   color="#f97316" icon={Shield}
          sub={`${stats.criticalAlerts} critical`} />
        <KpiCard label="Open Incidents"   value={openInc}         color="#a78bfa" icon={Clock}
          sub="open/investigating" />
        <KpiCard label="Cost MTD"         value={totalCosts.total_mtd || 0} prefix="$" decimals={2}
          color="#34d399" icon={DollarSign}
          sub={totalCosts.forecast ? `$${totalCosts.forecast.toFixed(0)} forecast` : 'No billing data'}
          sparkData={totalCosts.daily?.slice(-14)} sparkKey="cost" />
      </div>

      {/* ── Row 2: SLA + gauges | Performance chart | Status + providers ── */}
      <div className="grid grid-cols-12 gap-4">

        {/* SLA panel */}
        <div className="col-span-3 bg-bg-secondary border border-white/10 rounded-2xl p-5 flex flex-col gap-4">
          <div className="text-center relative">
            {/* Big SLA number */}
            <p className="text-[10px] text-slate-500 tracking-widest uppercase mb-1">SLA Compliance</p>
            <div className="relative inline-flex items-end justify-center">
              <span className={`text-5xl font-bold font-mono leading-none ${sla >= 99.9 ? 'text-green-400' : sla >= 99 ? 'text-yellow-400' : 'text-red-400'}`}>
                {sla.toFixed(2)}
              </span>
              <span className="text-xl text-slate-500 mb-0.5">%</span>
            </div>
            <p className="text-[10px] text-slate-600 mt-1">
              {allResources.filter(r=>r.status==='healthy').length} healthy / {allResources.length} total
            </p>
          </div>
          <div className="flex justify-around border-t border-white/10 pt-4">
            <GaugeArc value={avgCpu}  color={avgCpu>80?'#ff3d71':avgCpu>60?'#ffcc00':'#00b4d8'} label="CPU"  size={80} />
            <GaugeArc value={avgMem}  color={avgMem>80?'#ff3d71':avgMem>60?'#ffcc00':'#00d68f'} label="MEM"  size={80} />
            <GaugeArc value={avgDisk} color={avgDisk>85?'#ff3d71':avgDisk>70?'#ffcc00':'#8b5cf6'} label="DISK" size={80} />
          </div>
          <div className="grid grid-cols-3 gap-2 border-t border-white/10 pt-3">
            {[
              { label: 'Providers', value: providers.length },
              { label: 'Regions',   value: [...new Set(allResources.map(r=>r.region).filter(Boolean))].length },
              { label: 'Services',  value: [...new Set(allResources.map(r=>r.service||r.type).filter(Boolean))].length },
            ].map(s => (
              <div key={s.label} className="text-center bg-bg-primary rounded-lg p-2">
                <p className="text-[10px] text-slate-500">{s.label}</p>
                <p className="text-lg font-bold text-white">{s.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Performance chart */}
        <div className="col-span-6 bg-bg-secondary border border-white/10 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Fleet Performance — 24h</h3>
              <p className="text-[11px] text-slate-500">Average CPU · Memory · Alert count</p>
            </div>
            <div className="flex gap-3 text-[10px]">
              {[['CPU','#00b4d8'],['MEM','#00d68f'],['Critical','#ff3d71'],['Warning','#ffcc00']].map(([k,c]) => (
                <span key={k} className="flex items-center gap-1">
                  <span className="w-3 h-0.5 inline-block rounded" style={{ background: c }} />
                  <span className="text-slate-400">{k}</span>
                </span>
              ))}
            </div>
          </div>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={185}>
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  {[['cpu','#00b4d8'],['mem','#00d68f'],['critical','#ff3d71'],['warning','#ffcc00']].map(([k,c]) => (
                    <linearGradient key={k} id={`ov_${k}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={c} stopOpacity={0.4} />
                      <stop offset="95%" stopColor={c} stopOpacity={0}   />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff06" />
                <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#475569' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 9, fill: '#475569' }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: '#0a0e1a', border: '1px solid #1e293b', borderRadius: 10, fontSize: 11 }} labelStyle={{ color: '#94a3b8' }} />
                <Area type="monotone" dataKey="cpu"      name="CPU %"    stroke="#00b4d8" strokeWidth={2} fill="url(#ov_cpu)"      dot={false} />
                <Area type="monotone" dataKey="mem"      name="MEM %"    stroke="#00d68f" strokeWidth={2} fill="url(#ov_mem)"      dot={false} />
                <Area type="monotone" dataKey="critical" name="Critical" stroke="#ff3d71" strokeWidth={1.5} fill="url(#ov_critical)" dot={false} />
                <Area type="monotone" dataKey="warning"  name="Warning"  stroke="#ffcc00" strokeWidth={1.5} fill="url(#ov_warning)"  dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-44 flex items-center justify-center text-slate-600 text-sm">Accumulating history…</div>
          )}
        </div>

        {/* Status pie + provider pills */}
        <div className="col-span-3 bg-bg-secondary border border-white/10 rounded-2xl p-5 flex flex-col gap-4">
          <div>
            <h3 className="text-sm font-semibold text-white mb-2">Status</h3>
            <div className="flex items-center gap-3">
              <ResponsiveContainer width={90} height={90}>
                <PieChart>
                  <Pie data={statusPie} cx="50%" cy="50%" innerRadius={24} outerRadius={42} paddingAngle={4} dataKey="value">
                    {statusPie.map((e,i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#0a0e1a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 flex-1">
                {statusPie.map(d => (
                  <div key={d.name} className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                      <span className="text-slate-400">{d.name}</span>
                    </div>
                    <span className="font-mono font-bold" style={{ color: d.color }}>{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="flex-1">
            <h3 className="text-[11px] font-semibold text-slate-400 mb-2 uppercase tracking-wider">By Provider</h3>
            <div className="space-y-1.5">
              {providerGroups.map(p => <ProviderPill key={p.provider} {...p} />)}
            </div>
          </div>
        </div>
      </div>

      {/* ── Row 3: Cost + Critical + Alerts ── */}
      <div className="grid grid-cols-12 gap-4">

        {/* Cost spend bar (if billing data exists) */}
        {totalCosts.daily?.length > 0 && (
          <div className="col-span-4 bg-bg-secondary border border-white/10 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-white">Daily Cloud Spend</h3>
                <p className="text-[11px] text-slate-500">Last 14 days across all accounts</p>
              </div>
              <span className="text-sm font-bold text-green-400">${totalCosts.total_mtd?.toFixed(2) || '0'} MTD</span>
            </div>
            <ResponsiveContainer width="100%" height={110}>
              <BarChart data={totalCosts.daily.slice(-14)} barSize={8} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff06" />
                <XAxis dataKey="date" tickFormatter={v => v.slice(5)} tick={{ fontSize: 8, fill: '#475569' }} tickLine={false} axisLine={false} interval={3} />
                <YAxis tick={{ fontSize: 8, fill: '#475569' }} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} />
                <Tooltip contentStyle={{ background: '#0a0e1a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 11 }} formatter={v => [`$${v}`, 'Cost']} />
                <Bar dataKey="cost" fill="#34d399" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
            {totalCosts.by_service?.length > 0 && (
              <div className="mt-3 space-y-1.5 border-t border-white/10 pt-3">
                {totalCosts.by_service.slice(0,3).map((s,i) => {
                  const max = totalCosts.by_service[0].cost
                  const colors = ['#FF9900','#00b4d8','#00d68f']
                  return (
                    <div key={s.service} className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400 truncate w-28">{s.service.replace('Amazon ','').replace('AWS ','')}</span>
                      <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(s.cost/max)*100}%`, background: colors[i] }} />
                      </div>
                      <span className="text-[10px] font-mono text-white w-12 text-right">${s.cost.toFixed(2)}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Critical resources */}
        <div className={`${totalCosts.daily?.length > 0 ? 'col-span-4' : 'col-span-6'} bg-bg-secondary border border-white/10 rounded-2xl p-5`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">Critical Resources</h3>
            <span className="text-xs font-mono text-red-400 bg-red-500/10 px-2 py-0.5 rounded-lg border border-red-500/20">{critical.length}</span>
          </div>
          {critical.length === 0 ? (
            <div className="flex flex-col items-center py-6 gap-2">
              <Activity size={20} className="text-green-400" />
              <p className="text-green-400 text-sm font-medium">All resources healthy</p>
            </div>
          ) : (
            <div className="space-y-2">
              {critical.slice(0, 5).map(r => (
                <div key={r.id} className="flex items-center gap-3 p-2.5 bg-red-500/5 border border-red-500/15 rounded-xl">
                  <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white truncate">{r.name}</p>
                    <p className="text-[10px] text-slate-500">{r.public_ip || r.provider} · {r.region}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[10px] font-mono text-red-400">CPU {Math.round(r.cpu||0)}%</p>
                    <p className="text-[10px] font-mono text-orange-400">MEM {Math.round(r.mem||0)}%</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Active alerts */}
        <div className={`${totalCosts.daily?.length > 0 ? 'col-span-4' : 'col-span-6'} bg-bg-secondary border border-white/10 rounded-2xl p-5`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">Active Alerts</h3>
            <span className="text-xs font-mono text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-lg border border-orange-500/20">{alerts.length}</span>
          </div>
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center py-6 gap-2">
              <Shield size={20} className="text-green-400" />
              <p className="text-green-400 text-sm font-medium">No active alerts</p>
            </div>
          ) : (
            <div className="space-y-2">
              {alerts.slice(0, 5).map(a => (
                <div key={a.id} className="flex items-start gap-2.5 p-2.5 bg-bg-primary rounded-xl border border-white/5">
                  <span className={`w-2 h-2 rounded-full mt-1 shrink-0 ${a.severity==='critical'?'bg-red-400 animate-pulse':'bg-yellow-400'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-white truncate">{a.title}</p>
                    <p className="text-[10px] text-slate-500 truncate">{a.resource}</p>
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${a.severity==='critical'?'border-red-500/30 text-red-400 bg-red-500/10':'border-yellow-500/30 text-yellow-400 bg-yellow-500/10'}`}>
                    {a.severity}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Row 4: Security findings (if cloud accounts) ── */}
      {secFindings.length > 0 && (
        <div className="bg-bg-secondary border border-red-500/20 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Shield size={15} className="text-red-400" />
              <h3 className="text-sm font-semibold text-white">Security Findings</h3>
              <span className="text-[10px] bg-red-500/15 text-red-400 border border-red-500/25 px-2 py-0.5 rounded-lg font-mono">{secFindings.length} active</span>
            </div>
            <button onClick={() => setActiveNav('cloud-accounts')} className="text-[11px] text-accent hover:underline flex items-center gap-1">
              View all <ChevronRight size={11} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {secFindings.slice(0, 4).map(f => (
              <div key={f.id} className="flex items-start gap-2.5 p-3 bg-bg-primary rounded-xl border border-white/5">
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border shrink-0 mt-0.5 ${
                  f.severity==='CRITICAL'?'border-red-500/30 text-red-400 bg-red-500/10':
                  f.severity==='HIGH'?'border-orange-500/30 text-orange-400 bg-orange-500/10':
                  'border-yellow-500/30 text-yellow-400 bg-yellow-500/10'
                }`}>{f.severity}</span>
                <div className="min-w-0">
                  <p className="text-xs text-white truncate">{f.title}</p>
                  <p className="text-[10px] text-slate-500 truncate">{f.resource}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Row 5: Live unified resource table ── */}
      <div className="bg-bg-secondary border border-white/10 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
          <div>
            <h3 className="text-sm font-semibold text-white">Unified Resource Table</h3>
            <p className="text-[11px] text-slate-500">
              {allResources.length} resources — ☁ cloud API · ⬡ agent
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-green-400 animate-pulse' : 'bg-slate-600'}`} />
            <span className="text-[10px] text-slate-400">{wsConnected ? 'Live' : 'Polling'}</span>
          </div>
        </div>
        <div className="overflow-x-auto max-h-80 overflow-y-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-bg-secondary z-10">
              <tr className="text-[10px] text-slate-500 border-b border-white/10">
                <th className="text-left py-2 px-4 font-medium">Resource / IP</th>
                <th className="text-left py-2 px-2 font-medium">Provider</th>
                <th className="text-left py-2 px-2 font-medium">Region</th>
                <th className="text-left py-2 px-2 font-medium w-28">CPU</th>
                <th className="text-left py-2 px-2 font-medium w-28">Memory</th>
                <th className="text-left py-2 px-2 font-medium">Disk</th>
                <th className="text-left py-2 px-2 font-medium">Service</th>
                <th className="text-left py-2 px-4 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {allResources.map(r => <ServerRow key={`${r._source}-${r.id}`} server={r} source={r._source} />)}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
