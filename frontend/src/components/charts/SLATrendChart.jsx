import React from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts'

export default function SLATrendChart({ data }) {
  return (
    <div className="card">
      <div className="card-header">
        <span className="text-xs font-medium text-white">SLA Compliance Trend</span>
        <span className="text-[10px] text-slate-500 font-mono">Last 30 Days</span>
      </div>
      <div className="p-3">
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2d45" />
            <XAxis dataKey="day" tick={{ fontSize: 9, fill: '#4a5568' }} tickLine={false} axisLine={false} interval={6} />
            <YAxis domain={[99.5, 100]} tick={{ fontSize: 9, fill: '#4a5568' }} tickLine={false} axisLine={false} tickFormatter={v => `${v.toFixed(1)}%`} />
            <Tooltip
              contentStyle={{ background: '#131929', border: '1px solid #1e2d45', borderRadius: 6, fontSize: 11 }}
              formatter={(v) => [`${v.toFixed(3)}%`]}
            />
            <ReferenceLine y={99.9} stroke="#ff3d71" strokeDasharray="4 4" strokeOpacity={0.5} />
            <Line type="monotone" dataKey="aws" name="AWS" stroke="#ff9900" strokeWidth={1.5} dot={false} />
            <Line type="monotone" dataKey="azure" name="Azure" stroke="#0089d6" strokeWidth={1.5} dot={false} />
            <Line type="monotone" dataKey="gcp" name="GCP" stroke="#4285f4" strokeWidth={1.5} dot={false} />
            <Line type="monotone" dataKey="onprem" name="On-Prem" stroke="#8b5cf6" strokeWidth={1.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
        <div className="flex gap-4 mt-1">
          {[['AWS','#ff9900'],['Azure','#0089d6'],['GCP','#4285f4'],['On-Prem','#8b5cf6']].map(([k,c]) => (
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
