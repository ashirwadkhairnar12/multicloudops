import React, { useEffect, useState } from 'react'
import { Server, Bot, ArrowRight, AlertTriangle, Activity, TrendingUp, TrendingDown, Wifi, Clock, Zap, Shield } from 'lucide-react'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, RadialBarChart, RadialBar } from 'recharts'
import useStore from '@/store/useStore'
import { getStatusBorder, getStatusColor, getProviderColor, getCpuColor } from '@/utils/helpers'

// ── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ onGoToAgents }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-20 h-20 rounded-2xl bg-slate-800 border border-white/10 flex items-center justify-center mb-6">
        <Server size={36} className="text-slate-600" />
      </div>
      <h2 className="text-xl font-bold text-white mb-2">No servers yet</h2>
      <p className="text-slate-400 text-sm max-w-sm mb-8">
        Connect a monitoring agent to your server and it will appear here automatically with live metrics.
      </p>
      <button onClick={onGoToAgents} className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium text-sm transition-colors">
        <Bot size={16} /> Register your first agent <ArrowRight size={14} />
      </button>
    </div>
  )
}

// ── Gauge ring ───────────────────────────────────────────────────────────────
function GaugeRing({ value, max = 100, color, label, size = 80 }) {
  const pct    = Math.min(100, (value / max) * 100)
  const r      = (size - 10) / 2
  const circ   = 2 * Math.PI * r
  const dash   = (pct / 100) * circ
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1e293b" strokeWidth={8} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={8}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          transform={`rotate(-90 ${size/2} ${size/2})`}
          style={{ transition: 'stroke-dasharray 0.8s ease' }}
        />
        <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fontSize={size < 80 ? 12 : 15} fontWeight="bold" fill={color}>
          {Math.round(value)}%
        </text>
      </svg>
      <span className="text-[11px] text-slate-400">{label}</span>
    </div>
  )
}

// ── Server row for the live table ────────────────────────────────────────────
function ServerRow({ server }) {
  const statusColors = { healthy: '#00d68f', warning: '#ffcc00', critical: '#ff3d71', fluctuating: '#ff8c00', stopped: '#6b7280' }
  const color = statusColors[server.status] || '#6b7280'
  const provColor = getProviderColor(server.provider)
  return (
    <tr className="border-b border-white/5 hover:bg-white/5 transition-colors">
      <td className="py-2.5 px-4">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0 animate-pulse" style={{ background: color }} />
          <div>
            <p className="text-xs font-medium text-white">{server.name}</p>
            {server.public_ip && <p className="text-[10px] text-slate-500 font-mono">{server.public_ip}</p>}
          </div>
        </div>
      </td>
      <td className="py-2.5 px-3">
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border" style={{ color: provColor, borderColor: `${provColor}40`, background: `${provColor}15` }}>
          {server.provider}
        </span>
      </td>
      <td className="py-2.5 px-3 text-xs text-slate-400">{server.region}</td>
      <td className="py-2.5 px-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-slate-800 rounded-full w-16">
            <div className="h-full rounded-full" style={{ width: `${server.cpu}%`, background: getCpuColor(server.cpu) }} />
          </div>
          <span className="text-[10px] font-mono w-8" style={{ color: getCpuColor(server.cpu) }}>{Math.round(server.cpu)}%</span>
        </div>
      </td>
      <td className="py-2.5 px-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-slate-800 rounded-full w-16">
            <div className="h-full rounded-full" style={{ width: `${server.mem}%`, background: getCpuColor(server.mem) }} />
          </div>
          <span className="text-[10px] font-mono w-8" style={{ color: getCpuColor(server.mem) }}>{Math.round(server.mem)}%</span>
        </div>
      </td>
      <td className="py-2.5 px-3">
        <span className="text-[10px] font-mono text-slate-400">{server.disk}%</span>
      </td>
      <td className="py-2.5 px-4">
        <span className="text-[10px] font-medium capitalize px-2 py-0.5 rounded-full border"
          style={{ color, borderColor: `${color}40`, background: `${color}15` }}>
          {server.status}
        </span>
      </td>
    </tr>
  )
}

