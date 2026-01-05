import { Bars3Icon } from '@heroicons/react/24/outline'
import { UserCircle } from 'lucide-react'
import MCPStatus from '../ui/MCPStatus'
import { ThemeToggle } from '../ui/theme-toggle'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAppMode } from '../../contexts/ModeContext'
import { ModeBadge } from '../ui/ModeBadge'

interface HeaderProps {
  title: string
  onMenuClick: () => void
  sidebarOpen: boolean
}

export default function Header({ title, onMenuClick, sidebarOpen }: HeaderProps) {
  const navigationLabel = sidebarOpen ? 'Collapse navigation sidebar' : 'Expand navigation sidebar'
  const { isElectron } = useAppMode()

  return (
    <header className={cn(
      "px-8 py-5 sticky top-0 z-40 transition-all duration-300",
      "bg-background/40 backdrop-blur-md border-b border-border/10",
      "supports-[backdrop-filter]:bg-background/20",
      // Add left padding for traffic lights in Electron on Mac
      // Usually traffic lights are ~70px wide, let's add some buffer
      // ONLY if sidebar is closed (otherwise sidebar handles it)
      isElectron && !sidebarOpen && "pl-28"
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={onMenuClick}
            className={cn("text-muted-foreground hover:bg-muted/20", sidebarOpen ? 'lg:hidden' : '')}
            aria-label={navigationLabel}
            title={navigationLabel}
          >
            <Bars3Icon className="w-6 h-6" />
          </Button>

          <div className="animate-fade-in">
            <h1 className="text-2xl font-bold tracking-tight text-foreground bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
              {title}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-3 px-3 py-1.5 rounded-full bg-muted/20 border border-white/5 mx-2">
            <ModeBadge />
            <div className="w-px h-4 bg-border/20 mx-1" />
            <MCPStatus />
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <div className="px-3 py-1 rounded-full border border-muted/40 flex items-center justify-center">
              <UserCircle className="w-4 h-4 text-muted-foreground" />
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
