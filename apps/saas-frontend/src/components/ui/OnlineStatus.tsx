/**
 * Online Status Indicator
 * Simple component showing API connectivity status (SaaS mode)
 */

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { CircleIcon } from 'lucide-react';
import { getApiBaseUrl } from '@/config/ports';

interface OnlineStatusProps {
    className?: string;
    onStatusChange?: (status: 'online' | 'offline' | 'checking') => void;
}

export default function OnlineStatus({ className = '', onStatusChange }: OnlineStatusProps) {
    const [status, setStatus] = useState<'online' | 'offline' | 'checking'>('checking');

    useEffect(() => {
        const checkApiHealth = async () => {
            try {
                const apiBaseUrl = getApiBaseUrl();
                const response = await fetch(`${apiBaseUrl}/api/health`, {
                    method: 'GET',
                    headers: { 'Cache-Control': 'no-cache' },
                    signal: AbortSignal.timeout(5000)
                });

                const newStatus = response.ok ? 'online' : 'offline';
                setStatus(newStatus);
                onStatusChange?.(newStatus);
            } catch (error) {
                setStatus('offline');
                onStatusChange?.('offline');
            }
        };

        checkApiHealth();

        // Check every 30 seconds
        const interval = setInterval(checkApiHealth, 30000);
        return () => clearInterval(interval);
    }, [onStatusChange]);

    const statusConfig = {
        online: { color: 'bg-green-500', text: 'Online' },
        offline: { color: 'bg-red-500', text: 'Offline' },
        checking: { color: 'bg-yellow-500 animate-pulse', text: 'Checking...' }
    };

    const config = statusConfig[status];

    return (
        <div className={cn('flex items-center gap-2 text-sm', className)}>
            <div className={cn('w-2 h-2 rounded-full', config.color)} />
            <span className="text-muted-foreground">{config.text}</span>
        </div>
    );
}

/**
 * Check API health - simple utility function
 */
export async function checkApiHealth(): Promise<boolean> {
    try {
        const apiBaseUrl = getApiBaseUrl();
        console.log('[OnlineStatus] Checking API health at:', apiBaseUrl);
        const response = await fetch(`${apiBaseUrl}/api/health`, {
            method: 'GET',
            headers: { 'Cache-Control': 'no-cache' },
            signal: AbortSignal.timeout(5000)
        });
        console.log('[OnlineStatus] Health check response:', response.status);
        return response.ok;
    } catch (error) {
        console.warn('[OnlineStatus] Health check failed:', error);
        return false;
    }
}
