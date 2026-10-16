import { startServer } from './server';

const env = process.env;
const server = await startServer({
  port: Number(env.PORT ?? 8787),
  host: env.HOST ?? '127.0.0.1',
  allowedOrigins: (env.ALLOWED_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean),
  trustProxy: env.TRUST_PROXY === '1',
  ...(env.MAX_ROOMS_PER_IP ? { maxRoomsPerIp: Number(env.MAX_ROOMS_PER_IP) } : {}),
});
console.log(JSON.stringify({ msg: 'boot', port: server.port, at: new Date().toISOString() }));

const stop = async () => {
  await server.close();
  process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
