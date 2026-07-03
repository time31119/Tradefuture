import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { getDb } from './db.js';

// JWT secret key (should be stored in environment variable in production)
const JWT_SECRET = process.env.JWT_SECRET || 'tradefuture-secret-key-change-in-production';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        address: string;
        userId: number;
      };
    }
  }
}

// Authentication middleware
export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { address: string; userId: number };
    
    // Verify user exists in database
    const user = getDb().prepare('SELECT id, address FROM users WHERE id = ?').get(decoded.userId) as any;
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = {
      address: user.address,
      userId: user.id
    };

    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Generate JWT token
export const generateToken = (address: string, userId: number): string => {
  return jwt.sign(
    { address: address.toLowerCase(), userId },
    JWT_SECRET,
    { expiresIn: '7d' } // Token expires in 7 days
  );
};

// Optional authentication (doesn't block if no token)
export const optionalAuth = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { address: string; userId: number };
    
    const user = getDb().prepare('SELECT id, address FROM users WHERE id = ?').get(decoded.userId) as any;
    
    if (user) {
      req.user = {
        address: user.address,
        userId: user.id
      };
    }
  } catch (error) {
    // Token is invalid, but we don't block the request
  }

  next();
};
