import { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, useLocation, Navigate, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import Sidebar from './components/layout/Sidebar'
import Header from './components/layout/Header'
import NewComparison from './pages/NewComparison'
import Settings from './pages/Settings'
import SingleSourcePage from './pages/SingleSourcePage'
import ScreenshotComparison from './pages/ScreenshotComparison'
import Reports from './pages/Reports'
import ColorAnalytics from './pages/ColorAnalytics'
import SignIn from './pages/SignIn'
import ErrorBoundary from './components/ui/ErrorBoundary'
import { Toaster } from '@/components/ui/toaster'
import { useAuth } from './contexts/AuthContext'
import { isAuthRequired } from './utils/auth'

/**
 * Protected Route Component
 * Redirects to sign-in if auth is required and user is not authenticated
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [authRequired, setAuthRequired] = useState(false);

  useEffect(() => {
    setAuthRequired(isAuthRequired());
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (authRequired && !user) {
    return <Navigate to="/signin" replace />;
  }

  return <>{children}</>;
}

/**
 * Main App Content Component
 * SaaS-only version - no local server management
 */
function AppContent() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const location = useLocation()
  const navigate = useNavigate()
  const { user, loading } = useAuth()
  const [authRequired, setAuthRequired] = useState(false)

  // Check auth requirement after component mounts
  useEffect(() => {
    setAuthRequired(isAuthRequired())
  }, [])

  // Immediate redirect check before rendering any content
  useEffect(() => {
    if (!loading && authRequired && !user && location.pathname !== '/signin') {
      navigate('/signin', { replace: true })
    }
  }, [user, loading, authRequired, location.pathname, navigate])

  const getPageTitle = (pathname: string): string => {
    if (pathname.includes('signin')) return 'Sign In'
    if (pathname.includes('new-comparison')) return 'Compare'
    if (pathname.includes('screenshot-comparison')) return 'Screenshot Comparison'
    if (pathname.includes('settings')) return 'Settings'
    if (pathname.includes('single-source')) return 'Single Source'
    if (pathname.includes('color-analytics')) return 'Color Analytics'
    if (pathname.includes('reports')) return 'Reports'
    return 'Comparison Tool'
  }

  const pageVariants = {
    initial: { opacity: 0, scale: 0.98, y: 10 },
    in: { opacity: 1, scale: 1, y: 0 },
    out: { opacity: 0, scale: 1.02, y: -10 }
  }

  // Don't show sidebar/header on sign-in page
  const isSignInPage = location.pathname === '/signin'
  
  // If auth is required and user is not authenticated, show sign-in page immediately
  // This prevents any flash of sidebar/header before redirect
  if (isSignInPage || (!loading && authRequired && !user)) {
    return (
      <Routes>
        <Route path="/signin" element={<SignIn />} />
        <Route path="*" element={<Navigate to="/signin" replace />} />
      </Routes>
    )
  }

  return (
    <div className="app-container flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
      />

      <div className="flex-1 flex flex-col h-full relative overflow-hidden">
        {/* Decorative Background Elements - Subtle Monochrome */}
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
                <Route path="/signin" element={<SignIn />} />
                <Route path="/" element={<ProtectedRoute><NewComparison /></ProtectedRoute>} />
                <Route path="/new-comparison" element={<ProtectedRoute><NewComparison /></ProtectedRoute>} />
                <Route path="/screenshot-comparison" element={<ProtectedRoute><ScreenshotComparison /></ProtectedRoute>} />
                <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
                <Route path="/single-source" element={<ProtectedRoute><SingleSourcePage /></ProtectedRoute>} />
                <Route path="/color-analytics" element={<ProtectedRoute><ColorAnalytics /></ProtectedRoute>} />
                {/* Redirect any other routes */}
                <Route path="*" element={<Navigate to="/" replace />} />
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
      <Router>
        <AppContent />
        <Toaster />
      </Router>
    </ErrorBoundary>
  )
}

export default App