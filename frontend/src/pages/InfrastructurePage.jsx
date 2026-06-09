import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  Search, Bot, ArrowRight, Cloud, Server, Shield, Package,
  CheckCircle, AlertTriangle, X, RefreshCw, ChevronDown, Clock,
  Cpu, HardDrive, Wifi, Activity, Terminal, List, ShieldCheck,
  AlertCircle, ChevronUp, Filter, ExternalLink, Zap, MemoryStick,
  Info, Play, Loader, CheckSquare, XSquare, MinusSquare,
} from 'lucide-react'
import useStore       from '@/store/useStore'
import useCloudStore  from '@/store/useCloudStore'
import ServerTile     from '@/components/tiles/ServerTile'
import { getStatusColor, getStatusBorder, getProviderColor, getCpuColor } from '@/utils/helpers'
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts'

const PROVIDERS = ['All', 'AWS', 'Azure', 'GCP', 'Oracle', 'Kubernetes', 'On-Prem']
const STATUSES  = ['All', 'healthy', 'warning', 'critical', 'fluctuating', 'stopped']

// ── Helpers ───────────────────────────────────────────────────────────────────

function MiniBar({ value, color }) {
  return (
    <div className="h-1.5 w-full bg-bg-primary rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all duration-700"
           style={{ width: `${Math.min(value, 100)}%`, backgroundColor: color }} />
    </div>
  )
}

