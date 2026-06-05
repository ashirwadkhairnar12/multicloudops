import React, { useEffect, useState } from 'react'
import { Zap, TrendingUp, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react'
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, AreaChart, Area } from 'recharts'
import useStore from '@/store/useStore'

// Simple statistical anomaly detection — Z-score based
function detectAnomalies(servers) {
  if (servers.length < 2) return []
  const active = servers.filter(s => s.status !== 'stopped')
  if (active.length === 0) return []

  const cpus  = active.map(s => s.cpu)
  const mems  = active.map(s => s.mem)
  const disks = active.map(s => s.disk)

  const mean  = arr => arr.reduce((a, b) => a + b, 0) / arr.length
  const std   = arr => { const m = mean(arr); return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length) }

  const cpuMean = mean(cpus);  const cpuStd = std(cpus)
  const memMean = mean(mems);  const memStd = std(mems)
  const diskMean = mean(disks); const diskStd = std(disks)

  const anomalies = []
  for (const s of active) {
    const cpuZ  = cpuStd  > 0 ? Math.abs((s.cpu  - cpuMean)  / cpuStd)  : 0
    const memZ  = memStd  > 0 ? Math.abs((s.mem  - memMean)  / memStd)  : 0
    const diskZ = diskStd > 0 ? Math.abs((s.disk - diskMean) / diskStd) : 0

    const maxZ = Math.max(cpuZ, memZ, diskZ)
    if (maxZ < 1.5) continue

    const metric = cpuZ >= memZ && cpuZ >= diskZ ? 'CPU' : memZ >= diskZ ? 'Memory' : 'Disk'
    const value  = metric === 'CPU' ? s.cpu : metric === 'Memory' ? s.mem : s.disk
    const baseline = metric === 'CPU' ? cpuMean : metric === 'Memory' ? memMean : diskMean

    anomalies.push({
      id:        s.id,
      name:      s.name,
      provider:  s.provider,
      region:    s.region,
      metric,
      value:     Math.round(value * 10) / 10,
      baseline:  Math.round(baseline * 10) / 10,
      zScore:    Math.round(maxZ * 100) / 100,
      severity:  maxZ >= 3 ? 'critical' : maxZ >= 2 ? 'high' : 'medium',
      deviation: Math.round((value - baseline) * 10) / 10,
    })
  }

  return anomalies.sort((a, b) => b.zScore - a.zScore)
}

const SEV_STYLE = {
  critical: 'bg-red-500/10 text-red-400 border-red-500/20',
  high:     'bg-orange-500/10 text-orange-400 border-orange-500/20',
  medium:   'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
}

