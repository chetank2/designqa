import { useState, useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { unifiedApiService } from '../../services/unified-api'
import { getApiBaseUrl } from '../../utils/environment'
import ProgressIndicator, { ProgressStage } from '../ui/ProgressIndicator'
import { DesignSystemSelect } from '../common/DesignSystemSelect'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  DocumentTextIcon,
  GlobeAltIcon,
  CogIcon,
  PlayIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XMarkIcon,
  InformationCircleIcon,
  AdjustmentsHorizontalIcon
} from '@heroicons/react/24/outline'
import { ComparisonRequest, ComparisonResult } from '../../types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'

// Add error type definition
interface ComparisonError {
  message: string | { message: string };
  code?: string;
}

// No hardcoded placeholders

// Using the updated AuthenticationConfig interface from types

// Using the updated ComparisonResult interface from types

interface ComparisonFormProps {
  onSuccess?: (result: ComparisonResult) => void
  onComparisonStart?: (comparisonId: string) => void
}

export default function ComparisonForm({ onSuccess, onComparisonStart }: ComparisonFormProps) {
  const emptyCredentialValue = '__none__'
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [authType, setAuthType] = useState<'none' | 'credentials' | 'cookies' | 'headers'>('none')
  const [progressStages, setProgressStages] = useState<ProgressStage[]>([])
  const [currentStage, setCurrentStage] = useState<string>('')
  const [reportUrls, setReportUrls] = useState<{ directUrl?: string; downloadUrl?: string; hasError?: boolean }>({})
  const [reportOpenAttempts, setReportOpenAttempts] = useState<number>(0)
  const [figmaUrlError, setFigmaUrlError] = useState<string | null>(null)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [lastErrorMessage, setLastErrorMessage] = useState<string | null>(null)
  const [savedCredentials, setSavedCredentials] = useState<Array<{ id: string; name: string; url: string }>>([])
  const [selectedCredentialId, setSelectedCredentialId] = useState<string>('')
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { control, handleSubmit, watch, formState: { errors }, reset, setValue } = useForm<ComparisonRequest & { extractionMode: 'frame-only' | 'global-styles' | 'both' }>({
    defaultValues: {
      figmaUrl: '',
      designSystemId: '',
      webUrl: '',
      webSelector: '',
      includeVisual: true,
      extractionMode: 'both',
      authentication: {
        type: 'credentials',
        loginUrl: '',
        username: '',
        password: '',
        waitTime: 3000,
        successIndicator: ''
      }
    }
  })

  // Load saved credentials on mount and when credentials auth type is selected
  useEffect(() => {
    loadCredentials()
  }, [])

  // Also reload credentials when auth type changes to credentials
  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/49fa703a-56f7-4c75-b3dc-7ee1a4d36535', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'ComparisonForm.tsx:95', message: 'authType useEffect triggered', data: { authType }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run2', hypothesisId: 'C' }) }).catch(() => { });
    // #endregion
    if (authType === 'credentials') {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/49fa703a-56f7-4c75-b3dc-7ee1a4d36535', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'ComparisonForm.tsx:97', message: 'Reloading credentials due to authType change', data: { authType }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run2', hypothesisId: 'C' }) }).catch(() => { });
      // #endregion
      loadCredentials()
    }
  }, [authType])

  // Track savedCredentials and authType changes
  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/49fa703a-56f7-4c75-b3dc-7ee1a4d36535', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'ComparisonForm.tsx:106', message: 'State update', data: { savedCredentialsCount: savedCredentials.length, selectedCredentialId, authType }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run3', hypothesisId: 'F' }) }).catch(() => { });
    console.log('[DEBUG] State update - credentials:', savedCredentials.length, 'selected:', selectedCredentialId, 'authType:', authType)
    // #endregion
  }, [savedCredentials, selectedCredentialId, authType])

  const loadCredentials = async () => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/49fa703a-56f7-4c75-b3dc-7ee1a4d36535', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'ComparisonForm.tsx:107', message: 'loadCredentials called', data: {}, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run3', hypothesisId: 'F' }) }).catch(() => { });
    console.log('[DEBUG] loadCredentials called')
    // #endregion
    try {
      const apiBaseUrl = getApiBaseUrl()
      const response = await fetch(`${apiBaseUrl}/api/credentials`)

      if (response.ok) {
        const result = await response.json()
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/49fa703a-56f7-4c75-b3dc-7ee1a4d36535', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'ComparisonForm.tsx:114', message: 'Credentials loaded from API', data: { credentialsCount: result.data?.length || 0, credentials: result.data?.map((c: any) => ({ id: c.id, name: c.name, url: c.url })) || [] }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run3', hypothesisId: 'F' }) }).catch(() => { });
        console.log('[DEBUG] Credentials loaded:', result.data?.length || 0, 'credentials', 'response:', result)
        // #endregion
        const credentials = result.data || result.credentials || []
        console.log('[DEBUG] Setting savedCredentials to:', credentials.length, 'items')
        setSavedCredentials(credentials)
      } else {
        const errorText = await response.text().catch(() => 'Unknown error')
        console.log('[DEBUG] Failed to load credentials - response not ok:', response.status, errorText)
        setSavedCredentials([])
      }
    } catch (error) {
      console.error('[DEBUG] Failed to load credentials:', error)
      // Silently fail - local mode may not have credentials yet
    }
  }

  const handleCredentialSelect = async (credentialId: string) => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/49fa703a-56f7-4c75-b3dc-7ee1a4d36535', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'ComparisonForm.tsx:116', message: 'handleCredentialSelect entry', data: { credentialId, authType }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run3', hypothesisId: 'A' }) }).catch(() => { });
    console.log('[DEBUG] handleCredentialSelect:', credentialId, 'current authType:', authType)
    // #endregion
    const resolvedCredentialId = credentialId === emptyCredentialValue ? '' : credentialId
    setSelectedCredentialId(resolvedCredentialId)

    if (!resolvedCredentialId) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/49fa703a-56f7-4c75-b3dc-7ee1a4d36535', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'ComparisonForm.tsx:121', message: 'None selected - clearing auth fields', data: { authType }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run2', hypothesisId: 'B' }) }).catch(() => { });
      // #endregion
      // Clear form if "None" selected
      if (authType === 'credentials') {
        setAuthType('none')
      }
      setValue('authentication.username', '')
      setValue('authentication.password', '')
      setValue('authentication.loginUrl', '')
      return
    }

    try {
      const apiBaseUrl = getApiBaseUrl()
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/49fa703a-56f7-4c75-b3dc-7ee1a4d36535', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'ComparisonForm.tsx:130', message: 'Fetching credential decrypt', data: { resolvedCredentialId, authType }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'C' }) }).catch(() => { });
      // #endregion
      const response = await fetch(`${apiBaseUrl}/api/credentials/${resolvedCredentialId}/decrypt`)

      if (response.ok) {
        const result = await response.json()
        const credential = result.data

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/49fa703a-56f7-4c75-b3dc-7ee1a4d36535', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'ComparisonForm.tsx:137', message: 'Credential loaded from API', data: { credentialUrl: credential.url, hasUsername: !!credential.username, hasPassword: !!credential.password, hasLoginUrl: !!credential.loginUrl, authType }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run3', hypothesisId: 'D' }) }).catch(() => { });
        console.log('[DEBUG] Credential loaded:', { url: credential.url, username: credential.username, password: credential.password ? '***' : '', authType })
        // #endregion

        // Auto-fill Web URL
        if (credential.url) {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/49fa703a-56f7-4c75-b3dc-7ee1a4d36535', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'ComparisonForm.tsx:139', message: 'Setting webUrl', data: { url: credential.url }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run3', hypothesisId: 'D' }) }).catch(() => { });
          console.log('[DEBUG] Setting webUrl to:', credential.url)
          // #endregion
          setValue('webUrl', credential.url)
        } else {
          console.log('[DEBUG] Credential has no URL!')
        }

        // Only set authType to credentials if username/password exist (not empty strings)
        const hasAuth = (credential.username && credential.username.trim()) || (credential.password && credential.password.trim())
        console.log('[DEBUG] hasAuth check:', hasAuth, 'username:', credential.username, 'password:', credential.password ? 'exists' : 'empty')
        if (hasAuth) {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/49fa703a-56f7-4c75-b3dc-7ee1a4d36535', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'ComparisonForm.tsx:145', message: 'Credential has auth - setting authType', data: { currentAuthType: authType, willSetToCredentials: authType !== 'credentials' }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'A' }) }).catch(() => { });
          // #endregion
          if (authType !== 'credentials') {
            setAuthType('credentials')
          }
          // Auto-fill auth fields
          setValue('authentication.username', credential.username || '')
          setValue('authentication.password', credential.password || '')
          if (credential.loginUrl) {
            setValue('authentication.loginUrl', credential.loginUrl)
          }

          toast({
            title: 'Credential loaded',
            description: `Loaded credentials for ${credential.name || credential.id || 'selected credential'}. URL and authentication fields filled.`
          })
        } else {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/49fa703a-56f7-4c75-b3dc-7ee1a4d36535', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'ComparisonForm.tsx:159', message: 'Credential has no auth - clearing fields', data: { currentAuthType: authType }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run3', hypothesisId: 'A' }) }).catch(() => { });
          console.log('[DEBUG] Credential has no auth, current authType:', authType)
          // #endregion
          // No auth needed, reset authType to 'none' if it was 'credentials'
          if (authType === 'credentials') {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/49fa703a-56f7-4c75-b3dc-7ee1a4d36535', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'ComparisonForm.tsx:186', message: 'Resetting authType from credentials to none', data: { previousAuthType: authType }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run3', hypothesisId: 'A' }) }).catch(() => { });
            console.log('[DEBUG] Resetting authType from credentials to none')
            // #endregion
            setAuthType('none')
          } else {
            console.log('[DEBUG] authType is already:', authType, '- no reset needed')
          }
          setValue('authentication.username', '')
          setValue('authentication.password', '')
          setValue('authentication.loginUrl', '')

          toast({
            title: 'Credential loaded',
            description: `Loaded URL for ${credential.name || credential.id || 'selected credential'}. No authentication required.`
          })
        }
      } else {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to load credential')
      }
    } catch (error) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/49fa703a-56f7-4c75-b3dc-7ee1a4d36535', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'ComparisonForm.tsx:172', message: 'Error loading credential', data: { error: error instanceof Error ? error.message : 'Unknown' }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'E' }) }).catch(() => { });
      // #endregion
      toast({
        title: 'Failed to load credential',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive'
      })
    }
  }

  const describeError = (error: unknown): string => {
    if (!error) {
      return 'Extraction failed for an unknown reason.'
    }

    if (typeof error === 'string') {
      return error
    }

    if (error instanceof Error) {
      if (/network error/i.test(error.message)) {
        return 'Unable to reach the comparison server. Confirm it is running on port 3847 and retry.'
      }
      if (/timeout/i.test(error.message) || /timed out/i.test(error.message)) {
        return 'The comparison request timed out. Increase the timeout in Settings or try again with a smaller scope.'
      }
      return error.message
    }

    const apiError = error as { message?: string; status?: number; code?: string; details?: string }

    if (apiError.code === 'ABORT_TIMEOUT') {
      return 'The request was aborted after the configured timeout. Adjust timeout settings or retry with fewer steps.'
    }

    switch (apiError.status) {
      case 422:
        return apiError.details ? `${apiError.message} ${apiError.details}` : (apiError.message || 'Web extraction failed to produce usable DOM output.')
      case 401:
      case 403:
        return 'Authentication failed. Check your Figma token and any web credentials configured in Settings.'
      case 404:
        return 'The /api/compare endpoint is unavailable. Verify the backend is running the latest build.'
      case 504:
        return apiError.details || 'The comparison server timed out while extracting the web page. Try again with authentication enabled or a simpler URL.'
      case 429:
        return 'Too many requests in a short period. Wait a moment before running another comparison.'
      case 500:
        return 'The server encountered an error while processing the comparison. Review server logs for details.'
      default:
        break
    }

    if (apiError.message) {
      if (/network/i.test(apiError.message)) {
        return 'Network connection failed while contacting the comparison server.'
      }
      return apiError.message
    }

    return 'Extraction failed due to an unexpected server response.'
  }

  const comparisonMutation = useMutation({
    mutationFn: async (data: ComparisonRequest & { extractionMode: 'frame-only' | 'global-styles' | 'both' }) => {
      try {
        // Initialize progress stages
        setProgressStages([
          { stage: 'validation', label: 'Validating URLs', progress: 0 },
          { stage: 'figma-extraction', label: 'Extracting Figma Data', progress: 0 },
          { stage: 'web-extraction', label: 'Extracting Web Data', progress: 0 },
          { stage: 'comparison', label: 'Comparing Data', progress: 0 }
        ]);
        setCurrentStage('validation');

        // Parse and validate Figma URL
        let figmaUrl = data.figmaUrl;
        let nodeId: string | null = null;

        try {
          // Validate Figma URL format
          if (!figmaUrl.match(/^https:\/\/www\.figma\.com\/(file|design|proto)\/[a-zA-Z0-9-]+\//)) {
            throw new Error('Invalid Figma URL format. Expected format: https://www.figma.com/file/... or https://www.figma.com/design/...');
          }

          // Extract nodeId from URL if present
          const nodeIdMatch = figmaUrl.match(/[?&]node-id=([^&]+)/);
          if (nodeIdMatch) {
            nodeId = nodeIdMatch[1].replace('-', ':');
          }

          // Ensure URL is in file format for API compatibility
          if (figmaUrl.includes('/design/')) {
            figmaUrl = figmaUrl.replace('/design/', '/file/');
          } else if (figmaUrl.includes('/proto/')) {
            figmaUrl = figmaUrl.replace('/proto/', '/file/');
          }

          setFigmaUrlError(null);
        } catch (urlError: any) {
          setFigmaUrlError(urlError.message);
          throw urlError;
        }

        // Create the request payload with the expected format
        const payload = {
          figmaUrl: figmaUrl,
          webUrl: data.webUrl,
          includeVisual: data.includeVisual,
          nodeId: nodeId, // Use extracted nodeId
          extractionMode: data.extractionMode, // Add extraction mode
          authentication: authType === 'none' ? null : {
            type: authType,
            loginUrl: data.authentication?.loginUrl,
            username: data.authentication?.username,
            password: data.authentication?.password,
            waitTime: data.authentication?.waitTime || 3000,
            successIndicator: data.authentication?.successIndicator,
            figmaToken: data.authentication?.figmaToken,
            webAuth: {
              username: data.authentication?.username,
              password: data.authentication?.password
            }
          }
        };

        console.log('🚀 Sending comparison request:', payload);

        // Update progress: validation complete
        setProgressStages(prev => prev.map(stage =>
          stage.stage === 'validation'
            ? { ...stage, progress: 100 }
            : stage
        ));
        setCurrentStage('figma-extraction');

        // Use the compareUrls function from the unified API service
        const result = await unifiedApiService.compareUrls(payload);

        // Update progress: extraction complete
        setProgressStages(prev => prev.map(stage =>
          stage.stage === 'comparison'
            ? { ...stage, progress: 100 }
            : stage
        ));

        // The API now returns the comparison result directly
        const comparisonResult = result as ComparisonResult;

        // If the result contains a comparisonId, notify the parent component
        if ((comparisonResult.comparisonId) && onComparisonStart) {
          onComparisonStart(comparisonResult.comparisonId);
        }

        return comparisonResult;
      } catch (error) {
        console.error('❌ Request failed:', error);
        throw error;
      }
    },
    onSuccess: (result) => {
      console.log('🔥 COMPARISON FORM onSuccess CALLED!');
      console.log('✅ Comparison mutation successful:', result);
      queryClient.invalidateQueries({ queryKey: ['reports'] });

      // Store report URLs for UI access
      const resultData = result as any;
      const reports = resultData.reports;

      if (reports?.directUrl) {
        setReportUrls({
          directUrl: reports.directUrl,
          downloadUrl: reports.downloadUrl,
          hasError: reports.hasError || false
        });

        // Open the report in a new tab
        const apiBaseUrl = getApiBaseUrl();
        const fullDirectUrl = `${apiBaseUrl}${reports.directUrl}`;

        // Reset report open attempts counter
        setReportOpenAttempts(0);

        // Open the report in a new tab
        try {
          const newWindow = window.open(fullDirectUrl, '_blank');

          // Check if popup was blocked
          if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
            console.warn('⚠️ Popup blocked or failed to open');
            setReportOpenAttempts(prev => prev + 1);
          } else {
            // Success, reset attempts counter
            setReportOpenAttempts(0);
          }
        } catch (windowError) {
          console.error('❌ Failed to open report in new tab:', windowError);
          setReportOpenAttempts(prev => prev + 1);
        }
      }

      // Debug the result structure before passing to parent
      console.log('🔍 ComparisonForm: Raw result structure:', JSON.stringify(result, null, 2));
      console.log('🔍 ComparisonForm: result.data exists?', !!result.data);
      console.log('🔍 ComparisonForm: result.extractionDetails exists?', !!result.extractionDetails);
      console.log('🔍 ComparisonForm: result.data?.extractionDetails exists?', !!result.data?.extractionDetails);

      onSuccess?.(result);
      setLastErrorMessage(null)
    },
    onError: (error: unknown) => {
      console.error('❌ Comparison mutation failed:', error);

      const errorMessage = describeError(error);
      const comparisonError = error as ComparisonError;

      setProgressStages(prevStages => {
        const newStages = prevStages.length > 0 ? prevStages : [{
          stage: 'comparison',
          label: 'Comparison',
          progress: 0
        }];

        return newStages.map(stage =>
          stage.stage === currentStage
            ? {
              ...stage,
              error: true,
              message: errorMessage,
              details: comparisonError?.code ? `Error code: ${comparisonError.code}` : undefined
            }
            : stage
        );
      });

      setLastErrorMessage(errorMessage);

      toast({
        title: 'Extraction failed',
        description: errorMessage,
        variant: 'destructive'
      });

      if (window.Notification && Notification.permission === 'granted') {
        new Notification('Comparison Failed', {
          body: errorMessage,
          icon: '/error-icon.png'
        });
      }
    },
    retry: 2,
    retryDelay: attempt => Math.min(1000 * 2 ** attempt, 10000)
  });

  const onSubmit = (data: ComparisonRequest & { extractionMode: 'frame-only' | 'global-styles' | 'both' }) => {
    setLastErrorMessage(null)
    comparisonMutation.mutate(data);
  }

  const figmaUrl = watch('figmaUrl')
  const webUrl = watch('webUrl')
  const isSubmitDisabled =
    comparisonMutation.isPending || !figmaUrl?.trim() || !webUrl?.trim()

  // Reset progress when starting new comparison
  useEffect(() => {
    if (comparisonMutation.isIdle) {
      setProgressStages([])
      setCurrentStage('')
      setReportUrls({})
      setReportOpenAttempts(0)
    }
  }, [comparisonMutation.isIdle])

  // Function to open report in new tab
  const openReportInNewTab = () => {
    if (reportUrls.directUrl) {
      const apiBaseUrl = getApiBaseUrl();
      const url = `${apiBaseUrl}${reportUrls.directUrl}`;
      try {
        if (window.electronAPI?.openExternal) {
          window.electronAPI.openExternal(url);
          setReportOpenAttempts(0);
          return;
        }

        const newWindow = window.open(url, '_blank', 'noopener,noreferrer');

        // Check if popup was blocked
        if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
          console.warn('⚠️ Popup blocked or failed to open');
          setReportOpenAttempts(prev => prev + 1);
        } else {
          // Success, reset attempts counter
          setReportOpenAttempts(0);
        }
      } catch (error) {
        console.error('❌ Failed to open report:', error);
        setReportOpenAttempts(prev => prev + 1);
      }
    }
  }

  // Function to download report
  const downloadReport = () => {
    if (reportUrls.downloadUrl) {
      const apiBaseUrl = getApiBaseUrl();
      const url = `${apiBaseUrl}${reportUrls.downloadUrl}`;
      try {
        if (window.electronAPI?.openExternal) {
          window.electronAPI.openExternal(url);
          return;
        }

        window.open(url, '_blank', 'noopener,noreferrer');
      } catch (error) {
        console.error('❌ Failed to download report:', error);

        // Create a direct link as fallback
        const link = document.createElement('a');
        link.href = url;
        link.download = `comparison-report.html`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    }
  }

  const handleConfirmReset = () => {
    reset()
    setShowAdvanced(false)
    setAuthType('none')
    setProgressStages([])
    setCurrentStage('')
    setReportUrls({})
    setReportOpenAttempts(0)
    setFigmaUrlError(null)
    comparisonMutation.reset()
    setResetDialogOpen(false)
  }

  return (
    <div className="w-full">
      <form onSubmit={handleSubmit(onSubmit)} className="form-standard">

        {/* Design System Selection (Source of Truth) */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-6"
        >
          <Card className="border-primary/20 bg-white/5">
            <CardHeader className="pb-3">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                  <AdjustmentsHorizontalIcon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">Design System (Source of Truth)</CardTitle>
                  <CardDescription>Select the design system to validate against</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Controller
                name="designSystemId"
                control={control}
                render={({ field }) => (
                  <DesignSystemSelect
                    value={field.value || ''}
                    onChange={field.onChange}
                    disabled={comparisonMutation.isPending}
                  />
                )}
              />
            </CardContent>
          </Card>
        </motion.div>

        {/* Main Form */}
        <div className="flex flex-col gap-5 mb-8">
          {/* Figma Section */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
                    <DocumentTextIcon className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Figma Design</CardTitle>
                    <CardDescription>Paste your Figma file or frame URL</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">

                {/* Figma URL Input */}
                <div className="space-y-2">
                  <Label htmlFor="figmaUrl">Figma URL</Label>
                  <Controller
                    name="figmaUrl"
                    control={control}
                    rules={{
                      required: 'Figma URL is required',
                      pattern: {
                        value: /^https:\/\/www\.figma\.com\/(file|design|proto)\/[a-zA-Z0-9-]+\//,
                        message: 'Please enter a valid Figma URL'
                      }
                    }}
                    render={({ field }) => (
                      <Input
                        {...field}
                        type="url"
                        id="figmaUrl"
                        placeholder="https://www.figma.com/file/..."
                        className={cn(errors.figmaUrl && 'border-destructive focus-visible:ring-destructive')}
                        disabled={comparisonMutation.isPending}
                      />
                    )}
                  />
                  {errors.figmaUrl && (
                    <p className="text-xs text-destructive">{errors.figmaUrl.message}</p>
                  )}
                  {figmaUrlError && (
                    <p className="text-xs text-destructive">{figmaUrlError}</p>
                  )}
                </div>

                {/* Figma Extraction Mode */}
                <div className="space-y-3">
                  <Label className="flex items-center text-sm font-medium">
                    <AdjustmentsHorizontalIcon className="w-5 h-5 mr-1" />
                    Extraction Mode
                  </Label>
                  <Controller
                    name="extractionMode"
                    control={control}
                    render={({ field }) => (
                      <RadioGroup
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={comparisonMutation.isPending}
                        className="flex flex-row gap-4"
                      >
                        <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-accent/50 transition-colors w-full">
                          <RadioGroupItem value="frame-only" id="frame-only" className="mt-1" />
                          <div className="flex-1 space-y-1">
                            <Label htmlFor="frame-only" className="text-base font-medium cursor-pointer">
                              Frame Only
                            </Label>
                            <p className="text-sm text-muted-foreground">
                              Extract only elements from the selected frame
                            </p>
                          </div>
                        </div>

                        <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-accent/50 transition-colors w-full">
                          <RadioGroupItem value="global-styles" id="global-styles" className="mt-1" />
                          <div className="flex-1 space-y-1">
                            <Label htmlFor="global-styles" className="text-base font-medium cursor-pointer">
                              Global Styles
                            </Label>
                            <p className="text-sm text-muted-foreground">
                              Extract all global styles from the file
                            </p>
                          </div>
                        </div>

                        <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-accent/50 transition-colors w-full">
                          <RadioGroupItem value="both" id="both" className="mt-1" />
                          <div className="flex-1 space-y-1">
                            <Label htmlFor="both" className="text-base font-medium cursor-pointer">
                              Both
                            </Label>
                            <p className="text-sm text-muted-foreground">
                              Extract both frame elements and global styles
                            </p>
                          </div>
                        </div>
                      </RadioGroup>
                    )}
                  />
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Web Section */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                    <GlobeAltIcon className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Web Extraction</CardTitle>
                    <CardDescription>Enter the live website URL</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 p-4 bg-muted/50 rounded-lg">
                  <Label>Use Saved Credential</Label>
                  <Select
                    value={selectedCredentialId || undefined}
                    onValueChange={handleCredentialSelect}
                    disabled={false}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a saved credential (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {savedCredentials.length > 0 ? (
                        <>
                          <SelectItem value={emptyCredentialValue}>None (enter manually)</SelectItem>
                          {savedCredentials.map((cred) => (
                            <SelectItem key={cred.id} value={cred.id}>
                              {cred.name} - {cred.url}
                            </SelectItem>
                          ))}
                        </>
                      ) : (
                        <SelectItem value={emptyCredentialValue} disabled>
                          No saved credentials
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {savedCredentials.length === 0
                      ? 'No saved credentials yet. Add one in Settings.'
                      : 'Selecting a credential will auto-fill the Web URL. If the credential has username/password, authentication fields will also be filled.'}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="webUrl">Web URL</Label>
                  <Controller
                    name="webUrl"
                    control={control}
                    rules={{
                      required: 'Web URL is required',
                      pattern: {
                        value: /^https?:\/\/.+/,
                        message: 'Please enter a valid URL'
                      }
                    }}
                    render={({ field }) => (
                      <Input
                        {...field}
                        type="url"
                        id="webUrl"
                        placeholder="https://example.com"
                        className={cn(errors.webUrl && 'border-destructive focus-visible:ring-destructive')}
                        disabled={comparisonMutation.isPending}
                      />
                    )}
                  />
                  {errors.webUrl && (
                    <p className="text-xs text-destructive">{errors.webUrl.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="webSelector">CSS Selector (Optional)</Label>
                  <Controller
                    name="webSelector"
                    control={control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        type="text"
                        id="webSelector"
                        placeholder="e.g., .main-content, #hero-section"
                        disabled={comparisonMutation.isPending}
                      />
                    )}
                  />
                  <p className="text-xs text-muted-foreground">
                    Specify a CSS selector to focus on specific elements
                  </p>
                </div>

                {webUrl && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                  >
                    <Alert>
                      <CheckCircleIcon className="h-4 w-4" />
                      <AlertDescription>
                        Valid web URL detected
                      </AlertDescription>
                    </Alert>
                  </motion.div>
                )}

                {/* Advanced Options */}
                <div className="space-y-2">
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.2 }}
                    className="rounded-xl border bg-card text-card-foreground p-6"
                  >
                    <button
                      type="button"
                      onClick={() => setShowAdvanced(!showAdvanced)}
                      className="flex items-center justify-between w-full text-left rounded-lg hover:bg-accent/50 transition-colors p-0 border-0 bg-transparent"
                    >
                      <div className="flex items-center space-x-3 w-full">
                        <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
                          <CogIcon className="w-6 h-6 text-muted-foreground" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">Advanced Options</h3>
                          <p className="text-sm text-muted-foreground">Authentication, visual comparison settings</p>
                        </div>
                      </div>
                      <motion.div
                        animate={{ rotate: showAdvanced ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </motion.div>
                    </button>

                    <AnimatePresence>
                      {showAdvanced && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.3 }}
                          className="mt-6 space-y-6"
                        >
                          {/* Authentication */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-3">
                              Authentication Required?
                            </label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
                              {[
                                { value: 'none', label: 'None', desc: 'Public page' },
                                { value: 'credentials', label: 'Login', desc: 'Username/Password' },
                                { value: 'cookies', label: 'Cookies', desc: 'Session cookies' },
                                { value: 'headers', label: 'Headers', desc: 'Custom headers' }
                              ].map((option) => (
                                <button
                                  key={option.value}
                                  type="button"
                                  onClick={() => setAuthType(option.value as any)}
                                  className={`p-3 rounded-lg border text-left transition-colors w-full ${authType === option.value
                                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                                    : 'border-border hover:border-border/80'
                                    }`}
                                >
                                  <div className="font-medium text-sm">{option.label}</div>
                                  <div className="text-xs text-muted-foreground">{option.desc}</div>
                                </button>
                              ))}
                            </div>
                          </div>

                          {authType === 'credentials' && (
                            <motion.div
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="space-y-4"
                            >
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Login URL
                                  </label>
                                  <Controller
                                    name="authentication.loginUrl"
                                    control={control}
                                    render={({ field }) => (
                                      <input
                                        {...field}
                                        type="url"
                                        placeholder=""
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                      />
                                    )}
                                  />
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Success Indicator
                                  </label>
                                  <Controller
                                    name="authentication.successIndicator"
                                    control={control}
                                    render={({ field }) => (
                                      <input
                                        {...field}
                                        type="text"
                                        placeholder=""
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                      />
                                    )}
                                  />
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Username
                                  </label>
                                  <Controller
                                    name="authentication.username"
                                    control={control}
                                    render={({ field }) => (
                                      <input
                                        {...field}
                                        type="text"
                                        placeholder=""
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                      />
                                    )}
                                  />
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Password
                                  </label>
                                  <Controller
                                    name="authentication.password"
                                    control={control}
                                    render={({ field }) => (
                                      <input
                                        {...field}
                                        type="password"
                                        placeholder=""
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                      />
                                    )}
                                  />
                                </div>
                              </div>
                            </motion.div>
                          )}

                          {/* Visual Comparison Options */}
                          <div>
                            <label className="flex items-center space-x-3">
                              <Controller
                                name="includeVisual"
                                control={control}
                                render={({ field }) => (
                                  <input
                                    type="checkbox"
                                    checked={field.value}
                                    onChange={field.onChange}
                                    className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                                  />
                                )}
                              />
                              <div>
                                <span className="text-sm font-medium text-gray-700">
                                  Include Visual Comparison
                                </span>
                                <p className="text-xs text-muted-foreground">
                                  Generate pixel-perfect visual diff images
                                </p>
                              </div>
                            </label>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Submit Section */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center pt-6">
          <Button
            type="button"
            onClick={() => setResetDialogOpen(true)}
            variant="outline"
            disabled={comparisonMutation.isPending}
            className="flex items-center space-x-2"
          >
            <XMarkIcon className="w-5 h-5" />
            <span>Reset Form</span>
          </Button>

          <Button
            type="submit"
            disabled={isSubmitDisabled}
            className="flex items-center space-x-2 min-w-[200px]"
          >
            {comparisonMutation.isPending ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Extracting Data...</span>
              </>
            ) : (
              <>
                <PlayIcon className="w-5 h-5" />
                <span>Extract Design & Web Data</span>
              </>
            )}
          </Button>
        </div>

        {isSubmitDisabled && !comparisonMutation.isPending && (
          <p className="text-center text-xs text-muted-foreground mt-2">
            Enter both a Figma URL and a Web URL to enable extraction.
          </p>
        )}

        {/* Progress Indicator */}
        <AnimatePresence>
          {progressStages.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="card"
            >
              <ProgressIndicator
                stages={progressStages}
                currentStage={currentStage}
                error={comparisonMutation.isError}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Final Status Messages */}
        <AnimatePresence>
          {comparisonMutation.isError && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex items-center space-x-3 p-4 bg-red-50 border border-red-200 rounded-lg"
            >
              <ExclamationTriangleIcon className="w-6 h-6 text-destructive flex-shrink-0" />
              <div>
                <h4 className="font-medium text-destructive">Extraction Failed</h4>
                <p className="text-sm text-destructive/80">
                  {comparisonMutation.error instanceof Error
                    ? comparisonMutation.error.message
                    : 'An unexpected error occurred'}
                </p>
              </div>
            </motion.div>
          )}

          {comparisonMutation.isSuccess && !progressStages.some(stage => stage.error) && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex items-center space-x-3 p-4 bg-accent/10 border border-accent/20 rounded-lg"
            >
              <CheckCircleIcon className="w-6 h-6 text-accent-foreground flex-shrink-0" />
              <div className="flex-1">
                <h4 className="font-medium text-accent-foreground">Extraction Complete!</h4>
                <p className="text-sm text-accent-foreground/80">
                  Your design and web data has been extracted successfully.
                  {reportOpenAttempts > 0 && (
                    <span className="block mt-1 text-amber-600">
                      <InformationCircleIcon className="inline-block w-4 h-4 mr-1 -mt-0.5" />
                      The report may have been blocked by your browser's popup blocker.
                    </span>
                  )}
                  {reportUrls.hasError && (
                    <span className="block mt-1 text-amber-600">
                      <ExclamationTriangleIcon className="inline-block w-4 h-4 mr-1 -mt-0.5" />
                      The report was generated with some errors. Please check the report for details.
                    </span>
                  )}
                </p>
              </div>
              <div className="flex space-x-2">
                <Button
                  type="button"
                  onClick={openReportInNewTab}
                  size="sm"
                >
                  View Report
                </Button>
                <Button
                  type="button"
                  onClick={downloadReport}
                  variant="outline"
                  size="sm"
                >
                  Download
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </form>

      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset form?</DialogTitle>
            <DialogDescription>
              This will clear all entered URLs, authentication details, and progress.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmReset}>
              Reset Form
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
} 
