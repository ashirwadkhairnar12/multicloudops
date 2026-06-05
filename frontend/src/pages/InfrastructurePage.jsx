import React, { useState } from 'react'
import { Search, Filter, Bot, ArrowRight } from 'lucide-react'
import useStore from '@/store/useStore'
import ServerTile from '@/components/tiles/ServerTile'

const PROVIDERS = ['All', 'AWS', 'Azure', 'GCP', 'Oracle', 'Kubernetes', 'On-Prem']
const STATUSES  = ['All', 'healthy', 'warning', 'critical', 'fluctuating', 'stopped']

function EmptyState({ onGoToAgents }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-20 h-20 rounded-2xl bg-slate-800 border border-white/10 flex items-center justify-center mb-6">
        <Bot size={36} className="text-slate-600" />
      </div>
      <h2 className="text-xl font-bold text-white mb-2">No infrastructure connected</h2>
      <p className="text-slate-400 text-sm max-w-sm mb-8">
        Deploy the monitoring agent on your servers. They'll show up here in real time the moment the agent connects.
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

export default function InfrastructurePage() {
  const { servers, setActiveNav } = useStore()
  const [provider, setProvider] = useState('All')
  const [status,   setStatus]   = useState('All')
  const [search,   setSearch]   = useState('')

  const filtered = servers
    .filter(s => provider === 'All' || s.provider === provider)
    .filter(s => status   === 'All' || s.status   === status)
    .filter(s => !search  || s.name.toLowerCase().includes(search.toLowerCase()) ||
                             s.region.toLowerCase().includes(search.toLowerCase()))

  if (servers.length === 0) {
    return <EmptyState onGoToAgents={() => setActiveNav('agents')} />
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search servers…"
            className="bg-bg-secondary border border-bg-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-accent/50 w-48"
          />
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          {PROVIDERS.map(p => (
            <button
              key={p}
              onClick={() => setProvider(p)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                provider === p
                  ? 'bg-accent/20 text-accent border border-accent/30'
                  : 'bg-bg-secondary border border-bg-border text-slate-400 hover:text-white'
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 ml-auto flex-wrap">
          {STATUSES.map(s => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium capitalize transition-colors ${
                status === s
                  ? 'bg-accent/20 text-accent border border-accent/30'
                  : 'bg-bg-secondary border border-bg-border text-slate-400 hover:text-white'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Count */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500 font-mono">
          {filtered.length} of {servers.length} servers
        </span>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-12">No servers match this filter.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {filtered.map(s => <ServerTile key={s.id} server={s} />)}
        </div>
      )}
    </div>
  )
}
