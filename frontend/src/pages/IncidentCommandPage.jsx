import React, { useEffect, useState, useRef } from 'react'
import { Zap, Clock, User, Send, RefreshCw, AlertTriangle, CheckCircle, Activity } from 'lucide-react'
import useStore from '@/store/useStore'

const SEV_STYLE = {
  critical: 'border-red-500/40 bg-red-500/5',
  high:     'border-orange-500/40 bg-orange-500/5',
  medium:   'border-yellow-500/40 bg-yellow-500/5',
  low:      'border-blue-500/40 bg-blue-500/5',
}

const STATUS_COLOR = {
  open:          'text-red-400',
  investigating: 'text-yellow-400',
  resolved:      'text-green-400',
  closed:        'text-slate-400',
}

// Simple timeline entry component
function TimelineEntry({ time, event, type }) {
  const colors = { status: 'bg-blue-400', assign: 'bg-purple-400', note: 'bg-slate-400', create: 'bg-red-400', resolve: 'bg-green-400' }
  return (
    <div className="flex gap-3 text-xs">
      <div className="flex flex-col items-center">
        <div className={`w-2 h-2 rounded-full shrink-0 mt-0.5 ${colors[type] || 'bg-slate-400'}`} />
        <div className="w-px flex-1 bg-white/10 mt-1" />
      </div>
      <div className="pb-3">
        <p className="text-slate-300">{event}</p>
        <p className="text-slate-600 font-mono mt-0.5">{time}</p>
      </div>
    </div>
  )
}

