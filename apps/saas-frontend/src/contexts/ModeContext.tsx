import { createContext, useContext, useState, ReactNode } from 'react'

type AppMode = 'saas' | 'desktop'

interface ModeContextType {
  mode: AppMode
  setMode: (mode: AppMode) => void
  isDesktop: boolean
  isSaas: boolean
  isElectron: boolean
}

const ModeContext = createContext<ModeContextType | undefined>(undefined)

export function ModeProvider({ children }: { children: ReactNode }) {
  const isElectron = typeof window !== 'undefined' && (window as any).electron
  const initialMode: AppMode = isElectron || import.meta.env.VITE_APP_MODE === 'desktop' ? 'desktop' : 'saas'
  const [mode, setModeState] = useState<AppMode>(initialMode)

  const setMode = (next: AppMode) => {
    if (isElectron && next !== 'desktop') {
      return
    }
    setModeState(next)
  }

  const value: ModeContextType = {
    mode,
    setMode,
    isDesktop: mode === 'desktop',
    isSaas: mode === 'saas',
    isElectron,
  }

  return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>
}

export function useAppMode() {
  const context = useContext(ModeContext)
  if (context === undefined) {
    throw new Error('useAppMode must be used within a ModeProvider')
  }
  return context
}
