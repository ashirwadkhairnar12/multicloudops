import React, { useState } from 'react'
import { Eye, EyeOff, Loader2, Shield } from 'lucide-react'
import useAuthStore from '@/store/useAuthStore'

export default function LoginPage() {
  const { login, register } = useAuthStore()
  const [mode, setMode]       = useState('login')  // 'login' | 'register'
  const [form, setForm]       = useState({ username: '', email: '', password: '', full_name: '' })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      if (mode === 'login') {
        await login(form.username, form.password)
      } else {
        await register({
          username:  form.username,
          email:     form.email,
          password:  form.password,
          full_name: form.full_name,
        })
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-accent/20 border border-accent/30 mb-4">
            <Shield size={28} className="text-accent" />
          </div>
          <h1 className="text-2xl font-bold text-white">MultiCloudOps</h1>
          <p className="text-slate-400 text-sm mt-1">Infrastructure Monitoring Platform</p>
        </div>

        {/* Card */}
        <div className="bg-bg-secondary border border-white/10 rounded-2xl p-6 shadow-2xl">
          {/* Tabs */}
          <div className="flex bg-bg-primary rounded-xl p-1 mb-6">
            {['login', 'register'].map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(null) }}
                className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${
                  mode === m
                    ? 'bg-accent text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {m === 'login' ? 'Sign In' : 'Register'}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="text-xs text-slate-400 mb-1.5 block">Full Name</label>
                <input
                  value={form.full_name}
                  onChange={e => update('full_name', e.target.value)}
                  placeholder="John Doe"
                  className="w-full bg-bg-primary border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-accent/60"
                />
              </div>
            )}

            {mode === 'register' && (
              <div>
                <label className="text-xs text-slate-400 mb-1.5 block">Email</label>
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={e => update('email', e.target.value)}
                  placeholder="you@company.com"
                  className="w-full bg-bg-primary border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-accent/60"
                />
              </div>
            )}

            <div>
              <label className="text-xs text-slate-400 mb-1.5 block">
                {mode === 'login' ? 'Username or Email' : 'Username'}
              </label>
              <input
                required
                value={form.username}
                onChange={e => update('username', e.target.value)}
                placeholder={mode === 'login' ? 'admin or admin@example.com' : 'johndoe'}
                className="w-full bg-bg-primary border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-accent/60"
              />
            </div>

            <div>
              <label className="text-xs text-slate-400 mb-1.5 block">Password</label>
              <div className="relative">
                <input
                  required
                  type={showPass ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => update('password', e.target.value)}
                  placeholder={mode === 'register' ? 'Min 8 characters' : '••••••••'}
                  className="w-full bg-bg-primary border border-white/10 rounded-lg px-3 py-2.5 pr-10 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-accent/60"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-accent hover:bg-accent/80 disabled:opacity-50 text-white font-medium text-sm transition-colors flex items-center justify-center gap-2 mt-2"
            >
              {loading
                ? <><Loader2 size={14} className="animate-spin" /> Please wait…</>
                : mode === 'login' ? 'Sign In' : 'Create Account'
              }
            </button>
          </form>

          {mode === 'register' && (
            <p className="text-xs text-slate-500 text-center mt-4">
              First registered account gets <span className="text-accent">Admin</span> role automatically.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
