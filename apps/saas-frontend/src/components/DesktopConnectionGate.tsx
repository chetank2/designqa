import { FC, ReactNode } from 'react'
import { useDesktopConnection } from '../hooks/useDesktopConnection'
import { useAppMode } from '../contexts/ModeContext'
import ConnectDesktop from '../pages/ConnectDesktop'

interface DesktopConnectionGateProps {
  children: ReactNode
}

/**
 * Gate component that blocks the app until desktop connection is established.
 * Only activates in SaaS/web mode when VITE_REQUIRE_DESKTOP is true.
 *
 * In Electron mode, this gate is bypassed entirely.
 */
const DesktopConnectionGate: FC<DesktopConnectionGateProps> = ({ children }) => {
  const { isElectron } = useAppMode()

  // Check if desktop requirement is enabled
  const requireDesktop = import.meta.env.VITE_REQUIRE_DESKTOP === 'true'

  // Only poll when we actually need to gate (not in Electron, and feature enabled)
  const shouldPoll = !isElectron && requireDesktop
  const connection = useDesktopConnection({ enabled: shouldPoll })

  // Bypass gate in Electron mode or if desktop requirement is disabled
  if (!shouldPoll) {
    return <>{children}</>
  }

  // Show connection UI when not connected to desktop
  if (!connection.isConnected) {
    return (
      <ConnectDesktop
        isChecking={connection.isChecking}
        error={connection.error}
        desktopInfo={connection.desktopInfo}
        onRetry={connection.retry}
        consecutiveFailures={connection.consecutiveFailures}
      />
    )
  }

  // Connected - render the app
  return <>{children}</>
}

export default DesktopConnectionGate
