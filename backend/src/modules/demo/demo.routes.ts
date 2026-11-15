import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { DemoService } from './demo.service.js';
import { demoToolsGuard, runSeedScript } from './demo.runner.js';

export const demoRouter = Router();
demoRouter.use(demoToolsGuard);

// GET /api/v1/demo/stats - Live database statistics
demoRouter.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const stats = await DemoService.getStats();
    res.json({ success: true, data: stats });
  }),
);

// POST /api/v1/demo/seed - Complete demo seed (F1 + F2)
demoRouter.post(
  '/seed',
  asyncHandler(async (_req, res) => {
    const result = await runSeedScript('f2,f1', 'สร้างชุดข้อมูลจำลอง F1 + F2');
    res.json(result);
  }),
);

// POST /api/v1/demo/f2 - Seed near-expiry lots only
demoRouter.post(
  '/f2',
  asyncHandler(async (_req, res) => {
    const result = await runSeedScript('f2', 'สร้างยาใกล้หมดอายุ F2');
    res.json(result);
  }),
);

// POST /api/v1/demo/scenarios - Seed 4-role operational tasks
demoRouter.post(
  '/scenarios',
  asyncHandler(async (_req, res) => {
    const result = await DemoService.seedScenarios();
    res.json(result);
  }),
);

// POST /api/v1/demo/networks - Toggle network partitioning
demoRouter.post(
  '/networks',
  asyncHandler(async (req, res) => {
    const split = Boolean(req.body?.split);
    const result = await DemoService.toggleNetworks(split);
    res.json(result);
  }),
);

// POST /api/v1/demo/clean - Clean demo lots and records
demoRouter.post(
  '/clean',
  asyncHandler(async (_req, res) => {
    const result = await DemoService.cleanDemoData();
    res.json(result);
  }),
);
