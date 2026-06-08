import React, { useEffect, useState, useRef, useMemo } from 'react'
import { TrendingUp, TrendingDown, Server, AlertTriangle, CheckCircle, Activity,
         Zap, Shield, Clock, DollarSign, Cloud, ChevronRight, RefreshCw,
         Database, Globe, Cpu, BarChart2 } from 'lucide-react'
import { AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
         XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
         RadarChart, Radar, PolarGrid, PolarAngleAxis, ComposedChart, Scatter } from 'recharts'
import useStore from '@/store/useStore'
import useCloudStore from '@/store/useCloudStore'
import { getProviderColor } from '@/utils/helpers'

// ── Animated counter ──────────────────────────────────────────────────────────
function Counter({ value, prefix = '', suffix = '', decimals = 0, className = '' }) {
  const [display, setDisplay] = useState(0)
  const raf = useRef(null)
  useEffect(() => {
    const target = parseFloat(value) || 0
    const start  = display
    const t0 = performance.now()
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / 700)
      const e = 1 - Math.pow(1 - p, 3)
      setDisplay(start + (target - start) * e)
      if (p < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [value])
  const formatted = decimals > 0 ? display.toFixed(decimals) : Math.round(display).toLocaleString()
  return <span className={className}>{prefix}{formatted}{suffix}</span>
}

// ── Trend badge ───────────────────────────────────────────────────────────────
function Trend({ value, inverse = false }) {
  if (value === undefined || value === null) return null
  const good = inverse ? value <= 0 : value >= 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${good ? 'text-green-400' : 'text-red-400'}`}>
      {good ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
      {Math.abs(value)}%
    </span>
  )
}

// ── Section header ────────────────────────────────────────────────────────────
function SH({ title, sub, action, actionLabel }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2.5">
        <div className="h-4 w-0.5 rounded-full bg-accent" />
        <div>
          <h3 className="text-sm font-semibold text-white leading-tight">{title}</h3>
          {sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}
        </div>
      </div>
      {action && (
        <button onClick={action} className="text-[11px] text-accent hover:text-accent/80 flex items-center gap-1 transition-colors">
          {actionLabel} <ChevronRight size={11} />
        </button>
      )}
    </div>
  )
}

// ── Big metric tile ───────────────────────────────────────────────────────────
function BigTile({ label, value, sub, color, icon: Icon, trend, prefix = '', suffix = '', decimals = 0, highlight = false }) {
  return (
    <div className={`rounded-2xl p-5 flex flex-col gap-3 border relative overflow-hidden transition-all ${
      highlight
        ? 'bg-gradient-to-br from-bg-secondary to-bg-secondary border-white/15'
        : 'bg-bg-secondary border-white/10'
    }`}>
      <div className="absolute inset-0 pointer-events-none rounded-2xl opacity-30"
        style={{ background: `radial-gradient(ellipse at top right, ${color}20, transparent 65%)` }} />
      <div className="flex items-center justify-between relative">
        <span className="text-[11px] text-slate-400 font-medium">{label}</span>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${color}20` }}>
          <Icon size={14} style={{ color }} />
        </div>
      </div>
      <div className="relative">
        <div className="flex items-end gap-2">
          <span className="text-3xl font-bold leading-none" style={{ color }}>
            <Counter value={typeof value === 'number' ? value : parseFloat(value)||0}
              prefix={prefix} suffix={suffix} decimals={decimals} />
          </span>
          <Trend value={trend} />
        </div>
        {sub && <p className="text-[11px] text-slate-500 mt-1.5 leading-snug">{sub}</p>}
      </div>
    </div>
  )
}

