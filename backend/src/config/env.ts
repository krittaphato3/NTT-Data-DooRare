import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: Number(process.env.PORT || 3001),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || (process.env.DB_HOST === 'db' ? 5432 : 5442)),
    database: process.env.DB_NAME || 'doorare',
    user: process.env.DB_USER || 'doorare',
    password: process.env.DB_PASSWORD || 'doorare_dev',
  },
  security: {
    masterPassword: process.env.MASTER_PASSWORD || 'doorare123',
    demoOtp: process.env.DEMO_OTP || '123456',
    idleTimeoutMinutes: 30, // SEC-001
  },
};
