import React, { useEffect, useState } from 'react'
import { Cloud, Plus, RefreshCw, CheckCircle, AlertTriangle, Trash2, Play, ExternalLink,
         Server, Database, Zap, DollarSign, Shield, ChevronRight, ChevronDown, Wifi, WifiOff, X,
         TrendingDown, Eye, Clock } from 'lucide-react'
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
         CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import useCloudStore from '@/store/useCloudStore'
import useStore from '@/store/useStore'

// ─── Provider colours ────────────────────────────────────────────────────────
const PROVIDER_META = {
  AWS:   { color: '#FF9900', bg: 'bg-orange-500/10', border: 'border-orange-500/30', label: 'Amazon Web Services' },
  Azure: { color: '#0078D4', bg: 'bg-blue-500/10',   border: 'border-blue-500/30',   label: 'Microsoft Azure' },
  GCP:   { color: '#4285F4', bg: 'bg-blue-400/10',   border: 'border-blue-400/30',   label: 'Google Cloud Platform' },
}

const STATUS_META = {
  active:  { color: 'text-green-400',  dot: 'bg-green-400',  label: 'Active' },
  pending: { color: 'text-yellow-400', dot: 'bg-yellow-400', label: 'Pending' },
  error:   { color: 'text-red-400',    dot: 'bg-red-400',    label: 'Error' },
}

const SERVICE_ICONS = { EC2: Server, RDS: Database, Lambda: Zap }

