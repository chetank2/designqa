import { useState, useEffect, useCallback } from 'react'
import { getApiBaseUrl } from '../config/ports'

interface BackendReachability {
  reachable: boolean
  checking: boolean
  error: Error | null
  refetch: () => Promise<void>
  isReachable: boolean
  isLoading: boolean
}

export function useBackendReachability(): BackendReachability {
  const [reachable, setReachable] = useState(false)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const checkReachability = useCallback(async () => {
    try {
      setChecking(true)
      const baseUrl = getApiBaseUrl()
      const response = await fetch(`${baseUrl}/api/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      })
      setReachable(response.ok)
      setError(null)
    } catch (err) {
      setReachable(false)
      setError(err instanceof Error ? err : new Error('Backend unreachable'))
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    checkReachability()
    const interval = setInterval(checkReachability, 30000)
    return () => clearInterval(interval)
  }, [checkReachability])

  return {
    reachable,
    checking,
    error,
    refetch: checkReachability,
    isReachable: reachable,
    isLoading: checking
  }
}
