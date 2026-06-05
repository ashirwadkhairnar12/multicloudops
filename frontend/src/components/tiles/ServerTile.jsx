import React, { useState } from 'react'
import { getStatusBorder, getStatusColor, getProviderColor, getCpuColor } from '@/utils/helpers'
import ServerDetailModal from './ServerDetailModal'

const STATUS_LABELS = {
  healthy: 'Healthy', warning: 'Warning', critical: 'Critical',
  fluctuating: 'Fluctuating', stopped: 'Stopped',
}

function MiniBar({ value, color }) {
  return (
    <div className="h-1 w-full bg-bg-primary rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${value}%`, backgroundColor: color }} />
    </div>
  )
}

export default function ServerTile({ server }) {
  const [showModal, setShowModal] = useState(false)
  const borderClass  = getStatusBorder(server.status)
  const statusColor  = getStatusColor(server.status)
  const providerColor = getProviderColor(server.provider)

  return (
    <>
      <div
        className={`card border ${borderClass} p-3 hover:bg-bg-hover transition-all cursor-pointer group tile-${server.status}`}
        onClick={() => setShowModal(true)}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-1.5">
          <div className="flex-1 min-w-0">
            <div className="text-xs font-mono font-medium text-white truncate">{server.name}</div>
            {server.public_ip
              ? <div className="text-[10px] font-mono text-slate-500 mt-0.5">{server.public_ip}</div>
              : <div className="text-[10px] text-slate-600 mt-0.5">{server.type} · {server.region}</div>
            }
          </div>
          <div className={`text-[10px] font-mono font-semibold ${statusColor} shrink-0 ml-2`}>
            {STATUS_LABELS[server.status]}
          </div>
        </div>

        {/* Provider + region */}
        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border"
            style={{ color: providerColor, borderColor: `${providerColor}40`, backgroundColor: `${providerColor}15` }}>
            {server.provider}
          </span>
          <span className="text-[10px] text-slate-600 truncate">{server.region}</span>
        </div>

        {/* Metrics */}
        <div className="space-y-1.5">
          <div>
            <div className="flex justify-between text-[10px] text-slate-500 mb-0.5">
              <span>CPU</span><span style={{ color: getCpuColor(server.cpu) }}>{Math.round(server.cpu)}%</span>
            </div>
            <MiniBar value={server.cpu} color={getCpuColor(server.cpu)} />
          </div>
          <div>
            <div className="flex justify-between text-[10px] text-slate-500 mb-0.5">
              <span>MEM</span><span style={{ color: getCpuColor(server.mem) }}>{Math.round(server.mem)}%</span>
            </div>
            <MiniBar value={server.mem} color={getCpuColor(server.mem)} />
          </div>
          <div>
            <div className="flex justify-between text-[10px] text-slate-500 mb-0.5">
              <span>DISK</span><span className="text-slate-400">{server.disk}%</span>
            </div>
            <MiniBar value={server.disk} color="#4a5568" />
          </div>
        </div>

        {/* Uptime */}
        <div className="mt-2 pt-2 border-t border-bg-border flex justify-between text-[10px]">
          <span className="text-slate-600">Uptime</span>
          <span className="font-mono text-slate-400">{server.uptime}</span>
        </div>
      </div>

      {showModal && <ServerDetailModal server={server} onClose={() => setShowModal(false)} />}
    </>
  )
}
