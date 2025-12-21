/**
 * useAuthToken.js - Hook for preserving auth token in URLs
 *
 * Manages the ?token= parameter across navigation:
 * - Reads token from URL or localStorage
 * - Provides helper to append token to navigation URLs
 * - Ensures token is preserved for deep linking
 */

import { useSearchParams } from 'react-router-dom';
import { useCallback, useMemo } from 'react';

export function useAuthToken() {
  const [searchParams] = useSearchParams();

  // Get token from URL if present
  const urlToken = searchParams.get('token');

  // Check if we should preserve token in navigation
  // We preserve it if it was provided via URL and matches stored token
  const shouldPreserveToken = useMemo(() => {
    if (!urlToken) return false;
    const storedToken = localStorage.getItem('auth-token');
    return urlToken === storedToken;
  }, [urlToken]);

  // Get token parameter string for appending to URLs
  const getTokenParam = useCallback(() => {
    if (shouldPreserveToken && urlToken) {
      return `?token=${urlToken}`;
    }
    return '';
  }, [shouldPreserveToken, urlToken]);

  // Append token to a path if needed
  const appendTokenToPath = useCallback((path) => {
    const tokenParam = getTokenParam();
    if (!tokenParam) return path;

    // Handle paths that already have query params
    if (path.includes('?')) {
      return `${path}&token=${urlToken}`;
    }
    return `${path}${tokenParam}`;
  }, [getTokenParam, urlToken]);

  return {
    getTokenParam,
    appendTokenToPath,
    hasUrlToken: !!urlToken,
    urlToken
  };
}

export default useAuthToken;
