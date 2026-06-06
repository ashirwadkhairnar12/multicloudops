import { create } from 'zustand'

const useCloudStore = create((set, get) => ({
  accounts:        [],
  selectedAccount: null,
  // Per-account cache: { [accountId]: { resources, costs, security, ssm, optimisations } }
  accountData:     {},
  loading:         false,
  syncingId:       null,
  error:           null,

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

  syncAccount: async (id) => {
    set({ syncingId: id })
    try {
      const res  = await fetch(`/api/cloud-accounts/${id}/sync`, { method: 'POST' })
      const data = await res.json()
      await get().fetchAccounts()
      // Reload data for this account after sync
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
      set(state => ({
        accountData: {
          ...state.accountData,
          [id]: {
            resources:     resRes.resources     || [],
            costs:         costRes.costs        || {},
            security:      secRes.findings      || [],
            ssm:           secRes.ssm           || [],
            optimisations: optRes.optimisations || [],
            collected_at:  resRes.collected_at  || null,
          }
        }
      }))
    } catch (e) {
      console.error('loadAccountData:', e)
    }
  },

  // Load data for ALL active accounts — used by dashboards
  loadAllAccountData: async () => {
    const { accounts, loadAccountData } = get()
    const active = accounts.filter(a => a.status === 'active')
    await Promise.all(active.map(a => loadAccountData(a.id)))
  },

  // ── Computed aggregates used by dashboards ────────────────────────────────

  // All resources across all synced accounts
  getAllResources: () => {
    const { accountData } = get()
    return Object.values(accountData).flatMap(d => d.resources || [])
  },

  // Total costs across all accounts
  getTotalCosts: () => {
    const { accountData } = get()
    const all = Object.values(accountData)
    return {
      total_mtd: all.reduce((s, d) => s + (d.costs?.total_mtd || 0), 0),
      forecast:  all.reduce((s, d) => s + (d.costs?.forecast  || 0), 0),
      by_service: mergeServiceCosts(all.map(d => d.costs?.by_service || [])),
      daily:     mergeDaily(all.map(d => d.costs?.daily || [])),
    }
  },

  getAllSecurity: () => {
    const { accountData } = get()
    return Object.values(accountData).flatMap(d => d.security || [])
  },

  getAllOptimisations: () => {
    const { accountData } = get()
    return Object.values(accountData).flatMap(d => d.optimisations || [])
  },

  setSelectedAccount: (account) => set({ selectedAccount: account }),

  // Backward compat — single-account detail view
  get resources()     { return Object.values(this.accountData).flatMap(d => d.resources     || []) },
  get costs()         { return Object.values(this.accountData)[0]?.costs         || {} },
  get security()      { return Object.values(this.accountData).flatMap(d => d.security      || []) },
  get ssm()           { return Object.values(this.accountData).flatMap(d => d.ssm           || []) },
  get optimisations() { return Object.values(this.accountData).flatMap(d => d.optimisations || []) },
}))

// Merge service cost arrays from multiple accounts
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

// Merge daily cost arrays from multiple accounts (sum by date)
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
