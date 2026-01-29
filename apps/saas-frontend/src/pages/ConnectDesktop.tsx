import { FC, useState, useMemo, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { ArrowPathIcon, ArrowDownTrayIcon, CheckCircleIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline'
import type { DesktopHealthResponse } from '../hooks/useDesktopConnection'

interface ConnectDesktopProps {
  isChecking: boolean
  error: Error | null
  desktopInfo: DesktopHealthResponse | null
  onRetry: () => void
  consecutiveFailures: number
}

// GitHub repo for releases
const GITHUB_REPO = 'chetank2/designqa'
const RELEASES_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`
const RELEASES_PAGE = `https://github.com/${GITHUB_REPO}/releases/latest`

interface ReleaseAssets {
  macArm: string | null
  macIntel: string | null
  windows: string | null
  version: string | null
}

type Platform = 'mac' | 'windows' | 'other'

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other'

  const userAgent = navigator.userAgent.toLowerCase()
  const platform = navigator.platform?.toLowerCase() || ''

  if (platform.includes('mac') || userAgent.includes('macintosh') || userAgent.includes('mac os')) {
    return 'mac'
  }
  if (platform.includes('win') || userAgent.includes('windows')) {
    return 'windows'
  }
  return 'other'
}

function useLatestRelease() {
  const [assets, setAssets] = useState<ReleaseAssets>({
    macArm: null,
    macIntel: null,
    windows: null,
    version: null
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function fetchRelease() {
      try {
        const response = await fetch(RELEASES_API, {
          headers: { 'Accept': 'application/vnd.github.v3+json' }
        })

        if (!response.ok) throw new Error('Failed to fetch release')

        const data = await response.json()
        if (cancelled) return

        const releaseAssets: ReleaseAssets = {
          macArm: null,
          macIntel: null,
          windows: null,
          version: data.tag_name || null
        }

        // Parse assets to find platform-specific downloads
        for (const asset of data.assets || []) {
          const name = asset.name?.toLowerCase() || ''
          const url = asset.browser_download_url

          if (name.endsWith('.dmg')) {
            if (name.includes('arm64')) {
              releaseAssets.macArm = url
            } else {
              releaseAssets.macIntel = url
            }
          } else if (name.endsWith('.exe')) {
            releaseAssets.windows = url
          }
        }

        setAssets(releaseAssets)
      } catch (err) {
        // On error, assets remain null - UI will fall back to releases page
        console.warn('Failed to fetch latest release:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchRelease()
    return () => { cancelled = true }
  }, [])

  return { assets, loading }
}

const ConnectDesktop: FC<ConnectDesktopProps> = ({
  isChecking,
  error,
  desktopInfo,
  onRetry,
  consecutiveFailures
}) => {
  const [showTroubleshooting, setShowTroubleshooting] = useState(false)
  const [showAllPlatforms, setShowAllPlatforms] = useState(false)

  const platform = useMemo(() => detectPlatform(), [])
  const { assets, loading: assetsLoading } = useLatestRelease()
  const isConnected = desktopInfo?.ok === true

  // Check if we have valid download URLs
  const hasMacDownloads = assets.macArm || assets.macIntel
  const hasWindowsDownload = assets.windows

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md mx-4"
      >
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          {/* Header */}
          <div className="px-8 pt-10 pb-6 text-center border-b border-slate-100 dark:border-slate-800">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
              <img
                src="./logo.svg"
                alt="DesignQA"
                className="w-10 h-10"
              />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              DesignQA
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Figma vs Web Comparison Tool
            </p>
          </div>

          {/* Connection Status */}
          <div className="px-8 py-8">
            <div className="flex items-center justify-center gap-3 mb-6">
              {isChecking ? (
                <>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  >
                    <ArrowPathIcon className="w-5 h-5 text-primary" />
                  </motion.div>
                  <span className="text-slate-600 dark:text-slate-300">
                    Connecting to Desktop App...
                  </span>
                </>
              ) : isConnected ? (
                <>
                  <CheckCircleIcon className="w-5 h-5 text-green-500" />
                  <span className="text-green-600 dark:text-green-400">
                    Connected to Desktop App
                  </span>
                </>
              ) : (
                <>
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                  </span>
                  <span className="text-slate-600 dark:text-slate-300">
                    Waiting for Desktop App...
                  </span>
                </>
              )}
            </div>

            {/* Instructions */}
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 mb-6">
              <p className="text-sm text-slate-600 dark:text-slate-300 text-center">
                Start the <strong>DesignQA Desktop App</strong> to enable<br />
                Figma file comparisons and analysis.
              </p>
            </div>

            {/* Error display */}
            {error && consecutiveFailures >= 3 && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg mb-6">
                <ExclamationCircleIcon className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-700 dark:text-amber-300">
                  <p className="font-medium">Connection failed</p>
                  <p className="text-amber-600 dark:text-amber-400 text-xs mt-1">
                    Make sure the desktop app is running on port 3847
                  </p>
                </div>
              </div>
            )}

            {/* Retry Button */}
            <Button
              onClick={onRetry}
              disabled={isChecking}
              className="w-full mb-4"
              size="lg"
            >
              {isChecking ? (
                <>
                  <ArrowPathIcon className="w-4 h-4 mr-2 animate-spin" />
                  Checking...
                </>
              ) : (
                <>
                  <ArrowPathIcon className="w-4 h-4 mr-2" />
                  Retry Connection
                </>
              )}
            </Button>

            {/* Divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200 dark:border-slate-700"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white dark:bg-slate-900 px-2 text-slate-400">
                  Don't have the app?
                </span>
              </div>
            </div>

            {/* Platform-specific Download Buttons */}
            <div className="space-y-3">
              {assetsLoading ? (
                <div className="flex items-center justify-center py-4">
                  <ArrowPathIcon className="w-5 h-5 animate-spin text-slate-400" />
                  <span className="ml-2 text-sm text-slate-500">Loading downloads...</span>
                </div>
              ) : (
                <>
                  {/* macOS Downloads */}
                  {(platform === 'mac' || showAllPlatforms) && hasMacDownloads && (
                    <div className="space-y-2">
                      {platform === 'mac' && !showAllPlatforms && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 text-center mb-2">
                          Download for macOS
                        </p>
                      )}
                      {showAllPlatforms && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                          macOS
                        </p>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        {assets.macArm && (
                          <a
                            href={assets.macArm}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Button
                              variant="outline"
                              className="w-full text-sm"
                              size="default"
                            >
                              <ArrowDownTrayIcon className="w-4 h-4 mr-1" />
                              Apple Silicon
                            </Button>
                          </a>
                        )}
                        {assets.macIntel && (
                          <a
                            href={assets.macIntel}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Button
                              variant="outline"
                              className="w-full text-sm"
                              size="default"
                            >
                              <ArrowDownTrayIcon className="w-4 h-4 mr-1" />
                              Intel
                            </Button>
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Windows Download */}
                  {(platform === 'windows' || showAllPlatforms) && hasWindowsDownload && (
                    <div>
                      {showAllPlatforms && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-2">
                          Windows
                        </p>
                      )}
                      <a
                        href={assets.windows!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block"
                      >
                        <Button
                          variant={platform === 'windows' && !showAllPlatforms ? 'default' : 'outline'}
                          className="w-full"
                          size="lg"
                        >
                          <ArrowDownTrayIcon className="w-4 h-4 mr-2" />
                          {platform === 'windows' && !showAllPlatforms ? 'Download for Windows' : 'Windows Installer'}
                        </Button>
                      </a>
                    </div>
                  )}

                  {/* Fallback: No assets found or other platform */}
                  {(platform === 'other' || (!hasMacDownloads && !hasWindowsDownload)) && !showAllPlatforms && (
                    <a
                      href={RELEASES_PAGE}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
                    >
                      <Button
                        variant="outline"
                        className="w-full"
                        size="lg"
                      >
                        <ArrowDownTrayIcon className="w-4 h-4 mr-2" />
                        View All Downloads
                      </Button>
                    </a>
                  )}

                  {/* Toggle to show all platforms */}
                  {platform !== 'other' && (hasMacDownloads || hasWindowsDownload) && (
                    <button
                      onClick={() => setShowAllPlatforms(!showAllPlatforms)}
                      className="text-xs text-primary hover:text-primary/80 transition-colors w-full text-center mt-2"
                    >
                      {showAllPlatforms ? 'Show less' : 'Show all platforms'}
                    </button>
                  )}

                  {/* Version info */}
                  {assets.version && (
                    <p className="text-xs text-slate-400 text-center mt-2">
                      Latest: {assets.version}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Troubleshooting */}
          <div className="px-8 pb-8">
            <button
              onClick={() => setShowTroubleshooting(!showTroubleshooting)}
              className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors w-full text-center"
            >
              {showTroubleshooting ? 'Hide' : 'Show'} troubleshooting tips
            </button>

            {showTroubleshooting && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg"
              >
                <ul className="text-xs text-slate-500 dark:text-slate-400 space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="text-slate-400">1.</span>
                    Make sure DesignQA Desktop is running
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-slate-400">2.</span>
                    Check that port 3847 is not blocked by firewall
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-slate-400">3.</span>
                    Try restarting the desktop app
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-slate-400">4.</span>
                    Ensure you're using the latest version
                  </li>
                </ul>
              </motion.div>
            )}
          </div>

          {/* Footer */}
          <div className="px-8 py-4 bg-slate-50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800">
            <p className="text-xs text-center text-slate-400">
              {consecutiveFailures > 0 && (
                <span className="block mb-1">
                  Connection attempts: {consecutiveFailures}
                </span>
              )}
              Checking localhost:3847 for desktop app
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

export default ConnectDesktop
