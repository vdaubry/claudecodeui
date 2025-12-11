import express from 'express';

/**
 * Creates a test Express app with mocked authentication middleware
 * @param {Object} routeModule - The route module to mount
 * @param {string} basePath - The base path for the routes
 * @param {number} userId - The user ID to inject into requests
 * @returns {express.Application}
 */
export function createTestApp(routeModule, basePath, userId = 1) {
  const app = express();
  app.use(express.json());

  // Mock authentication middleware
  app.use((req, res, next) => {
    req.user = { id: userId, username: 'testuser' };
    next();
  });

  app.use(basePath, routeModule);

  return app;
}

/**
 * Creates a test Express app with multiple route modules
 * @param {Array<{module: Object, path: string}>} routes - Array of route configs
 * @param {number} userId - The user ID to inject into requests
 * @returns {express.Application}
 */
export function createTestAppWithMultipleRoutes(routes, userId = 1) {
  const app = express();
  app.use(express.json());

  // Mock authentication middleware
  app.use((req, res, next) => {
    req.user = { id: userId, username: 'testuser' };
    next();
  });

  for (const { module, path } of routes) {
    app.use(path, module);
  }

  return app;
}
