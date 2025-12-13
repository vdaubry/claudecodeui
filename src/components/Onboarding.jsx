import React, { useState, useEffect } from 'react';
import { Check, Loader2 } from 'lucide-react';
import ClaudeLogo from './ClaudeLogo';
import { authenticatedFetch } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';

const Onboarding = ({ onComplete }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [claudeAuthStatus, setClaudeAuthStatus] = useState({
    authenticated: false,
    email: null,
    loading: true,
    error: null
  });

  const { user } = useAuth();

  // Check authentication status on mount
  useEffect(() => {
    checkClaudeAuthStatus();
  }, []);

  const checkClaudeAuthStatus = async () => {
    try {
      const response = await authenticatedFetch('/api/cli/claude/status');
      if (response.ok) {
        const data = await response.json();
        setClaudeAuthStatus({
          authenticated: data.authenticated,
          email: data.email,
          loading: false,
          error: data.error || null
        });
      } else {
        setClaudeAuthStatus({
          authenticated: false,
          email: null,
          loading: false,
          error: 'Failed to check authentication status'
        });
      }
    } catch (error) {
      console.error('Error checking Claude auth status:', error);
      setClaudeAuthStatus({
        authenticated: false,
        email: null,
        loading: false,
        error: error.message
      });
    }
  };

  const handleFinish = async () => {
    setIsSubmitting(true);
    setError('');

    try {
      // Mark onboarding as complete
      const response = await authenticatedFetch('/api/user/complete-onboarding', {
        method: 'POST'
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to complete onboarding');
      }

      // Call the onComplete callback
      if (onComplete) {
        onComplete();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Main Card */}
        <div className="bg-card rounded-lg shadow-lg border border-border p-8">
          <div className="space-y-6">
            <div className="text-center mb-8">
              <div className="w-20 h-20 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <ClaudeLogo size={40} />
              </div>
              <h2 className="text-2xl font-bold text-foreground mb-2">Welcome to Claude Code UI</h2>
              <p className="text-muted-foreground">
                Your AI-powered coding assistant is ready to help
              </p>
            </div>

            {/* Auth Status Card */}
            <div className="border border-border rounded-lg p-6 bg-card">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${
                    claudeAuthStatus.loading ? 'bg-gray-400 animate-pulse' :
                    claudeAuthStatus.authenticated ? 'bg-green-500' : 'bg-yellow-500'
                  }`} />
                  <span className="font-medium text-foreground">
                    {claudeAuthStatus.loading ? 'Checking Claude CLI...' :
                     claudeAuthStatus.authenticated ? 'Claude CLI Connected' : 'Claude CLI Not Configured'}
                  </span>
                </div>
                {claudeAuthStatus.authenticated && (
                  <Check className="w-5 h-5 text-green-500" />
                )}
              </div>

              {claudeAuthStatus.authenticated && claudeAuthStatus.email && (
                <p className="text-sm text-muted-foreground">
                  Signed in as: <span className="text-foreground font-medium">{claudeAuthStatus.email}</span>
                </p>
              )}

              {!claudeAuthStatus.authenticated && !claudeAuthStatus.loading && (
                <div className="text-sm text-muted-foreground">
                  <p className="mb-2">To use Claude Code, run this in your terminal:</p>
                  <code className="block bg-muted px-3 py-2 rounded text-xs">claude auth login</code>
                </div>
              )}
            </div>

            <div className="text-center text-sm text-muted-foreground">
              <p>You can configure Claude CLI authentication anytime from Settings.</p>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mt-6 p-4 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Complete Button */}
          <div className="flex items-center justify-center mt-8 pt-6 border-t border-border">
            <button
              onClick={handleFinish}
              disabled={isSubmitting}
              className="flex items-center gap-2 px-8 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors duration-200"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Setting up...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Get Started
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
