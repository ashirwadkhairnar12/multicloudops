import { useEffect, useRef } from 'react'
import useStore from '@/store/useStore'

// Relative WebSocket URL — works on any host/IP automatically
// ws://same-host-and-port/ws/metrics → nginx proxies to backend
function getWsUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws/metrics`
}

export function useWebSocket() {
  const wsRef = useRef(null)
  const { setWsConnected, applyServerUpdate, fetchAll } = useStore()

  useEffect(() => {
    let ws = null
    let reconnectTimeout = null
    let reconnectAttempts = 0
    const MAX_RECONNECT = 20

    // Load initial data on mount
    fetchAll()

    function connect() {
      try {
        ws = new WebSocket(getWsUrl())
        wsRef.current = ws

        ws.onopen = () => {
          setWsConnected(true)
          reconnectAttempts = 0
          console.log('[WS] Connected to', getWsUrl())
        }

        ws.onclose = () => {
          setWsConnected(false)
          if (reconnectAttempts < MAX_RECONNECT) {
            const delay = Math.min(1000 * Math.pow(1.5, reconnectAttempts), 30000)
            reconnectAttempts++
            reconnectTimeout = setTimeout(connect, delay)
          }
        }

        ws.onerror = () => {
          setWsConnected(false)
        }

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data)
            if (msg.type === 'metrics_update' || msg.type === 'agent_metrics') {
              applyServerUpdate(msg.data || [])
            }
          } catch (e) {
            console.error('[WS] Parse error:', e)
          }
        }
      } catch (e) {
        console.warn('[WS] Connection failed, retrying:', e.message)
        const delay = Math.min(1000 * Math.pow(1.5, reconnectAttempts), 30000)
        reconnectAttempts++
        reconnectTimeout = setTimeout(connect, delay)
      }
    }

    connect()

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
      if (ws) ws.close()
    }
  }, [])

  return wsRef
}
