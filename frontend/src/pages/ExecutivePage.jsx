import React, { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, Server, AlertTriangle, CheckCircle, Activity, Zap, Shield, Clock, DollarSign } from 'lucide-react'
import { AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, RadarChart, Radar, PolarGrid, PolarAngleAxis } from 'recharts'
import useStore from '@/store/useStore'
import { getProviderColor } from '@/utils/helpers'

// ── Reusable mini components ──────────────────────────────────────────────────

function MetricCard({ label, value, sub, color, icon: Icon, trend, borderColor }) {
  return (
    <div className="bg-bg-secondary rounded-2xl p-5 border border-white/10 flex flex-col gap-3"
         style={borderColor ? { borderColor } : {}}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">{label}</span>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${color}20` }}>
          <Icon size={15} style={{ color }} />
        </div>
      </div>
      <div>
        <div className="flex items-end gap-2">
          <span className="text-3xl font-bold" style={{ color }}>{value}</span>
          {trend !== undefined && (
            <span className={`text-xs mb-1 flex items-center gap-0.5 ${trend >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {trend >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
              {Math.abs(trend)}%
            </span>
          )}
        </div>
        {sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function SectionHeader({ title, subtitle }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="h-4 w-1 rounded-full bg-accent" />
      <div>
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        {subtitle && <p className="text-[11px] text-slate-500">{subtitle}</p>}
      </div>
    </div>
  )
}

// ── Scorecard row ─────────────────────────────────────────────────────────────
function Scorecard({ label, value, target, unit = '%' }) {
  const numVal = parseFloat(value)
  const met    = numVal >= target
  const pct    = Math.min(100, (numVal / target) * 100)
  return (
    <div className="flex items-center gap-4 py-3 border-b border-white/5 last:border-0">
      <div className="w-44 shrink-0">
        <p className="text-xs text-white">{label}</p>
        <p className="text-[10px] text-slate-500 mt-0.5">Target ≥ {target}{unit}</p>
      </div>
      <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${met ? 'bg-green-500' : 'bg-red-500'}`}
          style={{ width: `${pct}%` }} />
      </div>
      <div className="w-28 text-right flex items-center justify-end gap-2">
        <span className={`text-sm font-bold font-mono ${met ? 'text-green-400' : 'text-red-400'}`}>
          {value}{unit}
        </span>
        {met ? <CheckCircle size={13} className="text-green-400 shrink-0" />
              : <AlertTriangle size={13} className="text-red-400 shrink-0" />}
      </div>
    </div>
  )
}

// ── Heatmap cell ──────────────────────────────────────────────────────────────
function HeatCell({ value, max }) {
  const pct = max > 0 ? value / max : 0
  const bg  = pct > 0.8 ? '#ff3d71' : pct > 0.6 ? '#ff8c00' : pct > 0.4 ? '#ffcc00' : pct > 0.1 ? '#00d68f' : '#1e293b'
  return (
    <div className="w-7 h-7 rounded flex items-center justify-center text-[9px] font-mono text-white/80 transition-all"
      style={{ background: bg }} title={`${value}`}>
      {value || ''}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ExecutivePage() {
  const { servers, alerts, incidents } = useStore()
  const [history,  setHistory]  = useState([])
  const [overview, setOverview] = useState(null)

  useEffect(() => {
    fetch('/api/history/overview?hours=24').then(r => r.json()).then(d => setHistory(d.points || []))
    fetch('/api/stats/overview').then(r => r.json()).then(setOverview)
  }, [])

  if (servers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Activity size={40} className="text-slate-600 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">No data yet</h2>
        <p className="text-slate-400 text-sm">Connect an agent to populate the executive dashboard.</p>
      </div>
    )
  }

  const total     = servers.length
  const healthy   = servers.filter(s => s.status === 'healthy').length
  const critical  = servers.filter(s => s.status === 'critical').length
  const warning   = servers.filter(s => s.status === 'warning').length
  const stopped   = servers.filter(s => s.status === 'stopped').length
  const active    = servers.filter(s => s.status !== 'stopped')
  const sla       = total > 0 ? ((healthy / total) * 100).toFixed(2) : '100.00'
  const slaNum    = parseFloat(sla)
  const openInc   = incidents.filter(i => ['open','investigating'].includes(i.status)).length
  const resolvedInc = incidents.filter(i => i.status === 'resolved').length

  const avgCpu  = active.length ? (active.reduce((a,s) => a+s.cpu,0) / active.length).toFixed(1) : 0
  const avgMem  = active.length ? (active.reduce((a,s) => a+s.mem,0) / active.length).toFixed(1) : 0
  const avgDisk = active.length ? (active.reduce((a,s) => a+s.disk,0) / active.length).toFixed(1) : 0

  // Provider breakdown
  const providers = [...new Set(servers.map(s => s.provider))]
  const providerData = providers.map(p => {
    const ps    = servers.filter(s => s.provider === p)
    const pa    = ps.filter(s => s.status !== 'stopped')
    const pSla  = ps.length > 0 ? ((ps.filter(s=>s.status==='healthy').length / ps.length)*100).toFixed(1) : 100
    const pCpu  = pa.length ? (pa.reduce((a,s)=>a+s.cpu,0)/pa.length).toFixed(1) : 0
    const pMem  = pa.length ? (pa.reduce((a,s)=>a+s.mem,0)/pa.length).toFixed(1) : 0
    return {
      name:     p,
      total:    ps.length,
      healthy:  ps.filter(s=>s.status==='healthy').length,
      warning:  ps.filter(s=>s.status==='warning').length,
      critical: ps.filter(s=>s.status==='critical').length,
      sla:      parseFloat(pSla),
      cpu:      parseFloat(pCpu),
      mem:      parseFloat(pMem),
      color:    getProviderColor(p),
    }
  })

  // Status distribution pie
  const statusPie = [
    { name: 'Healthy',     value: healthy,                                   color: '#00d68f' },
    { name: 'Warning',     value: warning,                                   color: '#ffcc00' },
    { name: 'Critical',    value: critical,                                  color: '#ff3d71' },
    { name: 'Fluctuating', value: servers.filter(s=>s.status==='fluctuating').length, color: '#ff8c00' },
    { name: 'Stopped',     value: stopped,                                   color: '#6b7280' },
  ].filter(d => d.value > 0)

  // Radar: per-provider health score (0–100)
  const radarData = providerData.map(p => ({
    provider: p.name.length > 8 ? p.name.slice(0,8) : p.name,
    SLA:    p.sla,
    Health: p.total > 0 ? Math.round((p.healthy/p.total)*100) : 0,
    CPU:    100 - p.cpu,
    Memory: 100 - p.mem,
  }))

  // Heatmap: cpu buckets over last hours (use history data)
  const hours = ['00','03','06','09','12','15','18','21']
  const metrics = ['CPU','MEM','Alerts']
  const heatData = hours.map(h => ({
    hour: `${h}:00`,
    CPU:    history.find(p => p.time?.startsWith(h))?.cpu      || 0,
    MEM:    history.find(p => p.time?.startsWith(h))?.mem      || 0,
    Alerts: (history.find(p => p.time?.startsWith(h))?.critical || 0) + (history.find(p => p.time?.startsWith(h))?.warning || 0),
  }))

  // Top 5 high-risk servers
  const riskServers = [...active]
    .map(s => ({ ...s, riskScore: (s.cpu * 0.4) + (s.mem * 0.35) + (s.disk * 0.25) }))
    .sort((a,b) => b.riskScore - a.riskScore)
    .slice(0, 5)

  const scorecards = [
    { label: 'Fleet SLA',          value: sla,                                     target: 99.9  },
    { label: 'Healthy Servers',    value: total > 0 ? ((healthy/total)*100).toFixed(1) : '100', target: 95 },
    { label: 'Critical-Free Fleet',value: critical === 0 ? '100.0' : '0.0',        target: 100  },
    { label: 'Availability',       value: total > 0 ? (((total-stopped)/total)*100).toFixed(1) : '100', target: 99.5 },
  ]

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Executive Dashboard</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}
            &nbsp;·&nbsp;{total} servers across {providers.length} providers
          </p>
        </div>
        <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border ${
          slaNum >= 99.9 ? 'bg-green-500/10 border-green-500/30' :
          slaNum >= 99   ? 'bg-yellow-500/10 border-yellow-500/30' :
                           'bg-red-500/10 border-red-500/30'
        }`}>
          <div>
            <p className="text-[10px] text-slate-400">Overall SLA</p>
            <p className={`text-2xl font-bold font-mono ${
              slaNum >= 99.9 ? 'text-green-400' : slaNum >= 99 ? 'text-yellow-400' : 'text-red-400'
            }`}>{sla}%</p>
          </div>
        </div>
      </div>

      {/* ── Row 1: 8 KPI cards ── */}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard label="Total Servers"    value={total}              color="#00b4d8" icon={Server}        sub={`${providers.length} providers · ${[...new Set(servers.map(s=>s.region))].length} regions`} />
        <MetricCard label="Healthy"          value={healthy}            color="#00d68f" icon={Activity}      sub={`${((healthy/total||0)*100).toFixed(0)}% of fleet online`} />
        <MetricCard label="Critical / Down"  value={`${critical} / ${stopped}`} color={critical>0?'#ff3d71':'#6b7280'} icon={Zap} sub={critical > 0 ? 'Requires immediate action' : 'No critical issues'} />
        <MetricCard label="Open Incidents"   value={openInc}            color="#a78bfa" icon={Clock}         sub={`${resolvedInc} resolved total`} />
      </div>
      <div className="grid grid-cols-4 gap-4">
        <MetricCard label="Active Alerts"    value={alerts.length}      color="#f97316" icon={AlertTriangle} sub={`${alerts.filter(a=>a.severity==='critical').length} critical · ${alerts.filter(a=>a.severity==='warning').length} warning`} />
        <MetricCard label="Avg CPU Usage"    value={`${avgCpu}%`}       color={parseFloat(avgCpu)>80?'#ff3d71':parseFloat(avgCpu)>60?'#ffcc00':'#00b4d8'} icon={TrendingUp} sub="fleet average" />
        <MetricCard label="Avg Memory"       value={`${avgMem}%`}       color={parseFloat(avgMem)>80?'#ff3d71':parseFloat(avgMem)>60?'#ffcc00':'#00d68f'} icon={TrendingUp} sub="fleet average" />
        <MetricCard label="Warning Servers"  value={warning}            color="#ffcc00" icon={Shield}        sub="needs attention" />
      </div>

      {/* ── Row 2: 24h trend + status pie ── */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-8 bg-bg-secondary border border-white/10 rounded-2xl p-5">
          <SectionHeader title="24h Fleet Performance Trend" subtitle="Average CPU, Memory and incident count over time" />
          {history.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={history} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  {[['cpu','#00b4d8'],['mem','#00d68f'],['critical','#ff3d71'],['warning','#ffcc00']].map(([k,c]) => (
                    <linearGradient key={k} id={`ex_${k}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={c} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={c} stopOpacity={0}   />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#475569' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#475569' }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: '#0f1623', border: '1px solid #1e293b', borderRadius: 10, fontSize: 11 }} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Area type="monotone" dataKey="cpu"      name="CPU %"     stroke="#00b4d8" fill="url(#ex_cpu)"      strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="mem"      name="MEM %"     stroke="#00d68f" fill="url(#ex_mem)"      strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="critical" name="Critical"  stroke="#ff3d71" fill="url(#ex_critical)" strokeWidth={1.5} dot={false} />
                <Area type="monotone" dataKey="warning"  name="Warning"   stroke="#ffcc00" fill="url(#ex_warning)"  strokeWidth={1.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-52 flex items-center justify-center text-slate-500 text-sm">
              History accumulates as agents push metrics — check back shortly
            </div>
          )}
        </div>

        <div className="col-span-4 bg-bg-secondary border border-white/10 rounded-2xl p-5">
          <SectionHeader title="Status Distribution" subtitle="Current fleet breakdown" />
          <div className="flex justify-center">
            <ResponsiveContainer width="100%" height={150}>
              <PieChart>
                <Pie data={statusPie} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={4} dataKey="value">
                  {statusPie.map((e,i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#0f1623', border: '1px solid #1e293b', borderRadius: 8, fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-1.5 mt-2">
            {statusPie.map(d => (
              <div key={d.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: d.color }} />
                  <span className="text-slate-400">{d.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-1 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(d.value/total)*100}%`, background: d.color }} />
                  </div>
                  <span className="font-mono font-bold w-5 text-right" style={{ color: d.color }}>{d.value}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Row 3: Provider table + radar ── */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-7 bg-bg-secondary border border-white/10 rounded-2xl p-5">
          <SectionHeader title="Provider Health Matrix" subtitle="SLA, utilisation and incident breakdown per provider" />
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-slate-500 border-b border-white/10">
                <th className="text-left py-2 pr-4">Provider</th>
                <th className="text-right pr-3">Servers</th>
                <th className="text-right pr-3">SLA</th>
                <th className="text-right pr-3">Avg CPU</th>
                <th className="text-right pr-3">Avg MEM</th>
                <th className="text-right pr-3">⚠</th>
                <th className="text-right">🔴</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {providerData.map(p => (
                <tr key={p.name} className="hover:bg-white/5 transition-colors">
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: p.color }} />
                      <span className="font-medium text-white text-xs">{p.name}</span>
                    </div>
                  </td>
                  <td className="text-right pr-3 text-xs text-slate-400">{p.total}</td>
                  <td className="text-right pr-3">
                    <span className={`text-xs font-mono font-bold ${p.sla >= 99.9 ? 'text-green-400' : p.sla >= 95 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {p.sla.toFixed(1)}%
                    </span>
                  </td>
                  <td className="text-right pr-3">
                    <span className={`text-xs font-mono ${p.cpu > 80 ? 'text-red-400' : p.cpu > 60 ? 'text-yellow-400' : 'text-blue-400'}`}>{p.cpu}%</span>
                  </td>
                  <td className="text-right pr-3">
                    <span className={`text-xs font-mono ${p.mem > 80 ? 'text-red-400' : p.mem > 60 ? 'text-yellow-400' : 'text-green-400'}`}>{p.mem}%</span>
                  </td>
                  <td className="text-right pr-3">
                    <span className="text-xs font-mono text-yellow-400">{p.warning}</span>
                  </td>
                  <td className="text-right">
                    <span className={`text-xs font-mono ${p.critical > 0 ? 'text-red-400 font-bold' : 'text-slate-500'}`}>{p.critical}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="col-span-5 bg-bg-secondary border border-white/10 rounded-2xl p-5">
          <SectionHeader title="Provider Radar" subtitle="Health, SLA, CPU & Memory efficiency" />
          {radarData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={radarData} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
                <PolarGrid stroke="#1e293b" />
                <PolarAngleAxis dataKey="provider" tick={{ fontSize: 10, fill: '#64748b' }} />
                <Radar name="SLA"    dataKey="SLA"    stroke="#00d68f" fill="#00d68f" fillOpacity={0.15} strokeWidth={2} />
                <Radar name="Health" dataKey="Health" stroke="#00b4d8" fill="#00b4d8" fillOpacity={0.1}  strokeWidth={2} />
                <Tooltip contentStyle={{ background: '#0f1623', border: '1px solid #1e293b', borderRadius: 8, fontSize: 11 }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-slate-500 text-sm">Needs multiple providers</div>
          )}
        </div>
      </div>

      {/* ── Row 4: SLA scorecards + risk table ── */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-5 bg-bg-secondary border border-white/10 rounded-2xl p-5">
          <SectionHeader title="SLA Scorecards" subtitle="Actuals vs targets" />
          <div>
            {scorecards.map(s => <Scorecard key={s.label} {...s} />)}
          </div>
        </div>

        <div className="col-span-7 bg-bg-secondary border border-white/10 rounded-2xl p-5">
          <SectionHeader title="Top Risk Servers" subtitle="Ranked by composite CPU + MEM + Disk risk score" />
          {riskServers.length === 0 ? (
            <div className="flex items-center gap-3 py-8 justify-center">
              <CheckCircle size={20} className="text-green-400" />
              <span className="text-green-400">All servers within normal operating parameters</span>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-[11px] text-slate-500 border-b border-white/10">
                  <th className="text-left py-2 pr-4">Server</th>
                  <th className="text-left pr-3">Provider</th>
                  <th className="text-right pr-3">CPU</th>
                  <th className="text-right pr-3">MEM</th>
                  <th className="text-right pr-3">Disk</th>
                  <th className="text-right">Risk Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {riskServers.map((s,i) => {
                  const risk = Math.round(s.riskScore)
                  const riskColor = risk > 75 ? '#ff3d71' : risk > 55 ? '#ffcc00' : '#00d68f'
                  return (
                    <tr key={s.id} className="hover:bg-white/5">
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-slate-400 w-4">{i+1}</span>
                          <div>
                            <p className="text-xs font-medium text-white">{s.name}</p>
                            {s.public_ip && <p className="text-[10px] font-mono text-slate-500">{s.public_ip}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="pr-3">
                        <span className="text-[10px] font-mono" style={{ color: getProviderColor(s.provider) }}>{s.provider}</span>
                      </td>
                      <td className="text-right pr-3 text-xs font-mono" style={{ color: s.cpu > 80 ? '#ff3d71' : s.cpu > 60 ? '#ffcc00' : '#64748b' }}>{Math.round(s.cpu)}%</td>
                      <td className="text-right pr-3 text-xs font-mono" style={{ color: s.mem > 80 ? '#ff3d71' : s.mem > 60 ? '#ffcc00' : '#64748b' }}>{Math.round(s.mem)}%</td>
                      <td className="text-right pr-3 text-xs font-mono text-slate-400">{s.disk}%</td>
                      <td className="text-right">
                        <span className="text-sm font-bold font-mono" style={{ color: riskColor }}>{risk}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Row 5: Provider health bar chart + incident summary ── */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-7 bg-bg-secondary border border-white/10 rounded-2xl p-5">
          <SectionHeader title="Health by Provider" subtitle="Healthy / Warning / Critical breakdown" />
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={providerData} barSize={16} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ background: '#0f1623', border: '1px solid #1e293b', borderRadius: 8, fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="healthy"  name="Healthy"  fill="#00d68f" radius={[2,2,0,0]} />
              <Bar dataKey="warning"  name="Warning"  fill="#ffcc00" radius={[2,2,0,0]} />
              <Bar dataKey="critical" name="Critical" fill="#ff3d71" radius={[2,2,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="col-span-5 bg-bg-secondary border border-white/10 rounded-2xl p-5">
          <SectionHeader title="Incident Summary" subtitle="Status breakdown" />
          {incidents.length === 0 ? (
            <div className="flex flex-col items-center py-8 gap-2">
              <CheckCircle size={28} className="text-green-400" />
              <p className="text-green-400 font-medium text-sm">No incidents recorded</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 mb-4">
                {[
                  { label: 'Open',          value: incidents.filter(i=>i.status==='open').length,          color: '#ff3d71' },
                  { label: 'Investigating', value: incidents.filter(i=>i.status==='investigating').length,  color: '#ffcc00' },
                  { label: 'Resolved',      value: incidents.filter(i=>i.status==='resolved').length,      color: '#00d68f' },
                  { label: 'Closed',        value: incidents.filter(i=>i.status==='closed').length,        color: '#6b7280' },
                ].map(s => (
                  <div key={s.label} className="bg-bg-primary rounded-xl p-3 border border-white/5">
                    <p className="text-[10px] text-slate-500">{s.label}</p>
                    <p className="text-xl font-bold mt-0.5" style={{ color: s.color }}>{s.value}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-1.5">
                {incidents.slice(0,3).map(i => (
                  <div key={i.id} className="flex items-center gap-2 p-2 bg-bg-primary rounded-lg border border-white/5 text-xs">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      i.status==='open'?'bg-red-400':i.status==='investigating'?'bg-yellow-400':'bg-green-400'
                    }`} />
                    <span className="text-white truncate flex-1">{i.title}</span>
                    <span className="text-slate-500 font-mono shrink-0">{i.id}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

    </div>
  )
}
