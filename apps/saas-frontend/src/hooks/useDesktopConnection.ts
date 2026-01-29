import { useState, useEffect, useCallback, useRef } from 'react'

// Desktop app runs on localhost:3847
const DESKTOP_HEALTH_URL = 'http://localhost:3847/api/desktop/health'

// Polling configuration
const INITIAL_INTERVAL_MS = 2000
const MAX_INTERVAL_MS = 10000
const BACKOFF_MULTIPLIER = 1.5
const REQUEST_TIMEOUT_MS = 3000

export interface DesktopHealthResponse {
  ok: boolean
  version?: string
  platform?: string
  timestamp?: string
  error?: string
}

export interface DesktopConnectionOptions {
  /** Whether polling is enabled. Set to false to disable all network activity. */
  enabled?: boolean
}

export interface DesktopConnection {
  isConnected: boolean
  isChecking: boolean
  error: Error | null
  desktopInfo: DesktopHealthResponse | null
  retry: () => void
  consecutiveFailures: number
}

/**
 * Hook to detect and monitor connection to the DesignQA desktop app.
 * Uses exponential backoff on failure to reduce unnecessary polling.
 *
 * This hook is designed for the web app (Vercel) to detect if the
 * desktop app is running on localhost.
 *
 * @param options.enabled - Set to false to disable polling entirely (default: true)
 */
export function useDesktopConnection(options: DesktopConnectionOptions = {}): DesktopConnection {
  const { enabled = true } = options

  const [isConnected, setIsConnected] = useState(false)
  const [isChecking, setIsChecking] = useState(enabled)
  const [error, setError] = useState<Error | null>(null)
  const [desktopInfo, setDesktopInfo] = useState<DesktopHealthResponse | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)

  const intervalRef = useRef<number | null>(null)
  const currentIntervalMs = useRef(INITIAL_INTERVAL_MS)
  const abortControllerRef = useRef<AbortController | null>(null)
  const isTimeoutAbortRef = useRef(false)
  const isMountedRef = useRef(true)

  const checkConnection = useCallback(async () => {
    // Cancel any in-flight request (this is a cleanup abort, not timeout)
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()
    const controller = abortControllerRef.current
    isTimeoutAbortRef.current = false

    // Set up timeout BEFORE fetch
    const timeoutId = setTimeout(() => {
      isTimeoutAbortRef.current = true
      controller.abort()
    }, REQUEST_TIMEOUT_MS)

    try {
      setIsChecking(true)

      const response = await fetch(DESKTOP_HEALTH_URL, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          // Force a CORS preflight so PNA headers are included.
          'X-Requested-With': 'DesignQA'
        },
        mode: 'cors',
        credentials: 'include'
      })

      clearTimeout(timeoutId)

      if (response.ok) {
        const data: DesktopHealthResponse = await response.json()

        if (data.ok) {
          setIsConnected(true)
          setDesktopInfo(data)
          setError(null)
          setConsecutiveFailures(0)
          // Reset to fast polling on success
          currentIntervalMs.current = INITIAL_INTERVAL_MS
        } else {
          throw new Error(data.error || 'Desktop reported not OK')
        }
      } else {
        throw new Error(`Desktop health check failed: ${response.status}`)
      }
    } catch (err) {
      clearTimeout(timeoutId)

      // Handle abort errors
      if (err instanceof Error && err.name === 'AbortError') {
        // Only update state if this was a timeout abort (not cleanup/unmount)
        if (isTimeoutAbortRef.current && isMountedRef.current) {
          setIsConnected(false)
          setDesktopInfo(null)
          setError(new Error('Connection timeout'))
          setConsecutiveFailures(prev => prev + 1)
          currentIntervalMs.current = Math.min(
            currentIntervalMs.current * BACKOFF_MULTIPLIER,
            MAX_INTERVAL_MS
          )
        }
        // For cleanup aborts, don't update state at all
        return
      }

      // Non-abort errors - only update if still mounted
      if (isMountedRef.current) {
        setIsConnected(false)
        setDesktopInfo(null)
        setError(err instanceof Error ? err : new Error('Failed to connect to desktop app'))
        setConsecutiveFailures(prev => prev + 1)

        // Apply exponential backoff
        currentIntervalMs.current = Math.min(
          currentIntervalMs.current * BACKOFF_MULTIPLIER,
          MAX_INTERVAL_MS
        )
      }
    } finally {
      if (isMountedRef.current) {
        setIsChecking(false)
      }
    }
  }, [])

  const retry = useCallback(() => {
    if (!enabled) return
    // Reset backoff on manual retry
    currentIntervalMs.current = INITIAL_INTERVAL_MS
    setConsecutiveFailures(0)
    checkConnection()
  }, [checkConnection, enabled])

  // Set up polling with dynamic interval (only when enabled)
  useEffect(() => {
    isMountedRef.current = true

    if (!enabled) {
      // Clear any existing state when disabled
      setIsChecking(false)
      return
    }

    // Initial check
    checkConnection()

    const scheduleNextCheck = () => {
      if (intervalRef.current) {
        clearTimeout(intervalRef.current)
      }
      intervalRef.current = window.setTimeout(() => {
        checkConnection().then(scheduleNextCheck)
      }, currentIntervalMs.current)
    }

    scheduleNextCheck()

    return () => {
      isMountedRef.current = false
      if (intervalRef.current) {
        clearTimeout(intervalRef.current)
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [checkConnection, enabled])

  return {
    isConnected,
    isChecking,
    error,
    desktopInfo,
    retry,
    consecutiveFailures
  }
}
