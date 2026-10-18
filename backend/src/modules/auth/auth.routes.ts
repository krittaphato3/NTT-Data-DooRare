import { Router } from 'express';
import { authController } from './auth.controller.js';

export const authRouter = Router();

authRouter.post('/login', authController.login);
authRouter.post('/logout', authController.logout);
authRouter.get('/role-accounts', authController.getRoleAccounts);
authRouter.get('/recent-logins', authController.getRecentLogins);
