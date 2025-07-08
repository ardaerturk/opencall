/**
 * Authentication modal component for login/register
 */

import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import styles from './AuthModal.module.css';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function AuthModal({ isOpen, onClose, onSuccess }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  
  const { login, register, isLoading } = useAuth();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!identity || !password) {
      setError('Please fill in all fields');
      return;
    }

    if (mode === 'register') {
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters long');
        return;
      }
    }

    // Submit
    const result = mode === 'login' 
      ? await login(identity, password)
      : await register(identity, password);

    if (result.success) {
      onSuccess?.();
      onClose();
      // Reset form
      setIdentity('');
      setPassword('');
      setConfirmPassword('');
    } else {
      setError(result.error || 'Authentication failed');
    }
  };

  const switchMode = () => {
    setMode(mode === 'login' ? 'register' : 'login');
    setError('');
    setPassword('');
    setConfirmPassword('');
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeButton} onClick={onClose}>×</button>
        
        <h2 className={styles.title}>
          {mode === 'login' ? 'Login to OpenCall' : 'Create Account'}
        </h2>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label htmlFor="identity">Email or Username</label>
            <input
              id="identity"
              type="text"
              value={identity}
              onChange={(e) => setIdentity(e.target.value)}
              placeholder="Enter email or username"
              disabled={isLoading}
              autoComplete={mode === 'login' ? 'username' : 'off'}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              disabled={isLoading}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>

          {mode === 'register' && (
            <div className={styles.field}>
              <label htmlFor="confirmPassword">Confirm Password</label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                disabled={isLoading}
                autoComplete="new-password"
              />
            </div>
          )}

          {error && (
            <div className={styles.error}>{error}</div>
          )}

          <button 
            type="submit" 
            className={styles.submitButton}
            disabled={isLoading}
          >
            {isLoading ? 'Processing...' : mode === 'login' ? 'Login' : 'Register'}
          </button>
        </form>

        <div className={styles.switchMode}>
          {mode === 'login' ? (
            <>
              Don't have an account?{' '}
              <button onClick={switchMode} disabled={isLoading}>
                Register
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button onClick={switchMode} disabled={isLoading}>
                Login
              </button>
            </>
          )}
        </div>

        <div className={styles.info}>
          <p>
            OpenCall uses zero-knowledge SRP authentication. Your password never leaves your device.
          </p>
        </div>
      </div>
    </div>
  );
}