function CommandPanel({ incident, onUpdate }) {
  const [note, setNote]       = useState('')
  const [assignee, setAssignee] = useState(incident.assignee || '')
  const [timeline, setTimeline] = useState([
    { time: incident.created, event: `Incident created: ${incident.title}`, type: 'create' },
  ])
  const chatRef = useRef(null)

  useEffect(() => { chatRef.current?.scrollTo(0, chatRef.current.scrollHeight) }, [timeline])

  const addNote = () => {
    if (!note.trim()) return
    setTimeline(t => [...t, { time: new Date().toLocaleTimeString(), event: note, type: 'note' }])
    setNote('')
  }

  const changeStatus = async (status) => {
    await fetch(`/api/incidents/${incident.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setTimeline(t => [...t, { time: new Date().toLocaleTimeString(), event: `Status changed to: ${status}`, type: 'status' }])
    onUpdate()
  }

  const saveAssignee = async () => {
    if (!assignee.trim()) return
    await fetch(`/api/incidents/${incident.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignee }),
    })
    setTimeline(t => [...t, { time: new Date().toLocaleTimeString(), event: `Assigned to: ${assignee}`, type: 'assign' }])
    onUpdate()
  }

  return (
    <div className={`bg-bg-secondary border rounded-2xl overflow-hidden ${SEV_STYLE[incident.severity] || SEV_STYLE.medium}`}>
      {/* Header */}
      <div className="p-4 border-b border-white/10">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-mono text-slate-500 shrink-0">{incident.id}</span>
            <h3 className="font-semibold text-white truncate text-sm">{incident.title}</h3>
          </div>
          <span className={`text-xs font-medium capitalize shrink-0 ${STATUS_COLOR[incident.status]}`}>
            ● {incident.status}
          </span>
        </div>
        {incident.server_name && (
          <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
            <Activity size={11} /> {incident.server_name}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 divide-x divide-white/10">
        {/* Timeline */}
        <div className="p-4">
          <p className="text-xs font-semibold text-slate-400 mb-3">Timeline</p>
          <div ref={chatRef} className="max-h-48 overflow-y-auto pr-1">
            {timeline.map((e, i) => <TimelineEntry key={i} {...e} />)}
          </div>
          <div className="flex gap-2 mt-3">
            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addNote()}
              placeholder="Add a note…"
              className="flex-1 bg-bg-primary border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/60"
            />
            <button onClick={addNote} className="p-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white">
              <Send size={12} />
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="p-4 space-y-4">
          <div>
            <p className="text-xs font-semibold text-slate-400 mb-2">Assignee</p>
            <div className="flex gap-2">
              <input
                value={assignee}
                onChange={e => setAssignee(e.target.value)}
                placeholder="Engineer name"
                className="flex-1 bg-bg-primary border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none"
              />
              <button onClick={saveAssignee} className="px-2.5 py-1.5 rounded-lg bg-bg-primary border border-white/10 text-xs text-slate-300 hover:text-white">
                Save
              </button>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-400 mb-2">Update Status</p>
            <div className="grid grid-cols-2 gap-1.5">
              {['open','investigating','resolved','closed'].map(s => (
                <button key={s} onClick={() => changeStatus(s)}
                  className={`py-1.5 rounded-lg text-xs font-medium capitalize transition-colors border ${
                    incident.status === s
                      ? 'bg-blue-600/20 text-blue-400 border-blue-500/30'
                      : 'border-white/10 text-slate-400 hover:text-white hover:bg-white/5'
                  }`}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-400 mb-2">Runbook Checklist</p>
            <div className="space-y-1.5">
              {[
                'Verify alert is not a false positive',
                'Check resource metrics in dashboard',
                'Review recent deployments',
                'Scale or restart affected service',
                'Update status and notify team',
              ].map((step, i) => (
                <RunbookStep key={i} step={step} index={i + 1} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function RunbookStep({ step, index }) {
  const [done, setDone] = useState(false)
  return (
    <div
      onClick={() => setDone(d => !d)}
      className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors text-xs ${
        done ? 'bg-green-500/10 border border-green-500/20' : 'bg-bg-primary border border-white/5 hover:bg-white/5'
      }`}
    >
      <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
        done ? 'bg-green-500 border-green-500' : 'border-slate-600'
      }`}>
        {done && <CheckCircle size={10} className="text-white" />}
      </div>
      <span className={done ? 'line-through text-slate-500' : 'text-slate-300'}>{step}</span>
    </div>
  )
}

export default function IncidentCommandPage() {
  const { servers } = useStore()
  const [incidents, setIncidents] = useState([])
  const [loading, setLoading]     = useState(true)
  const [selected, setSelected]   = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      await fetch('/api/incidents/auto-detect', { method: 'POST' })
      const res = await fetch('/api/incidents')
      const data = await res.json()
      const active = (data.incidents || []).filter(i => ['open','investigating'].includes(i.status))
      setIncidents(active)
      if (active.length > 0 && !selected) setSelected(active[0].id)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const activeIncident = incidents.find(i => i.id === selected)

  if (servers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Zap size={40} className="text-slate-600 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">No active incidents</h2>
        <p className="text-slate-400 text-sm">Connect an agent — critical servers auto-create incidents here.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Incident Command</h1>
          <p className="text-xs text-slate-400 mt-0.5">Live incident management · {incidents.length} active</p>
        </div>
        <button onClick={load} className="p-2 rounded-xl border border-white/10 text-slate-400 hover:text-white hover:bg-white/5">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {incidents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center bg-bg-secondary border border-white/10 rounded-2xl">
          <CheckCircle size={32} className="text-green-500 mb-3" />
          <p className="text-white font-medium">No active incidents</p>
          <p className="text-slate-400 text-sm mt-1">All systems nominal</p>
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-4">
          {/* Sidebar list */}
          <div className="col-span-3 space-y-2">
            {incidents.map(i => (
              <div
                key={i.id}
                onClick={() => setSelected(i.id)}
                className={`p-3 rounded-xl border cursor-pointer transition-colors ${
                  selected === i.id
                    ? 'border-blue-500/40 bg-blue-500/10'
                    : 'border-white/10 bg-bg-secondary hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle size={12} className={STATUS_COLOR[i.status]} />
                  <span className="text-xs font-mono text-slate-500">{i.id}</span>
                </div>
                <p className="text-xs font-medium text-white line-clamp-2">{i.title}</p>
                <p className="text-[11px] text-slate-500 mt-1 capitalize">{i.severity} · {i.status}</p>
              </div>
            ))}
          </div>

          {/* Command panel */}
          <div className="col-span-9">
            {activeIncident
              ? <CommandPanel key={activeIncident.id} incident={activeIncident} onUpdate={load} />
              : <div className="flex items-center justify-center h-64 text-slate-500 text-sm bg-bg-secondary rounded-2xl border border-white/10">
                  Select an incident
                </div>
            }
          </div>
        </div>
      )}
    </div>
  )
}
