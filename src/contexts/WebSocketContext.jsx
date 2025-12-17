/*
 * WebSocketContext.jsx - Shared WebSocket Provider
 *
 * Manages a single WebSocket connection at the App level that can be
 * shared across components. Supports message subscription by type.
 *
 * Features:
 * - Exponential backoff reconnection with jitter
 * - Connection state tracking (connecting, connected, reconnecting, failed)
 * - Manual reconnect capability
 * - Disconnect notification callbacks
 */

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

const WebSocketContext = createContext(null);

// Reconnection constants
const BASE_DELAY = 1000;      // 1 second
const MAX_DELAY = 30000;      // 30 seconds
const MAX_ATTEMPTS = 10;

// Calculate exponential backoff delay with jitter
function calculateBackoff(attempt) {
  const delay = Math.min(BASE_DELAY * Math.pow(2, attempt), MAX_DELAY);
  const jitter = delay * 0.1 * (Math.random() - 0.5) * 2;
  return Math.floor(delay + jitter);
}

export function WebSocketProvider({ children }) {
  const [ws, setWs] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState('disconnected');
  // Connection states: 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'failed'

  const subscribersRef = useRef(new Map()); // Map<messageType, Set<callback>>
  const reconnectTimeoutRef = useRef(null);
  const wsRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const onDisconnectCallbacksRef = useRef(new Set());
  const shouldReconnectRef = useRef(true); // Prevents scheduling reconnects during intentional closes
  const logPrefix = '[WebSocket]';

  const logDebug = useCallback((msg, extra = {}) => {
    // Keep logs concise and only emit when useful
    const parts = [logPrefix, msg];
    const keys = Object.keys(extra);
    if (keys.length) {
      parts.push(JSON.stringify(extra));
    }
    console.log(parts.join(' '));
  }, []);

  // Subscribe to disconnect events
  const onDisconnect = useCallback((callback) => {
    onDisconnectCallbacksRef.current.add(callback);
    return () => onDisconnectCallbacksRef.current.delete(callback);
  }, []);

  // Notify all disconnect subscribers
  const notifyDisconnect = useCallback(() => {
    onDisconnectCallbacksRef.current.forEach(cb => {
      try {
        cb();
      } catch (e) {
        console.error('[WebSocket] Error in disconnect callback:', e);
      }
    });
  }, []);

  // Core connect function used for both auto- and manual reconnects
  const connect = useCallback((options = {}) => {
    const { resetAttempts = false } = options;

    // Clear any pending reconnects before starting a new connection
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (resetAttempts) {
      reconnectAttemptRef.current = 0;
    }

    // Allow future reconnect scheduling for this connection
    shouldReconnectRef.current = true;

    setConnectionState(reconnectAttemptRef.current > 0 ? 'reconnecting' : 'connecting');
    logDebug('connect start', { attempt: reconnectAttemptRef.current + 1 });

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

    // IMPORTANT: Preserve auth token logic from existing ChatInterface
    const isPlatform = import.meta.env.VITE_IS_PLATFORM === 'true';
    let wsUrl = `${protocol}//${window.location.host}/ws`;
    if (!isPlatform) {
      const token = localStorage.getItem('auth-token');
      if (token) {
        wsUrl += `?token=${encodeURIComponent(token)}`;
      }
    }

    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      logDebug('connected');
      reconnectAttemptRef.current = 0; // Reset on successful connection
      setConnectionState('connected');
      setIsConnected(true);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        // Route to all subscribers for this message type
        const callbacks = subscribersRef.current.get(message.type);
        callbacks?.forEach(cb => cb(message));
      } catch (e) {
        console.error('[WebSocket] Failed to parse message:', e);
      }
    };

    socket.onclose = () => {
      // Ignore stale sockets that have already been replaced
      if (wsRef.current !== socket) {
        logDebug('stale socket close ignored');
        return;
      }

      logDebug('disconnected');
      setIsConnected(false);

      // Notify all disconnect subscribers immediately
      notifyDisconnect();

      // If we intentionally closed, do not schedule reconnect
      if (!shouldReconnectRef.current) {
        setConnectionState('disconnected');
        return;
      }

      // Check if we've exceeded max attempts
      if (reconnectAttemptRef.current >= MAX_ATTEMPTS) {
        console.log('[WebSocket] Max reconnection attempts reached');
        setConnectionState('failed');
        return; // Stop trying, user must manually reconnect
      }

      // Calculate backoff delay with jitter
        const delay = calculateBackoff(reconnectAttemptRef.current);
        reconnectAttemptRef.current++;

        logDebug('scheduling reconnect', {
          delay,
          attempt: reconnectAttemptRef.current,
          max: MAX_ATTEMPTS
        });
        setConnectionState('reconnecting');

        reconnectTimeoutRef.current = setTimeout(() => connect(), delay);
      };

    socket.onerror = (error) => {
      // Ignore stale sockets that have already been replaced
      if (wsRef.current !== socket) {
        logDebug('stale socket error ignored');
        return;
      }

      console.error(`${logPrefix} Error:`, error);
      // Also notify disconnect on error as connection may be dead
      notifyDisconnect();
    };

    setWs(socket);
    wsRef.current = socket;
  }, [notifyDisconnect]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      // Prevent scheduling reconnects after unmount
      shouldReconnectRef.current = false;
      // Close any existing socket to avoid stray reconnects
      if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  // Manual reconnect function - resets attempt counter and starts fresh
  const manualReconnect = useCallback(() => {
    logDebug('manual reconnect requested');

    // Clear any pending reconnect
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Prevent the close handler from scheduling a reconnect for this socket
    shouldReconnectRef.current = false;
    // Reflect the fact that we're no longer connected while we attempt a fresh connection
    setIsConnected(false);

    // Close existing socket if any
    if (wsRef.current?.readyState !== WebSocket.CLOSED &&
        wsRef.current?.readyState !== WebSocket.CLOSING) {
      wsRef.current.close();
    }

    // Start a fresh connection with reset attempts
    connect({ resetAttempts: true });
  }, [connect]);

  const sendMessage = useCallback((type, data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, ...data }));
      return true;
    } else {
      console.warn('[WebSocket] Cannot send, not connected. ReadyState:', wsRef.current?.readyState);
      // Sync the isConnected state if it's out of sync
      setIsConnected(false);
      return false;
    }
  }, []);

  const subscribe = useCallback((type, callback) => {
    if (!subscribersRef.current.has(type)) {
      subscribersRef.current.set(type, new Set());
    }
    subscribersRef.current.get(type).add(callback);
  }, []);

  const unsubscribe = useCallback((type, callback) => {
    subscribersRef.current.get(type)?.delete(callback);
  }, []);

  return (
    <WebSocketContext.Provider value={{
      ws,
      isConnected,
      connectionState,
      sendMessage,
      subscribe,
      unsubscribe,
      manualReconnect,
      onDisconnect
    }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export const useWebSocket = () => useContext(WebSocketContext);
