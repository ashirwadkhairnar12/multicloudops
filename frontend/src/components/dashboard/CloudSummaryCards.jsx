import React from 'react'
import { getProviderColor } from '@/utils/helpers'

const PROVIDER_ICONS = {
  AWS: '☁',
  Azure: '⬡',
  GCP: '◈',
  Oracle: '◉',
  Kubernetes: '⎈',
  'On-Prem': '▣',
}

export default function CloudSummaryCards({ servers }) {
  const providers = ['AWS', 'Azure', 'GCP', 'Oracle', 'Kubernetes', 'On-Prem']

  return (
    <div className="grid grid-cols-6 gap-3">
      {providers.map(provider => {
        const pServers = servers.filter(s => s.provider === provider)
        const healthy = pServers.filter(s => s.status === 'healthy').length
        const warning = pServers.filter(s => s.status === 'warning').length
        const critical = pServers.filter(s => s.status === 'critical').length
        const color = getProviderColor(provider)

        return (
          <div
            key={provider}
            className="card border px-3 py-3 hover:bg-bg-hover transition-all cursor-pointer"
            style={{ borderColor: `${color}30` }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg" style={{ color }}>{PROVIDER_ICONS[provider]}</span>
              <span className="text-xs font-mono font-semibold text-white">{provider}</span>
            </div>
            <div className="font-display text-lg font-bold text-white mb-1">{pServers.length}</div>
            <div className="flex gap-2 text-[10px]">
              <span className="text-status-healthy">{healthy}H</span>
              {warning > 0 && <span className="text-status-warning">{warning}W</span>}
              {critical > 0 && <span className="text-status-critical">{critical}C</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
