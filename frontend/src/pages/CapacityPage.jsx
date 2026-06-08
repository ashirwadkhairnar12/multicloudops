import React, { useEffect, useState } from 'react'
import { TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
         ResponsiveContainer, ReferenceLine, Cell } from 'recharts'
import useStore from '@/store/useStore'
import useCloudStore from '@/store/useCloudStore'

function riskColor(pct) {
  if (pct >= 85) return '#ff3d71'
  if (pct >= 70) return '#ffcc00'
  return '#00d68f'
}
function riskLabel(pct) {
  if (pct >= 85) return { label:'Critical', cls:'text-red-400 bg-red-500/10 border-red-500/20' }
  if (pct >= 70) return { label:'Warning',  cls:'text-yellow-400 bg-yellow-500/10 border-yellow-500/20' }
  return             { label:'Healthy',  cls:'text-green-400 bg-green-500/10 border-green-500/20' }
}
function projectDays(current, threshold=85, growthPerDay=0.5) {
  if (current >= threshold) return 0
  if (growthPerDay <= 0)    return null
  return Math.ceil((threshold - current) / growthPerDay)
}

export default function CapacityPage() {
  const { servers }        = useStore()
  const { getAllResources, loadAllAccountData } = useCloudStore()
  const [history, setHistory] = useState([])

  useEffect(() => {
    fetch('/api/history/overview?hours=24').then(r => r.json()).then(d => setHistory(d.points || []))
    loadAllAccountData()
  }, [])

  const cloudResources = getAllResources()
  const allResources   = [
    ...servers.map(s => ({ ...s, _src: 'agent' })),
    ...cloudResources.map(r => ({ ...r, _src: 'cloud' })),
  ]
  const active = allResources.filter(r => r.status !== 'stopped')

  if (allResources.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <TrendingUp size={40} className="text-slate-600 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">No data yet</h2>
        <p className="text-slate-400 text-sm">Connect an agent or cloud account to start capacity planning.</p>
      </div>
    )
  }

  const avgCpu  = active.length ? active.reduce((a,r) => a+(r.cpu||0),  0)/active.length : 0
  const avgMem  = active.length ? active.reduce((a,r) => a+(r.mem||0),  0)/active.length : 0
  const avgDisk = active.length ? active.reduce((a,r) => a+(r.disk||0), 0)/active.length : 0

  const overProvisioned  = active.filter(r => (r.cpu||0) < 20 && (r.mem||0) < 30)
  const underProvisioned = active.filter(r => (r.cpu||0) > 80 || (r.mem||0) > 80 || (r.disk||0) > 85)

  const serverCapacity = active
    .map(r => ({
      name:      r.name.length > 14 ? r.name.slice(0,14)+'…' : r.name,
      fullName:  r.name,
      provider:  r.provider,
      service:   r.service || r.type || 'VM',
      source:    r._src,
      CPU:       Math.round(r.cpu||0),
      Memory:    Math.round(r.mem||0),
      Disk:      Math.round(r.disk||0),
      maxMetric: Math.max(r.cpu||0, r.mem||0, r.disk||0),
    }))
    .sort((a,b) => b.maxMetric - a.maxMetric)

  const providers = [...new Set(active.map(r => r.provider))]
  const providerCapacity = providers.map(p => {
    const ps = active.filter(r => r.provider === p)
    const avgC = ps.reduce((a,r) => a+(r.cpu||0),  0)/ps.length
    const avgM = ps.reduce((a,r) => a+(r.mem||0),  0)/ps.length
    const avgD = ps.reduce((a,r) => a+(r.disk||0), 0)/ps.length
    const src  = ps.some(r => r._src==='cloud') ? 'cloud' : 'agent'
    return {
      provider: p, servers: ps.length, source: src,
      avgCpu:   Math.round(avgC), avgMem: Math.round(avgM), avgDisk: Math.round(avgD),
      projDisk: projectDays(avgD),
    }
  })

  const cpuBuckets = [
    { range:'0–20%',   count: active.filter(r=>(r.cpu||0)<20).length },
    { range:'20–40%',  count: active.filter(r=>(r.cpu||0)>=20&&(r.cpu||0)<40).length },
    { range:'40–60%',  count: active.filter(r=>(r.cpu||0)>=40&&(r.cpu||0)<60).length },
    { range:'60–80%',  count: active.filter(r=>(r.cpu||0)>=60&&(r.cpu||0)<80).length },
    { range:'80–100%', count: active.filter(r=>(r.cpu||0)>=80).length },
  ]

  const cloudCount = allResources.filter(r => r._src==='cloud').length
  const agentCount = allResources.filter(r => r._src==='agent').length

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-white">Capacity Planning</h1>
        <p className="text-xs text-slate-400 mt-0.5">
          {active.length} active resources
          <span className="text-orange-400 ml-2">☁ {cloudCount} cloud</span>
          <span className="text-blue-400 ml-2">⬡ {agentCount} agent</span>
        </p>
      </div>

      {/* Fleet summary */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label:'Fleet Avg CPU',    value:`${avgCpu.toFixed(1)}%`,  color:riskColor(avgCpu),  pct:avgCpu },
          { label:'Fleet Avg Memory', value:`${avgMem.toFixed(1)}%`,  color:riskColor(avgMem),  pct:avgMem },
          { label:'Fleet Avg Disk',   value:`${avgDisk.toFixed(1)}%`, color:riskColor(avgDisk), pct:avgDisk },
          { label:'Capacity Risk',    value:underProvisioned.length,   color:underProvisioned.length>0?'#ff3d71':'#00d68f', pct:0 },
        ].map(k => (
          <div key={k.label} className="bg-bg-secondary border border-white/10 rounded-2xl p-5">
            <p className="text-xs text-slate-400 mb-2">{k.label}</p>
            <p className="text-3xl font-bold" style={{ color:k.color }}>{k.value}</p>
            {k.pct > 0 && (
              <div className="mt-2 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width:`${k.pct}%`, background:k.color }} />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Top resources by utilisation */}
        <div className="col-span-8 bg-bg-secondary border border-white/10 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">
            Resource Utilisation (top {Math.min(10, serverCapacity.length)})
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={serverCapacity.slice(0,10)} barSize={8}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
              <XAxis dataKey="name" tick={{ fontSize:9, fill:'#64748b' }} />
              <YAxis tick={{ fontSize:10, fill:'#64748b' }} unit="%" domain={[0,100]} />
              <Tooltip
                contentStyle={{ background:'#1a1f2e', border:'1px solid #ffffff20', borderRadius:8, fontSize:11 }}
                content={({ payload }) => {
                  const d = payload?.[0]?.payload
                  if (!d) return null
                  return (
                    <div className="bg-bg-primary border border-white/20 rounded-lg p-2 text-xs">
                      <p className="font-medium text-white mb-1">{d.fullName}</p>
                      <p className="text-slate-400">{d.provider} · {d.service}</p>
                      <p className="text-[10px] mt-1">{d.source==='cloud' ? '☁ Cloud API' : '⬡ Agent'}</p>
                      <p className="text-blue-400">CPU: {d.CPU}%</p>
                      <p className="text-orange-400">Mem: {d.Memory}%</p>
                      <p className="text-yellow-400">Disk: {d.Disk}%</p>
                    </div>
                  )
                }}
              />
              <ReferenceLine y={85} stroke="#ff3d71" strokeDasharray="4 4" label={{ value:'85%', fontSize:9, fill:'#ff3d71' }} />
              <ReferenceLine y={70} stroke="#ffcc00" strokeDasharray="4 4" />
              <Bar dataKey="CPU"    fill="#00b4d8" radius={[2,2,0,0]} />
              <Bar dataKey="Memory" fill="#ff8c00" radius={[2,2,0,0]} />
              <Bar dataKey="Disk"   fill="#8b5cf6" radius={[2,2,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* CPU distribution */}
        <div className="col-span-4 bg-bg-secondary border border-white/10 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">CPU Distribution</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={cpuBuckets} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
              <XAxis dataKey="range" tick={{ fontSize:9, fill:'#64748b' }} />
              <YAxis tick={{ fontSize:10, fill:'#64748b' }} allowDecimals={false} />
              <Tooltip contentStyle={{ background:'#1a1f2e', border:'1px solid #ffffff20', borderRadius:8, fontSize:11 }} />
              <Bar dataKey="count" name="Resources" radius={[4,4,0,0]}>
                {cpuBuckets.map((_, i) => (
                  <Cell key={i} fill={i===4?'#ff3d71':i===3?'#ffcc00':i===0?'#6b7280':'#00d68f'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Provider capacity table */}
      <div className="bg-bg-secondary border border-white/10 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Capacity by Provider</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-slate-500 border-b border-white/10">
                {['Provider','Source','Resources','Avg CPU','Avg Mem','Avg Disk','Disk Runway','Risk'].map(h => (
                  <th key={h} className={`${h==='Provider'?'text-left':'text-right'} py-2 pr-4 font-medium`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {providerCapacity.map(p => {
                const risk = riskLabel(Math.max(p.avgCpu, p.avgMem, p.avgDisk))
                return (
                  <tr key={p.provider} className="hover:bg-white/5">
                    <td className="py-2.5 pr-4 font-medium text-white">{p.provider}</td>
                    <td className="text-right pr-4">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                        p.source==='cloud'
                          ? 'border-orange-500/30 text-orange-400 bg-orange-500/10'
                          : 'border-blue-500/30 text-blue-400 bg-blue-500/10'
                      }`}>{p.source==='cloud'?'☁ API':'⬡ Agent'}</span>
                    </td>
                    <td className="text-right pr-4 text-slate-400">{p.servers}</td>
                    <td className="text-right pr-4" style={{ color:riskColor(p.avgCpu) }}>{p.avgCpu}%</td>
                    <td className="text-right pr-4" style={{ color:riskColor(p.avgMem) }}>{p.avgMem}%</td>
                    <td className="text-right pr-4" style={{ color:riskColor(p.avgDisk)}}>{p.avgDisk}%</td>
                    <td className="text-right pr-4 text-slate-400 font-mono text-xs">
                      {p.projDisk===0 ? <span className="text-red-400">Now</span>
                        : p.projDisk ? `~${p.projDisk}d`
                        : <span className="text-green-400">OK</span>}
                    </td>
                    <td className="text-right">
                      <span className={`text-xs px-2 py-0.5 rounded-lg border ${risk.cls}`}>{risk.label}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recommendations */}
      <div className="grid grid-cols-2 gap-4">
        {overProvisioned.length > 0 && (
          <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-4">
            <h4 className="text-sm font-semibold text-blue-300 mb-2 flex items-center gap-2">
              <CheckCircle size={14} /> Over-Provisioned ({overProvisioned.length})
            </h4>
            <p className="text-xs text-slate-400 mb-2">CPU &lt;20% and Memory &lt;30% — consider right-sizing.</p>
            <div className="space-y-1">
              {overProvisioned.slice(0,4).map(r => (
                <div key={r.id} className="flex justify-between text-xs">
                  <span className="text-slate-300">{r.name}</span>
                  <span className="text-slate-500">CPU {Math.round(r.cpu||0)}% · MEM {Math.round(r.mem||0)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {underProvisioned.length > 0 && (
          <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-4">
            <h4 className="text-sm font-semibold text-red-300 mb-2 flex items-center gap-2">
              <AlertTriangle size={14} /> Under-Provisioned ({underProvisioned.length})
            </h4>
            <p className="text-xs text-slate-400 mb-2">High resource usage — scale up or redistribute workload.</p>
            <div className="space-y-1">
              {underProvisioned.slice(0,4).map(r => (
                <div key={r.id} className="flex justify-between text-xs">
                  <span className="text-slate-300">{r.name}</span>
                  <span className="text-red-400">CPU {Math.round(r.cpu||0)}% · MEM {Math.round(r.mem||0)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
