import React, { useEffect, useState } from 'react'
import { BarChart3, TrendingUp, TrendingDown, CheckCircle, AlertTriangle } from 'lucide-react'
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import useStore from '@/store/useStore'

export default function SLAPage() {
  const { servers } = useStore()
  const [history, setHistory]   = useState([])
  const [overview, setOverview] = useState(null)

  useEffect(() => {
    fetch('/api/stats/overview').then(r => r.json()).then(setOverview)
    fetch('/api/history/overview?hours=24').then(r => r.json()).then(d => setHistory(d.points || []))
  }, [])

  if (servers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <BarChart3 size={40} className="text-slate-600 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">No data yet</h2>
        <p className="text-slate-400 text-sm">Connect an agent to start tracking SLA compliance.</p>
      </div>
    )
  }

  const total     = servers.length
  const healthy   = servers.filter(s => s.status === 'healthy').length
  const stopped   = servers.filter(s => s.status === 'stopped').length
  const critical  = servers.filter(s => s.status === 'critical').length
  const sla       = total > 0 ? ((healthy / total) * 100).toFixed(2) : '100.00'
  const slaNum    = parseFloat(sla)
  const slaColor  = slaNum >= 99.9 ? 'text-green-400' : slaNum >= 99.0 ? 'text-yellow-400' : 'text-red-400'

  // Per-provider SLA
  const providers = [...new Set(servers.map(s => s.provider))]
  const providerSLA = providers.map(p => {
    const ps = servers.filter(s => s.provider === p)
    const ph = ps.filter(s => s.status === 'healthy').length
    const pct = ps.length > 0 ? ((ph / ps.length) * 100).toFixed(2) : '100.00'
    return { provider: p, total: ps.length, healthy: ph, sla: parseFloat(pct) }
  })

  const targets = [
    { label: 'Overall Uptime',   target: 99.9,  actual: slaNum },
    { label: 'Healthy Servers',  target: 95.0,  actual: total > 0 ? (healthy / total * 100) : 100 },
    { label: 'Zero Critical',    target: 100.0, actual: critical === 0 ? 100 : 0 },
    { label: 'Availability',     target: 99.5,  actual: total > 0 ? ((total - stopped) / total * 100) : 100 },
  ]

  return (
    <div className="space-y-5 animate-fade-in">
      <h1 className="text-xl font-bold text-white">SLA Monitoring</h1>

      {/* Top KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <div className="col-span-1 bg-bg-secondary border border-white/10 rounded-2xl p-6 flex flex-col items-center justify-center">
          <p className="text-xs text-slate-400 mb-2">Overall SLA</p>
          <p className={`text-5xl font-bold font-mono ${slaColor}`}>{sla}%</p>
          <p className="text-xs text-slate-500 mt-2">based on server health</p>
        </div>
        {[
          { label: 'Total Servers',    value: total,   color: 'text-white' },
          { label: 'Healthy',          value: healthy,  color: 'text-green-400' },
          { label: 'Critical / Down',  value: `${critical} / ${stopped}`, color: critical > 0 ? 'text-red-400' : 'text-slate-400' },
        ].map(k => (
          <div key={k.label} className="bg-bg-secondary border border-white/10 rounded-2xl p-5">
            <p className="text-xs text-slate-400 mb-2">{k.label}</p>
            <p className={`text-3xl font-bold ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* SLA Targets */}
      <div className="bg-bg-secondary border border-white/10 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">SLA Targets</h3>
        <div className="space-y-3">
          {targets.map(t => {
            const pct = Math.min(100, t.actual)
            const met = t.actual >= t.target
            return (
              <div key={t.label} className="flex items-center gap-4">
                <div className="w-40 shrink-0">
                  <p className="text-xs text-white">{t.label}</p>
                  <p className="text-[11px] text-slate-500">Target: {t.target}%</p>
                </div>
                <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${met ? 'bg-green-500' : 'bg-red-500'}`}
                    style={{ width: `${pct}%` }} />
                </div>
                <div className="w-20 text-right">
                  <span className={`text-xs font-mono font-bold ${met ? 'text-green-400' : 'text-red-400'}`}>
                    {t.actual.toFixed(1)}%
                  </span>
                  {met
                    ? <CheckCircle size={12} className="text-green-400 inline ml-1" />
                    : <AlertTriangle size={12} className="text-red-400 inline ml-1" />}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* History chart */}
      {history.length > 0 && (
        <div className="bg-bg-secondary border border-white/10 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">24h Health Trend</h3>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={history}>
              <defs>
                <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00d68f" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#00d68f" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#64748b' }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#64748b' }} unit="%" />
              <Tooltip contentStyle={{ background: '#1a1f2e', border: '1px solid #ffffff20', borderRadius: 8, fontSize: 11 }} />
              <Area type="monotone" dataKey="cpu" stroke="#00d68f" strokeWidth={2} fill="url(#cpuGrad)" name="Avg CPU %" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Per-provider SLA table */}
      <div className="bg-bg-secondary border border-white/10 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">SLA by Provider</h3>
        <div className="space-y-2">
          {providerSLA.map(p => (
            <div key={p.provider} className="flex items-center gap-4 py-2 border-b border-white/5 last:border-0">
              <span className="text-sm text-white w-28">{p.provider}</span>
              <span className="text-xs text-slate-500">{p.total} servers · {p.healthy} healthy</span>
              <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${p.sla >= 99.9 ? 'bg-green-500' : p.sla >= 95 ? 'bg-yellow-500' : 'bg-red-500'}`}
                  style={{ width: `${p.sla}%` }} />
              </div>
              <span className={`text-sm font-bold font-mono w-16 text-right ${
                p.sla >= 99.9 ? 'text-green-400' : p.sla >= 95 ? 'text-yellow-400' : 'text-red-400'
              }`}>{p.sla.toFixed(2)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
