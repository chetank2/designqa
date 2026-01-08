/**
 * Connection Dashboard Component
 * Shows MCP connection status, recent jobs, and logs
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2, XCircle, Clock } from 'lucide-react';
import { getApiBaseUrl } from '../../config/ports';

interface ConnectionStatus {
  connected: boolean;
  type: 'desktop' | 'remote' | 'proxy' | 'none';
  port?: number;
  lastChecked?: string;
}

interface RecentJob {
  id: string;
  status: 'completed' | 'running' | 'failed';
  createdAt: string;
  figmaUrl?: string;
}

export default function ConnectionDashboard() {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus | null>(null);
  const [recentJobs, setRecentJobs] = useState<RecentJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
    const interval = setInterval(loadDashboardData, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, []);

  const loadDashboardData = async () => {
    try {
      const apiBaseUrl = getApiBaseUrl();
      
      // Load MCP status
      const statusResponse = await fetch(`${apiBaseUrl}/api/mcp/status`, {
        headers: { 'Cache-Control': 'no-cache' }
      });
      
      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        setConnectionStatus({
          connected: statusData.connected || false,
          type: statusData.type || 'none',
          port: statusData.port,
          lastChecked: new Date().toISOString()
        });
      }

      // Load recent jobs (if endpoint exists)
      try {
        const jobsResponse = await fetch(`${apiBaseUrl}/api/comparisons/recent`, {
          headers: { 'Cache-Control': 'no-cache' }
        });
        if (jobsResponse.ok) {
          const jobsData = await jobsResponse.json();
          if (jobsData.success && jobsData.data) {
            setRecentJobs(jobsData.data.slice(0, 10));
          }
        }
      } catch (err) {
        // Endpoint may not exist yet
        console.debug('Recent jobs endpoint not available');
      }

    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Connection Dashboard</CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Connection Status */}
      <Card>
        <CardHeader>
          <CardTitle>MCP Connection Status</CardTitle>
          <CardDescription>Current connection to Figma MCP</CardDescription>
        </CardHeader>
        <CardContent>
          {connectionStatus?.connected ? (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between">
                <span>
                  Connected via <Badge>{connectionStatus.type}</Badge>
                  {connectionStatus.port && ` on port ${connectionStatus.port}`}
                </span>
                {connectionStatus.lastChecked && (
                  <span className="text-xs text-muted-foreground">
                    {new Date(connectionStatus.lastChecked).toLocaleTimeString()}
                  </span>
                )}
              </AlertDescription>
            </Alert>
          ) : (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>
                Not connected to MCP. Check your settings to enable a connection.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Recent Jobs */}
      {recentJobs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Comparison Jobs</CardTitle>
            <CardDescription>Last 10 comparison jobs</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentJobs.map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between p-2 border rounded"
                >
                  <div className="flex items-center gap-2">
                    {job.status === 'completed' && (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    )}
                    {job.status === 'running' && (
                      <Clock className="h-4 w-4 text-blue-500 animate-spin" />
                    )}
                    {job.status === 'failed' && (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                    <span className="text-sm">{job.id}</span>
                  </div>
                  <Badge variant={job.status === 'completed' ? 'default' : 'secondary'}>
                    {job.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
