import React, { useState } from 'react'
import {
  X, Server, Cpu, HardDrive, Wifi, Clock, Activity,
  AlertCircle, Terminal, Package, ShieldCheck,
} from 'lucide-react'
import { getStatusColor, getStatusBorder, getProviderColor, getCpuColor } from '@/utils/helpers'
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts'

function MetricGauge({ label, value, unit = '%' }) {
  const color = getCpuColor(value)
  const circumference = 2 * Math.PI * 28
  const offset = circumference - (value / 100) * circumference
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-16 h-16">
        <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90">
          <circle cx="32" cy="32" r="28" fill="none" stroke="#1e2d45" strokeWidth="5" />
          <circle
            cx="32" cy="32" r="28" fill="none"
            stroke={color} strokeWidth="5"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.7s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-mono font-bold text-white">{Math.round(value)}{unit}</span>
        </div>
      </div>
      <span className="text-[10px] text-slate-500">{label}</span>
    </div>
  )
}

function makeHistory(base) {
  return Array.from({ length: 20 }, (_, i) => ({
    t: i,
    v: Math.max(1, Math.min(99, base + (Math.random() - 0.5) * 20))
  }))
}

// Alert banner shown when CPU or memory is in warning/critical range
function ResourceAlertBanner({ server, onTabSwitch }) {
  const cpuAlert = server.cpu >= 85 ? 'critical' : server.cpu >= 70 ? 'warning' : null
  const memAlert = server.mem >= 85 ? 'critical' : server.mem >= 70 ? 'warning' : null

  if (!cpuAlert && !memAlert) return null

  const isCritical = cpuAlert === 'critical' || memAlert === 'critical'

  return (
    <button
      onClick={() => onTabSwitch('metrics')}
      className={`w-full text-left flex items-start gap-3 p-3 rounded-xl border mb-4 transition-all hover:opacity-90 ${
        isCritical
          ? 'bg-red-500/10 border-red-500/30 text-red-400'
          : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
      }`}
    >
      <AlertCircle size={14} className="shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold">
          {isCritical ? 'Critical resource usage' : 'High resource usage'}
        </p>
        <p className="text-[11px] opacity-75 mt-0.5">
          {cpuAlert && `CPU at ${Math.round(server.cpu)}%`}
          {cpuAlert && memAlert && ' · '}
          {memAlert && `Memory at ${Math.round(server.mem)}%`}
          {' — process-level detail requires AWS SSM (connect a cloud account)'}
        </p>
      </div>
      <span className="text-[10px] opacity-60 shrink-0">View →</span>
    </button>
  )
}

