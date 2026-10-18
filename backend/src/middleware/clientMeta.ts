import type { Request, Response, NextFunction } from 'express';

export interface ClientMeta {
  ip: string;
  device: string;
  browser: string;
  userAgent: string;
}

declare global {
  namespace Express {
    interface Request {
      clientMeta?: ClientMeta;
    }
  }
}

export function clientMetaMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const ua = req.headers['user-agent'] || '';
  const rawIp =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    '127.0.0.1';
  const cleanIp = rawIp.replace(/^::ffff:/, '');

  let browser = 'Chrome';
  if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Safari';
  else if (ua.includes('Firefox/')) browser = 'Firefox';

  let device = 'Windows PC';
  if (ua.includes('Macintosh')) device = 'MacBook';
  else if (ua.includes('iPhone')) device = 'iPhone';
  else if (ua.includes('iPad')) device = 'iPad';
  else if (ua.includes('Android')) device = 'Android';
  else if (ua.includes('Linux')) device = 'Linux PC';

  req.clientMeta = { ip: cleanIp, device, browser, userAgent: ua };
  next();
}
