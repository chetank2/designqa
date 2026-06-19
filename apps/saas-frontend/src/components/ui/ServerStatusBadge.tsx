import { useEffect, useState } from 'react'
import { Loader2, Server } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useAppMode } from '../../contexts/ModeContext'

interface ServerStatusBadgeProps {
  compact?: boolean
  className?: string
}

type ServerStatus = {
  running: boolean
  port: number | null
}

export function ServerStatusBadge({ compact = false, className }: ServerStatusBadgeProps) {
  const { isElectron } = useAppMode()
  const [status, setStatus] = useState<ServerStatus | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    if (!isElectron || !window.electronAPI?.getServerStatus) {
      return
    }

    let cancelled = false

    const refresh = async () => {
      try {
        setChecking(true)
        const nextStatus = await window.electronAPI!.getServerStatus()
        if (!cancelled) {
          setStatus(nextStatus)
        }
      } catch {
        if (!cancelled) {
          setStatus({ running: false, port: null })
        }
      } finally {
        if (!cancelled) {
          setChecking(false)
        }
      }
    }

    refresh()
    const interval = window.setInterval(refresh, 5000)
    window.addEventListener('server-status-updated', refresh)

    return () => {
      cancelled = true
      window.clearInterval(interval)
      window.removeEventListener('server-status-updated', refresh)
    }
  }, [isElectron])

  if (!isElectron) {
    return null
  }

  const running = status?.running === true
  const label = checking && !status ? 'Server checking' : running ? `Server ${status?.port ?? 3847}` : 'Server off'
  const title = running
    ? `Embedded server running on port ${status?.port ?? 3847}`
    : 'Embedded server is not running'

  return (
    <Badge
      variant="outline"
      title={title}
      className={cn(
        'h-7 gap-2 border-border/70 bg-background/60 px-2 text-xs font-medium shadow-none',
        running ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300',
        compact && 'h-8 w-8 justify-center px-0',
        className
      )}
    >
      {checking && !status ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <span
          className={cn(
            'h-2 w-2 rounded-full',
            running ? 'bg-emerald-500' : 'bg-rose-500'
          )}
        />
      )}
      {!compact && (
        <>
          <Server className="h-3.5 w-3.5" />
          <span className="whitespace-nowrap">{label}</span>
        </>
      )}
    </Badge>
  )
}
