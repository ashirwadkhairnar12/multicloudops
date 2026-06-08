import React, { useEffect, useState } from 'react'
import { Zap, TrendingUp, AlertTriangle, CheckCircle, RefreshCw, Cloud, Server } from 'lucide-react'
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
         ResponsiveContainer, ReferenceLine, AreaChart, Area } from 'recharts'
import useStore from '@/store/useStore'
import useCloudStore from '@/store/useCloudStore'

function detectAnomalies(resources) {
  const active = resources.filter(r => r.status !== 'stopped' && (r.cpu > 0 || r.mem > 0))
  if (active.length < 2) return []

  const cpus  = active.map(r => r.cpu  || 0)
  const mems  = active.map(r => r.mem  || 0)
  const disks = active.map(r => r.disk || 0)

  const mean = arr => arr.reduce((a, b) => a + b, 0) / arr.length
  const std  = arr => {
    const m = mean(arr)
    return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length)
  }

  const cpuMean = mean(cpus);  const cpuStd = std(cpus)
  const memMean = mean(mems);  const memStd = std(mems)
  const diskMean= mean(disks); const diskStd= std(disks)

  const anomalies = []
  for (const r of active) {
    const cpuZ  = cpuStd  > 0 ? Math.abs(((r.cpu  ||0) - cpuMean)  / cpuStd)  : 0
    const memZ  = memStd  > 0 ? Math.abs(((r.mem  ||0) - memMean)  / memStd)  : 0
    const diskZ = diskStd > 0 ? Math.abs(((r.disk ||0) - diskMean) / diskStd) : 0
    const maxZ  = Math.max(cpuZ, memZ, diskZ)
    if (maxZ < 1.5) continue

    const metric  = cpuZ >= memZ && cpuZ >= diskZ ? 'CPU' : memZ >= diskZ ? 'Memory' : 'Disk'
    const value   = metric === 'CPU' ? (r.cpu||0) : metric === 'Memory' ? (r.mem||0) : (r.disk||0)
    const baseline= metric === 'CPU' ? cpuMean : metric === 'Memory' ? memMean : diskMean

    anomalies.push({
      id:        r.id,
      name:      r.name,
      provider:  r.provider,
      region:    r.region,
      service:   r.service || r.type || 'Server',
      source:    r.account_id ? 'cloud' : 'agent',
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

const SEV = {
  critical: 'bg-red-500/10 text-red-400 border-red-500/20',
  high:     'bg-orange-500/10 text-orange-400 border-orange-500/20',
  medium:   'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
}

export default function AnomalyPage() {
  const { servers, trendData }     = useStore()
  const { getAllResources, loadAllAccountData } = useCloudStore()
  const [history,   setHistory]   = useState([])
  const [refreshed, setRefreshed] = useState(false)

  useEffect(() => {
    fetch('/api/history/overview?hours=6').then(r => r.json()).then(d => setHistory(d.points || []))
    loadAllAccountData()
  }, [])

  const cloudResources = getAllResources()
  const allResources   = [
    ...servers.map(s => ({ ...s, _src: 'agent' })),
    ...cloudResources.map(r => ({ ...r, _src: 'cloud' })),
  ]

  const refresh = () => {
    setRefreshed(true)
    fetch('/api/history/overview?hours=6').then(r => r.json()).then(d => {
      setHistory(d.points || [])
      setTimeout(() => setRefreshed(false), 1000)
    })
    loadAllAccountData()
  }

  if (allResources.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Zap size={40} className="text-slate-600 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">No data yet</h2>
        <p className="text-slate-400 text-sm">Connect an agent or cloud account to enable anomaly detection.</p>
      </div>
    )
  }

  const anomalies  = detectAnomalies(allResources)
  const active     = allResources.filter(r => r.status !== 'stopped' && (r.cpu > 0 || r.mem > 0))
  const avgCpu     = active.length ? (active.reduce((a, r) => a + (r.cpu||0), 0) / active.length).toFixed(1) : 0
  const avgMem     = active.length ? (active.reduce((a, r) => a + (r.mem||0), 0) / active.length).toFixed(1) : 0

  const scatterData = active.map(r => ({
    x: Math.round(r.cpu||0), y: Math.round(r.mem||0),
    name: r.name, provider: r.provider, service: r.service || r.type,
    source: r._src,
    isAnomaly: anomalies.some(a => a.id === r.id),
  }))

  const chartData = history.length > 0 ? history : trendData
  const enriched  = chartData.map(p => ({ ...p, anomaly_score: (p.critical||0)*2 + (p.warning||0) }))

  const cloudCount = allResources.filter(r => r._src === 'cloud').length
  const agentCount = allResources.filter(r => r._src === 'agent').length

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Anomaly Detection</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Z-score statistical analysis across {allResources.length} resources
            <span className="text-orange-400 ml-2">☁ {cloudCount} cloud</span>
            <span className="text-blue-400 ml-2">⬡ {agentCount} agent</span>
          </p>
        </div>
        <button onClick={refresh}
          className="p-2 rounded-xl border border-white/10 text-slate-400 hover:text-white hover:bg-white/5">
          <RefreshCw size={15} className={refreshed ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Anomalies Detected', value: anomalies.length,                                       color: anomalies.length > 0 ? 'text-red-400' : 'text-green-400' },
          { label: 'Critical Anomalies', value: anomalies.filter(a => a.severity==='critical').length,  color: 'text-red-400' },
          { label: 'Fleet Avg CPU',      value: `${avgCpu}%`,                                           color: 'text-blue-400' },
          { label: 'Fleet Avg MEM',      value: `${avgMem}%`,                                           color: 'text-orange-400' },
        ].map(k => (
          <div key={k.label} className="bg-bg-secondary border border-white/10 rounded-2xl p-5">
            <p className="text-xs text-slate-400 mb-2">{k.label}</p>
            <p className={`text-3xl font-bold ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Scatter: CPU vs MEM */}
        <div className="col-span-5 bg-bg-secondary border border-white/10 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-white mb-1">CPU vs Memory Scatter</h3>
          <p className="text-xs text-slate-500 mb-4">
            <span className="text-red-400">●</span> Anomaly &nbsp;
            <span className="text-green-400">●</span> Normal &nbsp;
            <span className="text-orange-400">☁</span> Cloud &nbsp;
            <span className="text-blue-400">⬡</span> Agent
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
              <XAxis dataKey="x" name="CPU" unit="%" type="number" domain={[0,100]}
                tick={{ fontSize:10, fill:'#64748b' }} label={{ value:'CPU %', position:'bottom', fontSize:10, fill:'#64748b' }} />
              <YAxis dataKey="y" name="MEM" unit="%" type="number" domain={[0,100]}
                tick={{ fontSize:10, fill:'#64748b' }} label={{ value:'MEM %', angle:-90, position:'left', fontSize:10, fill:'#64748b' }} />
              <ReferenceLine x={parseFloat(avgCpu)} stroke="#ffffff20" strokeDasharray="4 4" />
              <ReferenceLine y={parseFloat(avgMem)} stroke="#ffffff20" strokeDasharray="4 4" />
              <Tooltip
                content={({ payload }) => {
                  if (!payload?.length) return null
                  const d = payload[0]?.payload
                  return (
                    <div className="bg-bg-primary border border-white/20 rounded-lg p-2 text-xs">
                      <p className="font-medium text-white">{d?.name}</p>
                      <p className="text-slate-400">{d?.provider} · {d?.service}</p>
                      <p className="text-blue-400">CPU: {d?.x}%</p>
                      <p className="text-orange-400">MEM: {d?.y}%</p>
                      <p className="text-slate-400">{d?.source === 'cloud' ? '☁ Cloud' : '⬡ Agent'}</p>
                      {d?.isAnomaly && <p className="text-red-400 font-bold mt-1">⚠ Anomaly</p>}
                    </div>
                  )
                }}
              />
              {/* Normal cloud */}
              <Scatter data={scatterData.filter(d => !d.isAnomaly && d.source==='cloud')} fill="#FF9900" opacity={0.6} r={4} />
              {/* Normal agent */}
              <Scatter data={scatterData.filter(d => !d.isAnomaly && d.source==='agent')} fill="#00d68f" opacity={0.7} r={4} />
              {/* Anomalies */}
              <Scatter data={scatterData.filter(d => d.isAnomaly)} fill="#ff3d71" opacity={0.9} r={7} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        {/* Anomaly timeline */}
        <div className="col-span-7 bg-bg-secondary border border-white/10 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-white mb-1">Anomaly Score Over Time</h3>
          <p className="text-xs text-slate-500 mb-4">Combined score: critical × 2 + warning</p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={enriched}>
              <defs>
                {[['aGrad','#ff3d71'],['cGrad','#00b4d8']].map(([id,c]) => (
                  <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={c} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={c} stopOpacity={0}   />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
              <XAxis dataKey="time" tick={{ fontSize:10, fill:'#64748b' }} />
              <YAxis tick={{ fontSize:10, fill:'#64748b' }} />
              <Tooltip contentStyle={{ background:'#1a1f2e', border:'1px solid #ffffff20', borderRadius:8, fontSize:11 }} />
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
          <span className="ml-2 text-xs font-normal text-slate-400">— deviating from fleet baseline</span>
        </h3>
        {anomalies.length === 0 ? (
          <div className="flex items-center gap-3 py-6 justify-center">
            <CheckCircle size={20} className="text-green-400" />
            <p className="text-green-400 font-medium">No anomalies — fleet behaving normally</p>
          </div>
        ) : (
          <div className="space-y-2">
            {anomalies.map(a => (
              <div key={a.id} className="flex items-center gap-4 p-3 bg-bg-primary rounded-xl border border-white/5">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-lg border shrink-0 ${SEV[a.severity]}`}>
                  {a.severity.toUpperCase()}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{a.name}</p>
                  <p className="text-xs text-slate-500">{a.provider} · {a.region} · {a.service}</p>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${
                  a.source==='cloud'
                    ? 'border-orange-500/30 text-orange-400 bg-orange-500/10'
                    : 'border-blue-500/30 text-blue-400 bg-blue-500/10'
                }`}>{a.source==='cloud' ? '☁ Cloud' : '⬡ Agent'}</span>
                <div className="text-right shrink-0">
                  <p className="text-sm font-mono text-white">
                    {a.metric}: <span className="text-red-400">{a.value}%</span>
                  </p>
                  <p className="text-xs text-slate-500">baseline {a.baseline}% · Δ{a.deviation>0?'+':''}{a.deviation}%</p>
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

      {/* Explainer */}
      <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-blue-300 mb-3 flex items-center gap-2">
          <Zap size={14} /> Detection Method — Statistical Z-Score
        </h3>
        <div className="grid grid-cols-3 gap-4 text-xs text-slate-400">
          <div><span className="text-blue-400 font-semibold">Z-Score: </span>Measures standard deviations from fleet average. ≥1.5 = anomaly, ≥3.0 = critical.</div>
          <div><span className="text-blue-400 font-semibold">Sources: </span>Combines agent-reported metrics and CloudWatch data from all connected AWS accounts.</div>
          <div><span className="text-blue-400 font-semibold">Phase 4 ML: </span>Isolation Forest + LSTM per-resource baseline for learned, adaptive detection.</div>
        </div>
      </div>
    </div>
  )
}