export default function ServerDetailModal({ server, onClose }) {
  const [tab, setTab] = useState('overview')
  if (!server) return null

  const statusColor   = getStatusColor(server.status)
  const borderClass   = getStatusBorder(server.status)
  const providerColor = getProviderColor(server.provider)
  const cpuHistory    = makeHistory(server.cpu)
  const memHistory    = makeHistory(server.mem)

  const cpuAlert = server.cpu >= 85 ? 'critical' : server.cpu >= 70 ? 'warning' : null
  const memAlert = server.mem >= 85 ? 'critical' : server.mem >= 70 ? 'warning' : null
  const hasAlert = cpuAlert || memAlert

  const TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'metrics',  label: 'Metrics',
      badge: hasAlert ? { danger: cpuAlert === 'critical' || memAlert === 'critical' } : null },
    { key: 'system',   label: 'System Info' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className={`bg-bg-secondary border ${borderClass} rounded-xl w-[580px] max-h-[85vh] overflow-hidden shadow-2xl flex flex-col`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-bg-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-bg-card border border-bg-border flex items-center justify-center">
              <Server className="w-4 h-4 text-slate-400" />
            </div>
            <div>
              <div className="font-mono text-sm font-semibold text-white">{server.name}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">{server.id} · {server.type} · {server.region}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${
                server.status === 'healthy'  ? 'bg-status-healthy animate-pulse-slow' :
                server.status === 'critical' ? 'bg-status-critical' : 'bg-status-warning'
              }`} />
              <span className={`text-xs font-mono font-semibold capitalize ${statusColor}`}>{server.status}</span>
            </div>
            {hasAlert && (
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-lg border ${
                cpuAlert === 'critical' || memAlert === 'critical'
                  ? 'text-red-400 bg-red-500/10 border-red-500/30'
                  : 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30'
              }`}>
                ⚡ {cpuAlert === 'critical' || memAlert === 'critical' ? 'Critical' : 'Warning'}
              </span>
            )}
            <button onClick={onClose} className="p-1 hover:bg-bg-hover rounded-md text-slate-500 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0.5 px-5 pt-3 shrink-0">
          {TABS.map(({ key, label, badge }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-colors ${
                tab === key ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {label}
              {badge && (
                <span className={`text-[10px] w-1.5 h-1.5 rounded-full ${
                  badge.danger ? 'bg-red-400' : 'bg-yellow-400'
                }`} />
              )}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Alert banner visible on non-metrics tabs */}
          {tab !== 'metrics' && hasAlert && (
            <ResourceAlertBanner server={server} onTabSwitch={setTab} />
          )}

          {/* ── Overview ── */}
          {tab === 'overview' && (
            <>
              <div className="flex gap-2 flex-wrap">
                <span className="badge" style={{ color: providerColor, borderColor: `${providerColor}40`, backgroundColor: `${providerColor}15` }}>
                  {server.provider}
                </span>
                <span className="badge badge-healthy">Uptime {server.uptime}</span>
                <span className="badge badge-info">Network {server.net}</span>
              </div>

              <div className="flex justify-around py-2">
                <MetricGauge label="CPU" value={server.cpu} />
                <MetricGauge label="Memory" value={server.mem} />
                <MetricGauge label="Disk" value={server.disk} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  ['Server ID',   server.id],
                  ['Provider',    server.provider],
                  ['Region',      server.region],
                  ['Type',        server.type],
                  ['Network I/O', server.net],
                  ['Uptime',      server.uptime],
                ].map(([k, v]) => (
                  <div key={k} className="bg-bg-card rounded-lg px-3 py-2">
                    <div className="text-[10px] text-slate-500">{k}</div>
                    <div className="text-xs font-mono text-white mt-0.5">{v}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── Metrics ── */}
          {tab === 'metrics' && (
            <>
              {/* CPU */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                    <Cpu className="w-3 h-3" /> CPU Usage
                  </div>
                  <span className={`text-xs font-mono font-bold ${getCpuColor(server.cpu) === '#ff3d71' ? 'text-red-400' : getCpuColor(server.cpu) === '#ffcc00' ? 'text-yellow-400' : 'text-green-400'}`}>
                    {Math.round(server.cpu)}%
                  </span>
                </div>
                {cpuAlert && (
                  <div className={`text-xs mb-2 px-3 py-2 rounded-lg border flex items-center gap-2 ${
                    cpuAlert === 'critical'
                      ? 'bg-red-500/10 border-red-500/20 text-red-400'
                      : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'
                  }`}>
                    <AlertCircle size={12} />
                    CPU is {cpuAlert === 'critical' ? 'critically high' : 'elevated'} at {Math.round(server.cpu)}%.
                    For process-level detail, connect this server via AWS SSM.
                  </div>
                )}
                <div className="h-20">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={cpuHistory} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gcpud2" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#00b4d8" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#00b4d8" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="t" hide />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#4a5568' }} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ background: '#131929', border: '1px solid #1e2d45', fontSize: 10 }} formatter={v => [`${Math.round(v)}%`]} />
                      <Area type="monotone" dataKey="v" stroke="#00b4d8" strokeWidth={1.5} fill="url(#gcpud2)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Memory */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                    <Activity className="w-3 h-3" /> Memory Usage
                  </div>
                  <span className={`text-xs font-mono font-bold`} style={{ color: getCpuColor(server.mem) }}>
                    {Math.round(server.mem)}%
                  </span>
                </div>
                {memAlert && (
                  <div className={`text-xs mb-2 px-3 py-2 rounded-lg border flex items-center gap-2 ${
                    memAlert === 'critical'
                      ? 'bg-red-500/10 border-red-500/20 text-red-400'
                      : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'
                  }`}>
                    <AlertCircle size={12} />
                    Memory is {memAlert === 'critical' ? 'critically high' : 'elevated'} at {Math.round(server.mem)}%.
                    For per-process memory breakdown, connect via AWS SSM.
                  </div>
                )}
                <div className="h-20">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={memHistory} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gmemd2" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#00d68f" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#00d68f" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="t" hide />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#4a5568' }} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ background: '#131929', border: '1px solid #1e2d45', fontSize: 10 }} formatter={v => [`${Math.round(v)}%`]} />
                      <Area type="monotone" dataKey="v" stroke="#00d68f" strokeWidth={1.5} fill="url(#gmemd2)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Disk */}
              <div className="bg-bg-card rounded-xl p-3">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-400 flex items-center gap-1.5"><HardDrive size={12} /> Disk</span>
                  <span className="font-mono text-slate-300">{server.disk}%</span>
                </div>
                <div className="h-2 bg-bg-primary rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{
                    width: `${server.disk}%`,
                    backgroundColor: server.disk >= 90 ? '#ff3d71' : server.disk >= 70 ? '#ffcc00' : '#4a5568'
                  }} />
                </div>
              </div>
            </>
          )}

          {/* ── System Info ── */}
          {tab === 'system' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['Server ID',   server.id],
                  ['Name',        server.name],
                  ['Provider',    server.provider],
                  ['Region',      server.region],
                  ['Type',        server.type],
                  ['Agent ID',    server.agent_id || '—'],
                  ['Public IP',   server.public_ip || '—'],
                  ['Network I/O', server.net],
                  ['Uptime',      server.uptime],
                  ['Last seen',   server.timestamp ? new Date(server.timestamp).toLocaleString() : '—'],
                ].map(([k, v]) => (
                  <div key={k} className="bg-bg-card rounded-lg px-3 py-2">
                    <div className="text-[10px] text-slate-500">{k}</div>
                    <div className="text-xs font-mono text-white mt-0.5 truncate">{v}</div>
                  </div>
                ))}
              </div>

              <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4 text-xs text-blue-400">
                <p className="font-medium mb-1 flex items-center gap-1.5">
                  <Terminal size={12} /> Process-level monitoring
                </p>
                <p className="text-slate-400 leading-relaxed">
                  This server is monitored via the MCO agent which reports CPU, memory, disk and network totals.
                  For per-process CPU/memory, installed software inventory, and compliance checks,
                  connect this instance to AWS SSM (requires IAM role with{' '}
                  <span className="font-mono text-slate-300">AmazonSSMManagedInstanceCore</span>).
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
