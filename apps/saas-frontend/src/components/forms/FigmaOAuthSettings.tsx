import React, { useState, useEffect } from 'react';
import { KeyIcon, CheckCircleIcon, XCircleIcon, LinkIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import apiService, { saveFigmaCredentials, connectFigma, getFigmaStatus } from '../../services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface OAuthStatus {
  hasCredentials: boolean;
  connected: boolean;
}

const FigmaOAuthSettings: React.FC = () => {
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [isSecretMasked, setIsSecretMasked] = useState(true);
  const [credentialsSaved, setCredentialsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [status, setStatus] = useState<OAuthStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Load status on mount
  useEffect(() => {
    loadStatus();
  }, []);

  // Check URL params for OAuth callback result
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('figma_connected') === 'true') {
      setSuccessMessage('Successfully connected to Figma!');
      loadStatus();
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('figma_error')) {
      setError(decodeURIComponent(params.get('figma_error') || 'Connection failed'));
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const loadStatus = async () => {
    try {
      const result = await getFigmaStatus();
      if (result.success) {
        setStatus({
          hasCredentials: result.hasCredentials,
          connected: result.connected
        });
        setCredentialsSaved(result.hasCredentials);
      }
    } catch (err) {
      console.error('Failed to load OAuth status:', err);
    }
  };

  const handleSaveCredentials = async () => {
    if (!clientId.trim() || !clientSecret.trim()) {
      setError('Please enter both Client ID and Client Secret');
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await saveFigmaCredentials(clientId.trim(), clientSecret.trim());
      setCredentialsSaved(true);
      setSuccessMessage('Credentials saved successfully');
      setClientId('');
      setClientSecret('');
      await loadStatus();
    } catch (err: any) {
      setError(err.message || 'Failed to save credentials');
    } finally {
      setIsSaving(false);
    }
  };

  const handleConnect = async () => {
    setIsConnecting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await connectFigma();
      if (result.success && result.url) {
        // Redirect to Figma OAuth
        window.location.href = result.url;
      } else {
        throw new Error('Failed to get authorization URL');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to initiate OAuth connection');
      setIsConnecting(false);
    }
  };

  const getCallbackUrl = () => {
    const protocol = window.location.protocol;
    const host = window.location.host;
    return `${protocol}//${host}/api/auth/figma/callback`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Figma OAuth (Recommended)</h4>
        {status?.connected && (
          <div className="flex items-center text-green-600">
            <CheckCircleIcon className="h-5 w-5 mr-1" />
            <span className="text-sm font-medium">Connected</span>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Use OAuth 2.0 for secure, token-refreshable authentication. You'll need to create your own Figma App.
      </p>

      {/* Success Message */}
      {successMessage && (
        <Alert>
          <CheckCircleIcon className="h-4 w-4" />
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      )}

      {/* Error Message */}
      {error && (
        <Alert variant="destructive">
          <XCircleIcon className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Credentials Input */}
      {!credentialsSaved && (
        <div className="space-y-4 p-4 bg-muted/50 rounded-md border">
          <div className="space-y-2">
            <Label htmlFor="clientId">Figma App Client ID</Label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <KeyIcon className="h-5 w-5 text-muted-foreground" />
              </div>
              <Input
                type="text"
                id="clientId"
                className="pl-10"
                placeholder="Enter your Figma App Client ID"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="clientSecret">Figma App Client Secret</Label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <KeyIcon className="h-5 w-5 text-muted-foreground" />
              </div>
              <Input
                type={isSecretMasked ? 'password' : 'text'}
                id="clientSecret"
                className="pl-10 pr-16"
                placeholder="Enter your Figma App Client Secret"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                <button
                  type="button"
                  onClick={() => setIsSecretMasked(!isSecretMasked)}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  {isSecretMasked ? 'Show' : 'Hide'}
                </button>
              </div>
            </div>
          </div>

          <Button
            type="button"
            onClick={handleSaveCredentials}
            disabled={isSaving || !clientId.trim() || !clientSecret.trim()}
            className="w-full"
          >
            {isSaving ? 'Saving...' : 'Save Credentials'}
          </Button>
        </div>
      )}

      {/* Connect Button */}
      {credentialsSaved && (
        <div className="space-y-4">
          <Button
            type="button"
            onClick={handleConnect}
            disabled={isConnecting || status?.connected}
            className="w-full"
          >
            {isConnecting ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Connecting...
              </>
            ) : status?.connected ? (
              <>
                <CheckCircleIcon className="h-5 w-5 mr-2" />
                Connected to Figma
              </>
            ) : (
              <>
                <LinkIcon className="h-5 w-5 mr-2" />
                Connect to Figma
              </>
            )}
          </Button>
        </div>
      )}

      {/* Setup Instructions */}
      <Alert className="mt-4">
        <ExclamationTriangleIcon className="h-4 w-4" />
        <AlertDescription>
          <div className="space-y-2">
            <h4 className="text-sm font-medium mb-2">Setup Instructions</h4>
            <ol className="list-decimal list-inside space-y-1 text-sm">
              <li>Create a Figma App at <a href="https://www.figma.com/developers/apps" target="_blank" rel="noopener noreferrer" className="underline">figma.com/developers/apps</a></li>
              <li>Add this redirect URI to your app: <code className="bg-muted px-1 rounded text-xs font-mono">{getCallbackUrl()}</code></li>
              <li>Copy your Client ID and Client Secret</li>
              <li>Save them above, then click "Connect to Figma"</li>
            </ol>
            <p className="mt-2 text-xs">
              <strong>Required Scope:</strong> <code className="bg-muted px-1 rounded">files:read</code> (minimal permissions)
            </p>
          </div>
        </AlertDescription>
      </Alert>
    </div>
  );
};

export default FigmaOAuthSettings;
