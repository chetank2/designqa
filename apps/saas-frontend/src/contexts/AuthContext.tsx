import { createContext, useContext, ReactNode } from 'react';

interface LocalUser {
  id: string;
  email: string | null;
  name: string;
}

interface AuthContextType {
  user: LocalUser;
  session: null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: { message: string } | null }>;
  signUp: (email: string, password: string) => Promise<{ error: { message: string } | null }>;
  signOut: () => Promise<void>;
  resetPassword: () => Promise<{ error: null }>;
}

const defaultUser: LocalUser = {
  id: 'local-user',
  email: null,
  name: 'Local Designer'
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const value: AuthContextType = {
    user: defaultUser,
    session: null,
    loading: false,
    signIn: async (email: string, password: string) => ({ error: null }),
    signUp: async (email: string, password: string) => ({ error: null }),
    signOut: async () => Promise.resolve(),
    resetPassword: async () => ({ error: null })
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
