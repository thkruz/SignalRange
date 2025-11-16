/**
 * Cloudflare Worker for SignalRange Multiplayer Sync
 *
 * This worker routes requests to Durable Objects (rooms) for real-time collaboration.
 * Each room is a Durable Object that maintains WebSocket connections and shared state.
 */

import { SignalRangeRoom } from './room';

export { SignalRangeRoom };

export interface Env {
  ROOM: DurableObjectNamespace;
  ALLOWED_ORIGINS?: string;
}

// CORS headers
function getCorsHeaders(env: Env, request: Request): HeadersInit {
  const origin = request.headers.get('Origin');
  const allowedOrigins = env.ALLOWED_ORIGINS?.split(',') || ['*'];

  if (allowedOrigins.includes('*') || (origin && allowedOrigins.includes(origin))) {
    return {
      'Access-Control-Allow-Origin': origin || '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Upgrade, Connection',
      'Access-Control-Max-Age': '86400',
    };
  }

  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Upgrade, Connection',
  };
}

function jsonResponse(data: any, status = 200, env: Env, request: Request): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...getCorsHeaders(env, request),
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: getCorsHeaders(env, request),
      });
    }

    // Health check
    if (url.pathname === '/health' || url.pathname === '/api/health') {
      return jsonResponse(
        {
          status: 'ok',
          timestamp: Date.now(),
          service: 'signalrange-multiplayer',
        },
        200,
        env,
        request
      );
    }

    // Extract room ID from path or query parameter
    // Formats supported:
    // - /room/ROOM_ID/...
    // - /api/room/ROOM_ID/...
    // - ?roomId=ROOM_ID
    let roomId: string | null = null;

    const roomIdParam = url.searchParams.get('roomId') || url.searchParams.get('room');
    if (roomIdParam) {
      roomId = roomIdParam;
    } else {
      const pathMatch = url.pathname.match(/\/(?:api\/)?room\/([^\/]+)/);
      if (pathMatch) {
        roomId = pathMatch[1];
      }
    }

    // Default room if none specified
    if (!roomId) {
      roomId = 'default';
    }

    // Get the Durable Object for this room
    const id = env.ROOM.idFromName(roomId);
    const room = env.ROOM.get(id);

    // Forward the request to the Durable Object
    // Preserve the original URL path for the DO to handle
    const roomUrl = new URL(request.url);

    // Clean up the path for the DO (remove /room/ROOM_ID prefix if present)
    let doPath = roomUrl.pathname;
    doPath = doPath.replace(/^\/api\/room\/[^\/]+/, '');
    doPath = doPath.replace(/^\/room\/[^\/]+/, '');
    if (!doPath || doPath === '/') {
      doPath = '/state';
    }
    roomUrl.pathname = doPath;

    // Add roomId to query params for the DO
    roomUrl.searchParams.set('roomId', roomId);

    // Create new request for the DO
    const doRequest = new Request(roomUrl.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.body,
    });

    return room.fetch(doRequest);
  },
};
