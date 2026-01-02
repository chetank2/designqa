import { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import Sidebar from './components/layout/Sidebar'
import Header from './components/layout/Header'
import NewComparison from './pages/NewComparison'
import Settings from './pages/Settings'
import SingleSourcePage from './pages/SingleSourcePage'
import ScreenshotComparison from './pages/ScreenshotComparison'
import Reports from './pages/Reports'
import ColorAnalytics from './pages/ColorAnalytics'
import ErrorBoundary from './components/ui/ErrorBoundary'
import { Toaster } from '@/components/ui/toaster'
import { ModeProvider } from './contexts/ModeContext'

function AppContent() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const location = useLocation()

  // #region agent log
  useEffect(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'N/A';
    const href = typeof window !== 'undefined' ? window.location.href : 'N/A';
    const protocol = typeof window !== 'undefined' ? window.location.protocol : 'N/A';
    fetch('http://127.0.0.1:7242/ingest/49fa703a-56f7-4c75-b3dc-7ee1a4d36535', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'App.tsx:18', message: 'AppContent mount - window location', data: { origin, href, protocol, pathname: location.pathname }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'E' }) }).catch(() => { });
  }, [location.pathname]);
  // #endregion

  // #region agent log
  useEffect(() => {
    const handlePopState = () => {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'N/A';
      const href = typeof window !== 'undefined' ? window.location.href : 'N/A';
      fetch('http://127.0.0.1:7242/ingest/49fa703a-56f7-4c75-b3dc-7ee1a4d36535', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'App.tsx:25', message: 'PopState event', data: { origin, href, pathname: location.pathname }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'C' }) }).catch(() => { });
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [location.pathname]);
  // #endregion

  const pageVariants = {
    initial: { opacity: 0, scale: 0.98, y: 10 },
    in: { opacity: 1, scale: 1, y: 0 },
    out: { opacity: 0, scale: 1.02, y: -10 }
  }

  const getPageTitle = (pathname: string) => {
    if (pathname.includes('/new-comparison')) return 'Compare'
    if (pathname.includes('/screenshot-comparison')) return 'Screenshot Comparison'
    if (pathname.includes('/settings')) return 'Settings'
    if (pathname.includes('/single-source')) return 'Single Source'
    if (pathname.includes('/color-analytics')) return 'Color Analytics'
    if (pathname.includes('/reports')) return 'Reports'
    return 'Design QA'
  }

  const isAuthPage = ['/signin', '/signup'].includes(location.pathname)

  return (
    <div className="app-container flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
      />

      <div className="flex-1 flex flex-col h-full relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
          <div className="absolute top-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-primary/5 blur-[120px]" />
          <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-foreground/5 blur-[100px]" />
        </div>

        <Header
          title={getPageTitle(location.pathname)}
          onMenuClick={() => setSidebarOpen(!sidebarOpen)}
          sidebarOpen={sidebarOpen}
        />

        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 lg:p-8 scroll-smooth z-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial="initial"
              animate="in"
              exit="out"
              variants={pageVariants}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="min-h-full"
            >
              <Routes location={location}>
                <Route path="/" element={<NewComparison />} />
                <Route path="/new-comparison" element={<NewComparison />} />
                <Route path="/screenshot-comparison" element={<ScreenshotComparison />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/single-source" element={<SingleSourcePage />} />
                <Route path="/color-analytics" element={<ColorAnalytics />} />
                <Route path="*" element={<NewComparison />} />
              </Routes>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}

function App() {
  return (
    <ErrorBoundary>
      <ModeProvider>
        <Router>
          <AppContent />
          <Toaster />
        </Router>
      </ModeProvider>
    </ErrorBoundary>
  )
}

export default App
