import React, { useEffect, useState } from 'react'
import { Activity, Plus, RefreshCw, CheckCircle, Clock, AlertTriangle, XCircle, User, Trash2, ChevronDown } from 'lucide-react'
import useStore from '@/store/useStore'
import useAuthStore from '@/store/useAuthStore'

const SEV = {
  critical: 'text-red-400 bg-red-500/10 border-red-500/20',
  high:     'text-orange-400 bg-orange-500/10 border-orange-500/20',
  medium:   'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  low:      'text-blue-400 bg-blue-500/10 border-blue-500/20',
}
const STATUS_ICON = {
  open:          <AlertTriangle size={14} className="text-red-400" />,
  investigating: <Clock size={14} className="text-yellow-400" />,
  resolved:      <CheckCircle size={14} className="text-green-400" />,
  closed:        <XCircle size={14} className="text-slate-400" />,
}

function CreateModal({ onClose, onCreated, servers }) {
  const [form, setForm] = useState({ title: '', severity: 'medium', impact: 'Medium', description: '', server_id: '', assignee: '' })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const { getAuthHeader } = useAuthStore()
  const up = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ ...form, server_name: servers.find(s => s.id === form.server_id)?.name || '' }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || `Request failed (${res.status})`)
      }
      await res.json()
      onCreated()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-bg-secondary border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <h2 className="font-semibold text-white">Create Incident</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">×</button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Title *</label>
            <input required value={form.title} onChange={e => up('title', e.target.value)}
              className="w-full bg-bg-primary border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/60" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Severity</label>
              <select value={form.severity} onChange={e => up('severity', e.target.value)}
                className="w-full bg-bg-primary border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                {['critical','high','medium','low'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Impact</label>
              <select value={form.impact} onChange={e => up('impact', e.target.value)}
                className="w-full bg-bg-primary border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                {['Critical','High','Medium','Low'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Affected Server</label>
            <select value={form.server_id} onChange={e => up('server_id', e.target.value)}
              className="w-full bg-bg-primary border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
              <option value="">— None —</option>
              {servers.map(s => <option key={s.id} value={s.id}>{s.name} ({s.provider})</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Assignee</label>
            <input value={form.assignee} onChange={e => up('assignee', e.target.value)} placeholder="Engineer name"
              className="w-full bg-bg-primary border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/60" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Description</label>
            <textarea value={form.description} onChange={e => up('description', e.target.value)} rows={2}
              className="w-full bg-bg-primary border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/60 resize-none" />
          </div>
          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
          )}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-xl border border-white/10 text-slate-300 hover:bg-white/5 text-sm">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm disabled:opacity-50">
              {loading ? 'Creating…' : 'Create Incident'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function IncidentRow({ inc, onUpdate, onDelete }) {
  const [open, setOpen] = useState(false)
  const [assignee, setAssignee] = useState(inc.assignee)

  const updateStatus = async (status) => {
    await fetch(`/api/incidents/${inc.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    onUpdate()
  }

  const saveAssignee = async () => {
    await fetch(`/api/incidents/${inc.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignee }),
    })
    onUpdate()
  }

  return (
    <div className="bg-bg-secondary border border-white/10 rounded-xl overflow-hidden">
      <div className="flex items-center gap-4 p-4 cursor-pointer hover:bg-white/5" onClick={() => setOpen(!open)}>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-lg border ${SEV[inc.severity] || SEV.medium}`}>
          {inc.severity.toUpperCase()}
        </span>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {STATUS_ICON[inc.status]}
          <span className="text-sm font-medium text-white truncate">{inc.title}</span>
        </div>
        <span className="text-xs text-slate-500 font-mono hidden md:block">{inc.id}</span>
        <span className="text-xs text-slate-500 hidden lg:block">{inc.created}</span>
        {inc.mttr && <span className="text-xs text-green-400 font-mono">MTTR {inc.mttr}</span>}
        <ChevronDown size={14} className={`text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>

      {open && (
        <div className="border-t border-white/10 p-4 bg-bg-primary/30 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Status', value: inc.status },
              { label: 'Impact', value: inc.impact },
              { label: 'Server', value: inc.server_name || '—' },
              { label: 'Updated', value: inc.updated },
            ].map(({ label, value }) => (
              <div key={label} className="bg-bg-secondary rounded-lg p-3">
                <p className="text-xs text-slate-500 mb-0.5">{label}</p>
                <p className="text-sm font-medium text-white capitalize">{value}</p>
              </div>
            ))}
          </div>
          {inc.description && (
            <p className="text-sm text-slate-400 bg-bg-secondary rounded-lg p-3">{inc.description}</p>
          )}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <User size={13} className="text-slate-500 shrink-0" />
              <input
                value={assignee}
                onChange={e => setAssignee(e.target.value)}
                onBlur={saveAssignee}
                className="flex-1 bg-bg-primary border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500/60"
                placeholder="Assign to…"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {['open','investigating','resolved','closed'].map(s => (
                <button key={s} onClick={() => updateStatus(s)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium capitalize transition-colors border ${
                    inc.status === s
                      ? 'bg-blue-600/20 text-blue-400 border-blue-500/30'
                      : 'border-white/10 text-slate-400 hover:text-white hover:bg-white/5'
                  }`}>
                  {s}
                </button>
              ))}
            </div>
            <button onClick={() => onDelete(inc.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-colors ml-auto">
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function IncidentsPage() {
  const { servers } = useStore()
  const [incidents, setIncidents] = useState([])
  const [loading, setLoading]     = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [filter, setFilter]         = useState('all')

  const { getAuthHeader } = useAuthStore()

  const load = async () => {
    setLoading(true)
    try {
      const authH = getAuthHeader()
      const [incRes, _] = await Promise.all([
        fetch('/api/incidents', { headers: authH }).then(r => r.json()),
        fetch('/api/incidents/auto-detect', { method: 'POST', headers: authH }),
      ])
      setIncidents(incRes.incidents || [])
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const filtered = filter === 'all' ? incidents : incidents.filter(i => i.status === filter)
  const open     = incidents.filter(i => i.status === 'open').length
  const investing = incidents.filter(i => i.status === 'investigating').length

  const deleteInc = async (id) => {
    await fetch(`/api/incidents/${id}`, { method: 'DELETE', headers: getAuthHeader() })
    load()
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Incidents</h1>
          <p className="text-xs text-slate-400 mt-0.5">{open} open · {investing} investigating</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="p-2 rounded-xl border border-white/10 text-slate-400 hover:text-white hover:bg-white/5">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium">
            <Plus size={15} /> New Incident
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total',          value: incidents.length,                         color: 'text-white' },
          { label: 'Open',           value: open,                                     color: 'text-red-400' },
          { label: 'Investigating',  value: investing,                                color: 'text-yellow-400' },
          { label: 'Resolved',       value: incidents.filter(i => i.status === 'resolved').length, color: 'text-green-400' },
        ].map(s => (
          <div key={s.label} className="bg-bg-secondary border border-white/10 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {['all','open','investigating','resolved','closed'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
              filter === f ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'bg-bg-secondary border border-white/10 text-slate-400 hover:text-white'
            }`}>
            {f}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-12 text-slate-500"><RefreshCw size={20} className="animate-spin mx-auto" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <CheckCircle size={36} className="text-green-500 mb-3" />
          <p className="text-white font-medium">No incidents</p>
          <p className="text-slate-400 text-sm">System is healthy — auto-detection runs every 30s</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(i => <IncidentRow key={i.id} inc={i} onUpdate={load} onDelete={deleteInc} />)}
        </div>
      )}

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreated={load} servers={servers} />}
    </div>
  )
}
