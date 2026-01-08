import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import MCPStatus, { useMCPStatus } from '../components/ui/MCPStatus';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import CredentialsManager from '../components/settings/CredentialsManager';
import DesignSystemsManager from '../components/settings/DesignSystemsManager';
import DesktopMCPSettings from '../components/settings/DesktopMCPSettings';
import ModeToggle from '../components/settings/ModeToggle';
import { getApiBaseUrl } from '../config/ports';
import { useBackendReachability } from '../hooks/useBackendReachability';

export default function Settings() {
  const {
    reachable: backendReachable,
    checking: backendChecking,
    refetch: retryBackendReachability
  } = useBackendReachability();
  const { data: mcpData } = useMCPStatus({
    enabled: backendReachable === true
  });
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  const handleExportDiagnostics = async () => {
    setExporting(true);
    setExportMessage(null);
    if (backendReachable !== true) {
      setExporting(false);
      setExportMessage(
        backendReachable === null
          ? 'Waiting for the local backend to start before exporting diagnostics.'
          : 'Local backend unreachable. Start the embedded server before exporting diagnostics.'
      );
      return;
    }
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/diagnostics/export`, {
        method: 'POST'
      });
      const json = await response.json();
      if (json.success) {
        setExportMessage(json.message || `Diagnostics exported to ${json.data?.location}`);
      } else {
        setExportMessage(json.error || 'Failed to export diagnostics');
      }
    } catch (error) {
      console.warn('Export diagnostics failed', error);
      setExportMessage('Unexpected error while exporting diagnostics');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="inline-flex flex-wrap gap-2">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="credentials">Credentials</TabsTrigger>
          <TabsTrigger value="design-systems">Design Systems</TabsTrigger>
          <TabsTrigger value="desktop-mode">Desktop Mode</TabsTrigger>
        </TabsList>

        {backendReachable === false && (
          <Alert variant="destructive" className="mt-2">
            <AlertTitle>Local backend unreachable</AlertTitle>
            <AlertDescription>
              The desktop server at <code>{getApiBaseUrl()}</code> is not responding. Please restart the application.
            </AlertDescription>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={retryBackendReachability}
                disabled={backendChecking}
              >
                {backendChecking ? 'Retrying…' : 'Retry connection'}
              </Button>
            </div>
          </Alert>
        )}

        <TabsContent value="overview">
          <div className="space-y-6">
            <section className="grid lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Figma Desktop Status</CardTitle>
                  <CardDescription>Desktop MCP is the primary data source. Keep Figma Desktop open with Developer Mode enabled.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <MCPStatus showDetails className="text-xs text-muted-foreground" />
                  {mcpData && (
                    <div className="space-y-1 text-sm text-muted-foreground">
                      <p><strong>Port:</strong> {mcpData.data?.port ?? 3845}</p>
                      <p><strong>Figma running:</strong> {mcpData.data?.figmaRunning ? 'Yes' : 'No'}</p>
                      <p><strong>Last checked:</strong> {new Date().toLocaleTimeString()}</p>
                    </div>
                  )}
                  <Button variant="outline" onClick={() => window.location.reload()}>
                    Refresh status
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Export Options</CardTitle>
                  <CardDescription>Share diagnostics or copy data from the local output folder.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Reports, screenshots, and diagnostics are persisted locally. Use the buttons below to copy the current state.
                  </p>
                  <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleExportDiagnostics}
                disabled={exporting || backendReachable !== true}
                size="sm"
                title={backendReachable === true ? undefined : 'Start local backend to export diagnostics'}
              >
                {exporting ? 'Exporting…' : 'Export Diagnostics'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(`${getApiBaseUrl()}/reports`, '_blank')}
                disabled={backendReachable !== true}
                title={backendReachable === true ? undefined : 'Start the local server to view reports'}
              >
                View Reports
              </Button>
                  </div>
                  {exportMessage && (
                    <p className="text-xs text-muted-foreground mt-2">{exportMessage}</p>
                  )}
                </CardContent>
              </Card>
            </section>
          </div>
        </TabsContent>

        <TabsContent value="credentials">
          <CredentialsManager backendReachable={backendReachable} />
        </TabsContent>

        <TabsContent value="design-systems">
          <DesignSystemsManager backendReachable={backendReachable} />
        </TabsContent>

        <TabsContent value="desktop-mode">
          <div className="space-y-4">
            <ModeToggle />
            <DesktopMCPSettings backendReachable={backendReachable} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
