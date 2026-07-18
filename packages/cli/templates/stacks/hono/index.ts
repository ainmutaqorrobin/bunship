import { Hono } from 'hono';

const app = new Hono();

app.get('/', (c) => c.text('Hello from Hono!'));
app.get('/health', (c) => c.json({ status: 'ok' }));

export default {
  port: Number(process.env.PORT ?? 3001),
  fetch: app.fetch,
};