function StatusDot({ status }) {
  const colors = {
    healthy:  'bg-green-400',
    warning:  'bg-yellow-400',
    critical: 'bg-red-400 animate-pulse',
    missing:  'bg-slate-500',
    pass:     'bg-green-400',
    fail:     'bg-red-400',
  }
  return <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${colors[status] || 'bg-slate-500'}`} />
}

function SectionLabel({ children }) {
  return <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2 mt-4 first:mt-0">{children}</p>
}

// ── Process Alert Banner ───────────────────────────────────────────────────────
// Shows at the top of the modal if any processes are in warning/critical state.
function ProcessAlertBanner({ processes, onTabSwitch }) {
  const alerts = (processes || []).filter(p => p.status === 'warning' || p.status === 'critical')
  if (!alerts.length) return null

  const critical = alerts.filter(p => p.status === 'critical')
  const warning  = alerts.filter(p => p.status === 'warning')

  return (
    <button
      onClick={() => onTabSwitch('processes')}
      className={`w-full text-left flex items-start gap-3 p-3 rounded-xl border mb-4 transition-all hover:opacity-90 ${
        critical.length
          ? 'bg-red-500/10 border-red-500/30 text-red-400'
          : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
      }`}
    >
      <AlertCircle size={14} className="shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold">
          {critical.length > 0 && `${critical.length} critical process${critical.length > 1 ? 'es' : ''}`}
          {critical.length > 0 && warning.length > 0 && ', '}
          {warning.length > 0  && `${warning.length} warning process${warning.length > 1 ? 'es' : ''}`}
        </p>
        <p className="text-[11px] opacity-75 mt-0.5 truncate">
          {alerts.slice(0, 3).map(p =>
            `${p.name} (CPU ${p.cpu.toFixed(1)}% MEM ${p.mem.toFixed(1)}%)`
          ).join(' · ')}
          {alerts.length > 3 && ` · +${alerts.length - 3} more`}
        </p>
      </div>
      <span className="text-[10px] opacity-60 shrink-0">View →</span>
    </button>
  )
}

// ── Processes Tab ─────────────────────────────────────────────────────────────
// Scan states: idle | scanning | polling | done | error
function ProcessesTab({ ssm, accountId, instanceId }) {
  const [sortBy,       setSortBy]      = useState('cpu')
  const [filterStatus, setFilter]      = useState('all')
  const [scanState,    setScanState]   = useState('idle')   // idle|scanning|polling|done|error
  const [scanError,    setScanError]   = useState('')
  const [commandIds,   setCommandIds]  = useState([])       // [{command_id, region, platform}]
  const [processes,    setProcesses]   = useState(ssm?.processes || [])
  const [pollSummary,  setPollSummary] = useState(null)     // {total, completed, pending, failed}
  const [scannedAt,    setScannedAt]   = useState(null)
  const pollRef = useRef(null)

  // Seed from cached SSM data on mount
  useEffect(() => {
    if (ssm?.processes?.length) {
      setProcesses(ssm.processes)
      setScanState('done')
    }
  }, [])

  // Cleanup polling on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  const pollResults = async (cmds) => {
    // Poll all command_ids; merge by_instance across regions
    let allProcesses = {}
    let allDone = false

    const check = async () => {
      try {
        const fetches = cmds.map(({ command_id }) =>
          fetch(`/api/cloud-accounts/${accountId}/ssm/process-scan-result/${command_id}`)
            .then(r => r.json())
        )
        const results = await Promise.all(fetches)

        let total = 0, completed = 0, pending = 0, failed = 0
        results.forEach(r => {
          Object.assign(allProcesses, r.by_instance || {})
          total     += r.summary?.total     || 0
          completed += r.summary?.completed || 0
          pending   += r.summary?.pending   || 0
          failed    += r.summary?.failed    || 0
        })

        setPollSummary({ total, completed, pending, failed })

        // Merge all instances — show the scanned instance first if known
        const flat = Object.entries(allProcesses).flatMap(([iid, procs]) =>
          procs.map(p => ({ ...p, instance_id: iid }))
        )
        // If we know the instanceId, show its processes first; else just by cpu
        flat.sort((a, b) => {
          if (instanceId && a.instance_id === instanceId && b.instance_id !== instanceId) return -1
          if (instanceId && b.instance_id === instanceId && a.instance_id !== instanceId) return 1
          return b.cpu - a.cpu
        })
        if (flat.length) setProcesses(flat)

        allDone = results.every(r => r.status === 'done') || pending === 0
        if (allDone) {
          stopPolling()
          setScanState('done')
          setScannedAt(new Date())
        }
      } catch (e) {
        stopPolling()
        setScanError('Polling failed: ' + e.message)
        setScanState('error')
      }
    }

    await check()
    if (!allDone) {
      pollRef.current = setInterval(check, 4000)
    }
  }

  const triggerScan = async () => {
    if (!accountId) return
    setScanState('scanning')
    setScanError('')
    setCommandIds([])
    setProcesses([])
    setPollSummary(null)
    stopPolling()

    try {
      const res  = await fetch(`/api/cloud-accounts/${accountId}/ssm/run-process-scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json()

      if (!data.commands?.length) {
        setScanError(data.errors?.join('; ') || 'No online instances found to scan.')
        setScanState('error')
        return
      }

      setCommandIds(data.commands)
      setScanState('polling')
      await pollResults(data.commands)
    } catch (e) {
      setScanError(e.message)
      setScanState('error')
    }
  }

  if (!ssm) return <EmptySSMState />

  const isRunning     = scanState === 'scanning' || scanState === 'polling'
  const criticalCount = processes.filter(p => p.status === 'critical').length
  const warningCount  = processes.filter(p => p.status === 'warning').length

  const sorted = [...processes]
    .filter(p => filterStatus === 'all' || p.status === filterStatus)
    .sort((a, b) => sortBy === 'cpu' ? b.cpu - a.cpu : b.mem - a.mem)

  return (
    <div className="space-y-3">

      {/* ── Scan controls bar ── */}
      <div className="flex items-center justify-between gap-3 bg-bg-card border border-white/10 rounded-xl px-4 py-3">
        <div className="flex-1 min-w-0">
          {scanState === 'idle' && (
            <p className="text-xs text-slate-400">
              Runs <span className="font-mono text-slate-300">ps aux</span> via SSM RunCommand — no extra AWS cost.
            </p>
          )}
          {scanState === 'scanning' && (
            <p className="text-xs text-slate-400 flex items-center gap-2">
              <Loader size={11} className="animate-spin text-blue-400" />
              Sending command to instances…
            </p>
          )}
          {scanState === 'polling' && (
            <p className="text-xs text-slate-400 flex items-center gap-2">
              <Loader size={11} className="animate-spin text-blue-400" />
              {pollSummary
                ? `${pollSummary.completed}/${pollSummary.total} done, ${pollSummary.pending} pending…`
                : 'Waiting for results…'}
            </p>
          )}
          {scanState === 'done' && (
            <p className="text-xs text-green-400 flex items-center gap-1.5">
              <CheckCircle size={11} />
              {processes.length} processes collected
              {scannedAt && <span className="text-slate-500 ml-1">· {scannedAt.toLocaleTimeString()}</span>}
              {pollSummary?.failed > 0 && (
                <span className="text-yellow-400 ml-1">· {pollSummary.failed} instance(s) failed</span>
              )}
            </p>
          )}
          {scanState === 'error' && (
            <p className="text-xs text-red-400 flex items-center gap-1.5 truncate">
              <AlertCircle size={11} className="shrink-0" />
              {scanError || 'Scan failed'}
            </p>
          )}
        </div>

        <button
          onClick={triggerScan}
          disabled={isRunning || !accountId}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-400 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 shrink-0"
        >
          {isRunning
            ? <><Loader size={11} className="animate-spin" /> Scanning…</>
            : <><Play size={11} /> {scanState === 'done' ? 'Re-scan' : 'Scan Processes'}</>
          }
        </button>
      </div>

      {/* ── No data yet ── */}
      {!processes.length && !isRunning && (
        <div className="flex flex-col items-center py-10 text-center">
          <Terminal size={28} className="text-slate-600 mb-3" />
          <p className="text-slate-400 text-xs max-w-xs leading-relaxed">
            Click <span className="text-white font-medium">Scan Processes</span> to run{' '}
            <span className="font-mono text-slate-300">ps aux</span> on this instance via SSM RunCommand.
            Results appear in ~10 seconds.
          </p>
          {!accountId && (
            <p className="text-yellow-400 text-xs mt-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">
              ⚠ No cloud account linked — scan unavailable.
            </p>
          )}
        </div>
      )}

      {/* ── Process list ── */}
      {processes.length > 0 && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Total',    value: processes.length, color: 'text-slate-300' },
              { label: 'Warning',  value: warningCount,  color: warningCount  > 0 ? 'text-yellow-400' : 'text-slate-400' },
              { label: 'Critical', value: criticalCount, color: criticalCount > 0 ? 'text-red-400'    : 'text-slate-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-bg-card border border-white/10 rounded-xl p-3 text-center">
                <p className={`text-xl font-bold ${color}`}>{value}</p>
                <p className="text-[10px] text-slate-500 mt-1">{label}</p>
              </div>
            ))}
          </div>

          {/* Filter + sort controls */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-bg-card border border-white/10 rounded-lg p-0.5 text-xs">
              {['all', 'critical', 'warning', 'healthy'].map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-2 py-1 rounded capitalize transition-colors ${
                    filterStatus === f ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'
                  }`}>{f}</button>
              ))}
            </div>
            <div className="flex items-center gap-1 bg-bg-card border border-white/10 rounded-lg p-0.5 text-xs ml-auto">
              {['cpu', 'mem'].map(s => (
                <button key={s} onClick={() => setSortBy(s)}
                  className={`px-2 py-1 rounded uppercase transition-colors ${
                    sortBy === s ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'
                  }`}>{s}</button>
              ))}
            </div>
          </div>

          {/* Rows */}
          <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
            {sorted.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">No processes match this filter.</p>
            ) : sorted.map((proc, i) => {
              const isCritical = proc.status === 'critical'
              const isWarning  = proc.status === 'warning'
              const rowBg = isCritical
                ? 'border-red-500/20 bg-red-500/5'
                : isWarning
                ? 'border-yellow-500/20 bg-yellow-500/5'
                : 'border-white/5 bg-transparent hover:bg-white/5'

              return (
                <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${rowBg} transition-colors`}>
                  <StatusDot status={proc.status} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono text-white truncate">{proc.name || '—'}</span>
                      {proc.pid  && <span className="text-[10px] text-slate-600 shrink-0">PID {proc.pid}</span>}
                      {proc.user && <span className="text-[10px] text-slate-500 shrink-0 font-mono">{proc.user}</span>}
                    </div>
                    {proc.command && proc.command !== proc.name && (
                      <div className="text-[10px] text-slate-600 truncate mt-0.5 font-mono">{proc.command}</div>
                    )}
                  </div>
                  <div className="shrink-0 w-36">
                    <div className="flex items-center justify-end gap-3">
                      <div className="text-right">
                        <div className="text-[10px] text-slate-500 mb-0.5">CPU</div>
                        <div className={`text-xs font-mono font-bold ${isCritical ? 'text-red-400' : isWarning ? 'text-yellow-400' : 'text-slate-300'}`}>
                          {proc.cpu.toFixed(1)}%
                        </div>
                        <MiniBar value={proc.cpu} color={getCpuColor(proc.cpu)} />
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-slate-500 mb-0.5">MEM</div>
                        <div className={`text-xs font-mono font-bold ${isCritical ? 'text-red-400' : isWarning ? 'text-yellow-400' : 'text-slate-300'}`}>
                          {proc.mem.toFixed(1)}%
                        </div>
                        <MiniBar value={proc.mem} color={getCpuColor(proc.mem)} />
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ── Software Tab ──────────────────────────────────────────────────────────────
function SoftwareTab({ ssm }) {
  const [search, setSearch] = useState('')

  if (!ssm) return <EmptySSMState />

  const software = ssm.software || []

  if (!software.length) {
    return (
      <div className="flex flex-col items-center py-14 text-center">
        <Package size={32} className="text-slate-600 mb-3" />
        <p className="text-white font-medium text-sm">No software inventory</p>
        <p className="text-slate-400 text-xs mt-2 max-w-xs leading-relaxed">
          Enable SSM Inventory in AWS Systems Manager to collect installed package data.
        </p>
      </div>
    )
  }

  const filtered = search
    ? software.filter(sw => sw.name.toLowerCase().includes(search.toLowerCase()) ||
                            sw.version?.toLowerCase().includes(search.toLowerCase()) ||
                            sw.publisher?.toLowerCase().includes(search.toLowerCase()))
    : software

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">
          <span className="text-white font-semibold">{ssm.software_count || software.length}</span> packages installed
        </p>
        <div className="relative">
          <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter packages…"
            className="bg-bg-card border border-white/10 rounded-lg pl-6 pr-2 py-1 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-accent/50 w-40"
          />
        </div>
      </div>

      {/* Table */}
      <div className="border border-white/10 rounded-xl overflow-hidden">
        <div className="grid grid-cols-12 px-3 py-2 bg-bg-card text-[10px] text-slate-500 uppercase tracking-wider">
          <span className="col-span-4">Package</span>
          <span className="col-span-3">Version</span>
          <span className="col-span-3">Publisher</span>
          <span className="col-span-2 text-right">Installed</span>
        </div>
        <div className="max-h-72 overflow-y-auto divide-y divide-white/5">
          {filtered.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-6">No packages match "{search}"</p>
          ) : filtered.map((sw, i) => {
            const instDate = sw.installed_time ? new Date(sw.installed_time) : null
            const dateStr  = instDate && !isNaN(instDate)
              ? instDate.toLocaleDateString(undefined, { year: '2-digit', month: 'short', day: 'numeric' })
              : '—'
            return (
              <div key={i} className="grid grid-cols-12 px-3 py-1.5 hover:bg-white/5 transition-colors">
                <span className="col-span-4 text-xs text-slate-200 font-mono truncate">{sw.name}</span>
                <span className="col-span-3 text-xs font-mono text-slate-400 truncate">{sw.version || '—'}</span>
                <span className="col-span-3 text-xs text-slate-500 truncate">{sw.publisher || '—'}</span>
                <span className="col-span-2 text-[10px] text-slate-600 text-right font-mono">{dateStr}</span>
              </div>
            )
          })}
        </div>
      </div>

      {filtered.length > 0 && search && (
        <p className="text-[10px] text-slate-600 text-center">
          Showing {filtered.length} of {software.length} packages
        </p>
      )}
    </div>
  )
}

