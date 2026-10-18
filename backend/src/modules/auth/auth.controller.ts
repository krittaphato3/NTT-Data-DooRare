import type { Request, Response, NextFunction } from 'express';
import { authService, AuthService } from './auth.service.js';
import { scopeHospitalId } from '../../middleware/auth.js';

export class AuthController {
  constructor(private service: AuthService = authService) {}

  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.login(req.body, req.clientMeta);
      res.status(result.status).json(result);
    } catch (err) {
      next(err);
    }
  };

  getMe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.replace(/^Bearer\s+/i, '');
      const user = await this.service.getMe(token);

      if (!user) {
        res.status(401).json({
          ok: false,
          code: 'UNAUTHORIZED',
          title: 'ไม่ได้เข้าสู่ระบบหรือ Session หมดอายุ',
        });
        return;
      }

      res.status(200).json({ ok: true, user });
    } catch (err) {
      next(err);
    }
  };

  logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.replace(/^Bearer\s+/i, '');
      await this.service.logout(token);
      res.status(200).json({ ok: true, message: 'ออกจากระบบเรียบร้อยแล้ว' });
    } catch (err) {
      next(err);
    }
  };

  getRoleAccounts = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const accounts = await this.service.getRoleDemoAccounts();
      res.status(200).json({ ok: true, accounts });
    } catch (err) {
      next(err);
    }
  };

  getRecentLogins = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const limit = Number(req.query.limit || 25);
      // users bound to a hospital can only see their own hospital (SEC-002)
      const requested = typeof req.query.hospitalId === 'string' ? req.query.hospitalId : undefined;
      const hospitalId = scopeHospitalId(req) ?? requested;
      const data = await this.service.getRecentLogins(limit, hospitalId);
      res.status(200).json({ ok: true, ...data });
    } catch (err) {
      next(err);
    }
  };
}

export const authController = new AuthController();
