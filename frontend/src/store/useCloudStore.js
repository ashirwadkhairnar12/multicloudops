import { create } from 'zustand'

const useCloudStore = create((set, get) => ({
  accounts:        [],
  selectedAccount: null,
  resources:       [],
  costs:           {},
  security:        [],
  ssm:             [],
  optimisations:   [],
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
    const res  = await fetch('/api/cloud-accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error((await res.json()).detail || 'Failed')
    await get().fetchAccounts()
    return res.json()
  },

  deleteAccount: async (id) => {
    await fetch(`/api/cloud-accounts/${id}`, { method: 'DELETE' })
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
      return data
    } finally {
      set({ syncingId: null })
    }
  },

  loadAccountData: async (id) => {
    set({ loading: true })
    try {
      const [resRes, costRes, secRes, optRes] = await Promise.all([
        fetch(`/api/cloud-accounts/${id}/resources`).then(r => r.json()),
        fetch(`/api/cloud-accounts/${id}/costs`).then(r => r.json()),
        fetch(`/api/cloud-accounts/${id}/security`).then(r => r.json()),
        fetch(`/api/cloud-accounts/${id}/optimisations`).then(r => r.json()),
      ])
      set({
        resources:     resRes.resources     || [],
        costs:         costRes.costs        || {},
        security:      secRes.findings      || [],
        ssm:           secRes.ssm           || [],
        optimisations: optRes.optimisations || [],
        loading:       false,
      })
    } catch (e) {
      set({ error: e.message, loading: false })
    }
  },

  setSelectedAccount: (account) => set({ selectedAccount: account }),
}))

export default useCloudStore