export default function AnomalyPage() {
  const { servers, trendData } = useStore()
  const [history, setHistory]  = useState([])
  const [refreshed, setRefreshed] = useState(false)

  useEffect(() => {
    fetch('/api/history/overview?hours=6').then(r => r.json()).then(d => setHistory(d.points || []))
  }, [])

  const refresh = () => {
    setRefreshed(true)
    fetch('/api/history/overview?hours=6').then(r => r.json()).then(d => {
      setHistory(d.points || [])
      setTimeout(() => setRefreshed(false), 1000)
    })
  }

  if (servers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Zap size={40} className="text-slate-600 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">No data yet</h2>
        <p className="text-slate-400 text-sm">Connect an agent to enable anomaly detection.</p>
      </div>
    )
  }

  const anomalies  = detectAnomalies(servers)
  const active     = servers.filter(s => s.status !== 'stopped')
  const scatterData = active.map(s => ({
    x:     Math.round(s.cpu),
    y:     Math.round(s.mem),
    name:  s.name,
    provider: s.provider,
    isAnomaly: anomalies.some(a => a.id === s.id),
  }))

  const avgCpu  = active.length ? (active.reduce((a, s) => a + s.cpu, 0) / active.length).toFixed(1) : 0
  const avgMem  = active.length ? (active.reduce((a, s) => a + s.mem, 0) / active.length).toFixed(1) : 0

  // Enrich history with anomaly count
  const enrichedHistory = (history.length > 0 ? history : trendData).map((p, i) => ({
    ...p,
    anomaly_score: p.critical * 2 + p.warning,
  }))

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Anomaly Detection</h1>
          <p className="text-xs text-slate-400 mt-0.5">Statistical analysis using Z-score deviation from fleet baseline</p>
        </div>
        <button onClick={refresh} className="p-2 rounded-xl border border-white/10 text-slate-400 hover:text-white hover:bg-white/5">
          <RefreshCw size={15} className={refreshed ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Anomalies Detected', value: anomalies.length,                                     color: anomalies.length > 0 ? 'text-red-400' : 'text-green-400' },
          { label: 'Critical Anomalies', value: anomalies.filter(a => a.severity === 'critical').length, color: 'text-red-400' },
          { label: 'Fleet Avg CPU',      value: `${avgCpu}%`,                                          color: 'text-blue-400' },
          { label: 'Fleet Avg MEM',      value: `${avgMem}%`,                                          color: 'text-orange-400' },
        ].map(k => (
          <div key={k.label} className="bg-bg-secondary border border-white/10 rounded-2xl p-5">
            <p className="text-xs text-slate-400 mb-2">{k.label}</p>
            <p className={`text-3xl font-bold ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Scatter plot: CPU vs MEM */}
        <div className="col-span-5 bg-bg-secondary border border-white/10 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-white mb-1">CPU vs Memory Scatter</h3>
          <p className="text-xs text-slate-500 mb-4">Red dots = statistical anomalies (Z-score ≥ 1.5)</p>
          <ResponsiveContainer width="100%" height={220}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
              <XAxis dataKey="x" name="CPU" unit="%" type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: '#64748b' }} label={{ value: 'CPU %', position: 'bottom', fontSize: 10, fill: '#64748b' }} />
              <YAxis dataKey="y" name="MEM" unit="%" type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: '#64748b' }} label={{ value: 'MEM %', angle: -90, position: 'left', fontSize: 10, fill: '#64748b' }} />
              <ReferenceLine x={parseFloat(avgCpu)} stroke="#ffffff30" strokeDasharray="4 4" />
              <ReferenceLine y={parseFloat(avgMem)} stroke="#ffffff30" strokeDasharray="4 4" />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                contentStyle={{ background: '#1a1f2e', border: '1px solid #ffffff20', borderRadius: 8, fontSize: 11 }}
                formatter={(value, name, props) => [value + '%', name]}
                content={({ payload }) => {
                  if (!payload?.length) return null
                  const d = payload[0]?.payload
                  return (
                    <div className="bg-bg-primary border border-white/20 rounded-lg p-2 text-xs">
                      <p className="font-medium text-white">{d?.name}</p>
                      <p className="text-slate-400">{d?.provider}</p>
                      <p className="text-blue-400">CPU: {d?.x}%</p>
                      <p className="text-orange-400">MEM: {d?.y}%</p>
                      {d?.isAnomaly && <p className="text-red-400 font-bold mt-1">⚠ Anomaly</p>}
                    </div>
                  )
                }}
              />
              <Scatter
                data={scatterData.filter(d => !d.isAnomaly)}
                fill="#00d68f"
                opacity={0.7}
                r={4}
              />
              <Scatter
                data={scatterData.filter(d => d.isAnomaly)}
                fill="#ff3d71"
                opacity={0.9}
                r={6}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        {/* Anomaly score over time */}
        <div className="col-span-7 bg-bg-secondary border border-white/10 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-white mb-1">Anomaly Score Over Time</h3>
          <p className="text-xs text-slate-500 mb-4">Combined score: critical × 2 + warning</p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={enrichedHistory}>
              <defs>
                <linearGradient id="aGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ff3d71" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ff3d71" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="cGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00b4d8" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#00b4d8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
              <Tooltip contentStyle={{ background: '#1a1f2e', border: '1px solid #ffffff20', borderRadius: 8, fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="cpu"           stroke="#00b4d8" fill="url(#cGrad)" strokeWidth={2} name="Avg CPU %" />
              <Area type="monotone" dataKey="anomaly_score" stroke="#ff3d71" fill="url(#aGrad)" strokeWidth={2} name="Anomaly Score" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Anomaly list */}
      <div className="bg-bg-secondary border border-white/10 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">
          Detected Anomalies
          <span className="ml-2 text-xs font-normal text-slate-400">— servers deviating significantly from fleet baseline</span>
        </h3>
        {anomalies.length === 0 ? (
          <div className="flex items-center gap-3 py-6 justify-center">
            <CheckCircle size={20} className="text-green-400" />
            <p className="text-green-400 font-medium">No anomalies detected — fleet is behaving normally</p>
          </div>
        ) : (
          <div className="space-y-2">
            {anomalies.map(a => (
              <div key={a.id} className="flex items-center gap-4 p-3 bg-bg-primary rounded-xl border border-white/5">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-lg border shrink-0 ${SEV_STYLE[a.severity]}`}>
                  {a.severity.toUpperCase()}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{a.name}</p>
                  <p className="text-xs text-slate-500">{a.provider} · {a.region}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-mono text-white">{a.metric}: <span className="text-red-400">{a.value}%</span></p>
                  <p className="text-xs text-slate-500">baseline {a.baseline}% · Δ{a.deviation > 0 ? '+' : ''}{a.deviation}%</p>
                </div>
                <div className="text-right shrink-0 w-20">
                  <p className="text-xs text-slate-400">Z-score</p>
                  <p className="text-sm font-bold font-mono text-orange-400">{a.zScore}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ML Explainer */}
      <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-blue-300 mb-3 flex items-center gap-2">
          <Zap size={14} /> How Detection Works (Phase 2 — Statistical)
        </h3>
        <div className="grid grid-cols-3 gap-4 text-xs text-slate-400">
          <div><span className="text-blue-400 font-semibold">Z-Score:</span> Measures how many standard deviations a server's metric is from the fleet average. Score ≥ 1.5 = anomaly.</div>
          <div><span className="text-blue-400 font-semibold">Baseline:</span> Computed live from all active servers. Updates every 30 seconds as agents push metrics.</div>
          <div><span className="text-blue-400 font-semibold">Phase 3 ML:</span> Isolation Forest + LSTM time-series model will replace Z-score with learned per-server baselines.</div>
        </div>
      </div>
    </div>
  )
}
