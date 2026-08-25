'use client';

import { RealtimeEvent } from '@restaurant-os/types';
import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { WS_BASE } from '@/lib/api-client';

/**
 * Payloads arrive as `unknown`; a handler that needs fields casts to the
 * matching payload type from `@restaurant-os/types` at the call site.
 */
export type RealtimeHandler = (payload: unknown) => void;

type Handlers = Partial<Record<RealtimeEvent | string, RealtimeHandler>>;

export type ConnectionState = 'connecting' | 'live' | 'offline';

interface UseRealtimeOptions {
  /** Staff access token, or a customer order tracking token - never both. */
  token?: string | null;
  trackingToken?: string | null;
  handlers: Handlers;
  enabled?: boolean;
}

/**
 * Subscribes to the realtime feed.
 *
 * Handlers are held in a ref so a parent re-render never tears the socket down
 * and reconnects it. The returned state drives the "live / reconnecting"
 * indicator, and callers fall back to query polling while it is not `live`.
 */
export function useRealtime({
  token,
  trackingToken,
  handlers,
  enabled = true,
}: UseRealtimeOptions): ConnectionState {
  const [state, setState] = useState<ConnectionState>('connecting');
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const credential = trackingToken ?? token ?? null;

  useEffect(() => {
    if (!enabled || !credential) {
      setState('offline');
      return;
    }

    const socket: Socket = io(`${WS_BASE}/realtime`, {
      auth: trackingToken ? { trackingToken } : { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
      timeout: 8000,
    });

    socket.on('connected', () => setState('live'));
    socket.on('disconnect', () => setState('connecting'));
    socket.on('connect_error', () => setState('offline'));
    socket.on('unauthorized', () => setState('offline'));

    const eventNames = Object.values(RealtimeEvent) as string[];
    for (const name of eventNames) {
      socket.on(name, (payload: unknown) => {
        handlersRef.current[name]?.(payload);
      });
    }

    return () => {
      socket.removeAllListeners();
      socket.close();
    };
  }, [credential, token, trackingToken, enabled]);

  return state;
}
