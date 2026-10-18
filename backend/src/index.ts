import { app } from './app.js';
import { config } from './config/env.js';

const server = app.listen(config.port, () => {
  console.log(`[DooRare Backend] Server running on http://0.0.0.0:${config.port}`);
  console.log(`[DooRare Backend] Connecting to Postgres at ${config.db.host}:${config.db.port}/${config.db.database}`);
});

process.on('SIGTERM', () => {
  console.log('[DooRare Backend] SIGTERM received, shutting down gracefully...');
  server.close(() => {
    process.exit(0);
  });
});
