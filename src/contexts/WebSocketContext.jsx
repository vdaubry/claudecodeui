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

  useEffect(() => {
    const connect = () => {
      setConnectionState(reconnectAttemptRef.current > 0 ? 'reconnecting' : 'connecting');

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
        console.log('[WebSocket] Connected');
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
        console.log('[WebSocket] Disconnected');
        setIsConnected(false);

        // Notify all disconnect subscribers immediately
        notifyDisconnect();

        // Check if we've exceeded max attempts
        if (reconnectAttemptRef.current >= MAX_ATTEMPTS) {
          console.log('[WebSocket] Max reconnection attempts reached');
          setConnectionState('failed');
          return; // Stop trying, user must manually reconnect
        }

        // Calculate backoff delay with jitter
        const delay = calculateBackoff(reconnectAttemptRef.current);
        reconnectAttemptRef.current++;

        console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${reconnectAttemptRef.current}/${MAX_ATTEMPTS})`);
        setConnectionState('reconnecting');

        reconnectTimeoutRef.current = setTimeout(connect, delay);
      };

      socket.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
        // Also notify disconnect on error as connection may be dead
        notifyDisconnect();
      };

      setWs(socket);
      wsRef.current = socket;
    };

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      // Only close if the socket is open (not connecting or already closed)
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
    };
  }, [notifyDisconnect]);

  // Manual reconnect function - resets attempt counter and starts fresh
  const manualReconnect = useCallback(() => {
    // Clear any pending reconnect
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Close existing socket if any
    if (wsRef.current?.readyState === WebSocket.OPEN ||
        wsRef.current?.readyState === WebSocket.CONNECTING) {
      wsRef.current.close();
    }

    // Reset attempt counter
    reconnectAttemptRef.current = 0;
    setConnectionState('connecting');

    // Trigger reconnect via effect by updating a dependency
    // We need to create the connection directly here
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
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
      console.log('[WebSocket] Connected (manual reconnect)');
      reconnectAttemptRef.current = 0;
      setConnectionState('connected');
      setIsConnected(true);
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        const callbacks = subscribersRef.current.get(message.type);
        callbacks?.forEach(cb => cb(message));
      } catch (e) {
        console.error('[WebSocket] Failed to parse message:', e);
      }
    };

    socket.onclose = () => {
      console.log('[WebSocket] Disconnected');
      setIsConnected(false);
      notifyDisconnect();

      if (reconnectAttemptRef.current >= MAX_ATTEMPTS) {
        setConnectionState('failed');
        return;
      }

      const delay = calculateBackoff(reconnectAttemptRef.current);
      reconnectAttemptRef.current++;
      console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${reconnectAttemptRef.current}/${MAX_ATTEMPTS})`);
      setConnectionState('reconnecting');

      // Use a simple inline function for reconnect
      const reconnect = () => {
        const newSocket = new WebSocket(wsUrl);
        newSocket.onopen = socket.onopen;
        newSocket.onmessage = socket.onmessage;
        newSocket.onclose = socket.onclose;
        newSocket.onerror = socket.onerror;
        setWs(newSocket);
        wsRef.current = newSocket;
      };

      reconnectTimeoutRef.current = setTimeout(reconnect, delay);
    };

    socket.onerror = (error) => {
      console.error('[WebSocket] Error:', error);
      notifyDisconnect();
    };

    setWs(socket);
    wsRef.current = socket;
  }, [notifyDisconnect]);

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
