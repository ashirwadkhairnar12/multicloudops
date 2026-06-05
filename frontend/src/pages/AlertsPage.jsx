import React, { useState } from 'react'
import { Bell, CheckCircle, Filter, RefreshCw } from 'lucide-react'
import useStore from '@/store/useStore'

const SEV = {
  critical: { badge: 'bg-red-500/10 text-red-400 border-red-500/20',    dot: 'bg-red-400' },
  warning:  { badge: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20', dot: 'bg-yellow-400' },
}

function timeAgo(ts) {
  if (!ts) return '—'
  try {
    const d = new Date(ts)
    const diff = Math.floor((Date.now() - d) / 1000)
    if (diff < 60)   return `${diff}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    return `${Math.floor(diff / 3600)}h ago`
  } catch { return ts }
}

export default function AlertsPage() {
  const { alerts, servers, fetchAlerts } = useStore()
  const [filter, setFilter]   = useState('all')
  const [loading, setLoading] = useState(false)
  const [created, setCreated] = useState({})

  const refresh = async () => {
    setLoading(true)
    await fetchAlerts()
    setLoading(false)
  }

  const createIncident = async (alert) => {
    const server = alert.server || {}
    await fetch('/api/incidents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title:       alert.title,
        severity:    alert.severity === 'critical' ? 'critical' : 'high',
        impact:      alert.severity === 'critical' ? 'High' : 'Medium',
        description: `Auto-created from alert on ${alert.resource}`,
        server_id:   server.id || '',
        server_name: server.name || alert.resource,
      }),
    })
    setCreated(c => ({ ...c, [alert.id]: true }))
  }

  const filtered = filter === 'all' ? alerts : alerts.filter(a => a.severity === filter)
  const critical = alerts.filter(a => a.severity === 'critical').length
  const warning  = alerts.filter(a => a.severity === 'warning').length

  if (servers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Bell size={40} className="text-slate-700 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">No alerts</h2>
        <p className="text-slate-400 text-sm">Alerts will appear here once agents are connected and reporting.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Alerts</h1>
          <p className="text-xs text-slate-400 mt-0.5">{critical} critical · {warning} warning</p>
        </div>
        <button onClick={refresh} className="p-2 rounded-xl border border-white/10 text-slate-400 hover:text-white hover:bg-white/5">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Alerts', value: alerts.length, color: 'text-white' },
          { label: 'Critical',     value: critical,       color: 'text-red-400' },
          { label: 'Warning',      value: warning,        color: 'text-yellow-400' },
        ].map(k => (
          <div key={k.label} className="bg-bg-secondary border border-white/10 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-1">{k.label}</p>
            <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {['all','critical','warning'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
              filter === f
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                : 'bg-bg-secondary border border-white/10 text-slate-400 hover:text-white'
            }`}>
            {f} {f !== 'all' && `(${f === 'critical' ? critical : warning})`}
          </button>
        ))}
      </div>

      {/* Alert list */}
      {alerts.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <CheckCircle size={36} className="text-green-500 mb-3" />
          <p className="text-white font-medium">All clear</p>
          <p className="text-slate-400 text-sm mt-1">No active alerts across {servers.length} servers</p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-slate-500 text-sm text-center py-12">No {filter} alerts</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(a => {
            const s = SEV[a.severity] || SEV.warning
            return (
              <div key={a.id} className="bg-bg-secondary border border-white/10 rounded-xl p-4 flex items-center gap-4 hover:bg-white/5 transition-colors">
                <span className={`w-2 h-2 rounded-full shrink-0 animate-pulse ${s.dot}`} />
                <span className={`text-xs font-medium px-2.5 py-1 rounded-lg border shrink-0 ${s.badge}`}>
                  {a.severity.toUpperCase()}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white">{a.title}</p>
                  <p className="text-xs text-slate-500 truncate mt-0.5">{a.resource}</p>
                </div>
                <div className="text-right shrink-0 space-y-0.5">
                  <p className="text-xs text-slate-500 font-mono">{timeAgo(a.time)}</p>
                  <p className="text-xs text-slate-600">{a.source}</p>
                </div>
                <span className="text-xs bg-slate-700/50 text-slate-400 px-2 py-0.5 rounded shrink-0">
                  {a.status}
                </span>
                {!created[a.id] ? (
                  <button
                    onClick={() => createIncident(a)}
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 text-xs font-medium transition-colors whitespace-nowrap"
                  >
                    → Incident
                  </button>
                ) : (
                  <span className="shrink-0 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-medium whitespace-nowrap">
                    ✓ Created
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
