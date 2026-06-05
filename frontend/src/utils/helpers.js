export function getStatusColor(status) {
  const map = {
    healthy: 'text-status-healthy',
    warning: 'text-status-warning',
    critical: 'text-status-critical',
    fluctuating: 'text-status-fluctuating',
    stopped: 'text-status-stopped',
  }
  return map[status] || 'text-gray-400'
}

export function getStatusBg(status) {
  const map = {
    healthy: 'bg-status-healthy',
    warning: 'bg-status-warning',
    critical: 'bg-status-critical',
    fluctuating: 'bg-status-fluctuating',
    stopped: 'bg-status-stopped',
  }
  return map[status] || 'bg-gray-500'
}

export function getStatusBorder(status) {
  const map = {
    healthy: 'border-status-healthy/40',
    warning: 'border-status-warning/40',
    critical: 'border-status-critical/40',
    fluctuating: 'border-status-fluctuating/40',
    stopped: 'border-status-stopped/40',
  }
  return map[status] || 'border-gray-500/40'
}

export function getProviderColor(provider) {
  const map = {
    AWS: '#ff9900',
    Azure: '#0089d6',
    GCP: '#4285f4',
    Oracle: '#f80000',
    Kubernetes: '#326ce5',
    'On-Prem': '#8b5cf6',
  }
  return map[provider] || '#6b7280'
}

export function getCpuColor(val) {
  if (val >= 85) return '#ff3d71'
  if (val >= 65) return '#ffcc00'
  return '#00d68f'
}

export function formatUptime(uptime) {
  return uptime
}

export function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}