// ─── Add Account Modal ───────────────────────────────────────────────────────
function AddAccountModal({ onClose, onAdded }) {
  const { createAccount, testConnection } = useCloudStore()
  const [step,    setStep]    = useState(1)    // 1=form, 2=testing, 3=success
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [created, setCreated] = useState(null)
  const [testRes, setTestRes] = useState(null)
  const [form,    setForm]    = useState({
    name: '', provider: 'AWS', account_id: '',
    access_key: '', secret_key: '', role_arn: '',
    regions: ['us-east-1'], poll_interval: 300,
  })
  const up = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const AWS_REGIONS = [
    'us-east-1','us-east-2','us-west-1','us-west-2',
    'eu-west-1','eu-west-2','eu-central-1',
    'ap-south-1','ap-southeast-1','ap-southeast-2','ap-northeast-1',
  ]

  const toggleRegion = (r) => {
    const regions = form.regions.includes(r)
      ? form.regions.filter(x => x !== r)
      : [...form.regions, r]
    up('regions', regions.length > 0 ? regions : [r])
  }

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true); setError(null)
    try {
      const acc = await createAccount(form)
      setCreated(acc)
      setStep(2)
      // Auto-test connection
      const result = await testConnection(acc.id)
      setTestRes(result)
      setStep(3)
      onAdded()
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-bg-secondary border border-white/10 rounded-2xl w-full max-w-xl shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center">
              <Cloud size={15} className="text-orange-400" />
            </div>
            <h2 className="font-semibold text-white">Connect Cloud Account</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white">
            <X size={15} />
          </button>
        </div>

        {step === 1 && (
          <form onSubmit={submit} className="p-5 space-y-4">
            {/* Provider tabs */}
            <div>
              <label className="text-xs text-slate-400 mb-2 block">Cloud Provider</label>
              <div className="flex gap-2">
                {Object.entries(PROVIDER_META).map(([p, meta]) => (
                  <button key={p} type="button" onClick={() => up('provider', p)}
                    className={`flex-1 py-2 rounded-xl border text-sm font-medium transition-colors ${
                      form.provider === p
                        ? `${meta.bg} ${meta.border} text-white`
                        : 'border-white/10 text-slate-400 hover:text-white'
                    }`}
                    style={form.provider === p ? { color: meta.color } : {}}>
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-slate-400 mb-1.5 block">Account Name *</label>
                <input required value={form.name} onChange={e => up('name', e.target.value)}
                  placeholder="e.g. Production AWS" className="input-field w-full" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1.5 block">Access Key ID</label>
                <input value={form.access_key} onChange={e => up('access_key', e.target.value)}
                  placeholder="AKIA..." className="input-field w-full font-mono text-xs" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1.5 block">Secret Access Key</label>
                <input type="password" value={form.secret_key} onChange={e => up('secret_key', e.target.value)}
                  placeholder="••••••••••••" className="input-field w-full font-mono text-xs" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-slate-400 mb-1.5 block">IAM Role ARN <span className="text-slate-600">(optional — preferred over keys)</span></label>
                <input value={form.role_arn} onChange={e => up('role_arn', e.target.value)}
                  placeholder="arn:aws:iam::123456789:role/MultiCloudOpsRole" className="input-field w-full font-mono text-xs" />
              </div>
            </div>

            {/* Regions */}
            <div>
              <label className="text-xs text-slate-400 mb-2 block">Regions to Monitor</label>
              <div className="flex flex-wrap gap-1.5">
                {AWS_REGIONS.map(r => (
                  <button key={r} type="button" onClick={() => toggleRegion(r)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-mono transition-colors border ${
                      form.regions.includes(r)
                        ? 'bg-orange-500/15 border-orange-500/40 text-orange-300'
                        : 'border-white/10 text-slate-500 hover:text-white hover:border-white/20'
                    }`}>
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Poll interval */}
            <div>
              <label className="text-xs text-slate-400 mb-1.5 block">
                Poll Interval — <span className="text-orange-400 font-mono">{form.poll_interval}s</span>
                <span className="text-slate-600 ml-2">· shorter = more CloudWatch API cost</span>
              </label>
              <input type="range" min={60} max={3600} step={60}
                value={form.poll_interval} onChange={e => up('poll_interval', parseInt(e.target.value))}
                className="w-full accent-orange-500" />
              <div className="flex justify-between text-[10px] text-slate-600 mt-0.5">
                <span>1 min</span><span>5 min (recommended)</span><span>1 hour</span>
              </div>
            </div>

            {/* Cost warning */}
            <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-3 text-xs text-yellow-400 flex gap-2">
              <DollarSign size={13} className="shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Cost note: </span>
                CloudWatch GetMetricData costs ~$0.01/1000 metrics. Cost Explorer costs $0.01/request (cached 1h).
                At 5-min intervals with 50 servers → ~$15–30/month in AWS API costs.
              </div>
            </div>

            {error && (
              <div className="flex gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400">
                <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {error}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-300 hover:bg-white/5 text-sm">Cancel</button>
              <button type="submit" disabled={loading}
                className="flex-1 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium disabled:opacity-50">
                {loading ? 'Connecting…' : 'Connect Account'}
              </button>
            </div>
          </form>
        )}

        {step === 2 && (
          <div className="p-10 flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-full border-2 border-orange-500/30 border-t-orange-500 animate-spin" />
            <p className="text-white font-medium">Testing connection…</p>
            <p className="text-slate-400 text-sm">Calling STS GetCallerIdentity</p>
          </div>
        )}

        {step === 3 && (
          <div className="p-6 space-y-4">
            {testRes?.success ? (
              <div className="flex items-start gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
                <CheckCircle size={18} className="text-green-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-green-400 font-medium">Connection successful!</p>
                  <p className="text-slate-400 text-sm mt-0.5">
                    AWS Account: <span className="font-mono text-white">{testRes.aws_account_id}</span>
                  </p>
                  <p className="text-slate-500 text-xs mt-0.5 font-mono break-all">{testRes.arn}</p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                <AlertTriangle size={18} className="text-red-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-red-400 font-medium">Connection failed</p>
                  <p className="text-slate-400 text-sm mt-0.5">{testRes?.message}</p>
                </div>
              </div>
            )}

            {testRes?.success && (
              <div className="bg-bg-primary border border-white/10 rounded-xl p-4 text-xs space-y-1.5">
                <p className="text-slate-400 font-semibold mb-2">Required IAM Permissions</p>
                {['cloudwatch:GetMetricData','ec2:DescribeInstances','rds:DescribeDBInstances',
                  'lambda:ListFunctions','sts:GetCallerIdentity','ce:GetCostAndUsage',
                  'ssm:DescribeInstanceInformation','securityhub:GetFindings'].map(p => (
                  <div key={p} className="flex items-center gap-2">
                    <CheckCircle size={10} className="text-green-400" />
                    <span className="font-mono text-slate-300">{p}</span>
                  </div>
                ))}
              </div>
            )}

            <button onClick={onClose}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm">
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Account Card ─────────────────────────────────────────────────────────────
function AccountCard({ account, onSelect, onDelete, onSync, onTest, onEdit, isSyncing }) {
  const meta   = PROVIDER_META[account.provider] || PROVIDER_META.AWS
  const status = STATUS_META[account.status]     || STATUS_META.pending

  return (
    <div className={`bg-bg-secondary border rounded-2xl overflow-hidden hover:border-white/20 transition-all cursor-pointer ${
      account.status === 'error' ? 'border-red-500/30' : 'border-white/10'
    }`}
      onClick={() => onSelect(account)}>
      {/* Top bar */}
      <div className={`h-1 ${account.provider === 'AWS' ? 'bg-orange-500' : account.provider === 'Azure' ? 'bg-blue-500' : 'bg-blue-400'}`} />

      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${meta.bg} border ${meta.border} flex items-center justify-center`}>
              <Cloud size={18} style={{ color: meta.color }} />
            </div>
            <div>
              <h3 className="font-semibold text-white text-sm">{account.name}</h3>
              <p className="text-xs text-slate-500">{meta.label}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${status.dot} ${account.status === 'active' ? 'animate-pulse' : ''}`} />
            <span className={`text-xs font-medium ${status.color}`}>{status.label}</span>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-bg-primary rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-slate-500 mb-0.5">Account ID</p>
            <p className="text-xs font-mono text-white truncate">{account.account_id || '—'}</p>
          </div>
          <div className="bg-bg-primary rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-slate-500 mb-0.5">Regions</p>
            <p className="text-sm font-bold text-white">{(account.regions || []).length}</p>
          </div>
          <div className="bg-bg-primary rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-slate-500 mb-0.5">Poll</p>
            <p className="text-xs font-mono text-white">{account.poll_interval}s</p>
          </div>
        </div>

        {account.last_sync && (
          <p className="text-[10px] text-slate-600 flex items-center gap-1 mb-3">
            <Clock size={10} /> Last sync: {new Date(account.last_sync).toLocaleString()}
          </p>
        )}

        {account.error_msg && (
          <p className="text-[10px] text-red-400 bg-red-500/10 rounded-lg px-2 py-1 mb-3 truncate">{account.error_msg}</p>
        )}

        {/* Actions */}
        <div className="flex gap-2" onClick={e => e.stopPropagation()}>
          <button onClick={() => onTest(account.id)}
            className="flex-1 py-1.5 rounded-lg border border-white/10 text-xs text-slate-300 hover:text-white hover:bg-white/5 transition-colors">
            Test
          </button>
          <button onClick={() => onSync(account.id)}
            disabled={account.status !== 'active' || isSyncing}
            className="flex-1 py-1.5 rounded-lg bg-orange-600/20 border border-orange-500/30 text-xs text-orange-400 hover:bg-orange-600/30 disabled:opacity-40 transition-colors flex items-center justify-center gap-1">
            {isSyncing ? <RefreshCw size={11} className="animate-spin" /> : <Play size={11} />}
            Sync
          </button>
          <button onClick={() => onEdit(account)}
            className="p-1.5 rounded-lg hover:bg-blue-500/10 text-slate-500 hover:text-blue-400 transition-colors border border-white/10">
            <ChevronDown size={13} />
          </button>
          <button onClick={() => onDelete(account.id)}
            className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-colors border border-white/10">
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Account Detail Panel ─────────────────────────────────────────────────────
function AccountDetail({ account, onClose }) {
  const { loadAccountData, syncAccount, accountData, syncingId } = useCloudStore()
  const [tab,        setTab]        = useState('resources')
  const [dataLoading, setDataLoading] = useState(true)

  useEffect(() => {
    setDataLoading(true)
    loadAccountData(account.id).finally(() => setDataLoading(false))
  }, [account.id])

  // Read from the per-account cache, not from store root (which doesn't have these fields)
  const data         = accountData[account.id] || {}
  const resources    = data.resources     || []
  const costs        = data.costs         || {}
  const security     = data.security      || []
  const ssm          = data.ssm           || []
  const optimisations= data.optimisations || []

  const byService = resources.reduce((acc, r) => {
    acc[r.service] = (acc[r.service] || [])
    acc[r.service].push(r)
    return acc
  }, {})

  const services  = Object.keys(byService)
  const statusCounts = {
    healthy:  resources.filter(r => r.status === 'healthy').length,
    warning:  resources.filter(r => r.status === 'warning').length,
    critical: resources.filter(r => r.status === 'critical').length,
    stopped:  resources.filter(r => r.status === 'stopped').length,
  }

  const TABS = ['resources','costs','security','optimisations','ssm']

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-4xl bg-bg-secondary border-l border-white/10 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center">
              <Cloud size={16} className="text-orange-400" />
            </div>
            <div>
              <h2 className="font-semibold text-white">{account.name}</h2>
              <p className="text-xs text-slate-500">{account.account_id} · {account.provider}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => syncAccount(account.id)}
              disabled={syncingId === account.id}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-orange-600/20 border border-orange-500/30 text-orange-400 text-xs hover:bg-orange-600/30 transition-colors disabled:opacity-50">
              <RefreshCw size={12} className={syncingId === account.id ? 'animate-spin' : ''} />
              {syncingId === account.id ? 'Syncing…' : 'Sync Now'}
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Summary row */}
        <div className="grid grid-cols-5 gap-3 p-4 shrink-0 border-b border-white/10">
          {[
            { label: 'Resources',  value: resources.length,       color: 'text-white' },
            { label: 'Healthy',    value: statusCounts.healthy,   color: 'text-green-400' },
            { label: 'Warning',    value: statusCounts.warning,   color: 'text-yellow-400' },
            { label: 'Critical',   value: statusCounts.critical,  color: 'text-red-400' },
            { label: 'Savings',    value: `${optimisations.length} tips`, color: 'text-blue-400' },
          ].map(s => (
            <div key={s.label} className="bg-bg-primary rounded-xl p-3 text-center">
              <p className="text-[10px] text-slate-500">{s.label}</p>
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-4 pt-3 border-b border-white/10 shrink-0">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-t-lg text-xs font-medium capitalize transition-colors ${
                tab === t
                  ? 'bg-bg-primary text-white border border-b-0 border-white/10'
                  : 'text-slate-400 hover:text-white'
              }`}>
              {t}
              {t === 'security' && security.length > 0 && (
                <span className="ml-1.5 text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full">{security.length}</span>
              )}
              {t === 'optimisations' && optimisations.length > 0 && (
                <span className="ml-1.5 text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full">{optimisations.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-4">
          {dataLoading ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw size={20} className="animate-spin text-slate-400 mr-2" />
              <span className="text-slate-400">Loading account data…</span>
            </div>
          ) : tab === 'resources' ? (
            <ResourcesTab byService={byService} services={services} />
          ) : tab === 'costs' ? (
            <CostsTab costs={costs} />
          ) : tab === 'security' ? (
            <SecurityTab findings={security} />
          ) : tab === 'optimisations' ? (
            <OptimisationsTab items={optimisations} />
          ) : tab === 'ssm' ? (
            <SSMTab items={ssm} accountId={account.id} />
          ) : null}
        </div>
      </div>
    </div>
  )
}

// ─── Resources Tab ────────────────────────────────────────────────────────────
function ResourcesTab({ byService, services }) {
  const [selected, setSelected] = useState(services[0] || '')
  const resources = byService[selected] || []

  if (services.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <Server size={32} className="text-slate-600 mb-3" />
        <p className="text-white font-medium">No resources found</p>
        <p className="text-slate-400 text-sm mt-1">Sync the account to discover resources</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Service tabs */}
      <div className="flex gap-2 flex-wrap">
        {services.map(s => (
          <button key={s} onClick={() => setSelected(s)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
              selected === s
                ? 'bg-blue-600/20 border-blue-500/30 text-blue-400'
                : 'border-white/10 text-slate-400 hover:text-white'
            }`}>
            {s} <span className="font-mono opacity-60">{byService[s].length}</span>
          </button>
        ))}
      </div>

      {/* Resource list */}
      <div className="space-y-2">
        {resources.map(r => <ResourceRow key={r.id} resource={r} />)}
      </div>
    </div>
  )
}

function ResourceRow({ resource: r }) {
  const statusColor = { healthy:'text-green-400', warning:'text-yellow-400', critical:'text-red-400', stopped:'text-slate-500' }
  const borderColor = { healthy:'border-green-500/20', warning:'border-yellow-500/20', critical:'border-red-500/20', stopped:'border-white/5' }

  return (
    <div className={`bg-bg-primary border ${borderColor[r.status]||'border-white/10'} rounded-xl p-4`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`w-2 h-2 rounded-full shrink-0 ${r.status==='healthy'?'bg-green-400':r.status==='critical'?'bg-red-400':r.status==='warning'?'bg-yellow-400':'bg-slate-600'}`} />
            <p className="text-sm font-medium text-white truncate">{r.name}</p>
            <span className="text-[10px] font-mono text-slate-500 shrink-0">{r.id}</span>
          </div>
          {r.public_ip && <p className="text-[11px] font-mono text-slate-500 ml-4">{r.public_ip}</p>}
          <div className="flex items-center gap-3 mt-2 ml-4 flex-wrap">
            <span className="text-[10px] text-slate-500">{r.type}</span>
            <span className="text-[10px] text-slate-500">{r.region}</span>
            {r.engine && <span className="text-[10px] text-slate-500">{r.engine}</span>}
            {r.multi_az !== undefined && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${r.multi_az ? 'border-green-500/30 text-green-400' : 'border-slate-600 text-slate-500'}`}>
                {r.multi_az ? 'Multi-AZ' : 'Single-AZ'}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          {r.service === 'EC2' || r.service === 'RDS' ? (
            <>
              <div className="text-right">
                <p className="text-[10px] text-slate-500">CPU</p>
                <p className={`text-sm font-mono font-bold ${r.cpu>80?'text-red-400':r.cpu>60?'text-yellow-400':'text-slate-300'}`}>{r.cpu}%</p>
              </div>
              {r.connections !== undefined && (
                <div className="text-right">
                  <p className="text-[10px] text-slate-500">Conns</p>
                  <p className="text-sm font-mono font-bold text-slate-300">{r.connections}</p>
                </div>
              )}
            </>
          ) : r.service === 'Lambda' ? (
            <>
              <div className="text-right">
                <p className="text-[10px] text-slate-500">Invocations</p>
                <p className="text-sm font-mono font-bold text-slate-300">{r.invocations}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-slate-500">Error rate</p>
                <p className={`text-sm font-mono font-bold ${r.error_rate>5?'text-red-400':r.error_rate>1?'text-yellow-400':'text-green-400'}`}>{r.error_rate}%</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-slate-500">Avg dur.</p>
                <p className="text-sm font-mono font-bold text-slate-300">{r.duration_ms}ms</p>
              </div>
            </>
          ) : null}
          <span className={`text-xs font-medium capitalize ${statusColor[r.status]||'text-slate-400'}`}>{r.status}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Costs Tab ────────────────────────────────────────────────────────────────
function CostsTab({ costs }) {
  if (!costs || !costs.daily) {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <DollarSign size={32} className="text-slate-600 mb-3" />
        <p className="text-white font-medium">No cost data yet</p>
        <p className="text-slate-400 text-sm mt-1">Cost Explorer data loads after first sync</p>
        <p className="text-[11px] text-yellow-400 mt-2 bg-yellow-500/10 px-3 py-1.5 rounded-lg border border-yellow-500/20">
          Note: Cost Explorer API costs $0.01/request — cached for 1 hour
        </p>
      </div>
    )
  }

  const COST_COLORS = ['#FF9900','#00b4d8','#00d68f','#a78bfa','#ff3d71','#ffcc00','#f97316']

  return (
    <div className="space-y-5">
      {/* Top KPIs */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Month-to-Date', value: `$${costs.total_mtd?.toFixed(2) || '0.00'}`, color: 'text-white' },
          { label: 'Forecast (EOM)', value: `$${costs.forecast?.toFixed(2) || '0.00'}`, color: 'text-orange-400' },
          { label: 'Top Service', value: costs.by_service?.[0]?.service?.split(' ')[0] || '—', color: 'text-blue-400' },
        ].map(k => (
          <div key={k.label} className="bg-bg-primary rounded-xl p-4 border border-white/10">
            <p className="text-xs text-slate-400 mb-1">{k.label}</p>
            <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* 30-day daily spend chart */}
      <div className="bg-bg-primary rounded-2xl p-4 border border-white/10">
        <h4 className="text-sm font-semibold text-white mb-4">Daily Spend — Last 30 Days</h4>
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={costs.daily || []}>
            <defs>
              <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#FF9900" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#FF9900" stopOpacity={0}   />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#475569' }} tickLine={false}
              tickFormatter={v => v.slice(5)} interval={4} />
            <YAxis tick={{ fontSize: 9, fill: '#475569' }} tickLine={false}
              tickFormatter={v => `$${v}`} />
            <Tooltip contentStyle={{ background: '#0f1623', border: '1px solid #1e293b', borderRadius: 8, fontSize: 11 }}
              formatter={v => [`$${v}`, 'Cost']} />
            <Area type="monotone" dataKey="cost" stroke="#FF9900" strokeWidth={2} fill="url(#costGrad)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* By service */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-bg-primary rounded-2xl p-4 border border-white/10">
          <h4 className="text-sm font-semibold text-white mb-4">Cost by Service (MTD)</h4>
          <div className="space-y-2">
            {(costs.by_service || []).slice(0, 8).map((s, i) => {
              const pct = costs.total_mtd > 0 ? (s.cost / costs.total_mtd * 100) : 0
              return (
                <div key={s.service} className="flex items-center gap-3">
                  <span className="text-[10px] text-slate-400 w-28 truncate">{s.service.replace('Amazon ', '').replace('AWS ', '')}</span>
                  <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: COST_COLORS[i % COST_COLORS.length] }} />
                  </div>
                  <span className="text-[11px] font-mono text-white w-14 text-right">${s.cost.toFixed(2)}</span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="bg-bg-primary rounded-2xl p-4 border border-white/10">
          <h4 className="text-sm font-semibold text-white mb-3">Service Breakdown</h4>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={(costs.by_service||[]).slice(0,6)} cx="50%" cy="50%"
                innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="cost" nameKey="service">
                {(costs.by_service||[]).slice(0,6).map((_, i) => (
                  <Cell key={i} fill={COST_COLORS[i % COST_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: '#0f1623', border: '1px solid #1e293b', borderRadius: 8, fontSize: 11 }}
                formatter={v => [`$${v}`, '']} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

// ─── Security Tab ─────────────────────────────────────────────────────────────
function SecurityTab({ findings }) {
  const SEV_STYLE = {
    CRITICAL: 'bg-red-500/10 text-red-400 border-red-500/20',
    HIGH:     'bg-orange-500/10 text-orange-400 border-orange-500/20',
    MEDIUM:   'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    LOW:      'bg-blue-500/10 text-blue-400 border-blue-500/20',
    INFORMATIONAL: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  }
  if (!findings.length) {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <Shield size={32} className="text-green-500 mb-3" />
        <p className="text-white font-medium">No security findings</p>
        <p className="text-slate-400 text-sm">SecurityHub found no active issues</p>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {findings.map(f => (
        <div key={f.id} className="bg-bg-primary border border-white/10 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-lg border shrink-0 ${SEV_STYLE[f.severity]||SEV_STYLE.INFORMATIONAL}`}>{f.severity}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">{f.title}</p>
              <p className="text-xs text-slate-500 mt-0.5 truncate">{f.resource}</p>
              {f.description && <p className="text-xs text-slate-400 mt-1 line-clamp-2">{f.description}</p>}
            </div>
            <p className="text-[10px] text-slate-600 font-mono shrink-0">{f.created_at?.slice(0,10)}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Optimisations Tab ────────────────────────────────────────────────────────
function OptimisationsTab({ items }) {
  if (!items.length) {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <CheckCircle size={32} className="text-green-500 mb-3" />
        <p className="text-white font-medium">No optimisation recommendations</p>
        <p className="text-slate-400 text-sm">Your resources appear well-sized</p>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-3 text-xs text-green-400 flex items-center gap-2">
        <TrendingDown size={13} /> {items.length} cost optimisation opportunities found
      </div>
      {items.map((item, i) => (
        <div key={i} className="bg-bg-primary border border-white/10 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center justify-center shrink-0">
              <TrendingDown size={14} className="text-green-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-white">{item.title}</p>
              <p className="text-xs text-slate-400 mt-0.5">{item.detail}</p>
              <div className="flex items-center gap-3 mt-2">
                <span className="text-[10px] font-mono text-slate-500">{item.resource_id}</span>
                <span className="text-[10px] text-slate-500">{item.service} · {item.region}</span>
              </div>
            </div>
            {item.saving_pct > 0 && (
              <div className="shrink-0 text-right">
                <p className="text-[10px] text-slate-500">Est. saving</p>
                <p className="text-sm font-bold text-green-400">~{item.saving_pct}%</p>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── SSM Tab ──────────────────────────────────────────────────────────────────
function SSMTab({ items, accountId }) {
  const [scanning,    setScanning]    = useState(false)
  const [scanResult,  setScanResult]  = useState(null)
  const [scanError,   setScanError]   = useState(null)
  const [expanded,    setExpanded]    = useState(null)
  const [cmdStatus,   setCmdStatus]   = useState({}) // commandId -> status obj

  const runPatchScan = async () => {
    setScanning(true)
    setScanResult(null)
    setScanError(null)
    try {
      const res  = await fetch(`/api/cloud-accounts/${accountId}/ssm/run-patch-scan`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || `Error ${res.status}`)
      setScanResult(data)
      // Start polling command status
      for (const cmd of (data.commands || [])) {
        pollCommandStatus(accountId, cmd.command_id)
      }
    } catch (e) {
      setScanError(e.message)
    } finally {
      setScanning(false)
    }
  }

  const pollCommandStatus = async (acctId, commandId, attempts = 0) => {
    if (attempts > 12) return // stop after ~2 minutes
    try {
      const res  = await fetch(`/api/cloud-accounts/${acctId}/ssm/command-status/${commandId}`)
      const data = await res.json()
      setCmdStatus(prev => ({ ...prev, [commandId]: data }))
      const statuses = data.statuses || {}
      const pending  = (statuses['Pending'] || 0) + (statuses['InProgress'] || 0)
      if (pending > 0) {
        setTimeout(() => pollCommandStatus(acctId, commandId, attempts + 1), 10000)
      }
    } catch (e) {
      console.error('pollCommandStatus:', e)
    }
  }

  if (!items.length) {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <Server size={32} className="text-slate-600 mb-3" />
        <p className="text-white font-medium">No SSM-managed instances</p>
        <p className="text-slate-400 text-sm mt-1 max-w-sm">
          Ensure SSM Agent is installed and the IAM role has <code className="text-slate-300">ssm:DescribeInstanceInformation</code> permission.
        </p>
      </div>
    )
  }

  const compliant    = items.filter(i => i.patch_state === 'compliant').length
  const nonCompliant = items.filter(i => i.patch_state === 'non_compliant').length
  const unknown      = items.filter(i => !i.patch_state || i.patch_state === 'unknown').length
  const online       = items.filter(i => i.ping_status === 'Online').length
  const totalPatches = items.reduce((s, i) => s + (i.installed_patches || 0), 0)
  const totalMissing = items.reduce((s, i) => s + (i.missing_patches  || 0), 0)
  const totalFailed  = items.reduce((s, i) => s + (i.failed_patches   || 0), 0)

  return (
    <div className="space-y-4">

      {/* ── Summary bar ── */}
      <div className="grid grid-cols-5 gap-2">
        {[
          { label: 'Online',      value: online,       color: 'text-green-400'  },
          { label: 'Compliant',   value: compliant,    color: 'text-green-400'  },
          { label: 'Non-Compliant', value: nonCompliant, color: 'text-red-400'  },
          { label: 'Unknown',     value: unknown,      color: 'text-yellow-400' },
          { label: 'Missing Patches', value: totalMissing, color: totalMissing > 0 ? 'text-red-400' : 'text-slate-300' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-bg-primary border border-white/10 rounded-xl p-3 text-center">
            <p className={`text-xl font-bold ${color}`}>{value}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* ── Run Patch Scan button ── */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">{items.length} managed instance{items.length !== 1 ? 's' : ''}</p>
        <button
          onClick={runPatchScan}
          disabled={scanning}
          className="flex items-center gap-2 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 rounded-lg text-xs text-blue-400 disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={12} className={scanning ? 'animate-spin' : ''} />
          {scanning ? 'Triggering scan…' : 'Run Patch Scan'}
        </button>
      </div>

      {/* ── Scan result feedback ── */}
      {scanResult && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-xs space-y-2">
          <p className="text-green-400">✓ {scanResult.message}</p>
          {scanResult.commands?.map(cmd => {
            const st = cmdStatus[cmd.command_id]
            const statuses = st?.statuses || {}
            const failures = st?.failures || []
            const hasFailed = (statuses['Failed'] || 0) + (statuses['DeliveryTimedOut'] || 0) > 0
            return (
              <div key={cmd.command_id}>
                <p className={hasFailed ? 'text-yellow-400' : 'text-slate-400'}>
                  {cmd.region} · {st
                    ? Object.entries(statuses).map(([k,v]) => `${v} ${k}`).join(', ') || 'Pending…'
                    : 'Pending…'}
                </p>
                {failures.map((f, i) => (
                  <div key={i} className="mt-1 ml-3 bg-red-500/10 border border-red-500/20 rounded-lg p-2 space-y-1">
                    <p className="text-red-400 font-mono">{f.instance_id} — {f.status_detail || f.status}</p>
                    {f.output ? (
                      <p className="text-slate-400 font-mono whitespace-pre-wrap break-all">{f.output}</p>
                    ) : (
                      <div className="text-slate-400 space-y-0.5">
                        <p>Likely causes:</p>
                        <p>① Instance profile missing <code className="text-yellow-300">AmazonSSMManagedInstanceCore</code> policy</p>
                        <p>② No internet / VPC endpoint for <code className="text-yellow-300">ssm.{cmd.region}.amazonaws.com</code></p>
                        <p>③ SSM Agent version too old — run <code className="text-yellow-300">sudo systemctl restart amazon-ssm-agent</code></p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          })}
          {scanResult.errors?.length > 0 && (
            <p className="text-yellow-400">⚠ {scanResult.errors.join(', ')}</p>
          )}
        </div>
      )}
      {scanError && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-xs text-red-400">
          ✗ {scanError}
        </div>
      )}

      {/* ── Instance rows ── */}
      <div className="space-y-2">
        {items.map(inst => {
          const isExpanded = expanded === inst.instance_id
          const patchColor = inst.patch_state === 'compliant'
            ? 'border-green-500/30 text-green-400 bg-green-500/10'
            : inst.patch_state === 'non_compliant'
              ? 'border-red-500/30 text-red-400 bg-red-500/10'
              : 'border-yellow-500/30 text-yellow-400 bg-yellow-500/10'

          return (
            <div key={inst.instance_id} className="bg-bg-primary border border-white/10 rounded-xl overflow-hidden">
              {/* ── Row header ── */}
              <div
                className="flex items-center gap-4 p-4 cursor-pointer hover:bg-white/5 transition-colors"
                onClick={() => setExpanded(isExpanded ? null : inst.instance_id)}
              >
                {/* Instance info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono text-white">{inst.instance_id}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs text-slate-500">{inst.platform} {inst.platform_version}</p>
                    {inst.region && (
                      <span className="text-[10px] text-slate-600 bg-white/5 px-1.5 py-0.5 rounded">{inst.region}</span>
                    )}
                  </div>
                </div>

                {/* SSM Agent version */}
                {inst.agent_version && (
                  <div className="text-right hidden sm:block">
                    <p className="text-[10px] text-slate-500">SSM Agent</p>
                    <p className="text-xs text-slate-300 font-mono">{inst.agent_version}</p>
                  </div>
                )}

                {/* Ping status */}
                <div className="text-right">
                  <p className="text-[10px] text-slate-500">Ping</p>
                  <p className={`text-xs font-semibold ${inst.ping_status === 'Online' ? 'text-green-400' : 'text-red-400'}`}>
                    {inst.ping_status || '—'}
                  </p>
                </div>

                {/* Patches installed */}
                <div className="text-right">
                  <p className="text-[10px] text-slate-500">Installed</p>
                  <p className="text-xs text-slate-300 font-semibold">{inst.installed_patches ?? '—'}</p>
                </div>

                {/* Missing patches */}
                <div className="text-right">
                  <p className="text-[10px] text-slate-500">Missing</p>
                  <p className={`text-xs font-semibold ${(inst.missing_patches || 0) > 0 ? 'text-red-400' : 'text-slate-300'}`}>
                    {inst.missing_patches ?? '—'}
                  </p>
                </div>

                {/* Failed patches */}
                <div className="text-right">
                  <p className="text-[10px] text-slate-500">Failed</p>
                  <p className={`text-xs font-semibold ${(inst.failed_patches || 0) > 0 ? 'text-red-400' : 'text-slate-300'}`}>
                    {inst.failed_patches ?? '—'}
                  </p>
                </div>

                {/* Patch state badge */}
                <span className={`text-[10px] px-2 py-0.5 rounded-lg border shrink-0 ${patchColor}`}>
                  {inst.patch_state === 'compliant'     ? 'Compliant'
                   : inst.patch_state === 'non_compliant' ? 'Non-Compliant'
                   : 'Unknown'}
                </span>

                <ChevronDown size={14} className={`text-slate-500 transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
              </div>

              {/* ── Expanded detail ── */}
              {isExpanded && (
                <div className="border-t border-white/10 p-4 space-y-4">

                  {/* Last ping time */}
                  {inst.last_ping && (
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <Clock size={12} />
                      Last ping: {new Date(inst.last_ping).toLocaleString()}
                    </div>
                  )}

                  {/* Patch breakdown */}
                  {inst.patch_state !== 'unknown' && (
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Patch Summary</p>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { label: 'Installed', value: inst.installed_patches, color: 'text-green-400'  },
                          { label: 'Missing',   value: inst.missing_patches,   color: (inst.missing_patches||0) > 0 ? 'text-red-400' : 'text-slate-300' },
                          { label: 'Failed',    value: inst.failed_patches,    color: (inst.failed_patches||0)  > 0 ? 'text-red-400' : 'text-slate-300' },
                        ].map(({ label, value, color }) => (
                          <div key={label} className="bg-white/5 rounded-lg p-2 text-center">
                            <p className={`text-lg font-bold ${color}`}>{value ?? 0}</p>
                            <p className="text-[10px] text-slate-500">{label}</p>
                          </div>
                        ))}
                      </div>
                      {inst.patch_state === 'unknown' && (
                        <p className="text-xs text-yellow-400 mt-2">
                          ⚠ Patch data unavailable — click "Run Patch Scan" above to trigger a baseline scan.
                        </p>
                      )}
                    </div>
                  )}

                  {inst.patch_state === 'unknown' && (
                    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 text-xs text-yellow-400">
                      ⚠ Patch state unknown — AWS Patch Manager hasn't run a scan on this instance yet.
                      Use <strong>Run Patch Scan</strong> above to trigger <code>AWS-RunPatchBaseline</code>.
                    </div>
                  )}

                  {/* Software inventory */}
                  {inst.software && inst.software.length > 0 && (
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">
                        Software ({inst.software_count || inst.software.length} packages{inst.software_count > inst.software.length ? `, showing ${inst.software.length}` : ''})
                      </p>
                      <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                        {inst.software.map((sw, idx) => (
                          <div key={idx} className="flex justify-between items-center text-xs py-1 border-b border-white/5">
                            <span className="text-slate-300 truncate flex-1">{sw.name}</span>
                            <span className="text-slate-500 font-mono ml-3 shrink-0">{sw.version}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Footer totals ── */}
      {(totalPatches > 0 || totalMissing > 0) && (
        <div className="flex justify-end gap-4 text-xs text-slate-500 pt-1 border-t border-white/5">
          <span>Total installed: <strong className="text-slate-300">{totalPatches}</strong></span>
          {totalMissing > 0 && <span className="text-red-400">Total missing: <strong>{totalMissing}</strong></span>}
          {totalFailed  > 0 && <span className="text-red-400">Total failed: <strong>{totalFailed}</strong></span>}
        </div>
      )}
    </div>
  )
}


// ─── Edit Account Modal ───────────────────────────────────────────────────────
function EditAccountModal({ account, onClose, onSaved }) {
  const { updatePollInterval } = useCloudStore()
  const [interval, setInterval] = useState(account.poll_interval || 300)
  const [loading,  setLoading]  = useState(false)
  const [saved,    setSaved]    = useState(false)

  const save = async () => {
    setLoading(true)
    try {
      await updatePollInterval(account.id, interval)
      setSaved(true)
      setTimeout(() => { setSaved(false); onSaved(); onClose() }, 1200)
    } finally { setLoading(false) }
  }

  const label = interval < 60    ? 'Too short'
              : interval < 300   ? `${interval}s (frequent — higher CloudWatch cost)`
              : interval === 300 ? '5 min (recommended)'
              : interval < 900   ? `${interval}s`
              : interval < 3600  ? `${Math.round(interval/60)} min`
              : '1 hour'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-bg-secondary border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-white">Edit Sync Settings</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl">×</button>
        </div>
        <div>
          <p className="text-sm font-medium text-white mb-1">{account.name}</p>
          <p className="text-xs text-slate-500">Account ID: {account.account_id}</p>
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-slate-400">Poll Interval</label>
            <span className={`text-xs font-mono font-medium ${interval < 300 ? 'text-yellow-400' : 'text-orange-400'}`}>
              {label}
            </span>
          </div>
          <input type="range" min={60} max={3600} step={60}
            value={interval} onChange={e => setInterval(parseInt(e.target.value))}
            className="w-full accent-orange-500" />
          <div className="flex justify-between text-[10px] text-slate-600 mt-1">
            <span>1 min</span><span>5 min</span><span>30 min</span><span>1 hour</span>
          </div>
        </div>
        <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-3 text-[11px] text-yellow-400">
          ⚠ Shorter intervals = more CloudWatch API calls = higher AWS cost.
          5 min is the recommended balance.
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-300 hover:bg-white/5 text-sm">Cancel</button>
          <button onClick={save} disabled={loading}
            className={`flex-1 py-2.5 rounded-xl text-white text-sm font-medium transition-colors disabled:opacity-50 ${
              saved ? 'bg-green-600' : 'bg-orange-600 hover:bg-orange-500'
            }`}>
            {loading ? 'Saving…' : saved ? '✓ Saved' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CloudAccountsPage() {
  const { accounts, loading, syncingId, fetchAccounts, deleteAccount, testConnection, syncAccount } = useCloudStore()
  const [showAdd,   setShowAdd]   = useState(false)
  const [selected,  setSelected]  = useState(null)
  const [editAccount, setEditAccount] = useState(null)

  useEffect(() => { fetchAccounts() }, [])

  const totalResources = 0  // populated from cache after sync
  const activeAccounts = accounts.filter(a => a.status === 'active').length

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Cloud Accounts</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Connect AWS, Azure or GCP accounts — pull all resources via cloud APIs. No agents needed.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchAccounts}
            className="p-2.5 rounded-xl border border-white/10 text-slate-400 hover:text-white hover:bg-white/5">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-500 text-white rounded-xl font-medium text-sm transition-colors">
            <Plus size={15} /> Connect Account
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Connected Accounts', value: accounts.length,    color: 'text-white' },
          { label: 'Active',             value: activeAccounts,     color: 'text-green-400' },
          { label: 'Errors',             value: accounts.filter(a=>a.status==='error').length, color: 'text-red-400' },
          { label: 'Pending',            value: accounts.filter(a=>a.status==='pending').length, color: 'text-yellow-400' },
        ].map(s => (
          <div key={s.label} className="bg-bg-secondary border border-white/10 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-1">{s.label}</p>
            <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* How it works */}
      {accounts.length === 0 && (
        <div className="bg-orange-500/5 border border-orange-500/20 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-orange-300 mb-3 flex items-center gap-2">
            <Cloud size={14} /> How Cloud Account Integration Works
          </h3>
          <div className="grid grid-cols-4 gap-4 text-xs text-slate-400">
            {[
              { n:'1', t:'Add credentials', d:'Paste your AWS Access Key + Secret, or an IAM Role ARN for cross-account assume-role.' },
              { n:'2', t:'Test connection',  d:'We call STS GetCallerIdentity to verify credentials and discover your account number.' },
              { n:'3', t:'Auto-discovery',   d:'All EC2, RDS, Lambda, ECS resources are discovered across your selected regions.' },
              { n:'4', t:'Deep metrics',     d:'CloudWatch metrics, Cost Explorer spend, SSM patch status, and SecurityHub findings.' },
            ].map(s => (
              <div key={s.n} className="flex items-start gap-2">
                <span className="text-orange-400 font-bold shrink-0">{s.n}.</span>
                <div>
                  <p className="text-white font-medium mb-0.5">{s.t}</p>
                  <p>{s.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Account cards grid */}
      {loading && accounts.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-slate-500">
          <RefreshCw size={20} className="animate-spin mr-2" /> Loading…
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {accounts.map(account => (
            <AccountCard
              key={account.id}
              account={account}
              onSelect={setSelected}
              onDelete={deleteAccount}
              onSync={syncAccount}
              onTest={testConnection}
              onEdit={setEditAccount}
              isSyncing={syncingId === account.id}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {showAdd     && <AddAccountModal onClose={() => setShowAdd(false)} onAdded={fetchAccounts} />}
      {selected    && <AccountDetail account={selected} onClose={() => setSelected(null)} />}
      {editAccount && <EditAccountModal account={editAccount} onClose={() => setEditAccount(null)} onSaved={fetchAccounts} />}
    </div>
  )
}
