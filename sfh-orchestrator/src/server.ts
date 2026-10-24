import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import type { ApiDeps } from './api/routes.js';
import { registerRoutes } from './api/routes.js';

export async function buildServer(deps: ApiDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: deps.cfg.NODE_ENV !== 'test' });

  // CORS para el portal (el navegador llama al API con otro origen en Cloud Run).
  const corsOrigin = deps.cfg.CORS_ORIGIN.trim();
  await app.register(cors, {
    origin: corsOrigin === '' || corsOrigin === 'false' ? false : corsOrigin.split(',').map((o: string) => o.trim()),
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    max: deps.cfg.RATE_LIMIT_MAX,
    timeWindow: deps.cfg.RATE_LIMIT_WINDOW_MS,
  });

  app.setErrorHandler((err, req, reply) => {
    req.log.error({ err }, 'unhandled_error');
    if (reply.sent) return;
    const status = (err as { statusCode?: number }).statusCode;
    reply.code(status && status >= 400 ? status : 500).send({ error: 'internal_error' });
  });

  await registerRoutes(app, deps);
  return app;
}
