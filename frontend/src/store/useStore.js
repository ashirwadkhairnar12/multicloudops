import { create } from 'zustand'

const API_BASE = ''

const useStore = create((set, get) => ({
  activeNav: 'overview',
  setActiveNav: (nav) => set({ activeNav: nav }),

  servers:   [],
  alerts:    [],
  incidents: [],
  trendData: [],
  loading:   false,

  fetchServers: async () => {
    try {
      const res = await fetch(`${API_BASE}/api/servers`)
      const data = await res.json()
      set({ servers: data.servers || [] })
    } catch (e) { console.error('fetchServers:', e) }
  },

  fetchAlerts: async () => {
    try {
      const res = await fetch(`${API_BASE}/api/alerts`)
      const data = await res.json()
      set({ alerts: data.alerts || [] })
    } catch (e) { console.error('fetchAlerts:', e) }
  },

  fetchIncidents: async () => {
    try {
      const res = await fetch(`${API_BASE}/api/incidents`)
      const data = await res.json()
      set({ incidents: data.incidents || [] })
    } catch (e) { console.error('fetchIncidents:', e) }
  },

  fetchAll: async () => {
    const { fetchServers, fetchAlerts, fetchIncidents } = get()
    await Promise.all([fetchServers(), fetchAlerts(), fetchIncidents()])
  },

  agents: [],
  agentsLoading: false,
  agentsError: null,

  fetchAgents: async () => {
    set({ agentsLoading: true, agentsError: null })
    try {
      const res = await fetch(`${API_BASE}/api/agents`)
      const data = await res.json()
      set({ agents: data.agents || [], agentsLoading: false })
    } catch (e) {
      set({ agentsError: e.message, agentsLoading: false })
    }
  },

  registerAgent: async (payload) => {
    const res = await fetch(`${API_BASE}/api/agents/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  },

  deleteAgent: async (agentId) => {
    const res = await fetch(`${API_BASE}/api/agents/${agentId}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(await res.text())
    await get().fetchAgents()
  },

  wsConnected: false,
  setWsConnected: (v) => set({ wsConnected: v }),

  applyServerUpdate: (incomingServers) => {
    set(state => {
      const active = incomingServers.filter(s => s.status !== 'stopped')
      if (active.length === 0) return { servers: incomingServers }
      const now = new Date()
      const point = {
        time:     `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`,
        cpu:      Math.round(active.reduce((a, s) => a + s.cpu, 0) / active.length),
        mem:      Math.round(active.reduce((a, s) => a + s.mem, 0) / active.length),
        critical: incomingServers.filter(s => s.status === 'critical').length,
        warning:  incomingServers.filter(s => s.status === 'warning').length,
      }
      return { servers: incomingServers, trendData: [...state.trendData.slice(-23), point] }
    })
    get().fetchAlerts()
  },

  selectedProvider: 'All',
  setSelectedProvider: (p) => set({ selectedProvider: p }),
  selectedStatus: 'All',
  setSelectedStatus: (s) => set({ selectedStatus: s }),

  getFilteredServers: () => {
    const { servers, selectedProvider, selectedStatus } = get()
    return servers.filter(s =>
      (selectedProvider === 'All' || s.provider === selectedProvider) &&
      (selectedStatus   === 'All' || s.status   === selectedStatus)
    )
  },

  getStats: () => {
    const { servers, alerts, incidents } = get()
    return {
      total:          servers.length,
      healthy:        servers.filter(s => s.status === 'healthy').length,
      warning:        servers.filter(s => s.status === 'warning').length,
      critical:       servers.filter(s => s.status === 'critical').length,
      stopped:        servers.filter(s => s.status === 'stopped').length,
      fluctuating:    servers.filter(s => s.status === 'fluctuating').length,
      criticalAlerts: alerts.filter(a => a.severity === 'critical').length,
      warningAlerts:  alerts.filter(a => a.severity === 'warning').length,
      openIncidents:  incidents.filter(i => i.status === 'open').length,
    }
  },
}))

export default useStore