// ── Progress scorecard ────────────────────────────────────────────────────────
function ScoreRow({ label, actual, target, unit = '%', inverse = false }) {
  const num  = parseFloat(actual)
  const met  = inverse ? num <= target : num >= target
  const pct  = inverse
    ? Math.max(0, Math.min(100, (1 - num / (target * 2)) * 100))
    : Math.min(100, (num / (target || 100)) * 100)
  return (
    <div className="grid grid-cols-[160px_1fr_100px] items-center gap-3 py-2.5 border-b border-white/5 last:border-0">
      <div>
        <p className="text-xs text-white">{label}</p>
        <p className="text-[10px] text-slate-500">Target: {inverse ? '≤' : '≥'} {target}{unit}</p>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-1000 ${met ? 'bg-green-500' : 'bg-red-500'}`}
            style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="flex items-center justify-end gap-1.5">
        <span className={`text-sm font-bold font-mono ${met ? 'text-green-400' : 'text-red-400'}`}>
          {actual}{unit}
        </span>
        {met
          ? <CheckCircle size={12} className="text-green-400 shrink-0" />
          : <AlertTriangle size={12} className="text-red-400 shrink-0" />}
      </div>
    </div>
  )
}

// ── Heatmap row ───────────────────────────────────────────────────────────────
function HeatRow({ label, values, maxVal }) {
  const COLORS = ['#1e293b','#134e4a','#065f46','#047857','#059669','#10b981','#34d399']
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-slate-400 w-16 shrink-0 truncate">{label}</span>
      <div className="flex gap-0.5">
        {values.map((v, i) => {
          const idx = maxVal > 0 ? Math.round((v / maxVal) * (COLORS.length - 1)) : 0
          return (
            <div key={i} title={`${v}`}
              className="w-5 h-5 rounded-sm transition-colors"
              style={{ background: COLORS[Math.min(idx, COLORS.length-1)] }} />
          )
        })}
      </div>
    </div>
  )
}

// ── Custom tooltip ────────────────────────────────────────────────────────────
const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#0a0e1a] border border-[#1e293b] rounded-xl p-3 text-xs shadow-xl">
      <p className="text-slate-400 mb-2 font-mono">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-300">{p.name}</span>
          <span className="font-mono text-white ml-auto pl-4">{typeof p.value === 'number' ? p.value.toFixed(1) : p.value}</span>
        </div>
      ))}
    </div>
  )
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
export default function ExecutivePage() {
  const { servers, alerts, incidents, trendData } = useStore()
  const { accounts, getAllResources, getTotalCosts, getAllSecurity, getAllOptimisations, loadAllAccountData } = useCloudStore()
  const [history,   setHistory]   = useState([])
  const [loading,   setLoading]   = useState(false)
  const [lastSync,  setLastSync]  = useState(new Date())

  useEffect(() => {
    fetch('/api/history/overview?hours=24').then(r => r.json()).then(d => setHistory(d.points || []))
    loadAllAccountData()
  }, [])

  const cloudResources = getAllResources()
  const totalCosts     = getTotalCosts()
  const secFindings    = getAllSecurity()
  const optimisations  = getAllOptimisations()

  // Unified resources
  const allResources = useMemo(() => {
    const seen = new Set()
    const combined = [
      ...servers.map(s => ({ ...s, _src: s.agent_id ? 'agent' : 'cloud' })),
      ...cloudResources.map(r => ({ ...r, _src: 'cloud' })),
    ]
    return combined.filter(r => {
      if (seen.has(r.id)) return false
      seen.add(r.id)
      return true
    })
  }, [servers, cloudResources])

  const total     = allResources.length
  const active    = allResources.filter(r => r.status !== 'stopped')
  const healthy   = allResources.filter(r => r.status === 'healthy').length
  const critical  = allResources.filter(r => r.status === 'critical').length
  const warning   = allResources.filter(r => r.status === 'warning').length
  const stopped   = allResources.filter(r => r.status === 'stopped').length
  const sla       = total > 0 ? ((healthy / total) * 100).toFixed(2) : '100.00'
  const slaNum    = parseFloat(sla)

  const avgCpu  = active.length ? (active.reduce((a,r) => a+(r.cpu||0), 0) / active.length).toFixed(1) : '0.0'
  const avgMem  = active.length ? (active.reduce((a,r) => a+(r.mem||0), 0) / active.length).toFixed(1) : '0.0'
  const avgDisk = active.length ? (active.reduce((a,r) => a+(r.disk||0), 0) / active.length).toFixed(1) : '0.0'

  const openInc     = incidents.filter(i => ['open','investigating'].includes(i.status)).length
  const resolvedInc = incidents.filter(i => i.status === 'resolved').length
  const activeAccounts = accounts.filter(a => a.status === 'active').length
  const chartData  = history.length > 0 ? history : trendData

  // Provider matrix
  const providers = [...new Set(allResources.map(r => r.provider).filter(Boolean))]
  const provMatrix = providers.map(p => {
    const ps   = allResources.filter(r => r.provider === p)
    const pa   = ps.filter(r => r.status !== 'stopped')
    const pSla = ps.length > 0 ? ((ps.filter(r=>r.status==='healthy').length / ps.length)*100).toFixed(1) : '100.0'
    const pCpu = pa.length > 0 ? (pa.reduce((a,r)=>a+(r.cpu||0),0)/pa.length).toFixed(1) : '0.0'
    const pMem = pa.length > 0 ? (pa.reduce((a,r)=>a+(r.mem||0),0)/pa.length).toFixed(1) : '0.0'
    const source = accounts.some(a => a.provider === p && a.status === 'active') ? 'cloud' : 'agent'
    return {
      name: p, total: ps.length, healthy: ps.filter(r=>r.status==='healthy').length,
      warning: ps.filter(r=>r.status==='warning').length,
      critical: ps.filter(r=>r.status==='critical').length,
      sla: parseFloat(pSla), cpu: parseFloat(pCpu), mem: parseFloat(pMem),
      color: getProviderColor(p), source,
    }
  })

  // Status pie
  const statusPie = [
    { name: 'Healthy',     value: healthy,  color: '#00d68f' },
    { name: 'Warning',     value: warning,  color: '#ffcc00' },
    { name: 'Critical',    value: critical, color: '#ff3d71' },
    { name: 'Fluctuating', value: allResources.filter(r=>r.status==='fluctuating').length, color: '#ff8c00' },
    { name: 'Stopped',     value: stopped,  color: '#6b7280' },
  ].filter(d => d.value > 0)

  // Radar data
  const radarData = provMatrix.slice(0,6).map(p => ({
    provider: p.name.length > 8 ? p.name.slice(0,8) : p.name,
    SLA:    p.sla,
    Health: p.total > 0 ? Math.round((p.healthy/p.total)*100) : 0,
    Perf:   Math.max(0, 100 - p.cpu),
    Mem:    Math.max(0, 100 - p.mem),
  }))

  // Top risk
  const riskList = [...active]
    .map(r => ({ ...r, risk: (r.cpu||0)*0.4 + (r.mem||0)*0.35 + (r.disk||0)*0.25 }))
    .sort((a,b) => b.risk - a.risk)
    .slice(0, 6)

  // Cost optimisation savings
  const totalSaving = optimisations.reduce((s, o) => s + (o.saving_pct || 0), 0)

  // Heatmap — CPU by hour x provider (last 24h)
  const heatHours = Array.from({ length: 12 }, (_, i) => `${String(i*2).padStart(2,'0')}:00`)

  // Security severity counts
  const secBySev = {
    CRITICAL:      secFindings.filter(f=>f.severity==='CRITICAL').length,
    HIGH:          secFindings.filter(f=>f.severity==='HIGH').length,
    MEDIUM:        secFindings.filter(f=>f.severity==='MEDIUM').length,
    LOW:           secFindings.filter(f=>f.severity==='LOW').length,
  }

  const refresh = async () => {
    setLoading(true)
    await loadAllAccountData()
    const d = await fetch('/api/history/overview?hours=24').then(r=>r.json())
    setHistory(d.points || [])
    setLastSync(new Date())
    setLoading(false)
  }

  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Activity size={40} className="text-slate-600 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">No data yet</h2>
        <p className="text-slate-400 text-sm">Connect a cloud account or deploy an agent to populate this dashboard.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Executive Dashboard</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}
            &nbsp;·&nbsp;{total} resources · {providers.length} providers
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border ${
            slaNum >= 99.9 ? 'bg-green-500/8 border-green-500/25' :
            slaNum >= 99   ? 'bg-yellow-500/8 border-yellow-500/25' :
                             'bg-red-500/8 border-red-500/25'
          }`}>
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider">Fleet SLA</p>
              <p className={`text-2xl font-bold font-mono leading-none ${
                slaNum >= 99.9 ? 'text-green-400' : slaNum >= 99 ? 'text-yellow-400' : 'text-red-400'
              }`}>{sla}%</p>
            </div>
          </div>
          <button onClick={refresh} disabled={loading}
            className="p-2.5 rounded-xl border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-40">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── Row 1: 8 KPIs ── */}
      <div className="grid grid-cols-4 gap-4">
        <BigTile label="Total Resources"   value={total}        color="#00b4d8" icon={Server}        highlight
          sub={`${activeAccounts} cloud accounts · ${servers.length} agents`} />
        <BigTile label="Healthy"           value={healthy}      color="#00d68f" icon={Activity}
          sub={`${((healthy/total||0)*100).toFixed(0)}% of fleet operational`} />
        <BigTile label="Critical / Stopped" value={`${critical} / ${stopped}`} color={critical>0?'#ff3d71':'#6b7280'} icon={Zap}
          sub={critical > 0 ? 'Requires immediate action' : 'No critical issues'} />
        <BigTile label="Open Incidents"    value={openInc}      color="#a78bfa" icon={Clock}
          sub={`${resolvedInc} resolved · ${incidents.length} total`} />
      </div>
      <div className="grid grid-cols-4 gap-4">
        <BigTile label="Active Alerts"     value={alerts.length} color="#f97316" icon={AlertTriangle}
          sub={`${alerts.filter(a=>a.severity==='critical').length} critical`} />
        <BigTile label="Avg CPU"           value={avgCpu}   suffix="%" color={parseFloat(avgCpu)>80?'#ff3d71':parseFloat(avgCpu)>60?'#ffcc00':'#00b4d8'} icon={TrendingUp}
          sub="fleet average" />
        <BigTile label="Cloud Spend MTD"   value={totalCosts.total_mtd||0} prefix="$" decimals={2}
          color="#34d399" icon={DollarSign}
          sub={totalCosts.forecast ? `$${totalCosts.forecast.toFixed(0)} forecast EOM` : 'Connect billing'} />
        <BigTile label="Security Findings" value={secFindings.length} color={secFindings.length>0?'#f43f5e':'#00d68f'} icon={Shield}
          sub={`${secBySev.CRITICAL} critical · ${secBySev.HIGH} high`} />
      </div>

      {/* ── Row 2: 24h trend + status + source breakdown ── */}
      <div className="grid grid-cols-12 gap-4">

        {/* 24h trend */}
        <div className="col-span-7 bg-bg-secondary border border-white/10 rounded-2xl p-5">
          <SH title="24h Fleet Performance" sub="CPU · Memory · Incident pressure over time" />
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={210}>
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  {[['cpu','#00b4d8'],['mem','#00d68f'],['critical','#ff3d71'],['warning','#ffcc00']].map(([k,c]) => (
                    <linearGradient key={k} id={`ex2_${k}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={c} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={c} stopOpacity={0}    />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff06" />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#475569' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: '#475569' }} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTip />} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Area type="monotone" dataKey="cpu"      name="CPU %"    stroke="#00b4d8" fill="url(#ex2_cpu)"      strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="mem"      name="MEM %"    stroke="#00d68f" fill="url(#ex2_mem)"      strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="critical" name="Critical" stroke="#ff3d71" fill="url(#ex2_critical)" strokeWidth={1.5} dot={false} />
                <Area type="monotone" dataKey="warning"  name="Warning"  stroke="#ffcc00" fill="url(#ex2_warning)"  strokeWidth={1.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-52 flex items-center justify-center">
              <div className="text-center">
                <RefreshCw size={24} className="text-slate-600 mx-auto mb-2 animate-spin" />
                <p className="text-slate-500 text-sm">Accumulating history…</p>
              </div>
            </div>
          )}
        </div>

        {/* Status + data source */}
        <div className="col-span-5 space-y-4">
          <div className="bg-bg-secondary border border-white/10 rounded-2xl p-5">
            <SH title="Status Distribution" sub="Current fleet" />
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={100} height={100}>
                <PieChart>
                  <Pie data={statusPie} cx="50%" cy="50%" innerRadius={28} outerRadius={46} paddingAngle={4} dataKey="value">
                    {statusPie.map((e,i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#0a0e1a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 flex-1">
                {statusPie.map(d => (
                  <div key={d.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: d.color }} />
                      <span className="text-slate-400">{d.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-14 h-1 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(d.value/total)*100}%`, background: d.color }} />
                      </div>
                      <span className="font-mono font-bold w-5 text-right" style={{ color: d.color }}>{d.value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Data sources */}
          <div className="bg-bg-secondary border border-white/10 rounded-2xl p-4">
            <p className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wider">Data Sources</p>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-2.5 bg-orange-500/5 border border-orange-500/15 rounded-xl">
                <div className="flex items-center gap-2">
                  <Cloud size={13} className="text-orange-400" />
                  <span className="text-xs text-white">Cloud APIs</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-orange-400">{cloudResources.length} resources</span>
                  <span className={`w-1.5 h-1.5 rounded-full ${activeAccounts > 0 ? 'bg-green-400 animate-pulse' : 'bg-slate-600'}`} />
                </div>
              </div>
              <div className="flex items-center justify-between p-2.5 bg-blue-500/5 border border-blue-500/15 rounded-xl">
                <div className="flex items-center gap-2">
                  <Server size={13} className="text-blue-400" />
                  <span className="text-xs text-white">Agents</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-blue-400">{servers.length} servers</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Row 3: Provider health matrix + radar ── */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-7 bg-bg-secondary border border-white/10 rounded-2xl p-5">
          <SH title="Provider Health Matrix" sub="SLA · utilisation · incidents per provider" />
          <table className="w-full">
            <thead>
              <tr className="text-[11px] text-slate-500 border-b border-white/10">
                {['Provider','Source','Servers','SLA','Avg CPU','Avg MEM','⚠','🔴'].map(h => (
                  <th key={h} className={`py-2 font-medium ${h==='Provider' ? 'text-left pr-4' : 'text-right pr-3'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {provMatrix.map(p => (
                <tr key={p.name} className="hover:bg-white/[0.03] transition-colors">
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.color }} />
                      <span className="text-xs font-medium text-white">{p.name}</span>
                    </div>
                  </td>
                  <td className="text-right pr-3">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
                      p.source === 'cloud'
                        ? 'border-orange-500/30 text-orange-400 bg-orange-500/10'
                        : 'border-blue-500/30 text-blue-400 bg-blue-500/10'
                    }`}>{p.source === 'cloud' ? '☁ API' : '⬡ Agent'}</span>
                  </td>
                  <td className="text-right pr-3 text-xs text-slate-400">{p.total}</td>
                  <td className="text-right pr-3">
                    <span className={`text-xs font-mono font-bold ${p.sla>=99.9?'text-green-400':p.sla>=95?'text-yellow-400':'text-red-400'}`}>
                      {p.sla.toFixed(1)}%
                    </span>
                  </td>
                  <td className="text-right pr-3">
                    <span className={`text-xs font-mono ${p.cpu>80?'text-red-400':p.cpu>60?'text-yellow-400':'text-blue-400'}`}>{p.cpu}%</span>
                  </td>
                  <td className="text-right pr-3">
                    <span className={`text-xs font-mono ${p.mem>80?'text-red-400':p.mem>60?'text-yellow-400':'text-green-400'}`}>{p.mem}%</span>
                  </td>
                  <td className="text-right pr-3 text-xs font-mono text-yellow-400">{p.warning}</td>
                  <td className="text-right">
                    <span className={`text-xs font-mono font-bold ${p.critical>0?'text-red-400':'text-slate-600'}`}>{p.critical}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="col-span-5 bg-bg-secondary border border-white/10 rounded-2xl p-5">
          <SH title="Provider Radar" sub="Health · SLA · CPU & Memory efficiency" />
          {radarData.length > 1 ? (
            <ResponsiveContainer width="100%" height={230}>
              <RadarChart data={radarData} margin={{ top: 10, right: 25, bottom: 10, left: 25 }}>
                <PolarGrid stroke="#1e293b" />
                <PolarAngleAxis dataKey="provider" tick={{ fontSize: 10, fill: '#64748b' }} />
                <Radar name="SLA"    dataKey="SLA"    stroke="#00d68f" fill="#00d68f" fillOpacity={0.15} strokeWidth={2} />
                <Radar name="Health" dataKey="Health" stroke="#00b4d8" fill="#00b4d8" fillOpacity={0.1}  strokeWidth={2} />
                <Radar name="Perf"   dataKey="Perf"   stroke="#a78bfa" fill="#a78bfa" fillOpacity={0.1}  strokeWidth={1.5} />
                <Tooltip contentStyle={{ background: '#0a0e1a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 11 }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-56 flex flex-col items-center justify-center gap-2">
              <BarChart2 size={28} className="text-slate-600" />
              <p className="text-slate-500 text-sm">Add more providers to see radar</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Row 4: SLA scorecards + risk table ── */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-5 bg-bg-secondary border border-white/10 rounded-2xl p-5">
          <SH title="SLA Scorecards" sub="Actuals vs targets" />
          <div>
            <ScoreRow label="Fleet SLA"           actual={sla}                         target={99.9} />
            <ScoreRow label="Healthy Servers %"   actual={total>0?((healthy/total)*100).toFixed(1):'100.0'} target={95} />
            <ScoreRow label="Zero Critical"       actual={critical===0?'100.0':'0.0'}   target={100} />
            <ScoreRow label="Availability"        actual={total>0?(((total-stopped)/total)*100).toFixed(1):'100.0'} target={99.5} />
            {secFindings.length > 0 && (
              <ScoreRow label="Critical Findings" actual={secBySev.CRITICAL.toString()} target={0} unit="" inverse />
            )}
          </div>
        </div>

        <div className="col-span-7 bg-bg-secondary border border-white/10 rounded-2xl p-5">
          <SH title="Top Risk Resources" sub="Composite score: CPU×0.4 + MEM×0.35 + Disk×0.25" />
          {riskList.length === 0 ? (
            <div className="flex items-center gap-3 py-8 justify-center">
              <CheckCircle size={20} className="text-green-400" />
              <span className="text-green-400">All resources within normal parameters</span>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-[11px] text-slate-500 border-b border-white/10">
                  <th className="text-left py-2 pr-4 font-medium">#  Resource</th>
                  <th className="text-left pr-3 font-medium">Provider</th>
                  <th className="text-right pr-3 font-medium">CPU</th>
                  <th className="text-right pr-3 font-medium">MEM</th>
                  <th className="text-right pr-3 font-medium">Disk</th>
                  <th className="text-right font-medium">Risk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {riskList.map((r, i) => {
                  const rk = Math.round(r.risk)
                  const rc = rk>75?'#ff3d71':rk>55?'#ffcc00':'#00d68f'
                  return (
                    <tr key={r.id} className="hover:bg-white/[0.03] transition-colors">
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-slate-600 w-4">{i+1}</span>
                          <div>
                            <p className="text-xs font-medium text-white">{r.name}</p>
                            {r.public_ip && <p className="text-[10px] font-mono text-slate-500">{r.public_ip}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="pr-3">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ background: getProviderColor(r.provider) }} />
                          <span className="text-[10px] text-slate-400">{r.provider}</span>
                        </div>
                      </td>
                      <td className="text-right pr-3 text-xs font-mono" style={{ color: (r.cpu||0)>80?'#ff3d71':(r.cpu||0)>60?'#ffcc00':'#475569' }}>{Math.round(r.cpu||0)}%</td>
                      <td className="text-right pr-3 text-xs font-mono" style={{ color: (r.mem||0)>80?'#ff3d71':(r.mem||0)>60?'#ffcc00':'#475569' }}>{Math.round(r.mem||0)}%</td>
                      <td className="text-right pr-3 text-xs font-mono text-slate-500">{r.disk||0}%</td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <div className="w-12 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${Math.min(100,rk)}%`, background: rc }} />
                          </div>
                          <span className="text-sm font-bold font-mono w-6" style={{ color: rc }}>{rk}</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Row 5: Cost + Provider bar + Security ── */}
      <div className="grid grid-cols-12 gap-4">
        {/* Cost breakdown */}
        <div className="col-span-4 bg-bg-secondary border border-white/10 rounded-2xl p-5">
          <SH title="Cloud Cost Breakdown" sub="Month-to-date by service" />
          {totalCosts.by_service?.length > 0 ? (
            <>
              <div className="flex items-end gap-3 mb-4">
                <div>
                  <p className="text-[10px] text-slate-500">MTD Spend</p>
                  <p className="text-2xl font-bold text-white">${totalCosts.total_mtd?.toFixed(2)||'0.00'}</p>
                </div>
                {totalCosts.forecast > 0 && (
                  <div className="mb-0.5">
                    <p className="text-[10px] text-slate-500">EOM Forecast</p>
                    <p className="text-sm font-bold text-orange-400">${totalCosts.forecast.toFixed(2)}</p>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                {totalCosts.by_service.slice(0,6).map((s, i) => {
                  const COLS = ['#FF9900','#00b4d8','#00d68f','#a78bfa','#f97316','#34d399']
                  const max  = totalCosts.by_service[0].cost
                  return (
                    <div key={s.service} className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: COLS[i%COLS.length] }} />
                      <span className="text-[10px] text-slate-400 truncate flex-1">{s.service.replace('Amazon ','').replace('AWS ','')}</span>
                      <div className="w-20 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(s.cost/max)*100}%`, background: COLS[i%COLS.length] }} />
                      </div>
                      <span className="text-[10px] font-mono text-white w-14 text-right">${s.cost.toFixed(2)}</span>
                    </div>
                  )
                })}
              </div>
              {optimisations.length > 0 && (
                <div className="mt-3 pt-3 border-t border-white/10">
                  <div className="flex items-center gap-2 p-2.5 bg-green-500/5 border border-green-500/15 rounded-xl">
                    <TrendingDown size={13} className="text-green-400 shrink-0" />
                    <p className="text-[11px] text-green-400">
                      <span className="font-bold">{optimisations.length}</span> cost optimisation tips available
                    </p>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center py-6 gap-2">
              <DollarSign size={24} className="text-slate-600" />
              <p className="text-slate-500 text-sm text-center">Sync a cloud account to see billing</p>
            </div>
          )}
        </div>

        {/* Provider health bars */}
        <div className="col-span-5 bg-bg-secondary border border-white/10 rounded-2xl p-5">
          <SH title="Health by Provider" sub="Healthy / Warning / Critical" />
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={provMatrix} barSize={14} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff06" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#475569' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#475569' }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip content={<ChartTip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="healthy"  name="Healthy"  fill="#00d68f" radius={[3,3,0,0]} />
              <Bar dataKey="warning"  name="Warning"  fill="#ffcc00" radius={[3,3,0,0]} />
              <Bar dataKey="critical" name="Critical" fill="#ff3d71" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Security + incidents */}
        <div className="col-span-3 space-y-4">
          <div className="bg-bg-secondary border border-white/10 rounded-2xl p-4">
            <p className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wider">Security Posture</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label:'Critical', value: secBySev.CRITICAL, color:'#ff3d71' },
                { label:'High',     value: secBySev.HIGH,     color:'#f97316' },
                { label:'Medium',   value: secBySev.MEDIUM,   color:'#ffcc00' },
                { label:'Low',      value: secBySev.LOW,      color:'#64748b' },
              ].map(s => (
                <div key={s.label} className="bg-bg-primary rounded-xl p-2.5 text-center border border-white/5">
                  <p className="text-[10px] text-slate-500">{s.label}</p>
                  <p className="text-lg font-bold" style={{ color: s.value > 0 ? s.color : '#334155' }}>{s.value}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-bg-secondary border border-white/10 rounded-2xl p-4">
            <p className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wider">Incidents</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Open',     value: incidents.filter(i=>i.status==='open').length,          color:'#ff3d71' },
                { label: 'Investig', value: incidents.filter(i=>i.status==='investigating').length,  color:'#ffcc00' },
                { label: 'Resolved', value: incidents.filter(i=>i.status==='resolved').length,      color:'#00d68f' },
                { label: 'Total',    value: incidents.length,                                        color:'#64748b' },
              ].map(s => (
                <div key={s.label} className="bg-bg-primary rounded-xl p-2.5 text-center border border-white/5">
                  <p className="text-[10px] text-slate-500">{s.label}</p>
                  <p className="text-lg font-bold" style={{ color: s.color }}>{s.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}
