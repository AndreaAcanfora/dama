// PM2 definition for the VPS. The bundle is plain JavaScript, so PM2 runs it with node directly.
module.exports = {
  apps: [
    {
      name: 'dama-ws',
      script: 'dist/server.mjs',
      cwd: __dirname,
      env: {
        PORT: '8787',
        HOST: '127.0.0.1',
        TRUST_PROXY: '1',
        ALLOWED_ORIGINS: 'https://andreaacanfora.github.io',
      },
      max_memory_restart: '150M',
    },
  ],
};