// ── Compliance Tab ─────────────────────────────────────────────────────────────
function ComplianceTab({ instance, accountId }) {
  const [checks, setChecks]     = useState([
    { id: 1, package: 'nginx',   operator: '>=', version: '1.24.0', label: 'nginx ≥ 1.24' },
    { id: 2, package: 'openssl', operator: '>=', version: '3.0.0',  label: 'openssl ≥ 3.0' },
  ])
  const [newPkg,  setNewPkg]    = useState('')
  const [newOp,   setNewOp]     = useState('>=')
  const [newVer,  setNewVer]    = useState('')
  const [results, setResults]   = useState({})   // { checkId: { status, data } }
  const [running, setRunning]   = useState(null)  // currently running check id

  const runCheck = async (check) => {
    if (!accountId) return
    setRunning(check.id)
    setResults(r => ({ ...r, [check.id]: { status: 'running' } }))
    try {
      const res = await fetch(`/api/cloud-accounts/${accountId}/ssm/compliance-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          package: check.package, operator: check.operator,
          version: check.version, label: check.label,
        }),
      })
      const data = await res.json()
      // Filter to only this instance
      const instResult = data.results?.find(r =>
        r.instance_id === instance?.id || r.instance_id === instance?.name
      )
      setResults(r => ({ ...r, [check.id]: { status: 'done', data, instResult } }))
    } catch (e) {
      setResults(r => ({ ...r, [check.id]: { status: 'error', error: e.message } }))
    } finally {
      setRunning(null)
    }
  }

  const addCheck = () => {
    if (!newPkg || !newVer) return
    const id = Date.now()
    setChecks(c => [...c, {
      id, package: newPkg.trim(), operator: newOp,
      version: newVer.trim(), label: `${newPkg.trim()} ${newOp} ${newVer.trim()}`,
    }])
    setNewPkg(''); setNewVer('')
  }

  const removeCheck = (id) => {
    setChecks(c => c.filter(x => x.id !== id))
    setResults(r => { const n = { ...r }; delete n[id]; return n })
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400 leading-relaxed">
        Run custom compliance checks against this instance's software inventory.
        Checks compare the installed version against your policy requirement.
      </p>

      {/* Check list */}
      <div className="space-y-2">
        {checks.map(check => {
          const res = results[check.id]
          const instResult = res?.instResult
          const isRunning  = running === check.id

          return (
            <div key={check.id} className="bg-bg-card border border-white/10 rounded-xl overflow-hidden">
              {/* Row */}
              <div className="flex items-center gap-3 px-4 py-3">
                {/* Status icon */}
                <div className="shrink-0 w-5 h-5 flex items-center justify-center">
                  {isRunning ? (
                    <Loader size={14} className="text-blue-400 animate-spin" />
                  ) : !res ? (
                    <ShieldCheck size={14} className="text-slate-500" />
                  ) : res.status === 'error' ? (
                    <AlertCircle size={14} className="text-red-400" />
                  ) : instResult?.status === 'pass' ? (
                    <CheckSquare size={14} className="text-green-400" />
                  ) : instResult?.status === 'fail' ? (
                    <XSquare size={14} className="text-red-400" />
                  ) : instResult?.status === 'missing' ? (
                    <MinusSquare size={14} className="text-yellow-400" />
                  ) : (
                    <ShieldCheck size={14} className="text-slate-500" />
                  )}
                </div>

                {/* Label */}
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-mono text-white">{check.label}</span>
                  {instResult && (
                    <div className="mt-0.5">
                      {instResult.status === 'pass' && (
                        <span className="text-[10px] text-green-400">
                          Installed: {instResult.installed_version} ✓
                        </span>
                      )}
                      {instResult.status === 'fail' && (
                        <span className="text-[10px] text-red-400">
                          Installed: {instResult.installed_version} — version too old
                        </span>
                      )}
                      {instResult.status === 'missing' && (
                        <span className="text-[10px] text-yellow-400">Not installed on this instance</span>
                      )}
                    </div>
                  )}
                  {res?.status === 'error' && (
                    <div className="text-[10px] text-red-400 mt-0.5">{res.error}</div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => runCheck(check)}
                    disabled={isRunning || !accountId}
                    className="px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-400 rounded-lg text-[10px] font-medium transition-colors disabled:opacity-40 flex items-center gap-1"
                  >
                    {isRunning ? <Loader size={9} className="animate-spin" /> : <Play size={9} />}
                    Run
                  </button>
                  <button
                    onClick={() => removeCheck(check.id)}
                    className="p-1 text-slate-600 hover:text-slate-400 transition-colors"
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>

              {/* Fleet summary (if check was run) */}
              {res?.status === 'done' && res.data?.summary && (
                <div className="px-4 pb-3 border-t border-white/5">
                  <p className="text-[10px] text-slate-500 mt-2 mb-1.5">Fleet result ({res.data.summary.total} instances)</p>
                  <div className="flex gap-3">
                    {[
                      { label: 'Pass',    value: res.data.summary.passing, color: 'text-green-400' },
                      { label: 'Fail',    value: res.data.summary.failing, color: res.data.summary.failing > 0 ? 'text-red-400' : 'text-slate-500' },
                      { label: 'Missing', value: res.data.summary.missing, color: res.data.summary.missing > 0 ? 'text-yellow-400' : 'text-slate-500' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="text-center">
                        <div className={`text-sm font-bold font-mono ${color}`}>{value}</div>
                        <div className="text-[10px] text-slate-600">{label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Add new check */}
      <div className="border border-white/10 rounded-xl p-3 bg-bg-card/50">
        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Add compliance check</p>
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex-1 min-w-[100px]">
            <label className="text-[10px] text-slate-500 block mb-1">Package</label>
            <input
              value={newPkg}
              onChange={e => setNewPkg(e.target.value)}
              placeholder="e.g. nginx"
              className="w-full bg-bg-primary border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-accent/50"
            />
          </div>
          <div className="w-16">
            <label className="text-[10px] text-slate-500 block mb-1">Op</label>
            <select
              value={newOp}
              onChange={e => setNewOp(e.target.value)}
              className="w-full bg-bg-primary border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-accent/50"
            >
              {['>=', '>', '==', '<=', '<', '!='].map(op => (
                <option key={op} value={op}>{op}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[80px]">
            <label className="text-[10px] text-slate-500 block mb-1">Version</label>
            <input
              value={newVer}
              onChange={e => setNewVer(e.target.value)}
              placeholder="e.g. 1.24.0"
              className="w-full bg-bg-primary border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-accent/50"
            />
          </div>
          <button
            onClick={addCheck}
            disabled={!newPkg || !newVer}
            className="px-3 py-1.5 bg-accent/20 hover:bg-accent/30 border border-accent/30 text-accent rounded-lg text-xs transition-colors disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </div>

      {!accountId && (
        <p className="text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
          ⚠ Compliance checks require a connected cloud account with active SSM.
        </p>
      )}
    </div>
  )
}

// ── Empty SSM state ───────────────────────────────────────────────────────────
function EmptySSMState() {
  return (
    <div className="flex flex-col items-center py-14 text-center">
      <Shield size={32} className="text-slate-600 mb-3" />
      <p className="text-white font-medium text-sm">No SSM data</p>
      <p className="text-slate-400 text-xs mt-2 max-w-xs">
        Ensure the SSM Agent is installed and the IAM role includes
        <span className="font-mono text-slate-300"> AmazonSSMManagedInstanceCore</span>.
      </p>
    </div>
  )
}

// ── Cloud Instance Detail Modal ───────────────────────────────────────────────
function CloudInstanceModal({ instance, ssmData, accountId, onClose }) {
  const [tab, setTab] = useState('overview')
  if (!instance) return null

  const statusColor = getStatusColor(instance.status)
  const borderClass = getStatusBorder(instance.status)

  const ssm = ssmData?.find(s =>
    s.instance_id === instance.id || s.instance_id === instance.name
  )

  const patchBadge = !ssm ? null
    : ssm.patch_state === 'compliant'     ? { label: 'Compliant',     cls: 'text-green-400 bg-green-500/10 border-green-500/30' }
    : ssm.patch_state === 'non_compliant' ? { label: 'Non-Compliant', cls: 'text-red-400 bg-red-500/10 border-red-500/30' }
    : { label: 'Unknown', cls: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30' }

  const processes = ssm?.processes || []
  const alertProcs = processes.filter(p => p.status === 'warning' || p.status === 'critical')

  const TABS = [
    { key: 'overview',   label: 'Overview' },
    { key: 'processes',  label: 'Processes',
      badge: alertProcs.length > 0 ? { count: alertProcs.length, danger: alertProcs.some(p => p.status === 'critical') } : null },
    { key: 'patches',    label: 'Patches',
      badge: ssm?.missing_patches > 0 ? { count: ssm.missing_patches, danger: true } : null },
    { key: 'software',   label: 'Software',
      badge: ssm?.software_count > 0 ? { count: ssm.software_count, danger: false } : null },
    { key: 'compliance', label: 'Compliance' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className={`bg-bg-secondary border ${borderClass} rounded-xl w-[700px] max-h-[88vh] overflow-hidden shadow-2xl flex flex-col`}
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
                {instance.id !== instance.name && instance.id && `${instance.id} · `}
                {instance.type || instance.resource_type} · {instance.region}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
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
        <div className="flex gap-0.5 px-5 pt-3 shrink-0 overflow-x-auto">
          {TABS.map(({ key, label, badge }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                tab === key ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {label}
              {badge && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  badge.danger
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-slate-500/20 text-slate-400'
                }`}>
                  {badge.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">

          {/* Process alert banner — visible on all tabs when there are alerts */}
          {tab !== 'processes' && alertProcs.length > 0 && (
            <ProcessAlertBanner processes={processes} onTabSwitch={setTab} />
          )}

          {/* ── Overview ── */}
          {tab === 'overview' && (
            <div className="space-y-4">
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
                  ['Launch Time',   instance.launch_time ? new Date(instance.launch_time).toLocaleString() : '—'],
                  ['State',         instance.state || '—'],
                ].map(([k, v]) => (
                  <div key={k} className="bg-bg-card rounded-lg px-3 py-2">
                    <div className="text-[10px] text-slate-500">{k}</div>
                    <div className="text-xs font-mono text-white mt-0.5 truncate">{v}</div>
                  </div>
                ))}
              </div>

              {/* SSM Quick Summary */}
              {ssm ? (
                <div className="bg-bg-card border border-white/10 rounded-xl p-4">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-3">SSM / System Status</p>
                  <div className="grid grid-cols-5 gap-2">
                    {[
                      { label: 'Ping',      value: ssm.ping_status,           color: ssm.ping_status === 'Online' ? 'text-green-400' : 'text-red-400' },
                      { label: 'Missing',   value: ssm.missing_patches  ?? 0, color: (ssm.missing_patches||0)  > 0 ? 'text-red-400' : 'text-green-400' },
                      { label: 'Installed', value: ssm.installed_patches ?? 0, color: 'text-slate-300' },
                      { label: 'Processes', value: processes.length,           color: 'text-slate-300' },
                      { label: 'Packages',  value: ssm.software_count || ssm.software?.length || 0, color: 'text-slate-300' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="text-center">
                        <p className={`text-sm font-bold ${color}`}>{value}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>
                  {ssm.platform && (
                    <p className="text-[10px] text-slate-500 mt-3 font-mono">{ssm.platform} {ssm.platform_version}</p>
                  )}
                  {ssm.last_ping && (
                    <p className="text-[10px] text-slate-500 flex items-center gap-1 mt-1">
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
                  <SectionLabel>Tags</SectionLabel>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(instance.tags).map(([k, v]) => (
                      <span key={k} className="text-[10px] bg-white/5 border border-white/10 rounded px-2 py-0.5 font-mono">
                        <span className="text-slate-400">{k}:</span> <span className="text-slate-300">{v}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Processes ── */}
          {tab === 'processes' && <ProcessesTab ssm={ssm} accountId={accountId} instanceId={instance?.id} />}

          {/* ── Patches ── */}
          {tab === 'patches' && (
            <div className="space-y-3">
              {!ssm ? <EmptySSMState /> : (
                <>
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
                      ⚠ Patch state unknown — run a patch scan from Cloud Accounts → SSM.
                    </div>
                  )}

                  {ssm.missing_packages?.length > 0 && (
                    <div>
                      <SectionLabel>Packages to upgrade ({ssm.missing_packages.length})</SectionLabel>
                      <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
                        {ssm.missing_packages.map((pkg, i) => (
                          <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-red-500/5 border border-red-500/10 rounded-lg">
                            <Package size={11} className="text-red-400 shrink-0" />
                            <span className="text-xs font-mono text-slate-300">{pkg}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Software ── */}
          {tab === 'software' && <SoftwareTab ssm={ssm} />}

          {/* ── Compliance ── */}
          {tab === 'compliance' && <ComplianceTab instance={instance} accountId={accountId} />}
        </div>
      </div>
    </div>
  )
}

// ── Cloud Instance Tile ────────────────────────────────────────────────────────
function CloudInstanceTile({ instance, ssmData, onClick }) {
  const ssm = ssmData?.find(s => s.instance_id === instance.id || s.instance_id === instance.name)
  const borderClass   = getStatusBorder(instance.status)
  const statusColor   = getStatusColor(instance.status)
  const providerColor = getProviderColor(instance.provider || 'AWS')

  const processes  = ssm?.processes || []
  const alertProcs = processes.filter(p => p.status === 'warning' || p.status === 'critical')
  const hasAlert   = alertProcs.some(p => p.status === 'critical')
  const hasWarning = alertProcs.some(p => p.status === 'warning')

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
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          {alertProcs.length > 0 && (
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
              hasAlert ? 'text-red-400 bg-red-500/10 border-red-500/20' : 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20'
            }`}>
              {alertProcs.length}⚡
            </span>
          )}
          <div className={`text-[10px] font-mono font-semibold capitalize ${statusColor}`}>
            {instance.status}
          </div>
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

      {/* Metrics row */}
      <div className="mt-2 pt-2 border-t border-bg-border space-y-1">
        <div className="flex justify-between text-[10px]">
          <span className="text-slate-600">Patches</span>
          <span className={`font-mono ${patchColor}`}>{patchLabel}</span>
        </div>
        {ssm && (
          <div className="flex justify-between text-[10px]">
            <span className="text-slate-600">SSM Ping</span>
            <span className={ssm.ping_status === 'Online' ? 'text-green-400' : 'text-red-400'}>
              {ssm.ping_status || '—'}
            </span>
          </div>
        )}
        {processes.length > 0 && (
          <div className="flex justify-between text-[10px]">
            <span className="text-slate-600">Processes</span>
            <span className={
              hasAlert ? 'text-red-400' : hasWarning ? 'text-yellow-400' : 'text-slate-400'
            }>
              {processes.length} {alertProcs.length > 0 ? `(${alertProcs.length} alert)` : ''}
            </span>
          </div>
        )}
      </div>
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
  const [viewMode,  setViewMode]  = useState('all')
  const [selected,  setSelected]  = useState(null)
  const [selAccountId, setSelAccountId] = useState(null)

  useEffect(() => { loadAllAccountData() }, [])

  const cloudResources = Object.values(accountData).flatMap(d => d.resources || [])
  const allSSMData     = Object.values(accountData).flatMap(d => d.ssm || [])

  // Build instance → account_id map for compliance check endpoint
  const instanceAccountMap = useMemo(() => {
    const map = {}
    Object.entries(accountData).forEach(([accStoreKey, d]) => {
      // Find the real account id from the accounts list
      const acc = accounts.find(a => a.id === accStoreKey)
      const accId = acc?.id || accStoreKey
      ;(d.resources || []).forEach(r => { map[r.id] = accId })
    })
    return map
  }, [accountData, accounts])

  const seen = new Set()
  const agentServers   = servers.filter(s => { if (seen.has(s.id)) return false; seen.add(s.id); return true })
  const cloudInstances = cloudResources.filter(r =>
    (r.resource_type === 'EC2' || r.type === 'EC2' || r.service === 'EC2') &&
    !seen.has(r.id)
  )

  const totalAll    = agentServers.length + cloudInstances.length
  const totalAgents = agentServers.length
  const totalCloud  = cloudInstances.length

  const filteredAgents = viewMode !== 'cloud' ? agentServers
    .filter(s => provider === 'All' || s.provider === provider)
    .filter(s => status   === 'All' || s.status   === status)
    .filter(s => !search  || s.name?.toLowerCase().includes(search.toLowerCase()) ||
                             s.region?.toLowerCase().includes(search.toLowerCase()))
    : []

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
      {/* Filters bar */}
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

      <div className="flex items-center gap-3 text-xs text-slate-500 font-mono">
        <span>{filteredAgents.length + filteredCloud.length} of {totalAll} instances</span>
        {totalAgents > 0 && <span>· ⬡ {totalAgents} agent{totalAgents !== 1 ? 's' : ''}</span>}
        {totalCloud  > 0 && <span>· ☁ {totalCloud} cloud</span>}
      </div>

      {/* Agent servers */}
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

      {/* Cloud instances */}
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
                onClick={() => {
                  setSelected(r)
                  setSelAccountId(instanceAccountMap[r.id] || accounts[0]?.id || null)
                }}
              />
            ))}
          </div>
        </div>
      )}

      {filteredAgents.length === 0 && filteredCloud.length === 0 && (
        <p className="text-sm text-slate-500 text-center py-12">No instances match this filter.</p>
      )}

      {/* Cloud instance detail modal */}
      {selected && (
        <CloudInstanceModal
          instance={selected}
          ssmData={allSSMData}
          accountId={selAccountId}
          onClose={() => { setSelected(null); setSelAccountId(null) }}
        />
      )}
    </div>
  )
}
