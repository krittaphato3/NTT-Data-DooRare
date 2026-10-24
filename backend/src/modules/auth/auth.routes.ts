import { Router } from 'express';
import { authController } from './auth.controller.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';

export const authRouter = Router();

authRouter.post('/login', authController.login);
authRouter.post('/cognito', authController.cognitoLogin);
authRouter.post('/logout', authController.logout);
authRouter.get('/role-accounts', authController.getRoleAccounts);
authRouter.get(
  '/recent-logins',
  requireAuth,
  requireRole('HOSPITAL_ADMIN', 'SYSTEM_ADMIN', 'REGION_ADMIN', 'AUDITOR'),
  authController.getRecentLogins,
);
