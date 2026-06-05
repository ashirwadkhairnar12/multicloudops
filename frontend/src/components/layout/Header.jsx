import React, { useState, useEffect } from 'react'
import { Search, Bell, RefreshCw } from 'lucide-react'
import useStore from '@/store/useStore'

const PAGE_TITLES = {
  overview:       'Overview',
  infrastructure: 'Infrastructure',
  alerts:         'Alerts',
  dashboards:     'Dashboards',
  incidents:      'Incidents',
  command:        'Incident Command',
  sla:            'SLA Monitoring',
  agents:         'Monitoring Agents',
  metrics:        'Metrics Explorer',
  logs:           'Logs',
  anomaly:        'Anomaly Detection',
  remediation:    'Auto-Remediation',
  reports:        'Reports',
  integrations:   'Integrations',
  users:          'Users & Roles',
  settings:       'Settings',
}

export default function Header() {
  const { activeNav, alerts, wsConnected, fetchAll } = useStore()
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const criticalCount = alerts.filter(a => a.severity === 'critical').length

  return (
    <header className="h-12 bg-bg-secondary border-b border-bg-border flex items-center px-4 gap-3 shrink-0">
      {/* Live dot + title */}
      <div className="flex items-center gap-2 mr-4">
        <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-status-healthy animate-pulse' : 'bg-slate-600'}`} />
        <h1 className="font-display text-sm font-semibold text-white">
          {PAGE_TITLES[activeNav] || activeNav}
        </h1>
      </div>

      {/* Search */}
      <div className="flex-1 max-w-xs relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
        <input
          className="w-full bg-bg-primary border border-bg-border rounded-md pl-7 pr-3 py-1 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-accent/50"
          placeholder="Search resources..."
        />
      </div>

      <div className="ml-auto flex items-center gap-3">
        <span className="font-mono text-[11px] text-slate-500">
          {now.toLocaleTimeString()}
        </span>

        {/* WS status */}
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
          wsConnected
            ? 'bg-green-500/10 text-green-400 border-green-500/20'
            : 'bg-slate-700/50 text-slate-500 border-slate-600/30'
        }`}>
          {wsConnected ? '● CONNECTED' : '○ CONNECTING…'}
        </span>

        {/* Refresh */}
        <button
          onClick={fetchAll}
          className="p-1.5 hover:bg-bg-hover rounded-md transition-colors"
          title="Refresh data"
        >
          <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
        </button>

        {/* Alerts bell */}
        <button className="relative p-1.5 hover:bg-bg-hover rounded-md transition-colors">
          <Bell className="w-3.5 h-3.5 text-slate-400" />
          {criticalCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-status-critical rounded-full text-[9px] font-bold text-white flex items-center justify-center">
              {criticalCount}
            </span>
          )}
        </button>
      </div>
    </header>
  )
}
