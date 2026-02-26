import { randomUUID } from 'crypto';
import { EventStore } from './store';
import { SessionLogger } from './logger';
import { normalizeHookPayload } from './normalizer';

export interface ServerOptions {
  port: number;
  devMode: boolean;
  webDistPath?: string;
}

export async function createServer(options: ServerOptions) {
  const sessionId = randomUUID();
  const store = new EventStore(sessionId);
  const logger = new SessionLogger(sessionId);
  await logger.init();

  const clients = new Set<{ send(data: string): void }>();

  function broadcast(data: unknown): void {
    const str = JSON.stringify(data);
    for (const client of clients) client.send(str);
  }

  const server = Bun.serve({
    port: options.port,
    async fetch(req, server) {
      const url = new URL(req.url);

      if (server.upgrade(req)) return undefined;

      if (url.pathname === '/health') return new Response('ok');

      if (url.pathname === '/stats') return Response.json(store.getStats());

      if (url.pathname === '/events') return Response.json(store.getAll());

      if (url.pathname === '/event' && req.method === 'POST') {
        let payload: Record<string, unknown>;
        try {
          payload = await req.json() as Record<string, unknown>;
        } catch {
          return new Response('invalid json', { status: 400 });
        }
        const agentId = (payload.agent_id as string) ?? 'agent-0';
        const event = normalizeHookPayload(payload, agentId);
        if (event) {
          store.add(event);
          logger.write(event);
          broadcast(event);
        }
        return new Response('ok');
      }

      // Serve built web app in production
      if (options.webDistPath) {
        const filePath = url.pathname === '/' ? '/index.html' : url.pathname;
        const file = Bun.file(options.webDistPath + filePath);
        if (await file.exists()) return new Response(file);
      }

      return new Response('not found', { status: 404 });
    },
    websocket: {
      open(ws) {
        clients.add(ws);
        ws.send(JSON.stringify({ type: 'snapshot', events: store.getAll(), stats: store.getStats() }));
      },
      close(ws) { clients.delete(ws); },
      message() {},
    },
  });

  return server;
}
