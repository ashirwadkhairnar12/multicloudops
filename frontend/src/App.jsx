import React, { useEffect, Component } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import LoginPage from '@/pages/LoginPage'
import useStore from '@/store/useStore'
import useAuthStore from '@/store/useAuthStore'
import useCloudStore from '@/store/useCloudStore'
import { useWebSocket } from '@/hooks/useWebSocket'

import OverviewPage         from '@/pages/OverviewPage'
import InfrastructurePage   from '@/pages/InfrastructurePage'
import AlertsPage           from '@/pages/AlertsPage'
import IncidentsPage        from '@/pages/IncidentsPage'
import IncidentCommandPage  from '@/pages/IncidentCommandPage'
import SLAPage              from '@/pages/SLAPage'
import AnomalyPage          from '@/pages/AnomalyPage'
import CapacityPage         from '@/pages/CapacityPage'
import ExecutivePage        from '@/pages/ExecutivePage'
import AgentsPage           from '@/pages/AgentsPage'
import CloudAccountsPage    from '@/pages/CloudAccountsPage'
import PlaceholderPage      from '@/pages/PlaceholderPage'

// ── Error boundary: catches render crashes and shows a message instead of blank screen ──
class PageErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, info) {
    console.error('Page crash:', error, info)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full py-24 text-center">
          <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center mb-4">
            <span className="text-red-400 text-xl">!</span>
          </div>
          <p className="text-white font-semibold mb-1">Something went wrong on this page</p>
          <p className="text-slate-400 text-sm mb-4 max-w-sm">
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm transition-colors"
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// ── Page map as functions (not pre-created JSX) so only the active page mounts ──
const PAGE_MAP = {
  overview:         () => <OverviewPage />,
  infrastructure:   () => <InfrastructurePage />,
  alerts:           () => <AlertsPage />,
  dashboards:       () => <ExecutivePage />,
  incidents:        () => <IncidentsPage />,
  command:          () => <IncidentCommandPage />,
  sla:              () => <SLAPage />,
  anomaly:          () => <AnomalyPage />,
  capacity:         () => <CapacityPage />,
  'cloud-accounts': () => <CloudAccountsPage />,
  agents:           () => <AgentsPage />,
  logs:             () => <PlaceholderPage title="Log Management"      phase="Phase 4" />,
  remediation:      () => <PlaceholderPage title="Auto-Remediation"    phase="Phase 4" />,
  reports:          () => <PlaceholderPage title="Reports & Analytics" phase="Phase 4" />,
  integrations:     () => <PlaceholderPage title="Integrations"        phase="Phase 4" />,
  settings:         () => <PlaceholderPage title="Settings"            phase="Phase 4" />,
}

function Dashboard() {
  const { activeNav } = useStore()
  const { fetchAccounts } = useCloudStore()
  useWebSocket()
  useEffect(() => { fetchAccounts() }, [])

  const renderPage = PAGE_MAP[activeNav] || PAGE_MAP['overview']

  return (
    <div className="flex h-screen overflow-hidden bg-bg-primary">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-4">
          <PageErrorBoundary key={activeNav}>
            {renderPage()}
          </PageErrorBoundary>
        </main>
      </div>
    </div>
  )
}

export default function App() {
  const { user, loading, init } = useAuthStore()
  useEffect(() => { init() }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return <LoginPage />
  return <Dashboard />
}
