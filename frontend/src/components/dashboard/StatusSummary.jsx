import React from 'react'
import { Server, AlertTriangle, XCircle, Pause, Activity } from 'lucide-react'

const STATUS_CONFIG = [
  { key: 'total',       label: 'Total Servers', icon: Server,        color: '#00b4d8', bg: 'bg-accent/10',               border: 'border-accent/20' },
  { key: 'healthy',     label: 'Healthy',        icon: Activity,      color: '#00d68f', bg: 'bg-status-healthy/10',       border: 'border-status-healthy/20' },
  { key: 'warning',     label: 'Warning',        icon: AlertTriangle, color: '#ffcc00', bg: 'bg-status-warning/10',       border: 'border-status-warning/20' },
  { key: 'critical',    label: 'Critical',       icon: XCircle,       color: '#ff3d71', bg: 'bg-status-critical/10',      border: 'border-status-critical/20' },
  { key: 'fluctuating', label: 'Fluctuating',    icon: Activity,      color: '#ff8c00', bg: 'bg-status-fluctuating/10',   border: 'border-status-fluctuating/20' },
  { key: 'stopped',     label: 'Stopped',        icon: Pause,         color: '#6b7280', bg: 'bg-gray-500/10',             border: 'border-gray-500/20' },
]

export default function StatusSummary({ stats }) {
  return (
    <div className="grid grid-cols-6 gap-3">
      {STATUS_CONFIG.map(({ key, label, icon: Icon, color, bg, border }) => (
        <div key={key} className={`card border ${border} ${bg} px-3 py-3`}>
          <div className="flex items-center gap-2 mb-1">
            <Icon className="w-3.5 h-3.5" style={{ color }} />
            <span className="text-[11px] text-slate-400">{label}</span>
          </div>
          <div className="font-display text-xl font-bold" style={{ color }}>
            {stats[key] ?? 0}
          </div>
        </div>
      ))}
    </div>
  )
}
