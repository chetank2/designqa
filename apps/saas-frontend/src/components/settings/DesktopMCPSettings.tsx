/**
 * Desktop MCP Settings Component
 * Shows toggle for Desktop MCP when available
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { getApiBaseUrl } from '../../config/ports';
import { useAuth } from '../../contexts/AuthContext';

interface DesktopMCPCapabilities {
  desktopMCPAvailable: boolean;
  message?: string;
}

export default function DesktopMCPSettings() {
  const { user } = useAuth();
  const [capabilities, setCapabilities] = useState<DesktopMCPCapabilities | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    loadCapabilities();
    loadPreference();
  }, [user]);

  const loadCapabilities = async () => {
    try {
      const apiBaseUrl = getApiBaseUrl();
      const response = await fetch(`${apiBaseUrl}/api/desktop/capabilities/${user?.id}`, {
        headers: {
          'Cache-Control': 'no-cache'
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setCapabilities(result);
        }
      }
    } catch (err) {
      console.error('Failed to load desktop capabilities:', err);
      setError('Failed to check desktop MCP availability');
    } finally {
      setLoading(false);
    }
  };

  const loadPreference = () => {
    const saved = localStorage.getItem('desktopMCPEnabled');
    if (saved === 'true') {
      setEnabled(true);
    }
  };

  const handleToggle = async (checked: boolean) => {
    setEnabled(checked);
    localStorage.setItem('desktopMCPEnabled', checked.toString());

    // Sync preference to user profile if available
    if (user?.id) {
      try {
        const apiBaseUrl = getApiBaseUrl();
        await fetch(`${apiBaseUrl}/api/user/preferences`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            desktopMCPEnabled: checked
          })
        });
      } catch (err) {
        console.warn('Failed to sync preference:', err);
      }
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Figma Desktop MCP</CardTitle>
          <CardDescription>Checking availability...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!capabilities?.desktopMCPAvailable) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Figma Desktop MCP</CardTitle>
          <CardDescription>Connect to Figma Desktop App's local MCP server</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {capabilities?.message || 'Desktop MCP is not available. Make sure you have the DesignQA Desktop app installed and running.'}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Figma Desktop MCP</CardTitle>
        <CardDescription>Connect to Figma Desktop App's local MCP server for faster, offline extraction</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="desktop-mcp-toggle">Enable Desktop MCP</Label>
            <p className="text-sm text-muted-foreground">
              Use local Figma Desktop MCP when available (faster, works offline)
            </p>
          </div>
          <Switch
            id="desktop-mcp-toggle"
            checked={enabled}
            onCheckedChange={handleToggle}
          />
        </div>

        {enabled && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>
              Desktop MCP is enabled. Comparisons will use your local Figma Desktop app when available.
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
