/**
 * Sign In Page
 * First page users see when authentication is required
 */

import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import SignInForm from '../components/auth/SignInForm';
import { Loader2 } from 'lucide-react';

export default function SignIn() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // If already authenticated, redirect to home
    if (!loading && user) {
      navigate('/', { replace: true });
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (user) {
    return null; // Will redirect via useEffect
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Welcome to DesignQA</h1>
          <p className="text-muted-foreground">
            Sign in to access your comparison tools and cloud storage
          </p>
        </div>
        <SignInForm onSuccess={() => navigate('/', { replace: true })} />
        <div className="text-center text-sm">
          <span className="text-muted-foreground">Don't have an account? </span>
          <Link to="/signup" className="text-primary hover:underline font-medium">
            Sign up
          </Link>
        </div>
      </div>
    </div>
  );
}
