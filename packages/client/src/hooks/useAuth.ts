/**
 * React hook for authentication
 */

import { useState, useEffect, useCallback } from 'react';
import { getAuthService } from '../services/auth/authService';

export interface AuthState {
  isAuthenticated: boolean;
  identity: string | null;
  isLoading: boolean;
  error: string | null;
}

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    identity: null,
    isLoading: true,
    error: null,
  });

  const authService = getAuthService();

  // Check authentication status on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = useCallback(async () => {
    try {
      setAuthState(prev => ({ ...prev, isLoading: true, error: null }));
      
      const user = await authService.getCurrentUser();
      
      if (user.error) {
        setAuthState({
          isAuthenticated: false,
          identity: null,
          isLoading: false,
          error: user.error,
        });
      } else {
        setAuthState({
          isAuthenticated: user.authenticated,
          identity: user.identity || null,
          isLoading: false,
          error: null,
        });
      }
    } catch (error) {
      setAuthState({
        isAuthenticated: false,
        identity: null,
        isLoading: false,
        error: 'Failed to check authentication status',
      });
    }
  }, [authService]);

  const login = useCallback(async (identity: string, password: string) => {
    try {
      setAuthState(prev => ({ ...prev, isLoading: true, error: null }));
      
      const result = await authService.authenticate(identity, password);
      
      if (result.success) {
        setAuthState({
          isAuthenticated: true,
          identity,
          isLoading: false,
          error: null,
        });
        return { success: true };
      } else {
        setAuthState(prev => ({
          ...prev,
          isLoading: false,
          error: result.error || 'Authentication failed',
        }));
        return { success: false, error: result.error };
      }
    } catch (error) {
      const errorMessage = 'Network error during authentication';
      setAuthState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
      return { success: false, error: errorMessage };
    }
  }, [authService]);

  const register = useCallback(async (identity: string, password: string) => {
    try {
      setAuthState(prev => ({ ...prev, isLoading: true, error: null }));
      
      const result = await authService.register(identity, password);
      
      if (result.success) {
        // Auto-login after successful registration
        return await login(identity, password);
      } else {
        setAuthState(prev => ({
          ...prev,
          isLoading: false,
          error: result.error || 'Registration failed',
        }));
        return { success: false, error: result.error };
      }
    } catch (error) {
      const errorMessage = 'Network error during registration';
      setAuthState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
      return { success: false, error: errorMessage };
    }
  }, [authService, login]);

  const logout = useCallback(async () => {
    try {
      setAuthState(prev => ({ ...prev, isLoading: true, error: null }));
      
      await authService.logout();
      
      setAuthState({
        isAuthenticated: false,
        identity: null,
        isLoading: false,
        error: null,
      });
      
      // Refresh to get new ephemeral identity
      await checkAuth();
    } catch (error) {
      setAuthState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Failed to logout',
      }));
    }
  }, [authService, checkAuth]);

  const getSessionKey = useCallback(() => {
    return authService.getSessionKey();
  }, [authService]);

  return {
    ...authState,
    login,
    register,
    logout,
    checkAuth,
    getSessionKey,
  };
}