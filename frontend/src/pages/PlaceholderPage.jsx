import React from 'react'
import { Construction } from 'lucide-react'

export default function PlaceholderPage({ title, phase }) {
  return (
    <div className="flex flex-col items-center justify-center h-96 gap-4 animate-fade-in">
      <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center">
        <Construction className="w-8 h-8 text-accent/60" />
      </div>
      <div className="text-center">
        <h2 className="font-display text-xl font-bold text-white mb-1">{title}</h2>
        <p className="text-sm text-slate-500">Coming in <span className="text-accent font-mono">{phase || 'Phase 2'}</span></p>
      </div>
      <div className="flex gap-2">
        {['Backend Integration','Real-time Data','Advanced Analytics'].map(tag => (
          <span key={tag} className="badge badge-info">{tag}</span>
        ))}
      </div>
    </div>
  )
}
