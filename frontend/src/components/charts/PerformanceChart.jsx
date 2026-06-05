import React from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-bg-card border border-bg-border rounded-lg p-2 text-[11px]">
      <div className="text-slate-400 mb-1 font-mono">{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} className="flex gap-2">
          <span style={{ color: p.color }}>{p.name}:</span>
          <span className="text-white font-mono">{Math.round(p.value)}%</span>
        </div>
      ))}
    </div>
  )
}

export default function PerformanceChart({ data, title }) {
  return (
    <div className="card">
      <div className="card-header">
        <span className="text-xs font-medium text-white">{title || 'Performance Overview'}</span>
        <span className="text-[10px] text-slate-500 font-mono">Last 24 Hours</span>
      </div>
      <div className="p-3">
        <ResponsiveContainer width="100%" height={130}>
          <AreaChart data={data} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
            <defs>
              <linearGradient id="gCpu" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00b4d8" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#00b4d8" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gMem" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00d68f" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#00d68f" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gNet" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ff9900" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#ff9900" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2d45" />
            <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#4a5568' }} tickLine={false} axisLine={false} interval={5} />
            <YAxis tick={{ fontSize: 9, fill: '#4a5568' }} tickLine={false} axisLine={false} domain={[0, 100]} />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="cpu" name="CPU" stroke="#00b4d8" strokeWidth={1.5} fill="url(#gCpu)" dot={false} />
            <Area type="monotone" dataKey="mem" name="MEM" stroke="#00d68f" strokeWidth={1.5} fill="url(#gMem)" dot={false} />
            <Area type="monotone" dataKey="net" name="NET" stroke="#ff9900" strokeWidth={1.5} fill="url(#gNet)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
        <div className="flex gap-4 mt-1">
          {[['CPU','#00b4d8'],['MEM','#00d68f'],['NET','#ff9900']].map(([k,c]) => (
            <div key={k} className="flex items-center gap-1">
              <div className="w-2 h-0.5 rounded" style={{ backgroundColor: c }} />
              <span className="text-[10px] text-slate-500">{k}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
