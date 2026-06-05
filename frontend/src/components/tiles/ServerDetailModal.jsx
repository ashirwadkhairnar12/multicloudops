import React from 'react'
import { X, Server, Cpu, MemoryStick, HardDrive, Wifi, Clock, Activity } from 'lucide-react'
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

// Generate sparkline history for a metric value
function makeHistory(base) {
  return Array.from({ length: 20 }, (_, i) => ({
    t: i,
    v: Math.max(1, Math.min(99, base + (Math.random() - 0.5) * 20))
  }))
}

export default function ServerDetailModal({ server, onClose }) {
  if (!server) return null

  const statusColor = getStatusColor(server.status)
  const borderClass = getStatusBorder(server.status)
  const providerColor = getProviderColor(server.provider)
  const cpuHistory = makeHistory(server.cpu)
  const memHistory = makeHistory(server.mem)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className={`bg-bg-secondary border ${borderClass} rounded-xl w-[580px] max-h-[80vh] overflow-y-auto shadow-2xl`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-bg-border">
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
              <div className={`w-2 h-2 rounded-full ${server.status === 'healthy' ? 'bg-status-healthy animate-pulse-slow' : server.status === 'critical' ? 'bg-status-critical' : 'bg-status-warning'}`} />
              <span className={`text-xs font-mono font-semibold capitalize ${statusColor}`}>{server.status}</span>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-bg-hover rounded-md text-slate-500 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Provider + Uptime badges */}
          <div className="flex gap-2 flex-wrap">
            <span className="badge" style={{ color: providerColor, borderColor: `${providerColor}40`, backgroundColor: `${providerColor}15` }}>
              {server.provider}
            </span>
            <span className="badge badge-healthy">Uptime {server.uptime}</span>
            <span className="badge badge-info">Network {server.net}</span>
          </div>

          {/* Gauges */}
          <div className="flex justify-around py-2">
            <MetricGauge label="CPU" value={server.cpu} />
            <MetricGauge label="Memory" value={server.mem} />
            <MetricGauge label="Disk" value={server.disk} />
          </div>

          {/* CPU sparkline */}
          <div>
            <div className="text-[11px] text-slate-400 mb-2 flex items-center gap-1.5">
              <Cpu className="w-3 h-3" /> CPU History (last 20 readings)
            </div>
            <div className="h-20">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={cpuHistory} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gcpud" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00b4d8" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#00b4d8" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="t" hide />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#4a5568' }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ background: '#131929', border: '1px solid #1e2d45', fontSize: 10 }} formatter={v => [`${Math.round(v)}%`]} />
                  <Area type="monotone" dataKey="v" stroke="#00b4d8" strokeWidth={1.5} fill="url(#gcpud)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Memory sparkline */}
          <div>
            <div className="text-[11px] text-slate-400 mb-2 flex items-center gap-1.5">
              <Activity className="w-3 h-3" /> Memory History
            </div>
            <div className="h-20">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={memHistory} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gmemd" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00d68f" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#00d68f" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="t" hide />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#4a5568' }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ background: '#131929', border: '1px solid #1e2d45', fontSize: 10 }} formatter={v => [`${Math.round(v)}%`]} />
                  <Area type="monotone" dataKey="v" stroke="#00d68f" strokeWidth={1.5} fill="url(#gmemd)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-3">
            {[
              ['Server ID', server.id],
              ['Provider', server.provider],
              ['Region', server.region],
              ['Type', server.type],
              ['Network I/O', server.net],
              ['Uptime', server.uptime],
            ].map(([k, v]) => (
              <div key={k} className="bg-bg-card rounded-lg px-3 py-2">
                <div className="text-[10px] text-slate-500">{k}</div>
                <div className="text-xs font-mono text-white mt-0.5">{v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
