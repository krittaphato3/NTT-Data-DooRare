import express from 'express';
import cors from 'cors';
import { config } from './config/env.js';
import { clientMetaMiddleware } from './middleware/clientMeta.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { authController } from './modules/auth/auth.controller.js';
import { healthRouter } from './modules/health/health.routes.js';
import { forecastsRouter } from './modules/forecasts/forecasts.routes.js';
import { transportRouter, vehiclesRouter } from './modules/transport/transport.routes.js';

export const app = express();

app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(express.json());
app.use(clientMetaMiddleware);

// API v1 routes
app.use('/api/v1/health', healthRouter);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/forecasts', forecastsRouter); // API-F1a-001 / API-F1a-002 (read-only)
app.use('/api/v1/transport-tasks', transportRouter); // API-F2a-012
app.use('/api/v1/vehicles', vehiclesRouter);
app.get('/api/v1/me', authController.getMe); // API-PL-001

// Global error handler
app.use(errorHandler);
