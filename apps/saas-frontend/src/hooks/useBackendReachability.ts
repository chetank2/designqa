import { useState, useEffect } from 'react'
import { getApiBaseUrl } from '../config/ports'

interface BackendReachability {
  isReachable: boolean
  isLoading: boolean
  error: Error | null
}

export function useBackendReachability(): BackendReachability {
  const [isReachable, setIsReachable] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const checkReachability = async () => {
      try {
        setIsLoading(true)
        const baseUrl = getApiBaseUrl()
        const response = await fetch(`${baseUrl}/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(5000), // 5 second timeout
        })
        setIsReachable(response.ok)
        setError(null)
      } catch (err) {
        setIsReachable(false)
        setError(err instanceof Error ? err : new Error('Backend unreachable'))
      } finally {
        setIsLoading(false)
      }
    }

    checkReachability()
    // Check every 30 seconds
    const interval = setInterval(checkReachability, 30000)
    return () => clearInterval(interval)
  }, [])

  return { isReachable, isLoading, error }
}
