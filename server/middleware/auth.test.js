import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  validateApiKey,
  authenticateToken,
  generateToken,
  authenticateWebSocket,
  JWT_SECRET
} from './auth.js';

// Mock the database module
vi.mock('../database/db.js', () => ({
  userDb: {
    getFirstUser: vi.fn(),
    getUserById: vi.fn()
  }
}));

import { userDb } from '../database/db.js';

describe('Auth Middleware', () => {
  const mockUser = { id: 1, username: 'testuser' };
  let originalEnv;

  beforeEach(() => {
    vi.clearAllMocks();
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('validateApiKey', () => {
    it('should call next() when API_KEY is not configured', () => {
      delete process.env.API_KEY;
      const req = { headers: {} };
      const res = {};
      const next = vi.fn();

      validateApiKey(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should call next() when valid API key is provided', () => {
      process.env.API_KEY = 'test-api-key';
      const req = { headers: { 'x-api-key': 'test-api-key' } };
      const res = {};
      const next = vi.fn();

      validateApiKey(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should return 401 when invalid API key is provided', () => {
      process.env.API_KEY = 'correct-key';
      const req = { headers: { 'x-api-key': 'wrong-key' } };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      validateApiKey(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid API key' });
    });
  });

  describe('authenticateToken', () => {
    it('should authenticate with valid JWT token', async () => {
      userDb.getUserById.mockReturnValue(mockUser);
      const token = jwt.sign({ userId: 1, username: 'testuser' }, JWT_SECRET);
      const req = {
        headers: { authorization: `Bearer ${token}` },
        query: {}
      };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      await authenticateToken(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toEqual(mockUser);
    });

    it('should authenticate with test token in query parameter', async () => {
      userDb.getFirstUser.mockReturnValue(mockUser);
      const req = {
        headers: {},
        query: { token: 'claude-ui-test-token-2024' }
      };
      const res = {};
      const next = vi.fn();

      await authenticateToken(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toEqual(mockUser);
    });

    it('should authenticate with test token in x-test-token header', async () => {
      userDb.getFirstUser.mockReturnValue(mockUser);
      const req = {
        headers: { 'x-test-token': 'claude-ui-test-token-2024' },
        query: {}
      };
      const res = {};
      const next = vi.fn();

      await authenticateToken(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toEqual(mockUser);
    });

    it('should authenticate with test token as Bearer token', async () => {
      userDb.getFirstUser.mockReturnValue(mockUser);
      const req = {
        headers: { authorization: 'Bearer claude-ui-test-token-2024' },
        query: {}
      };
      const res = {};
      const next = vi.fn();

      await authenticateToken(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toEqual(mockUser);
    });

    it('should return 401 when no token is provided', async () => {
      const req = {
        headers: {},
        query: {}
      };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      await authenticateToken(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Access denied. No token provided.' });
    });

    it('should return 403 for invalid JWT token', async () => {
      const req = {
        headers: { authorization: 'Bearer invalid-token' },
        query: {}
      };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      await authenticateToken(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' });
    });

    it('should return 401 when user not found for valid token', async () => {
      userDb.getUserById.mockReturnValue(undefined);
      const token = jwt.sign({ userId: 999, username: 'unknown' }, JWT_SECRET);
      const req = {
        headers: { authorization: `Bearer ${token}` },
        query: {}
      };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      await authenticateToken(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token. User not found.' });
    });

    it('should use first user in platform mode', async () => {
      process.env.VITE_IS_PLATFORM = 'true';
      userDb.getFirstUser.mockReturnValue(mockUser);
      const req = {
        headers: {},
        query: {}
      };
      const res = {};
      const next = vi.fn();

      await authenticateToken(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toEqual(mockUser);
    });

    it('should return 500 in platform mode when no user found', async () => {
      process.env.VITE_IS_PLATFORM = 'true';
      userDb.getFirstUser.mockReturnValue(undefined);
      const req = {
        headers: {},
        query: {}
      };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      await authenticateToken(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('generateToken', () => {
    it('should generate a valid JWT token', () => {
      const user = { id: 1, username: 'testuser' };

      const token = generateToken(user);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');

      const decoded = jwt.verify(token, JWT_SECRET);
      expect(decoded.userId).toBe(1);
      expect(decoded.username).toBe('testuser');
    });

    it('should generate token without expiration', () => {
      const user = { id: 1, username: 'testuser' };

      const token = generateToken(user);
      const decoded = jwt.verify(token, JWT_SECRET);

      expect(decoded.exp).toBeUndefined();
    });
  });

  describe('authenticateWebSocket', () => {
    it('should authenticate with valid JWT token', () => {
      const token = jwt.sign({ userId: 1, username: 'testuser' }, JWT_SECRET);

      const result = authenticateWebSocket(token);

      expect(result).toBeDefined();
      expect(result.userId).toBe(1);
      expect(result.username).toBe('testuser');
    });

    it('should authenticate with test token', () => {
      userDb.getFirstUser.mockReturnValue(mockUser);

      const result = authenticateWebSocket('claude-ui-test-token-2024');

      expect(result).toBeDefined();
      expect(result.userId).toBe(1);
      expect(result.username).toBe('testuser');
    });

    it('should return null for invalid token', () => {
      const result = authenticateWebSocket('invalid-token');

      expect(result).toBeNull();
    });

    it('should return null for empty token', () => {
      const result = authenticateWebSocket('');
      expect(result).toBeNull();

      const resultNull = authenticateWebSocket(null);
      expect(resultNull).toBeNull();
    });

    it('should use first user in platform mode', () => {
      process.env.VITE_IS_PLATFORM = 'true';
      userDb.getFirstUser.mockReturnValue(mockUser);

      const result = authenticateWebSocket(null);

      expect(result).toBeDefined();
      expect(result.userId).toBe(1);
    });

    it('should return null in platform mode when no user found', () => {
      process.env.VITE_IS_PLATFORM = 'true';
      userDb.getFirstUser.mockReturnValue(undefined);

      const result = authenticateWebSocket(null);

      expect(result).toBeNull();
    });
  });
});
