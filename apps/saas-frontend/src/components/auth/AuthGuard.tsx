/**
 * AuthGuard Component
 * Protects routes that require authentication
 * Redirects to sign-in when user is not authenticated
 */

import { ReactNode } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import SignInForm from './SignInForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Shield } from 'lucide-react';

interface AuthGuardProps {
    children: ReactNode;
    /**
     * If true, shows a loading spinner while checking auth state
     * If false, immediately shows children (useful for SSR)
     */
    showLoading?: boolean;
    /**
     * Custom fallback component to show when not authenticated
     * Defaults to SignInForm
     */
    fallback?: ReactNode;
    /**
     * If true, allows unauthenticated access (for optional auth features)
     */
    optional?: boolean;
}

export default function AuthGuard({
    children,
    showLoading = true,
    fallback,
    optional = false
}: AuthGuardProps) {
    const { user, loading } = useAuth();

    // Show loading state while checking auth
    if (loading && showLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-center space-y-4">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                    <p className="text-muted-foreground">Checking authentication...</p>
                </div>
            </div>
        );
    }

    // If optional auth, always show children
    if (optional) {
        return <>{children}</>;
    }

    // If authenticated, show protected content
    if (user) {
        return <>{children}</>;
    }

    // Not authenticated - show fallback or sign-in form
    if (fallback) {
        return <>{fallback}</>;
    }

    return (
        <div className="flex items-center justify-center min-h-[400px] p-4">
            <div className="w-full max-w-md space-y-6">
                <Card>
                    <CardHeader className="text-center">
                        <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                            <Shield className="h-6 w-6 text-primary" />
                        </div>
                        <CardTitle>Authentication Required</CardTitle>
                        <CardDescription>
                            Please sign in to access this feature
                        </CardDescription>
                    </CardHeader>
                </Card>

                <SignInForm />
            </div>
        </div>
    );
}

/**
 * HOC version of AuthGuard for protecting components
 */
export function withAuth<P extends object>(
    WrappedComponent: React.ComponentType<P>,
    options?: Omit<AuthGuardProps, 'children'>
) {
    return function WithAuthComponent(props: P) {
        return (
            <AuthGuard {...options}>
                <WrappedComponent {...props} />
            </AuthGuard>
        );
    };
}
