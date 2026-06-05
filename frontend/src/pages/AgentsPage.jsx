import React, { useEffect, useState } from 'react'
import useStore from '@/store/useStore'
import { Server, Plus, Trash2, RefreshCw, Copy, CheckCircle, AlertCircle, Clock, Wifi, WifiOff, ChevronDown, ChevronUp, Terminal, X } from 'lucide-react'

const STATUS_COLORS = {
  online:  { dot: 'bg-green-400',  badge: 'bg-green-400/10 text-green-400 border border-green-400/20' },
  offline: { dot: 'bg-slate-500',  badge: 'bg-slate-500/10 text-slate-400 border border-slate-500/20' },
  error:   { dot: 'bg-red-400',    badge: 'bg-red-400/10 text-red-400 border border-red-400/20' },
}

function AgentStatusBadge({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.offline
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${c.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot} ${status === 'online' ? 'animate-pulse' : ''}`} />
      {status}
    </span>
  )
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={copy} className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
      {copied ? <CheckCircle size={14} className="text-green-400" /> : <Copy size={14} />}
    </button>
  )
}

function RegisterModal({ onClose, onSuccess }) {
  const { registerAgent } = useStore()
  const [form, setForm] = useState({ name: '', description: '', provider: 'AWS', region: '' })
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const data = await registerAgent(form)
      setResult(data)
      onSuccess()
    } catch (err) {
      setError(err.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  const PROVIDERS = ['AWS', 'Azure', 'GCP', 'Oracle', 'Kubernetes', 'On-Prem', 'Other']

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-bg-secondary border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <Plus size={16} className="text-blue-400" />
            </div>
            <h2 className="text-lg font-semibold text-white">Register New Agent</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        {result ? (
          /* Success state */
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
              <CheckCircle size={20} className="text-green-400 shrink-0" />
              <div>
                <p className="text-green-400 font-medium">Agent registered!</p>
                <p className="text-slate-400 text-sm">Copy the API key — it won't be shown again.</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Agent ID</label>
                <div className="flex items-center gap-2 bg-bg-primary rounded-lg p-3 border border-white/10">
                  <code className="text-sm text-slate-300 flex-1 font-mono">{result.id}</code>
                  <CopyButton text={result.id} />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">API Key <span className="text-orange-400">(save this now!)</span></label>
                <div className="flex items-center gap-2 bg-bg-primary rounded-lg p-3 border border-orange-500/30">
                  <code className="text-sm text-orange-300 flex-1 font-mono break-all">{result.api_key}</code>
                  <CopyButton text={result.api_key} />
                </div>
              </div>
            </div>

            <div className="bg-bg-primary rounded-xl p-4 border border-white/10">
              <p className="text-xs text-slate-400 mb-2 flex items-center gap-1.5"><Terminal size={12} /> Quick start</p>
              <pre className="text-xs text-slate-300 font-mono overflow-x-auto whitespace-pre-wrap">{`# Install & run the agent
pip install multicloudops-agent

mco-agent start \\
  --server http://your-server:8000 \\
  --key ${result.api_key}`}</pre>
            </div>

            <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors">
              Done
            </button>
          </div>
        ) : (
          /* Form */
          <form onSubmit={submit} className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-xs text-slate-400 mb-1.5 block">Agent Name *</label>
                <input
                  required
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. prod-aws-monitor"
                  className="w-full bg-bg-primary border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/60"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1.5 block">Cloud Provider</label>
                <select
                  value={form.provider}
                  onChange={e => setForm(f => ({ ...f, provider: e.target.value }))}
                  className="w-full bg-bg-primary border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/60"
                >
                  {PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1.5 block">Region</label>
                <input
                  value={form.region}
                  onChange={e => setForm(f => ({ ...f, region: e.target.value }))}
                  placeholder="e.g. us-east-1"
                  className="w-full bg-bg-primary border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/60"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-slate-400 mb-1.5 block">Description</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="What does this agent monitor?"
                  rows={2}
                  className="w-full bg-bg-primary border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/60 resize-none"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
                <AlertCircle size={14} /> {error}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-300 hover:bg-white/5 font-medium transition-colors text-sm">
                Cancel
              </button>
              <button type="submit" disabled={loading} className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium transition-colors text-sm">
                {loading ? 'Registering…' : 'Register Agent'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

function AgentCard({ agent, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!confirm(`Delete agent "${agent.name}"? This cannot be undone.`)) return
    setDeleting(true)
    try { await onDelete(agent.id) } catch (e) { setDeleting(false) }
  }

  const lastSeen = agent.last_seen
    ? new Date(agent.last_seen).toLocaleString()
    : 'Never'

  return (
    <div className="bg-bg-secondary border border-white/10 rounded-xl overflow-hidden hover:border-white/20 transition-colors">
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              agent.status === 'online' ? 'bg-green-500/15' : 'bg-slate-700/50'
            }`}>
              {agent.status === 'online'
                ? <Wifi size={18} className="text-green-400" />
                : <WifiOff size={18} className="text-slate-500" />
              }
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-white truncate">{agent.name}</h3>
              <p className="text-sm text-slate-400 truncate">{agent.description || 'No description'}</p>
            </div>
          </div>
          <AgentStatusBadge status={agent.status} />
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="bg-bg-primary rounded-lg p-3">
            <p className="text-xs text-slate-500 mb-0.5">Provider</p>
            <p className="text-sm font-medium text-white">{agent.provider}</p>
          </div>
          <div className="bg-bg-primary rounded-lg p-3">
            <p className="text-xs text-slate-500 mb-0.5">Region</p>
            <p className="text-sm font-medium text-white">{agent.region || '—'}</p>
          </div>
          <div className="bg-bg-primary rounded-lg p-3">
            <p className="text-xs text-slate-500 mb-0.5">Servers</p>
            <p className="text-sm font-medium text-white">{agent.servers_reporting}</p>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Clock size={11} />
            Last seen: {lastSeen}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1.5 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-colors disabled:opacity-40"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Expanded: setup instructions */}
      {expanded && (
        <div className="border-t border-white/10 p-5 bg-bg-primary/50">
          <p className="text-xs text-slate-400 mb-3 flex items-center gap-1.5">
            <Terminal size={12} /> Agent setup for <strong className="text-white">{agent.name}</strong>
          </p>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-slate-500 mb-1">Agent ID</p>
              <div className="flex items-center gap-2 bg-bg-primary rounded p-2 border border-white/10">
                <code className="text-xs text-slate-300 font-mono flex-1">{agent.id}</code>
                <CopyButton text={agent.id} />
              </div>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">API Endpoint</p>
              <div className="flex items-center gap-2 bg-bg-primary rounded p-2 border border-white/10">
                <code className="text-xs text-slate-300 font-mono flex-1">{window.location.protocol}//{window.location.hostname}:8000</code>
                <CopyButton text={`${window.location.protocol}//${window.location.hostname}:8000`} />
              </div>
            </div>
            <p className="text-xs text-slate-500 italic">API key was shown at registration time. Regenerate by deleting and re-registering.</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AgentsPage() {
  const { agents, agentsLoading, agentsError, fetchAgents, deleteAgent } = useStore()
  const [showRegister, setShowRegister] = useState(false)

  useEffect(() => { fetchAgents() }, [])

  const onlineCount = agents.filter(a => a.status === 'online').length
  const offlineCount = agents.filter(a => a.status === 'offline').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Monitoring Agents</h1>
          <p className="text-slate-400 text-sm mt-0.5">Deploy agents on your servers to push real-time metrics to this dashboard.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchAgents}
            disabled={agentsLoading}
            className="p-2.5 rounded-xl border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <RefreshCw size={16} className={agentsLoading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setShowRegister(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors text-sm"
          >
            <Plus size={16} />
            Register Agent
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Agents', value: agents.length, color: 'text-white' },
          { label: 'Online', value: onlineCount, color: 'text-green-400' },
          { label: 'Offline', value: offlineCount, color: 'text-slate-400' },
        ].map(s => (
          <div key={s.label} className="bg-bg-secondary border border-white/10 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-1">{s.label}</p>
            <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* How it works callout */}
      <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-blue-300 mb-2 flex items-center gap-2">
          <Server size={14} /> How Agents Work
        </h3>
        <div className="grid grid-cols-3 gap-4 text-sm text-slate-400">
          <div className="flex items-start gap-2">
            <span className="text-blue-400 font-bold shrink-0">1.</span>
            <span>Register an agent here to get a unique API key.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-blue-400 font-bold shrink-0">2.</span>
            <span>Deploy the agent process on your server with the key.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-blue-400 font-bold shrink-0">3.</span>
            <span>Agent pushes metrics every 30s — your dashboard updates live.</span>
          </div>
        </div>
      </div>

      {/* Agent list */}
      {agentsError && (
        <div className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
          <AlertCircle size={16} /> Failed to load agents: {agentsError}
        </div>
      )}

      {agentsLoading && agents.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-slate-500">
          <RefreshCw size={20} className="animate-spin mr-2" /> Loading agents…
        </div>
      ) : agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-700/50 flex items-center justify-center mb-4">
            <Server size={28} className="text-slate-500" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-1">No agents registered</h3>
          <p className="text-slate-400 text-sm mb-6 max-w-sm">Register your first agent to start collecting real metrics from your infrastructure.</p>
          <button
            onClick={() => setShowRegister(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
          >
            <Plus size={16} /> Register First Agent
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {agents.map(agent => (
            <AgentCard key={agent.id} agent={agent} onDelete={deleteAgent} />
          ))}
        </div>
      )}

      {showRegister && (
        <RegisterModal
          onClose={() => setShowRegister(false)}
          onSuccess={() => fetchAgents()}
        />
      )}
    </div>
  )
}
