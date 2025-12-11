/*
 * WebSocketContext.jsx - Shared WebSocket Provider
 *
 * Manages a single WebSocket connection at the App level that can be
 * shared across components. Supports message subscription by type.
 */

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

const WebSocketContext = createContext(null);

export function WebSocketProvider({ children }) {
  const [ws, setWs] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const subscribersRef = useRef(new Map()); // Map<messageType, Set<callback>>
  const reconnectTimeoutRef = useRef(null);
  const wsRef = useRef(null);

  useEffect(() => {
    const connect = () => {
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
        // Don't clear ws or wsRef - they'll be replaced on reconnect
        // This prevents race conditions where components try to send during reconnect window
        // Reconnect after delay
        reconnectTimeoutRef.current = setTimeout(connect, 3000);
      };

      socket.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
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
  }, []);

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
    <WebSocketContext.Provider value={{ ws, isConnected, sendMessage, subscribe, unsubscribe }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export const useWebSocket = () => useContext(WebSocketContext);
