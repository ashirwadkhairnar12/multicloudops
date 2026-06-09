import React, { useState, useEffect } from 'react'
import { Search, Bot, ArrowRight, Cloud, Server, Shield, Package,
         CheckCircle, AlertTriangle, X, RefreshCw, ChevronDown, Clock,
         Cpu, HardDrive, Wifi, Activity } from 'lucide-react'
import useStore       from '@/store/useStore'
import useCloudStore  from '@/store/useCloudStore'
import ServerTile     from '@/components/tiles/ServerTile'
import { getStatusColor, getStatusBorder, getProviderColor } from '@/utils/helpers'
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts'

const PROVIDERS = ['All', 'AWS', 'Azure', 'GCP', 'Oracle', 'Kubernetes', 'On-Prem']
const STATUSES  = ['All', 'healthy', 'warning', 'critical', 'fluctuating', 'stopped']

// ── Cloud Instance Detail Modal ────────────────────────────────────────────────
function CloudInstanceModal({ instance, ssmData, onClose }) {
  const [tab, setTab] = useState('overview')
  if (!instance) return null

  const statusColor = getStatusColor(instance.status)
  const borderClass = getStatusBorder(instance.status)

  // Find matching SSM record for this instance
  const ssm = ssmData?.find(s =>
    s.instance_id === instance.id ||
    s.instance_id === instance.name
  )

  const patchBadge = !ssm ? null
    : ssm.patch_state === 'compliant'     ? { label: 'Compliant',     cls: 'text-green-400 bg-green-500/10 border-green-500/30' }
    : ssm.patch_state === 'non_compliant' ? { label: 'Non-Compliant', cls: 'text-red-400 bg-red-500/10 border-red-500/30' }
    : { label: 'Unknown', cls: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30' }

  const TABS = ['overview', 'patches', 'software']

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className={`bg-bg-secondary border ${borderClass} rounded-xl w-[640px] max-h-[85vh] overflow-hidden shadow-2xl flex flex-col`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-bg-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
              <Cloud className="w-4 h-4 text-orange-400" />
            </div>
            <div>
              <div className="font-mono text-sm font-semibold text-white">{instance.name || instance.id}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {instance.id} · {instance.type || instance.resource_type} · {instance.region}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-lg border capitalize ${statusColor} bg-white/5 border-white/10`}>
              {instance.status}
            </span>
            {patchBadge && (
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-lg border ${patchBadge.cls}`}>
                {patchBadge.label}
              </span>
            )}
            <button onClick={onClose} className="p-1 hover:bg-bg-hover rounded-md text-slate-500 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 pt-3 shrink-0">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-lg text-xs capitalize transition-colors ${
                tab === t ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {t}
              {t === 'patches' && ssm?.missing_patches > 0 && (
                <span className="ml-1.5 text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full">
                  {ssm.missing_patches}
                </span>
              )}
              {t === 'software' && ssm?.software_count > 0 && (
                <span className="ml-1.5 text-[10px] bg-slate-500/20 text-slate-400 px-1.5 py-0.5 rounded-full">
                  {ssm.software_count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* ── Overview tab ── */}
          {tab === 'overview' && (
            <>
              {/* Instance details grid */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  ['Instance ID',   instance.id],
                  ['Type',          instance.type || instance.resource_type || '—'],
                  ['Region',        instance.region],
                  ['Provider',      instance.provider || 'AWS'],
                  ['Status',        instance.status],
                  ['Public IP',     instance.public_ip || '—'],
                  ['Private IP',    instance.private_ip || '—'],
                  ['VPC',           instance.vpc_id || '—'],
                ].map(([k, v]) => (
                  <div key={k} className="bg-bg-card rounded-lg px-3 py-2">
                    <div className="text-[10px] text-slate-500">{k}</div>
                    <div className="text-xs font-mono text-white mt-0.5 truncate">{v}</div>
                  </div>
                ))}
              </div>

              {/* SSM quick summary */}
              {ssm ? (
                <div className="bg-bg-card border border-white/10 rounded-xl p-4">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-3">SSM / Patch Status</p>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: 'Ping',      value: ssm.ping_status,         color: ssm.ping_status === 'Online' ? 'text-green-400' : 'text-red-400' },
                      { label: 'Missing',   value: ssm.missing_patches ?? 0, color: (ssm.missing_patches||0) > 0 ? 'text-red-400' : 'text-green-400' },
                      { label: 'Installed', value: ssm.installed_patches ?? 0, color: 'text-slate-300' },
                      { label: 'SSM Agent', value: ssm.agent_version || '—', color: 'text-slate-300' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="text-center">
                        <p className={`text-sm font-bold ${color}`}>{value}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>
                  {ssm.last_ping && (
                    <p className="text-[10px] text-slate-500 mt-3 flex items-center gap-1">
                      <Clock size={10} /> Last ping: {new Date(ssm.last_ping).toLocaleString()}
                    </p>
                  )}
                </div>
              ) : (
                <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-4 text-xs text-yellow-400">
                  ⚠ No SSM data — ensure SSM Agent is installed and the IAM role has AmazonSSMManagedInstanceCore.
                </div>
              )}

              {/* Tags */}
              {instance.tags && Object.keys(instance.tags).length > 0 && (
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Tags</p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(instance.tags).map(([k, v]) => (
                      <span key={k} className="text-[10px] bg-white/5 border border-white/10 rounded px-2 py-0.5 font-mono">
                        <span className="text-slate-400">{k}:</span> <span className="text-slate-300">{v}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Patches tab ── */}
          {tab === 'patches' && (
            <>
              {!ssm ? (
                <div className="flex flex-col items-center py-16 text-center">
                  <Shield size={32} className="text-slate-600 mb-3" />
                  <p className="text-white font-medium">No SSM patch data</p>
                  <p className="text-slate-400 text-sm mt-1">Run a patch scan from the Cloud Accounts → SSM tab.</p>
                </div>
              ) : (
                <>
                  {/* Patch summary */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Installed', value: ssm.installed_patches ?? 0, color: 'text-green-400' },
                      { label: 'Missing',   value: ssm.missing_patches   ?? 0, color: (ssm.missing_patches||0) > 0 ? 'text-red-400' : 'text-green-400' },
                      { label: 'Failed',    value: ssm.failed_patches    ?? 0, color: (ssm.failed_patches||0)  > 0 ? 'text-red-400' : 'text-slate-300' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="bg-bg-card border border-white/10 rounded-xl p-3 text-center">
                        <p className={`text-2xl font-bold ${color}`}>{value}</p>
                        <p className="text-[10px] text-slate-500 mt-1">{label}</p>
                      </div>
                    ))}
                  </div>

                  {/* State banner */}
                  {ssm.patch_state === 'compliant' && (
                    <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 flex items-center gap-2 text-green-400 text-sm">
                      <CheckCircle size={16} /> All patches are up to date.
                    </div>
                  )}
                  {ssm.patch_state === 'non_compliant' && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-center gap-2 text-red-400 text-sm">
                      <AlertTriangle size={16} /> {ssm.missing_patches} package{ssm.missing_patches !== 1 ? 's' : ''} need updating.
                    </div>
                  )}
                  {ssm.patch_state === 'unknown' && (
                    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 text-yellow-400 text-sm">
                      ⚠ Patch state unknown — go to Cloud Accounts → SSM tab and click Run Patch Scan.
                    </div>
                  )}

                  {/* Missing packages list */}
                  {ssm.missing_packages?.length > 0 && (
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">
                        Packages to upgrade ({ssm.missing_packages.length})
                      </p>
                      <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                        {ssm.missing_packages.map((pkg, i) => (
                          <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-red-500/5 border border-red-500/10 rounded-lg">
                            <Package size={11} className="text-red-400 shrink-0" />
                            <span className="text-xs font-mono text-slate-300">{pkg}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {ssm.missing_patches > 0 && (!ssm.missing_packages || ssm.missing_packages.length === 0) && (
                    <div className="text-xs text-slate-500 bg-bg-card rounded-xl p-3">
                      {ssm.missing_patches} packages need upgrading.
                      Run another patch scan to get the package names.
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ── Software tab ── */}
          {tab === 'software' && (
            <>
              {!ssm || !ssm.software?.length ? (
                <div className="flex flex-col items-center py-16 text-center">
                  <Package size={32} className="text-slate-600 mb-3" />
                  <p className="text-white font-medium">No software inventory</p>
                  <p className="text-slate-400 text-sm mt-1 max-w-xs">
                    Enable SSM Inventory in AWS Systems Manager to collect installed software data.
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">
                    Installed software ({ssm.software_count || ssm.software.length} packages{ssm.software_count > ssm.software.length ? `, showing ${ssm.software.length}` : ''})
                  </p>
                  <div className="space-y-1 max-h-96 overflow-y-auto pr-1">
                    {ssm.software.map((sw, i) => (
                      <div key={i} className="flex justify-between items-center px-3 py-1.5 border-b border-white/5 hover:bg-white/5 rounded">
                        <span className="text-xs text-slate-300 truncate flex-1">{sw.name}</span>
                        <span className="text-xs font-mono text-slate-500 ml-3 shrink-0">{sw.version}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Cloud Instance Tile ────────────────────────────────────────────────────────
function CloudInstanceTile({ instance, ssmData, onClick }) {
  const ssm = ssmData?.find(s => s.instance_id === instance.id || s.instance_id === instance.name)
  const borderClass  = getStatusBorder(instance.status)
  const statusColor  = getStatusColor(instance.status)
  const providerColor = getProviderColor(instance.provider || 'AWS')

  const patchColor = !ssm                              ? 'text-slate-600'
    : ssm.patch_state === 'compliant'                  ? 'text-green-400'
    : ssm.patch_state === 'non_compliant'              ? 'text-red-400'
    : 'text-yellow-400'

  const patchLabel = !ssm                              ? 'No SSM'
    : ssm.patch_state === 'compliant'                  ? 'Compliant'
    : ssm.patch_state === 'non_compliant'              ? `${ssm.missing_patches} missing`
    : 'Unknown'

  return (
    <div
      className={`card border ${borderClass} p-3 hover:bg-bg-hover transition-all cursor-pointer`}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-1.5">
        <div className="flex-1 min-w-0">
          <div className="text-xs font-mono font-medium text-white truncate">
            {instance.name || instance.id}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5 truncate">
            {instance.type || instance.resource_type} · {instance.region}
          </div>
        </div>
        <div className={`text-[10px] font-mono font-semibold capitalize ${statusColor} shrink-0 ml-2`}>
          {instance.status}
        </div>
      </div>

      {/* Provider badge */}
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border"
          style={{ color: providerColor, borderColor: `${providerColor}40`, backgroundColor: `${providerColor}15` }}>
          {instance.provider || 'AWS'}
        </span>
        <Cloud size={10} className="text-slate-600" />
        <span className="text-[10px] text-slate-600">Cloud</span>
      </div>

      {/* Patch status */}
      <div className="mt-2 pt-2 border-t border-bg-border flex justify-between text-[10px]">
        <span className="text-slate-600">Patches</span>
        <span className={`font-mono ${patchColor}`}>{patchLabel}</span>
      </div>

      {/* Ping status */}
      {ssm && (
        <div className="flex justify-between text-[10px] mt-1">
          <span className="text-slate-600">SSM Ping</span>
          <span className={ssm.ping_status === 'Online' ? 'text-green-400' : 'text-red-400'}>
            {ssm.ping_status || '—'}
          </span>
        </div>
      )}
    </div>
  )
}

// ── Empty State ────────────────────────────────────────────────────────────────
function EmptyState({ onGoToAgents }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-20 h-20 rounded-2xl bg-slate-800 border border-white/10 flex items-center justify-center mb-6">
        <Bot size={36} className="text-slate-600" />
      </div>
      <h2 className="text-xl font-bold text-white mb-2">No infrastructure connected</h2>
      <p className="text-slate-400 text-sm max-w-sm mb-8">
        Deploy the monitoring agent on your servers or connect a cloud account to see your infrastructure here.
      </p>
      <button
        onClick={onGoToAgents}
        className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium text-sm transition-colors"
      >
        <Bot size={16} />
        Register an agent
        <ArrowRight size={14} />
      </button>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function InfrastructurePage() {
  const { servers, setActiveNav }                          = useStore()
  const { accounts, accountData, loadAllAccountData }      = useCloudStore()
  const [provider,  setProvider]  = useState('All')
  const [status,    setStatus]    = useState('All')
  const [search,    setSearch]    = useState('')
  const [viewMode,  setViewMode]  = useState('all')   // 'all' | 'agents' | 'cloud'
  const [selected,  setSelected]  = useState(null)    // selected cloud instance

  // Load cloud account data on mount
  useEffect(() => { loadAllAccountData() }, [])

  // Gather all cloud resources + their SSM data
  const cloudResources = Object.values(accountData).flatMap(d => d.resources || [])
  const allSSMData     = Object.values(accountData).flatMap(d => d.ssm       || [])

  // Combine: agent servers + cloud instances (deduplicated by id)
  const seen = new Set()
  const agentServers  = servers.filter(s => { if (seen.has(s.id)) return false; seen.add(s.id); return true })
  const cloudInstances = cloudResources.filter(r =>
    (r.resource_type === 'EC2' || r.type === 'EC2' || r.service === 'EC2') &&
    !seen.has(r.id)
  )

  const totalAll    = agentServers.length + cloudInstances.length
  const totalAgents = agentServers.length
  const totalCloud  = cloudInstances.length

  // Filter agents
  const filteredAgents = viewMode !== 'cloud' ? agentServers
    .filter(s => provider === 'All' || s.provider === provider)
    .filter(s => status   === 'All' || s.status   === status)
    .filter(s => !search  || s.name?.toLowerCase().includes(search.toLowerCase()) ||
                             s.region?.toLowerCase().includes(search.toLowerCase()))
    : []

  // Filter cloud
  const filteredCloud = viewMode !== 'agents' ? cloudInstances
    .filter(r => provider === 'All' || (r.provider || 'AWS') === provider)
    .filter(r => status   === 'All' || r.status === status)
    .filter(r => !search  || r.name?.toLowerCase().includes(search.toLowerCase()) ||
                             r.id?.toLowerCase().includes(search.toLowerCase()) ||
                             r.region?.toLowerCase().includes(search.toLowerCase()))
    : []

  if (totalAll === 0) {
    return <EmptyState onGoToAgents={() => setActiveNav('agents')} />
  }

  return (
    <div className="space-y-4 animate-fade-in">

      {/* ── Filters bar ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search instances…"
            className="bg-bg-secondary border border-bg-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-accent/50 w-48"
          />
        </div>

        {/* View mode toggle */}
        <div className="flex items-center gap-1 bg-bg-secondary border border-bg-border rounded-lg p-0.5">
          {[
            { key: 'all',    label: `All (${totalAll})` },
            { key: 'agents', label: `Agents (${totalAgents})` },
            { key: 'cloud',  label: `Cloud (${totalCloud})` },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setViewMode(key)}
              className={`px-2.5 py-1 rounded text-xs transition-colors ${
                viewMode === key ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >{label}</button>
          ))}
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          {PROVIDERS.map(p => (
            <button key={p} onClick={() => setProvider(p)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                provider === p
                  ? 'bg-accent/20 text-accent border border-accent/30'
                  : 'bg-bg-secondary border border-bg-border text-slate-400 hover:text-white'
              }`}
            >{p}</button>
          ))}
        </div>

        <div className="flex items-center gap-1 ml-auto flex-wrap">
          {STATUSES.map(s => (
            <button key={s} onClick={() => setStatus(s)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium capitalize transition-colors ${
                status === s
                  ? 'bg-accent/20 text-accent border border-accent/30'
                  : 'bg-bg-secondary border border-bg-border text-slate-400 hover:text-white'
              }`}
            >{s}</button>
          ))}
        </div>
      </div>

      {/* ── Count ── */}
      <div className="flex items-center gap-3 text-xs text-slate-500 font-mono">
        <span>{filteredAgents.length + filteredCloud.length} of {totalAll} instances</span>
        {totalAgents > 0 && <span>· ⬡ {totalAgents} agent{totalAgents !== 1 ? 's' : ''}</span>}
        {totalCloud  > 0 && <span>· ☁ {totalCloud} cloud</span>}
      </div>

      {/* ── Agent servers ── */}
      {filteredAgents.length > 0 && (
        <div>
          {viewMode === 'all' && (
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Bot size={10} /> Agent Monitored
            </p>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {filteredAgents.map(s => <ServerTile key={s.id} server={s} />)}
          </div>
        </div>
      )}

      {/* ── Cloud instances ── */}
      {filteredCloud.length > 0 && (
        <div>
          {viewMode === 'all' && (
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Cloud size={10} /> Cloud Instances
            </p>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {filteredCloud.map(r => (
              <CloudInstanceTile
                key={r.id}
                instance={r}
                ssmData={allSSMData}
                onClick={() => setSelected(r)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── No results ── */}
      {filteredAgents.length === 0 && filteredCloud.length === 0 && (
        <p className="text-sm text-slate-500 text-center py-12">No instances match this filter.</p>
      )}

      {/* ── Cloud instance detail modal ── */}
      {selected && (
        <CloudInstanceModal
          instance={selected}
          ssmData={allSSMData}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
