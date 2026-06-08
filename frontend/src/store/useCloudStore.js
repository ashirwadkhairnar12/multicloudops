import { create } from 'zustand'

const useCloudStore = create((set, get) => ({
  accounts:    [],
  accountData: {},   // { [accountId]: { resources, costs, security, ssm, optimisations } }
  loading:     false,
  syncingId:   null,
  error:       null,
  lastUpdated: null,

  fetchAccounts: async () => {
    set({ loading: true, error: null })
    try {
      const res  = await fetch('/api/cloud-accounts')
      const data = await res.json()
      set({ accounts: data.accounts || [], loading: false })
    } catch (e) {
      set({ error: e.message, loading: false })
    }
  },

  createAccount: async (payload) => {
    const res = await fetch('/api/cloud-accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error((await res.json()).detail || 'Failed')
    const created = await res.json()
    await get().fetchAccounts()
    return created
  },

  deleteAccount: async (id) => {
    await fetch(`/api/cloud-accounts/${id}`, { method: 'DELETE' })
    set(state => {
      const next = { ...state.accountData }
      delete next[id]
      return { accountData: next }
    })
    await get().fetchAccounts()
  },

  testConnection: async (id) => {
    const res  = await fetch(`/api/cloud-accounts/${id}/test`, { method: 'POST' })
    const data = await res.json()
    await get().fetchAccounts()
    return data
  },

  updatePollInterval: async (id, seconds) => {
    const res = await fetch(`/api/cloud-accounts/${id}/poll-interval`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ poll_interval: seconds }),
    })
    if (!res.ok) throw new Error('Failed to update')
    await get().fetchAccounts()
    return res.json()
  },

  syncAccount: async (id) => {
    set({ syncingId: id })
    try {
      // Use force-sync to bypass cache
      const res  = await fetch(`/api/cloud-accounts/${id}/force-sync`, { method: 'POST' })
      const data = await res.json()
      await get().fetchAccounts()
      await get().loadAccountData(id)
      return data
    } catch (e) {
      // fallback to regular sync
      const res  = await fetch(`/api/cloud-accounts/${id}/sync`, { method: 'POST' })
      const data = await res.json()
      await get().fetchAccounts()
      await get().loadAccountData(id)
      return data
    } finally {
      set({ syncingId: null })
    }
  },

  loadAccountData: async (id) => {
    try {
      const [resRes, costRes, secRes, optRes] = await Promise.all([
        fetch(`/api/cloud-accounts/${id}/resources`).then(r => r.json()),
        fetch(`/api/cloud-accounts/${id}/costs`).then(r => r.json()),
        fetch(`/api/cloud-accounts/${id}/security`).then(r => r.json()),
        fetch(`/api/cloud-accounts/${id}/optimisations`).then(r => r.json()),
      ])

      const sec = secRes || {}

      set(state => ({
        accountData: {
          ...state.accountData,
          [id]: {
            resources:     resRes.resources        || [],
            costs:         costRes.costs           || resRes.costs || {},
            security:      sec.findings            || [],
            guardduty:     sec.guardduty           || [],
            iam_unused:    sec.iam_unused_roles     || [],
            config_nc:     sec.config_non_compliant|| [],
            cloudtrail:    sec.cloudtrail_events   || [],
            ssm:           sec.ssm || resRes.ssm   || [],
            optimisations: optRes.optimisations    || [],
            collected_at:  resRes.collected_at     || null,
            errors:        resRes.errors           || [],
          }
        },
        lastUpdated: new Date().toISOString(),
      }))
    } catch (e) {
      console.error('loadAccountData:', e)
    }
  },

  loadAllAccountData: async () => {
    const { accounts, loadAccountData } = get()
    const active = accounts.filter(a => a.status === 'active')
    if (active.length === 0) return
    await Promise.all(active.map(a => loadAccountData(a.id)))
  },

  // ── Computed aggregates ───────────────────────────────────────────────────

  getAllResources: () => {
    const { accountData } = get()
    return Object.values(accountData).flatMap(d => d.resources || [])
  },

  getTotalCosts: () => {
    const { accountData } = get()
    const all = Object.values(accountData)
    if (all.length === 0) return { total_mtd: 0, forecast: 0, by_service: [], daily: [], anomalies: [], savings_utilisation: null, by_tag: {} }
    return {
      total_mtd:          all.reduce((s, d) => s + (d.costs?.total_mtd || 0), 0),
      forecast:           all.reduce((s, d) => s + (d.costs?.forecast  || 0), 0),
      by_service:         mergeServiceCosts(all.map(d => d.costs?.by_service || [])),
      daily:              mergeDaily(all.map(d => d.costs?.daily || [])),
      anomalies:          all.flatMap(d => d.costs?.anomalies || []),
      savings_utilisation:all.find(d => d.costs?.savings_utilisation)?.costs?.savings_utilisation || null,
      by_tag:             Object.assign({}, ...all.map(d => d.costs?.by_tag || {})),
    }
  },

  getAllSecurity: () => {
    const { accountData } = get()
    return Object.values(accountData).flatMap(d => d.security || [])
  },

  getAllGuardDuty: () => {
    const { accountData } = get()
    return Object.values(accountData).flatMap(d => d.guardduty || [])
  },

  getAllOptimisations: () => {
    const { accountData } = get()
    return Object.values(accountData).flatMap(d => d.optimisations || [])
  },

  getAllSSM: () => {
    const { accountData } = get()
    return Object.values(accountData).flatMap(d => d.ssm || [])
  },

  getAllCloudTrail: () => {
    const { accountData } = get()
    return Object.values(accountData).flatMap(d => d.cloudtrail || [])
  },

  setSelectedAccount: (account) => set({ selectedAccount: account }),
}))

function mergeServiceCosts(arrays) {
  const map = {}
  arrays.flat().forEach(item => {
    if (!item?.service) return
    map[item.service] = (map[item.service] || 0) + (item.cost || 0)
  })
  return Object.entries(map)
    .map(([service, cost]) => ({ service, cost: Math.round(cost * 100) / 100 }))
    .sort((a, b) => b.cost - a.cost)
}

function mergeDaily(arrays) {
  const map = {}
  arrays.flat().forEach(item => {
    if (!item?.date) return
    map[item.date] = (map[item.date] || 0) + (item.cost || 0)
  })
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, cost]) => ({ date, cost: Math.round(cost * 100) / 100 }))
}

export default useCloudStore
