import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { extractFigmaOnly, extractWebOnly, FigmaOnlyResponse, WebOnlyResponse } from '../../services/api';
import { DesignSystemSelect } from '../common/DesignSystemSelect';
import { AuthenticationConfig } from '../../types';
import { getApiBaseUrl } from '../../config/ports';
import { motion } from 'framer-motion';
import {
  DocumentTextIcon,
  GlobeAltIcon,
  ArrowPathIcon,
  LockClosedIcon,
  InformationCircleIcon,
  AdjustmentsHorizontalIcon
} from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PAGE_CONTENT, FORM_CONTENT, EXTRACTION_MODES, BUTTON_LABELS } from '../../constants/content';
import { toast } from '../../utils/toast';
import { cn } from '@/lib/utils';

interface SingleSourceFormProps {
  onFigmaSuccess?: (data: FigmaOnlyResponse['data']) => void;
  onWebSuccess?: (data: WebOnlyResponse['data']) => void;
}

interface SingleSourceRequest {
  extractionType: 'figma' | 'web';
  figmaUrl: string;
  extractionMode: 'frame-only' | 'global-styles' | 'both';
  designSystemId?: string;
  webUrl: string;
  webSelector?: string;
  authentication?: AuthenticationConfig;
}

export default function SingleSourceForm({ onFigmaSuccess, onWebSuccess }: SingleSourceFormProps) {
  const [extractionType, setExtractionType] = useState<'figma' | 'web'>('figma');
  const [showAuth, setShowAuth] = useState(false);
  const [authType, setAuthType] = useState<'none' | 'credentials'>('none');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savedCredentials, setSavedCredentials] = useState<Array<{ id: string; name: string; url: string }>>([]);
  const [selectedCredentialId, setSelectedCredentialId] = useState<string>('');

  const { control, handleSubmit, watch, formState: { errors }, reset, setValue } = useForm<SingleSourceRequest>({
    defaultValues: {
      figmaUrl: '',
      extractionMode: 'both',
      designSystemId: '',
      webUrl: '',
      webSelector: '',
      authentication: {
        type: 'credentials',
        loginUrl: '',
        username: '',
        password: '',
        waitTime: 3000,
        successIndicator: ''
      }
    }
  });

  const loadCredentials = async () => {
    try {
      const apiBaseUrl = getApiBaseUrl();
      const response = await fetch(`${apiBaseUrl}/api/credentials`);
      if (!response.ok) return;

      const result = await response.json();
      setSavedCredentials(result.data || []);
    } catch {
      // Silently fail; local mode may have no credentials yet
      setSavedCredentials([]);
    }
  };

  const handleCredentialSelect = async (credentialId: string) => {
    setSelectedCredentialId(credentialId);

    if (!credentialId) {
      setValue('authentication.username', '');
      setValue('authentication.password', '');
      setValue('authentication.loginUrl', '');
      return;
    }

    try {
      const apiBaseUrl = getApiBaseUrl();
      const response = await fetch(`${apiBaseUrl}/api/credentials/${credentialId}/decrypt`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to load credential');
      }

      const result = await response.json();
      const credential = result.data;

      // Apply auth fields only (do NOT overwrite the URL field)
      setValue('authentication.username', credential.username || '');
      setValue('authentication.password', credential.password || '');
      if (credential.loginUrl) {
        setValue('authentication.loginUrl', credential.loginUrl);
      }

      toast({
        title: 'Credential loaded',
        description: `Loaded credentials for ${credential.name || credential.id || 'selected credential'}`,
        status: 'success',
        duration: 2500,
        isClosable: true,
      });
    } catch (error) {
      toast({
        title: 'Failed to load credential',
        description: error instanceof Error ? error.message : 'Unknown error',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  };

  useEffect(() => {
    const shouldLoad =
      extractionType === 'web' &&
      showAuth &&
      authType === 'credentials';

    if (shouldLoad) {
      loadCredentials();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extractionType, showAuth, authType]);

  const describeRequestError = (error: unknown): string => {
    if (!error) return 'Extraction failed for an unknown reason.';

    if (typeof error === 'string') return error;

    if (error instanceof Error) {
      if (/network error/i.test(error.message)) {
        return 'Unable to reach the extraction server. Ensure the backend on port 3847 is running.';
      }
      if (/timeout/i.test(error.message) || /timed out/i.test(error.message)) {
        return 'The extraction request timed out. Try again after increasing the timeout in Settings.';
      }
      return error.message;
    }

    const apiError = error as { message?: string; status?: number; code?: string; details?: string };

    switch (apiError.status) {
      case 401:
      case 403:
        return 'Authentication failed. Verify your Figma token or provided web credentials.';
      case 404:
        return 'Requested endpoint not found. Update to the latest server build and retry.';
      case 429:
        return 'Too many extraction requests. Wait a few moments before retrying.';
      case 500:
        return 'The server encountered an error during extraction. Check server logs for details.';
      default:
        break;
    }

    if (apiError.message) {
      return apiError.message;
    }

    return 'Extraction failed due to an unexpected server response.';
  };

  const figmaMutation = useMutation({
    mutationFn: async (data: { figmaUrl: string, extractionMode: 'frame-only' | 'global-styles' | 'both' }) => {
      console.log('Submitting Figma extraction request:', data.figmaUrl, 'Mode:', data.extractionMode);

      return await extractFigmaOnly({
        figmaUrl: data.figmaUrl,
        extractionMode: data.extractionMode,
        designSystemId: (data as any).designSystemId
      });
    },
    onSuccess: (data) => {
      console.log('Figma extraction successful, data received:', {
        componentCount: data.metadata?.totalComponents || data.components?.length || 0,
        colorCount: data.metadata?.colorCount || data.colors?.length || 0,
        typographyCount: data.metadata?.typographyCount || data.typography?.length || 0,
        actualColorsCount: data.colors?.length || 0,
        dataStructure: Object.keys(data || {})
      });
      setErrorMessage(null);

      // Validate data before passing to parent
      if (!data || typeof data !== 'object') {
        console.error('Invalid Figma data structure received:', data);
        toast({
          title: 'Data Error',
          description: 'Received invalid data structure from server',
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
        setErrorMessage('Received invalid data structure from server.');
        return;
      }

      // Pass the data to parent component
      onFigmaSuccess?.(data);

      // Don't reset form after success to keep the URL visible
      // User can manually clear if needed
    },
    onError: (error: any) => {
      console.error('Figma extraction failed:', error);
      const friendlyMessage = describeRequestError(error);
      setErrorMessage(friendlyMessage);

      toast({
        title: 'Extraction Failed',
        description: friendlyMessage,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  });

  const webMutation = useMutation({
    mutationFn: async (data: {
      webUrl: string,
      webSelector?: string,
      authentication?: AuthenticationConfig,
      designSystemId?: string
    }) => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/49fa703a-56f7-4c75-b3dc-7ee1a4d36535', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'SingleSourceForm.tsx:162', message: 'webMutation.mutationFn entry', data: { webUrl: data.webUrl, hasSelector: !!data.webSelector, hasAuth: !!data.authentication }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'ALL' }) }).catch(() => { });
      // #endregion
      try {
        const result = await extractWebOnly(
          data.webUrl,
          data.webSelector,
          data.authentication,
          data.designSystemId
        );
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/49fa703a-56f7-4c75-b3dc-7ee1a4d36535', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'SingleSourceForm.tsx:167', message: 'webMutation.mutationFn success', data: { resultType: typeof result, hasResult: !!result, resultKeys: result ? Object.keys(result).slice(0, 10) : [], elementsCount: result?.elements?.length }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'ALL' }) }).catch(() => { });
        // #endregion
        return result;
      } catch (error) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/49fa703a-56f7-4c75-b3dc-7ee1a4d36535', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'SingleSourceForm.tsx:171', message: 'webMutation.mutationFn catch', data: { errorMessage: error instanceof Error ? error.message : String(error), errorName: error instanceof Error ? error.name : 'unknown', errorType: typeof error }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'ALL' }) }).catch(() => { });
        // #endregion
        throw error;
      }
    },
    onSuccess: (data) => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/49fa703a-56f7-4c75-b3dc-7ee1a4d36535', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'SingleSourceForm.tsx:177', message: 'webMutation.onSuccess', data: { dataType: typeof data, hasData: !!data, dataKeys: data ? Object.keys(data).slice(0, 10) : [] }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'ALL' }) }).catch(() => { });
      // #endregion
      setErrorMessage(null);
      onWebSuccess?.(data);
    },
    onError: (error: any) => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/49fa703a-56f7-4c75-b3dc-7ee1a4d36535', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'SingleSourceForm.tsx:182', message: 'webMutation.onError', data: { errorMessage: error?.message || String(error), errorName: error?.name, errorType: typeof error, errorStatus: error?.status, errorCode: error?.code, errorKeys: error ? Object.keys(error).slice(0, 10) : [] }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'ALL' }) }).catch(() => { });
      // #endregion
      console.error('Web extraction failed:', error);
      const friendlyMessage = describeRequestError(error);
      setErrorMessage(friendlyMessage);
      toast({
        title: 'Extraction Failed',
        description: friendlyMessage,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  });

  // Handle extraction type change
  const handleExtractionTypeChange = (type: 'figma' | 'web') => {
    // Clear previous form state
    reset({
      extractionType: type,
      figmaUrl: '',
      extractionMode: 'both',
      webUrl: '',
      webSelector: '',
      authentication: {
        type: 'credentials',
        loginUrl: '',
        username: '',
        password: '',
        waitTime: 3000,
        successIndicator: ''
      }
    });

    setExtractionType(type);
    setShowAuth(false);
    setAuthType('none');
    setErrorMessage(null);
  };

  const onSubmit = (data: SingleSourceRequest) => {
    setErrorMessage(null);
    if (extractionType === 'figma' && data.figmaUrl) {
      figmaMutation.mutate({
        figmaUrl: data.figmaUrl,
        extractionMode: data.extractionMode,
        designSystemId: data.designSystemId
      } as any);
    } else if (extractionType === 'web' && data.webUrl) {
      // Only include authentication if it's enabled
      const auth: AuthenticationConfig | undefined = authType === 'none' ? undefined : {
        ...data.authentication,
        type: authType as AuthenticationConfig['type'] // Use the selected auth type
      };

      webMutation.mutate({
        webUrl: data.webUrl,
        webSelector: data.webSelector,
        authentication: auth,
        designSystemId: data.designSystemId
      });
    }
  };

  const isLoading = figmaMutation.isPending || webMutation.isPending;

  return (
    <div className="w-full">
      {errorMessage && (
        <Alert variant="destructive" className="mb-6">
          <InformationCircleIcon className="h-4 w-4" />
          <AlertDescription>
            {errorMessage}
          </AlertDescription>
        </Alert>
      )}

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
                <CardTitle className="text-base font-semibold">Design System (Source of Truth)</CardTitle>
                <CardDescription className="text-sm">Select the design system context for this extraction</CardDescription>
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
                  disabled={isLoading}
                />
              )}
            />
          </CardContent>
        </Card>
      </motion.div>

      <Tabs value={extractionType} onValueChange={(value) => handleExtractionTypeChange(value as 'figma' | 'web')} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="figma" className="flex items-center space-x-2">
            <DocumentTextIcon className="w-4 h-4" />
            <span>{PAGE_CONTENT.SINGLE_SOURCE.figma.title}</span>
          </TabsTrigger>
          <TabsTrigger value="web" className="flex items-center space-x-2">
            <GlobeAltIcon className="w-4 h-4" />
            <span>{PAGE_CONTENT.SINGLE_SOURCE.web.title}</span>
          </TabsTrigger>
        </TabsList>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6">

          {/* Figma Form */}
          {extractionType === 'figma' && (
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Figma Design</h3>
              <Controller
                name="figmaUrl"
                control={control}
                rules={{
                  required: 'Figma URL is required',
                  pattern: {
                    value: /^https:\/\/www\.figma\.com\/(file|design)\/[a-zA-Z0-9-]+\//,
                    message: 'Please enter a valid Figma URL'
                  }
                }}
                render={({ field }) => (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Figma URL
                    </label>
                    <input
                      {...field}
                      type="url"
                      placeholder="Enter Figma URL"
                      className={`flex h-10 w-full rounded-md border px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${errors.figmaUrl ? 'border-destructive focus-visible:ring-destructive' : 'border-input bg-background'}`}
                      disabled={isLoading}
                    />
                    {errors.figmaUrl && (
                      <p className="mt-1 text-sm text-red-600">{errors.figmaUrl.message}</p>
                    )}
                  </div>
                )}
              />

              {/* Extraction Mode Selection */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                  <AdjustmentsHorizontalIcon className="w-5 h-5 mr-1" />
                  Extraction Mode
                </label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Controller
                    name="extractionMode"
                    control={control}
                    render={({ field }) => (
                      <>
                        <div
                          className={`p-3 border rounded-lg cursor-pointer ${field.value === 'frame-only' ? 'bg-blue-50 border-blue-300' : 'bg-card border-gray-200'}`}
                          onClick={() => field.onChange('frame-only')}
                        >
                          <div className="flex items-center">
                            <input
                              type="radio"
                              id="frame-only"
                              checked={field.value === 'frame-only'}
                              onChange={() => field.onChange('frame-only')}
                              className="h-4 w-4 text-purple-600 border-gray-300"
                            />
                            <label htmlFor="frame-only" className="ml-2 block text-sm font-medium text-gray-700 cursor-pointer">
                              Frame Only
                            </label>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Extract only elements from the selected frame
                          </p>
                        </div>

                        <div
                          className={`p-3 border rounded-lg cursor-pointer ${field.value === 'global-styles' ? 'bg-blue-50 border-blue-300' : 'bg-card border-gray-200'}`}
                          onClick={() => field.onChange('global-styles')}
                        >
                          <div className="flex items-center">
                            <input
                              type="radio"
                              id="global-styles"
                              checked={field.value === 'global-styles'}
                              onChange={() => field.onChange('global-styles')}
                              className="h-4 w-4 text-purple-600 border-gray-300"
                            />
                            <label htmlFor="global-styles" className="ml-2 block text-sm font-medium text-gray-700 cursor-pointer">
                              Global Styles
                            </label>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Extract all global styles from the file
                          </p>
                        </div>

                        <div
                          className={`p-3 border rounded-lg cursor-pointer ${field.value === 'both' ? 'bg-blue-50 border-blue-300' : 'bg-card border-gray-200'}`}
                          onClick={() => field.onChange('both')}
                        >
                          <div className="flex items-center">
                            <input
                              type="radio"
                              id="both"
                              checked={field.value === 'both'}
                              onChange={() => field.onChange('both')}
                              className="h-4 w-4 text-purple-600 border-gray-300"
                            />
                            <label htmlFor="both" className="ml-2 block text-sm font-medium text-gray-700 cursor-pointer">
                              Both
                            </label>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Extract both frame elements and global styles
                          </p>
                        </div>
                      </>
                    )}
                  />
                </div>
              </div>

              {!figmaMutation.isSuccess && (
                <div className="mt-4 p-3 bg-yellow-50 rounded-lg">
                  <p className="text-sm text-yellow-700">
                    <InformationCircleIcon className="inline-block w-5 h-5 mr-1 -mt-0.5" />
                    Make sure your Figma file is accessible with your API token.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Web Form */}
          {extractionType === 'web' && (
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Web Extraction</h3>
              <div className="mb-4 space-y-2">
                <Label htmlFor="savedCredential">Use Saved Credential</Label>
                <select
                  id="savedCredential"
                  value={selectedCredentialId}
                  onChange={(e) => handleCredentialSelect(e.target.value)}
                  disabled={isLoading || savedCredentials.length === 0}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">None</option>
                  {savedCredentials.map((cred) => (
                    <option key={cred.id} value={cred.id}>
                      {cred.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  {savedCredentials.length === 0
                    ? 'No saved credentials yet. Add one in Settings.'
                    : 'Selecting a credential will auto-fill the Web URL. If the credential has username/password, authentication fields will also be filled.'}
                </p>
              </div>
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
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Web URL
                    </label>
                    <input
                      {...field}
                      type="url"
                      placeholder="Enter website URL"
                      className={`flex h-10 w-full rounded-md border px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${errors.webUrl ? 'border-destructive focus-visible:ring-destructive' : 'border-input bg-background'}`}
                      disabled={isLoading}
                    />
                    {errors.webUrl && (
                      <p className="mt-1 text-sm text-red-600">{errors.webUrl.message}</p>
                    )}
                  </div>
                )}
              />

              <div className="mt-4">
                <Controller
                  name="webSelector"
                  control={control}
                  render={({ field }) => (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        CSS Selector (Optional)
                      </label>
                      <input
                        {...field}
                        type="text"
                        placeholder="Enter CSS selectors"
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isLoading}
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        Specify CSS selectors to focus on specific elements
                      </p>
                    </div>
                  )}
                />
              </div>

              {/* Authentication Toggle */}
              <div className="mt-6">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    className="h-4 w-4 text-blue-600 rounded"
                    checked={showAuth}
                    onChange={(event) => {
                      const nextEnabled = event.target.checked;
                      setShowAuth(nextEnabled);
                      if (!nextEnabled) {
                        setAuthType('none');
                        return;
                      }
                      if (authType === 'none') {
                        setAuthType('credentials');
                      }
                    }}
                    disabled={isLoading}
                  />
                  <span className="ml-2 text-sm">Authentication Required</span>
                </label>

                {/* Authentication Fields */}
                {showAuth && authType === 'credentials' && (
                  <div className="mt-4 p-4 bg-muted/50 rounded-lg space-y-4">
                    {/* Saved Credentials Selector */}
                    <Controller
                      name="authentication.loginUrl"
                      control={control}
                      rules={{
                        required: showAuth ? 'Login URL is required' : false,
                      }}
                      render={({ field }) => (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Login URL
                          </label>
                          <input
                            {...field}
                            type="url"
                            placeholder="Enter login page URL"
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={isLoading}
                          />
                        </div>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <Controller
                        name="authentication.username"
                        control={control}
                        rules={{
                          required: showAuth ? 'Username is required' : false,
                        }}
                        render={({ field }) => (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Username
                            </label>
                            <input
                              {...field}
                              type="text"
                              placeholder="Username"
                              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={isLoading}
                            />
                          </div>
                        )}
                      />

                      <Controller
                        name="authentication.password"
                        control={control}
                        rules={{
                          required: showAuth ? 'Password is required' : false,
                        }}
                        render={({ field }) => (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Password
                            </label>
                            <input
                              {...field}
                              type="password"
                              placeholder="••••••••"
                              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={isLoading}
                            />
                          </div>
                        )}
                      />
                    </div>

                    <Controller
                      name="authentication.successIndicator"
                      control={control}
                      render={({ field }) => (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Success Indicator (Optional)
                          </label>
                          <input
                            {...field}
                            type="text"
                            placeholder="CSS selector for successful login"
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={isLoading}
                          />
                          <p className="mt-1 text-xs text-muted-foreground">
                            CSS selector that indicates successful login
                          </p>
                        </div>
                      )}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Submit Button */}
          <div className="flex justify-center pt-6">
            <Button
              type="submit"
              disabled={isLoading}
              className="px-8 py-3 flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <ArrowPathIcon className="w-5 h-5 animate-spin" />
                  <span>Extracting...</span>
                </>
              ) : (
                <span>{BUTTON_LABELS.extractData}</span>
              )}
            </Button>
          </div>
        </form>
      </Tabs>
    </div>
  );
}
