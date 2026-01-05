import { FC } from 'react'
import { useAppMode } from '../../contexts/ModeContext'
import { Badge } from '@/components/ui/badge'

export const ModeBadge: FC = () => {
  const { mode, isElectron } = useAppMode()

  if (!isElectron) {
    return null
  }

  return (
    <Badge variant="outline" className="text-xs">
      {mode === 'desktop' ? 'Desktop' : 'SaaS'}
    </Badge>
  )
}
