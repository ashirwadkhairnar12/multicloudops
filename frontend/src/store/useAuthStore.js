import { create } from 'zustand'

const API_BASE = ''

const useAuthStore = create((set, get) => ({
  user:    null,
  token:   localStorage.getItem('mco_token') || null,
  loading: true,   // true on first load while we verify stored token
  error:   null,

  // On app boot — verify stored token
  init: async () => {
    const token = get().token
    if (!token) { set({ loading: false }); return }
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const user = await res.json()
        set({ user, loading: false })
      } else {
        // Token expired or invalid
        localStorage.removeItem('mco_token')
        set({ user: null, token: null, loading: false })
      }
    } catch {
      set({ loading: false })
    }
  },

  login: async (username, password) => {
    set({ error: null })
    const form = new URLSearchParams({ username, password })
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || 'Login failed')
    localStorage.setItem('mco_token', data.access_token)
    set({ user: data.user, token: data.access_token, error: null })
    return data.user
  },

  register: async (payload) => {
    set({ error: null })
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || 'Registration failed')
    localStorage.setItem('mco_token', data.access_token)
    set({ user: data.user, token: data.access_token, error: null })
    return data.user
  },

  logout: () => {
    localStorage.removeItem('mco_token')
    set({ user: null, token: null })
  },

  getAuthHeader: () => {
    const token = get().token
    return token ? { Authorization: `Bearer ${token}` } : {}
  },

  isAdmin: () => get().user?.role === 'admin',
}))

export default useAuthStore
