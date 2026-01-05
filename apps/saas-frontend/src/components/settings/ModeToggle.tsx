import { FC } from 'react'
import { useAppMode } from '../../contexts/ModeContext'
import { Button } from '@/components/ui/button'

const ModeToggle: FC = () => {
  const { mode, setMode, isDesktop, isSaas, isElectron } = useAppMode()

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-gray-600 dark:text-gray-400">Mode:</span>
      <Button
        variant={isSaas ? 'default' : 'outline'}
        size="sm"
        onClick={() => setMode('saas')}
        disabled={isElectron}
      >
        SaaS
      </Button>
      <Button
        variant={isDesktop ? 'default' : 'outline'}
        size="sm"
        onClick={() => setMode('desktop')}
        disabled={isElectron}
      >
        Desktop
      </Button>
      {isElectron && (
        <span className="text-xs text-muted-foreground">Locked in Desktop App</span>
      )}
    </div>
  )
}

export default ModeToggle
