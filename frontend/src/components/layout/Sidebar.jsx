import React, { useState } from 'react'
import {
  LayoutDashboard, Server, Bell, Activity, BarChart3, Search,
  Zap, Wrench, FileText, Puzzle, Settings, Cloud, Wifi, WifiOff,
  Bot, LogOut, ChevronDown, ChevronRight, DollarSign, Shield, Database
} from 'lucide-react'
import useStore from '@/store/useStore'
import useAuthStore from '@/store/useAuthStore'
import useCloudStore from '@/store/useCloudStore'

const NAV_SECTIONS = [
  {
    label: 'Monitoring',
    items: [
      { id: 'overview',       label: 'Overview',          icon: LayoutDashboard },
      { id: 'infrastructure', label: 'Infrastructure',    icon: Server },
      { id: 'alerts',         label: 'Alerts',            icon: Bell, badgeKey: 'criticalAlerts' },
      { id: 'dashboards',     label: 'Executive',         icon: BarChart3 },
    ],
  },
  {
    label: 'Operations',
    items: [
      { id: 'incidents',  label: 'Incidents',        icon: Activity, badgeKey: 'openIncidents' },
      { id: 'command',    label: 'Incident Command', icon: Zap },
      { id: 'sla',        label: 'SLA Monitoring',   icon: BarChart3 },
      { id: 'anomaly',    label: 'Anomaly Detection',icon: Search },
      { id: 'capacity',   label: 'Capacity Planning',icon: Database },
    ],
  },
  {
    label: 'Cloud',
    items: [
      { id: 'cloud-accounts', label: 'Cloud Accounts', icon: Cloud, badge: 'cloud' },
      { id: 'agents',         label: 'Agents',          icon: Bot },
    ],
  },
  {
    label: 'Platform',
    items: [
      { id: 'logs',         label: 'Logs',             icon: FileText },
      { id: 'remediation',  label: 'Auto-Remediation', icon: Wrench },
      { id: 'reports',      label: 'Reports',          icon: FileText },
      { id: 'integrations', label: 'Integrations',     icon: Puzzle },
      { id: 'settings',     label: 'Settings',         icon: Settings },
    ],
  },
]

export default function Sidebar() {
  const { activeNav, setActiveNav, wsConnected, getStats } = useStore()
  const { user, logout }   = useAuthStore()
  const { accounts }       = useCloudStore()
  const stats              = getStats()
  const [collapsed, setCollapsed] = useState({})

  const initials = user?.full_name
    ? user.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.username?.slice(0, 2).toUpperCase() || 'U'

  const toggleSection = (label) =>
    setCollapsed(c => ({ ...c, [label]: !c[label] }))

  const getBadge = (item) => {
    if (item.badgeKey && stats[item.badgeKey] > 0) return stats[item.badgeKey]
    if (item.badge === 'cloud') {
      const errors = accounts.filter(a => a.status === 'error').length
      return errors > 0 ? errors : null
    }
    return null
  }

  return (
    <aside className="w-52 min-h-screen bg-bg-secondary border-r border-bg-border flex flex-col shrink-0">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-bg-border">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-accent/20 border border-accent/40 flex items-center justify-center">
            <Cloud className="w-4 h-4 text-accent" />
          </div>
          <div>
            <div className="font-display text-sm font-bold text-white leading-none">MultiCloud</div>
            <div className="text-[10px] text-slate-500 font-mono">Ops v3.0</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {NAV_SECTIONS.map(({ label, items }) => (
          <div key={label} className="mb-1">
            <button
              onClick={() => toggleSection(label)}
              className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider hover:text-slate-300 transition-colors"
            >
              {label}
              {collapsed[label]
                ? <ChevronRight size={10} />
                : <ChevronDown size={10} />
              }
            </button>

            {!collapsed[label] && (
              <div className="px-2 space-y-0.5">
                {items.map(({ id, label: itemLabel, icon: Icon, badgeKey, badge }) => {
                  const badgeCount = getBadge({ badgeKey, badge })
                  return (
                    <div
                      key={id}
                      onClick={() => setActiveNav(id)}
                      className={`nav-item ${activeNav === id ? 'active' : ''}`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span className="text-xs flex-1">{itemLabel}</span>
                      {badgeCount > 0 && (
                        <span className="text-[10px] bg-status-critical/80 text-white px-1.5 py-0.5 rounded-full font-mono">
                          {badgeCount}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-bg-border space-y-2">
        <div className="flex items-center gap-2 text-xs">
          {wsConnected
            ? <><Wifi className="w-3 h-3 text-status-healthy" /><span className="text-status-healthy font-mono">Live</span></>
            : <><WifiOff className="w-3 h-3 text-status-stopped" /><span className="text-slate-500 font-mono">Connecting…</span></>
          }
          <span className="text-slate-600 ml-auto text-[10px]">
            {accounts.filter(a => a.status === 'active').length > 0 &&
              `${accounts.filter(a => a.status === 'active').length} cloud`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-accent/30 flex items-center justify-center text-[10px] font-bold text-accent shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-medium text-white truncate">{user?.full_name || user?.username}</div>
            <div className="text-[10px] text-slate-500 capitalize">{user?.role}</div>
          </div>
          <button onClick={logout} title="Sign out"
            className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-white transition-colors shrink-0">
            <LogOut size={12} />
          </button>
        </div>
      </div>
    </aside>
  )
}
