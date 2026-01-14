/**
 * Site Profiles Manager Component
 * Manages per-domain extraction overrides in Settings
 */

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Plus, Trash2, Edit2 } from 'lucide-react';
import { getApiBaseUrl } from '@/config/ports';
import type { SiteProfile } from '@/types';

interface SiteProfilesManagerProps {
  backendReachable?: boolean | null;
}

const defaultForm = {
  name: '',
  domain: '',
  enabled: true,
  extractionTimeout: '',
  stabilityTimeout: '',
  navigationTimeout: '',
  resourceBlocking: 'auto',
  waitForSelector: '',
  notes: ''
};

export default function SiteProfilesManager({ backendReachable }: SiteProfilesManagerProps) {
  const [profiles, setProfiles] = useState<SiteProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ ...defaultForm });

  const backendState = backendReachable === undefined ? true : backendReachable;

  const loadProfiles = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${getApiBaseUrl()}/api/site-profiles`);
      if (!response.ok) {
        setProfiles([]);
        return;
      }
      const result = await response.json();
      setProfiles(result.data || []);
    } catch (err) {
      console.error('Failed to load site profiles:', err);
      setError(err instanceof Error ? err.message : 'Failed to load site profiles');
      setProfiles([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (backendState === false) {
      setLoading(false);
      setProfiles([]);
      setError('Local backend unavailable. Start the embedded server to manage site profiles.');
      return;
    }

    if (backendState === null) {
      setLoading(true);
      setError(null);
      return;
    }

    loadProfiles();
  }, [backendState]);

  const handleEdit = (profile: SiteProfile) => {
    setEditingId(profile.id);
    setShowForm(true);
    setFormData({
      name: profile.name || '',
      domain: profile.domain || '',
      enabled: profile.enabled !== false,
      extractionTimeout: profile.timeouts?.extraction ? String(profile.timeouts.extraction) : '',
      stabilityTimeout: profile.timeouts?.stability ? String(profile.timeouts.stability) : '',
      navigationTimeout: profile.timeouts?.navigation ? String(profile.timeouts.navigation) : '',
      resourceBlocking: profile.resourceBlocking || 'auto',
      waitForSelector: profile.waitForSelector || '',
      notes: profile.notes || ''
    });
  };

  const resetForm = () => {
    setEditingId(null);
    setFormData({ ...defaultForm });
  };

  const parseTimeout = (value: string) => {
    if (!value || !value.trim()) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setError(null);

    if (!formData.name.trim()) {
      setError('Profile name is required');
      return;
    }
    if (!formData.domain.trim()) {
      setError('Profile domain is required');
      return;
    }

    try {
      const payload = {
        name: formData.name.trim(),
        domain: formData.domain.trim(),
        enabled: formData.enabled,
        timeouts: {
          extraction: parseTimeout(formData.extractionTimeout),
          stability: parseTimeout(formData.stabilityTimeout),
          navigation: parseTimeout(formData.navigationTimeout)
        },
        resourceBlocking: formData.resourceBlocking,
        waitForSelector: formData.waitForSelector.trim() || undefined,
        notes: formData.notes.trim() || undefined
      };

      const apiBaseUrl = getApiBaseUrl();
      const url = editingId
        ? `${apiBaseUrl}/api/site-profiles/${editingId}`
        : `${apiBaseUrl}/api/site-profiles`;

      const method = editingId ? 'PUT' : 'POST';
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to save site profile');
      }

      await loadProfiles();
      setShowForm(false);
      resetForm();
    } catch (err) {
      console.error('Failed to save site profile:', err);
      setError(err instanceof Error ? err.message : 'Failed to save site profile');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this site profile?')) {
      return;
    }

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/site-profiles/${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to delete site profile');
      }

      await loadProfiles();
    } catch (err) {
      console.error('Failed to delete site profile:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete site profile');
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Site Profiles</CardTitle>
          <CardDescription>
            Save per-domain extraction overrides (timeouts, resource blocking, stability waits).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => {
                if (showForm && !editingId) {
                  setShowForm(false);
                  resetForm();
                  return;
                }
                setShowForm(true);
                setEditingId(null);
                setFormData({ ...defaultForm });
              }}
              disabled={backendState === false || backendState === null}
            >
              <Plus className="h-4 w-4 mr-2" />
              {showForm && !editingId ? 'Close' : 'Add Profile'}
            </Button>
          </div>

          {showForm && (
            <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="profile-name">Profile Name</Label>
                  <Input
                    id="profile-name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Example: Shopify Admin"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-domain">Domain</Label>
                  <Input
                    id="profile-domain"
                    value={formData.domain}
                    onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                    placeholder="example.com or *.example.com"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="timeout-extraction">Extraction Timeout (ms)</Label>
                  <Input
                    id="timeout-extraction"
                    type="number"
                    value={formData.extractionTimeout}
                    onChange={(e) => setFormData({ ...formData, extractionTimeout: e.target.value })}
                    placeholder="180000"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timeout-stability">Stability Timeout (ms)</Label>
                  <Input
                    id="timeout-stability"
                    type="number"
                    value={formData.stabilityTimeout}
                    onChange={(e) => setFormData({ ...formData, stabilityTimeout: e.target.value })}
                    placeholder="5000"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timeout-navigation">Navigation Timeout (ms)</Label>
                  <Input
                    id="timeout-navigation"
                    type="number"
                    value={formData.navigationTimeout}
                    onChange={(e) => setFormData({ ...formData, navigationTimeout: e.target.value })}
                    placeholder="60000"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Resource Blocking</Label>
                  <Select
                    value={formData.resourceBlocking}
                    onValueChange={(value) =>
                      setFormData({ ...formData, resourceBlocking: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select strategy" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto (default)</SelectItem>
                      <SelectItem value="block-heavy">Block images/fonts/media</SelectItem>
                      <SelectItem value="allow-all">Allow all resources</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wait-selector">Wait For Selector</Label>
                  <Input
                    id="wait-selector"
                    value={formData.waitForSelector}
                    onChange={(e) => setFormData({ ...formData, waitForSelector: e.target.value })}
                    placeholder=".app-content"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="profile-enabled"
                  checked={formData.enabled}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, enabled: Boolean(checked) })
                  }
                />
                <Label htmlFor="profile-enabled">Enabled</Label>
              </div>

              <div className="space-y-2">
                <Label htmlFor="profile-notes">Notes</Label>
                <Input
                  id="profile-notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Optional notes"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="submit" size="sm">
                  {editingId ? 'Update Profile' : 'Save Profile'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowForm(false);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading profiles…</p>
          ) : profiles.length === 0 ? (
            <p className="text-sm text-muted-foreground">No site profiles saved yet.</p>
          ) : (
            <div className="space-y-3">
              {profiles.map((profile) => (
                <div key={profile.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-medium">{profile.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {profile.domain} · {profile.enabled ? 'Enabled' : 'Disabled'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Timeout: {profile.timeouts?.extraction ?? 'default'} ms · Stability: {profile.timeouts?.stability ?? 'default'} ms
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleEdit(profile)}>
                      <Edit2 className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleDelete(profile.id)}>
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
