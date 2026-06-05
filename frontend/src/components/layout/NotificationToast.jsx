import React, { useEffect, useState } from 'react'
import { X, AlertTriangle, CheckCircle, Info } from 'lucide-react'

const ICONS = {
  critical: <AlertTriangle className="w-4 h-4 text-status-critical" />,
  warning:  <AlertTriangle className="w-4 h-4 text-status-warning" />,
  success:  <CheckCircle   className="w-4 h-4 text-status-healthy" />,
  info:     <Info          className="w-4 h-4 text-accent" />,
}

const BORDERS = {
  critical: 'border-l-status-critical',
  warning:  'border-l-status-warning',
  success:  'border-l-status-healthy',
  info:     'border-l-accent',
}

function Toast({ id, type = 'info', title, message, onClose }) {
  useEffect(() => {
    const t = setTimeout(() => onClose(id), 5000)
    return () => clearTimeout(t)
  }, [id, onClose])

  return (
    <div
      className={`flex items-start gap-3 bg-bg-card border border-bg-border border-l-4 ${BORDERS[type]} rounded-lg px-4 py-3 shadow-xl w-80 animate-slide-in`}
    >
      <div className="mt-0.5 shrink-0">{ICONS[type]}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-white">{title}</div>
        {message && <div className="text-xs text-slate-400 mt-0.5">{message}</div>}
      </div>
      <button onClick={() => onClose(id)} className="text-slate-500 hover:text-white transition-colors shrink-0">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// Standalone toast manager — import useToast() in any component
let _addToast = null

export function useToast() {
  return {
    toast: (opts) => _addToast?.(opts),
    critical: (title, message) => _addToast?.({ type: 'critical', title, message }),
    warning:  (title, message) => _addToast?.({ type: 'warning',  title, message }),
    success:  (title, message) => _addToast?.({ type: 'success',  title, message }),
    info:     (title, message) => _addToast?.({ type: 'info',     title, message }),
  }
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    _addToast = (opts) => {
      const id = Date.now() + Math.random()
      setToasts(prev => [...prev.slice(-4), { ...opts, id }]) // max 5 at once
    }
    return () => { _addToast = null }
  }, [])

  const removeToast = (id) => setToasts(prev => prev.filter(t => t.id !== id))

  if (!toasts.length) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map(t => (
        <Toast key={t.id} {...t} onClose={removeToast} />
      ))}
    </div>
  )
}
