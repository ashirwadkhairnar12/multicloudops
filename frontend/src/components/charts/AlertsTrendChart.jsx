import React from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

export default function AlertsTrendChart({ data, title }) {
  return (
    <div className="card">
      <div className="card-header">
        <span className="text-xs font-medium text-white">{title || 'Alerts Trend'}</span>
        <span className="text-[10px] text-slate-500 font-mono">Last 24 Hours</span>
      </div>
      <div className="p-3">
        <ResponsiveContainer width="100%" height={130}>
          <BarChart data={data} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2d45" />
            <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#4a5568' }} tickLine={false} axisLine={false} interval={5} />
            <YAxis tick={{ fontSize: 9, fill: '#4a5568' }} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{ background: '#131929', border: '1px solid #1e2d45', borderRadius: 6, fontSize: 11 }}
              labelStyle={{ color: '#94a3b8' }}
            />
            <Bar dataKey="critical" name="Critical" stackId="a" fill="#ff3d71" radius={[0,0,0,0]} />
            <Bar dataKey="warning" name="Warning" stackId="a" fill="#ffcc00" radius={[2,2,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
