/**
 * SignalRange Room - Durable Object
 *
 * Each room is a Durable Object that:
 * - Maintains WebSocket connections to all clients in the room
 * - Stores the current shared equipment state in memory
 * - Broadcasts state changes to all connected clients in real-time
 * - Handles client join/leave events
 */

export interface Env {
  ROOM: DurableObjectNamespace;
}

interface WebSocketClient {
  ws: WebSocket;
  clientId: string;
  joinedAt: number;
}

interface BroadcastMessage {
  type: 'state_update' | 'client_joined' | 'client_left' | 'client_list';
  data: any;
  timestamp: number;
  senderId?: string;
}

export class SignalRangeRoom {
  private state: DurableObjectState;
  private env: Env;
  private clients: Map<WebSocket, WebSocketClient> = new Map();
  private currentState: any = null;
  private roomId: string;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.roomId = state.id.toString();

    // Accept WebSocket connections
    this.state.getWebSockets().forEach(ws => {
      // Restore WebSocket connections after hibernation
      const metadata = ws.deserializeAttachment() as WebSocketClient | null;
      if (metadata) {
        this.clients.set(ws, metadata);
      }
    });
  }

  /**
   * Handle HTTP requests and WebSocket upgrades
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Handle WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocketUpgrade(request);
    }

    // REST API endpoints for HTTP clients (fallback)
    if (url.pathname === '/state' && request.method === 'GET') {
      return this.handleGetState();
    }

    if (url.pathname === '/state' && request.method === 'POST') {
      return this.handlePostState(request);
    }

    if (url.pathname === '/clients' && request.method === 'GET') {
      return this.handleGetClients();
    }

    return new Response('Not found', { status: 404 });
  }

  /**
   * Handle WebSocket upgrade and client connection
   */
  private handleWebSocketUpgrade(request: Request): Response {
    const url = new URL(request.url);
    const clientId = url.searchParams.get('clientId') || crypto.randomUUID();

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Accept the WebSocket connection
    this.state.acceptWebSocket(server);

    const clientInfo: WebSocketClient = {
      ws: server,
      clientId,
      joinedAt: Date.now(),
    };

    this.clients.set(server, clientInfo);

    // Serialize client info for hibernation support
    server.serializeAttachment(clientInfo);

    // Send current state to new client
    if (this.currentState) {
      server.send(JSON.stringify({
        type: 'initial_state',
        data: this.currentState,
        timestamp: Date.now(),
      }));
    }

    // Send current client list to new client
    const clientList = this.getClientList();
    server.send(JSON.stringify({
      type: 'client_list',
      data: clientList,
      timestamp: Date.now(),
    }));

    // Notify other clients about new join
    this.broadcast({
      type: 'client_joined',
      data: { clientId, joinedAt: clientInfo.joinedAt },
      timestamp: Date.now(),
    }, server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    try {
      const clientInfo = this.clients.get(ws);
      if (!clientInfo) return;

      const data = typeof message === 'string' ? JSON.parse(message) : message;

      switch (data.type) {
        case 'state_update':
          // Update state and broadcast to all clients
          this.currentState = data.data;
          this.broadcast({
            type: 'state_update',
            data: this.currentState,
            timestamp: Date.now(),
            senderId: clientInfo.clientId,
          }, ws); // Exclude sender
          break;

        case 'ping':
          // Respond to ping to keep connection alive
          ws.send(JSON.stringify({
            type: 'pong',
            timestamp: Date.now(),
          }));
          break;

        case 'request_state':
          // Send current state to requesting client
          ws.send(JSON.stringify({
            type: 'current_state',
            data: this.currentState,
            timestamp: Date.now(),
          }));
          break;

        case 'request_clients':
          // Send client list to requesting client
          ws.send(JSON.stringify({
            type: 'client_list',
            data: this.getClientList(),
            timestamp: Date.now(),
          }));
          break;

        default:
          console.warn('Unknown message type:', data.type);
      }
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
    }
  }

  /**
   * Handle WebSocket close event
   */
  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    const clientInfo = this.clients.get(ws);
    if (clientInfo) {
      this.clients.delete(ws);

      // Notify other clients about disconnect
      this.broadcast({
        type: 'client_left',
        data: { clientId: clientInfo.clientId },
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Handle WebSocket error event
   */
  async webSocketError(ws: WebSocket, error: unknown) {
    console.error('WebSocket error:', error);
    const clientInfo = this.clients.get(ws);
    if (clientInfo) {
      this.clients.delete(ws);
    }
  }

  /**
   * Broadcast message to all clients (optionally excluding sender)
   */
  private broadcast(message: BroadcastMessage, exclude?: WebSocket) {
    const messageStr = JSON.stringify(message);

    for (const [ws, _] of this.clients) {
      if (ws !== exclude && ws.readyState === 1) { // 1 = OPEN
        try {
          ws.send(messageStr);
        } catch (error) {
          console.error('Error broadcasting to client:', error);
        }
      }
    }
  }

  /**
   * Get list of connected clients
   */
  private getClientList(): Array<{ clientId: string; joinedAt: number }> {
    return Array.from(this.clients.values()).map(client => ({
      clientId: client.clientId,
      joinedAt: client.joinedAt,
    }));
  }

  /**
   * HTTP: Get current state
   */
  private handleGetState(): Response {
    return new Response(JSON.stringify({
      state: this.currentState,
      clientCount: this.clients.size,
      timestamp: Date.now(),
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  /**
   * HTTP: Update state (for HTTP-only clients)
   */
  private async handlePostState(request: Request): Promise<Response> {
    try {
      const newState = await request.json();
      this.currentState = newState;

      // Broadcast to WebSocket clients
      this.broadcast({
        type: 'state_update',
        data: this.currentState,
        timestamp: Date.now(),
        senderId: 'http_client',
      });

      return new Response(JSON.stringify({
        success: true,
        clientCount: this.clients.size,
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  /**
   * HTTP: Get connected clients
   */
  private handleGetClients(): Response {
    return new Response(JSON.stringify({
      clients: this.getClientList(),
      count: this.clients.size,
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}
