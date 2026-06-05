import React from 'react'

export default function LoadingSpinner({ size = 'md', text }) {
  const sizes = { sm: 'w-4 h-4', md: 'w-8 h-8', lg: 'w-12 h-12' }
  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <div className={`${sizes[size]} relative`}>
        <div className="absolute inset-0 rounded-full border-2 border-bg-border" />
        <div className="absolute inset-0 rounded-full border-2 border-t-accent border-l-transparent border-r-transparent border-b-transparent animate-spin" />
      </div>
      {text && <span className="text-xs text-slate-500 font-mono">{text}</span>}
    </div>
  )
}