// ── Stat KPI card ─────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color, icon: Icon, trend }) {
  return (
    <div className="bg-bg-secondary border border-white/10 rounded-2xl p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">{label}</span>
        <Icon size={15} style={{ color }} />
      </div>
      <div className="flex items-end gap-2">
        <span className="text-3xl font-bold" style={{ color }}>{value}</span>
        {trend !== undefined && (
          <span className={`text-xs mb-1 flex items-center gap-0.5 ${trend >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {trend >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
            {Math.abs(trend)}%
          </span>
        )}
      </div>
      {sub && <span className="text-[11px] text-slate-500">{sub}</span>}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function OverviewPage() {
  const { servers, alerts, trendData, incidents, getStats, setActiveNav, wsConnected } = useStore()
  const [serverHistory, setServerHistory] = useState([])
  const stats = getStats()

  useEffect(() => {
    fetch('/api/history/overview?hours=24').then(r => r.json()).then(d => setServerHistory(d.points || []))
  }, [])

  if (servers.length === 0) {
    return <EmptyState onGoToAgents={() => setActiveNav('agents')} />
  }

  const active       = servers.filter(s => s.status !== 'stopped')
  const avgCpu       = active.length ? (active.reduce((a,s) => a+s.cpu,0) / active.length) : 0
  const avgMem       = active.length ? (active.reduce((a,s) => a+s.mem,0) / active.length) : 0
  const avgDisk      = active.length ? (active.reduce((a,s) => a+s.disk,0) / active.length) : 0
  const sla          = servers.length ? ((stats.healthy / servers.length) * 100).toFixed(2) : '100.00'
  const criticalSrvs = servers.filter(s => s.status === 'critical')
  const warningSrvs  = servers.filter(s => s.status === 'warning')
  const openInc      = incidents.filter(i => i.status === 'open' || i.status === 'investigating').length

  // Status pie
  const statusPie = [
    { name: 'Healthy',     value: stats.healthy,     color: '#00d68f' },
    { name: 'Warning',     value: stats.warning,     color: '#ffcc00' },
    { name: 'Critical',    value: stats.critical,    color: '#ff3d71' },
    { name: 'Fluctuating', value: stats.fluctuating, color: '#ff8c00' },
    { name: 'Stopped',     value: stats.stopped,     color: '#6b7280' },
  ].filter(d => d.value > 0)

  // Provider bar
  const providers = [...new Set(servers.map(s => s.provider))]
  const providerBar = providers.map(p => {
    const ps = servers.filter(s => s.provider === p)
    return {
      name: p,
      H: ps.filter(s => s.status === 'healthy').length,
      W: ps.filter(s => s.status === 'warning').length,
      C: ps.filter(s => s.status === 'critical').length,
    }
  })

  const chartData = serverHistory.length > 0 ? serverHistory : trendData

  return (
    <div className="space-y-4 animate-fade-in">

      {/* ── Row 1: KPI strip ── */}
      <div className="grid grid-cols-6 gap-3">
        <KpiCard label="Total Servers"   value={stats.total}           color="#00b4d8" icon={Server}        sub={`${stats.stopped} stopped`} />
        <KpiCard label="Healthy"         value={stats.healthy}         color="#00d68f" icon={Activity}      sub={`${((stats.healthy/stats.total)*100||0).toFixed(0)}% of fleet`} />
        <KpiCard label="Warning"         value={stats.warning}         color="#ffcc00" icon={AlertTriangle} sub="needs attention" />
        <KpiCard label="Critical"        value={stats.critical}        color="#ff3d71" icon={Zap}           sub="immediate action" />
        <KpiCard label="Active Alerts"   value={alerts.length}         color="#f97316" icon={Shield}        sub={`${stats.criticalAlerts} critical`} />
        <KpiCard label="Open Incidents"  value={openInc}               color="#a78bfa" icon={Clock}         sub="open / investigating" />
      </div>

      {/* ── Row 2: SLA + gauges + charts ── */}
      <div className="grid grid-cols-12 gap-4">

        {/* SLA + gauges */}
        <div className="col-span-3 bg-bg-secondary border border-white/10 rounded-2xl p-5 flex flex-col gap-4">
          <div className="text-center">
            <p className="text-xs text-slate-400 mb-1">Overall SLA</p>
            <p className={`text-5xl font-bold font-mono ${parseFloat(sla) >= 99.9 ? 'text-green-400' : parseFloat(sla) >= 99 ? 'text-yellow-400' : 'text-red-400'}`}>
              {sla}%
            </p>
            <p className="text-[11px] text-slate-500 mt-1">Based on healthy / total</p>
          </div>
          <div className="flex justify-around pt-2 border-t border-white/10">
            <GaugeRing value={avgCpu}  color={avgCpu  > 80 ? '#ff3d71' : avgCpu  > 60 ? '#ffcc00' : '#00b4d8'} label="CPU"  size={72} />
            <GaugeRing value={avgMem}  color={avgMem  > 80 ? '#ff3d71' : avgMem  > 60 ? '#ffcc00' : '#00d68f'} label="MEM"  size={72} />
            <GaugeRing value={avgDisk} color={avgDisk > 85 ? '#ff3d71' : avgDisk > 70 ? '#ffcc00' : '#8b5cf6'} label="DISK" size={72} />
          </div>
          <div className="flex justify-between text-xs pt-2 border-t border-white/10">
            <div className="text-center">
              <p className="text-slate-500">Providers</p>
              <p className="text-white font-bold">{providers.length}</p>
            </div>
            <div className="text-center">
              <p className="text-slate-500">Regions</p>
              <p className="text-white font-bold">{[...new Set(servers.map(s => s.region))].length}</p>
            </div>
            <div className="text-center">
              <p className="text-slate-500">Agents</p>
              <p className="text-white font-bold">{[...new Set(servers.map(s => s.agent_id).filter(Boolean))].length}</p>
            </div>
          </div>
        </div>

        {/* Performance chart */}
        <div className="col-span-5 bg-bg-secondary border border-white/10 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Fleet Performance</h3>
              <p className="text-[11px] text-slate-500">Avg CPU & Memory — last 24h</p>
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              {[['CPU','#00b4d8'],['MEM','#00d68f'],['Critical','#ff3d71']].map(([k,c]) => (
                <span key={k} className="flex items-center gap-1">
                  <span className="w-3 h-0.5 rounded inline-block" style={{ background: c }} />
                  <span className="text-slate-400">{k}</span>
                </span>
              ))}
            </div>
          </div>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={170}>
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  {[['cpu','#00b4d8'],['mem','#00d68f'],['critical','#ff3d71']].map(([k,c]) => (
                    <linearGradient key={k} id={`g_${k}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={c} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={c} stopOpacity={0}    />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#475569' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 9, fill: '#475569' }} tickLine={false} axisLine={false} domain={[0, 100]} />
                <Tooltip contentStyle={{ background: '#0f1623', border: '1px solid #1e293b', borderRadius: 10, fontSize: 11 }}
                  labelStyle={{ color: '#94a3b8' }} />
                <Area type="monotone" dataKey="cpu"      name="CPU %"     stroke="#00b4d8" strokeWidth={2} fill="url(#g_cpu)"      dot={false} />
                <Area type="monotone" dataKey="mem"      name="MEM %"     stroke="#00d68f" strokeWidth={2} fill="url(#g_mem)"      dot={false} />
                <Area type="monotone" dataKey="critical" name="Critical"  stroke="#ff3d71" strokeWidth={1.5} fill="url(#g_critical)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-40 flex items-center justify-center text-slate-500 text-sm">Accumulating data…</div>
          )}
        </div>

        {/* Status pie + provider bar */}
        <div className="col-span-4 bg-bg-secondary border border-white/10 rounded-2xl p-5 flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-white">Status Distribution</h3>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width={110} height={110}>
              <PieChart>
                <Pie data={statusPie} cx="50%" cy="50%" innerRadius={30} outerRadius={50} paddingAngle={3} dataKey="value">
                  {statusPie.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#0f1623', border: '1px solid #1e293b', borderRadius: 8, fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1.5 flex-1">
              {statusPie.map(d => (
                <div key={d.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                    <span className="text-slate-400">{d.name}</span>
                  </div>
                  <span className="font-mono font-bold" style={{ color: d.color }}>{d.value}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Provider mini bars */}
          <div className="border-t border-white/10 pt-3">
            <p className="text-[11px] text-slate-500 mb-2">By Provider</p>
            {providerBar.map(p => {
              const total = p.H + p.W + p.C
              if (total === 0) return null
              return (
                <div key={p.name} className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10px] text-slate-400 w-16 truncate">{p.name}</span>
                  <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden flex">
                    {p.H > 0 && <div className="h-full bg-green-500"  style={{ width: `${(p.H/total)*100}%` }} />}
                    {p.W > 0 && <div className="h-full bg-yellow-500" style={{ width: `${(p.W/total)*100}%` }} />}
                    {p.C > 0 && <div className="h-full bg-red-500"    style={{ width: `${(p.C/total)*100}%` }} />}
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 w-4 text-right">{total}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Row 3: Alerts trend + top critical ── */}
      <div className="grid grid-cols-12 gap-4">
        {/* Alert trend bar chart */}
        <div className="col-span-4 bg-bg-secondary border border-white/10 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-white mb-1">Alert Volume</h3>
          <p className="text-[11px] text-slate-500 mb-4">Critical & warning over time</p>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={chartData} barSize={6} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#475569' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 9, fill: '#475569' }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: '#0f1623', border: '1px solid #1e293b', borderRadius: 8, fontSize: 11 }} />
                <Bar dataKey="critical" name="Critical" stackId="a" fill="#ff3d71" radius={[0,0,0,0]} />
                <Bar dataKey="warning"  name="Warning"  stackId="a" fill="#ffcc00" radius={[2,2,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-32 flex items-center justify-center text-slate-500 text-xs">Accumulating data…</div>
          )}
        </div>

        {/* Critical servers */}
        <div className="col-span-4 bg-bg-secondary border border-white/10 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Critical Servers</h3>
            <span className="text-xs font-mono text-red-400">{criticalSrvs.length}</span>
          </div>
          {criticalSrvs.length === 0 ? (
            <div className="flex items-center gap-2 py-6 justify-center">
              <Activity size={16} className="text-green-400" />
              <span className="text-green-400 text-sm">All servers healthy</span>
            </div>
          ) : (
            <div className="space-y-2">
              {criticalSrvs.slice(0, 5).map(s => (
                <div key={s.id} className="flex items-center gap-3 p-2.5 bg-red-500/5 border border-red-500/20 rounded-xl">
                  <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white truncate">{s.name}</p>
                    {s.public_ip && <p className="text-[10px] font-mono text-slate-500">{s.public_ip}</p>}
                  </div>
                  <div className="text-right text-[10px]">
                    <p className="text-red-400 font-mono">CPU {Math.round(s.cpu)}%</p>
                    <p className="text-orange-400 font-mono">MEM {Math.round(s.mem)}%</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent alerts */}
        <div className="col-span-4 bg-bg-secondary border border-white/10 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Active Alerts</h3>
            <span className="text-xs font-mono text-orange-400">{alerts.length}</span>
          </div>
          {alerts.length === 0 ? (
            <div className="flex items-center gap-2 py-6 justify-center">
              <Shield size={16} className="text-green-400" />
              <span className="text-green-400 text-sm">No active alerts</span>
            </div>
          ) : (
            <div className="space-y-2">
              {alerts.slice(0, 5).map(a => (
                <div key={a.id} className="flex items-start gap-2.5 p-2.5 bg-bg-primary rounded-xl border border-white/5">
                  <span className={`w-2 h-2 rounded-full mt-0.5 shrink-0 ${a.severity === 'critical' ? 'bg-red-400' : 'bg-yellow-400'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-white truncate">{a.title}</p>
                    <p className="text-[10px] text-slate-500 truncate">{a.resource}</p>
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${
                    a.severity === 'critical' ? 'text-red-400 border-red-500/30 bg-red-500/10' : 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10'
                  }`}>{a.severity}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Row 4: Live server table ── */}
      <div className="bg-bg-secondary border border-white/10 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
          <div>
            <h3 className="text-sm font-semibold text-white">Live Server Status</h3>
            <p className="text-[11px] text-slate-500">All {servers.length} servers · updates every 30s</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-400 animate-pulse' : 'bg-slate-600'}`} />
            <span className="text-[11px] text-slate-400">{wsConnected ? 'Live' : 'Polling'}</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-[11px] text-slate-500 border-b border-white/10">
                <th className="text-left py-2 px-4 font-medium">Server / IP</th>
                <th className="text-left py-2 px-3 font-medium">Provider</th>
                <th className="text-left py-2 px-3 font-medium">Region</th>
                <th className="text-left py-2 px-3 font-medium">CPU</th>
                <th className="text-left py-2 px-3 font-medium">Memory</th>
                <th className="text-left py-2 px-3 font-medium">Disk</th>
                <th className="text-left py-2 px-4 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {servers.map(s => <ServerRow key={s.id} server={s} />)}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
