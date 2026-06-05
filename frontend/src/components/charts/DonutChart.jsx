import React from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

export default function DonutChart({ data, title, centerLabel, centerValue }) {
  return (
    <div className="card">
      {title && (
        <div className="card-header">
          <span className="text-xs font-medium text-white">{title}</span>
        </div>
      )}
      <div className="p-3 flex items-center gap-4">
        <div className="relative w-24 h-24 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} cx="50%" cy="50%" innerRadius={28} outerRadius={42} dataKey="value" strokeWidth={0}>
                {data.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#131929', border: '1px solid #1e2d45', borderRadius: 6, fontSize: 11 }}
              />
            </PieChart>
          </ResponsiveContainer>
          {centerValue && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="font-display text-lg font-bold text-white">{centerValue}</div>
              {centerLabel && <div className="text-[9px] text-slate-500">{centerLabel}</div>}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          {data.map(item => (
            <div key={item.name} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
              <span className="text-[10px] text-slate-400 flex-1">{item.name}</span>
              <span className="text-[10px] font-mono text-white">{item.value}</span>
              {item.pct && <span className="text-[10px] text-slate-500">({item.pct}%)</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
