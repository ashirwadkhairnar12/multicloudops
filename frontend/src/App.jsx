import React, { useEffect } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import LoginPage from '@/pages/LoginPage'
import useStore from '@/store/useStore'
import useAuthStore from '@/store/useAuthStore'
import { useWebSocket } from '@/hooks/useWebSocket'

// Pages
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
import PlaceholderPage      from '@/pages/PlaceholderPage'

const PAGE_MAP = {
  overview:       <OverviewPage />,
  infrastructure: <InfrastructurePage />,
  alerts:         <AlertsPage />,
  dashboards:     <ExecutivePage />,
  incidents:      <IncidentsPage />,
  command:        <IncidentCommandPage />,
  sla:            <SLAPage />,
  anomaly:        <AnomalyPage />,
  capacity:       <CapacityPage />,
  agents:         <AgentsPage />,
  metrics:        <PlaceholderPage title="Metrics Explorer"    phase="Phase 3" />,
  logs:           <PlaceholderPage title="Log Management"      phase="Phase 3" />,
  remediation:    <PlaceholderPage title="Auto-Remediation"    phase="Phase 4" />,
  reports:        <PlaceholderPage title="Reports & Analytics" phase="Phase 3" />,
  integrations:   <PlaceholderPage title="Integrations"        phase="Phase 3" />,
  settings:       <PlaceholderPage title="Settings"            phase="Phase 3" />,
}

function Dashboard() {
  const { activeNav } = useStore()
  useWebSocket()
  return (
    <div className="flex h-screen overflow-hidden bg-bg-primary">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-4">
          {PAGE_MAP[activeNav] || PAGE_MAP['overview']}
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
