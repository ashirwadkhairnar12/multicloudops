import { useEffect, useRef } from 'react'
import useStore from '@/store/useStore'
import useCloudStore from '@/store/useCloudStore'

function getWsUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws/metrics`
}

export function useWebSocket() {
  const wsRef = useRef(null)
  const { setWsConnected, applyServerUpdate, fetchAll } = useStore()
  const { loadAccountData, accounts } = useCloudStore()

  useEffect(() => {
    let ws = null
    let reconnectTimeout = null
    let reconnectAttempts = 0
    const MAX_RECONNECT = 20
    let initialLoadDone = false

    async function doInitialLoad() {
      if (initialLoadDone) return
      initialLoadDone = true
      await fetchAll()
    }

    doInitialLoad()

    function connect() {
      try {
        ws = new WebSocket(getWsUrl())
        wsRef.current = ws

        ws.onopen = () => {
          setWsConnected(true)
          reconnectAttempts = 0
        }

        ws.onclose = () => {
          setWsConnected(false)
          if (reconnectAttempts < MAX_RECONNECT) {
            const delay = Math.min(1000 * Math.pow(1.5, reconnectAttempts), 30000)
            reconnectAttempts++
            reconnectTimeout = setTimeout(connect, delay)
          }
        }

        ws.onerror = () => setWsConnected(false)

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data)

            if (msg.type === 'metrics_update' || msg.type === 'agent_metrics') {
              applyServerUpdate(msg.data || [])
            }

            // Cloud account auto-poll completed — reload that account's data
            if (msg.type === 'cloud_update') {
              const accountId = msg.account_id
              if (accountId) {
                loadAccountData(accountId)
              }
            }
          } catch (e) {
            console.error('[WS] Parse error:', e)
          }
        }
      } catch (e) {
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
