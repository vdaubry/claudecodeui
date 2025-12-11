import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get the path to the user access configuration file
 * Located at: <project-root>/config/user-access-config.json
 * @returns {string} Path to the config file
 */
function getConfigPath() {
  // Navigate from server/utils/ to project root, then to config/
  return path.join(__dirname, '..', '..', 'config', 'user-access-config.json');
}

/**
 * Load user access configuration from file
 * @returns {Object} Configuration object with defaultAccess and users
 */
export function loadUserAccessConfig() {
  const configPath = getConfigPath();

  // Default configuration if file doesn't exist or has errors
  const defaultConfig = {
    defaultAccess: 'all',
    users: {}
  };

  try {
    // Check if file exists
    if (!fs.existsSync(configPath)) {
      return defaultConfig;
    }

    // Read and parse config file
    const configData = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configData);

    // Validate basic structure
    if (typeof config !== 'object' || config === null) {
      console.warn('[UserAccess] Config file has invalid structure, using defaults');
      return defaultConfig;
    }

    // Ensure required fields exist
    if (!config.defaultAccess) {
      config.defaultAccess = 'all';
    }

    if (!config.users || typeof config.users !== 'object') {
      config.users = {};
    }

    return config;
  } catch (error) {
    console.error('[UserAccess] Error loading config file:', error.message);
    return defaultConfig;
  }
}

/**
 * Check if a project path matches a pattern
 * Supports exact match and wildcard patterns
 *
 * @param {string} projectPath - The full path of the project
 * @param {string} pattern - The pattern to match against (supports /* wildcard)
 * @returns {boolean} True if the path matches the pattern
 */
export function matchPath(projectPath, pattern) {
  if (!projectPath || !pattern) {
    return false;
  }

  try {
    const normalizedPath = path.normalize(projectPath);
    const normalizedPattern = path.normalize(pattern);

    // Exact match
    if (normalizedPattern === normalizedPath) {
      return true;
    }

    // Wildcard match for direct children (pattern ends with /*)
    if (normalizedPattern.endsWith(path.sep + '*')) {
      const prefix = normalizedPattern.slice(0, -2); // Remove /*

      // Check if project path starts with the prefix
      if (!normalizedPath.startsWith(prefix + path.sep)) {
        return false;
      }

      // Ensure it's a direct child (no additional path separators)
      const remainder = normalizedPath.slice(prefix.length + 1);
      return !remainder.includes(path.sep);
    }

    // Also handle /* without path.sep for cross-platform compatibility
    if (normalizedPattern.endsWith('/*')) {
      const prefix = normalizedPattern.slice(0, -2);

      if (!normalizedPath.startsWith(prefix + path.sep)) {
        return false;
      }

      const remainder = normalizedPath.slice(prefix.length + 1);
      return !remainder.includes(path.sep);
    }

    return false;
  } catch (error) {
    console.error('[UserAccess] Error matching path:', error.message);
    return false;
  }
}

/**
 * Filter projects based on user access rules
 *
 * @param {Array} projects - Array of project objects
 * @param {string} username - Username to check access for
 * @returns {Array} Filtered array of projects the user can access
 */
export function filterProjectsByUserAccess(projects, username) {
  // Safety check
  if (!Array.isArray(projects)) {
    console.error('[UserAccess] Projects is not an array');
    return [];
  }

  if (!username) {
    console.warn('[UserAccess] No username provided, allowing all projects');
    return projects;
  }

  try {
    // Load configuration
    const config = loadUserAccessConfig();

    // Check if user has specific rules
    const userRules = config.users[username];

    // If user not in config, apply default access policy
    if (!userRules) {
      if (config.defaultAccess === 'all') {
        return projects;
      } else if (config.defaultAccess === 'none') {
        console.log(`[UserAccess] User "${username}" not in config, defaultAccess is "none", returning empty list`);
        return [];
      } else {
        // Invalid defaultAccess value, fail open
        console.warn(`[UserAccess] Invalid defaultAccess value: "${config.defaultAccess}", defaulting to "all"`);
        return projects;
      }
    }

    // User is in config, check folder rules
    if (!userRules.folders || !Array.isArray(userRules.folders) || userRules.folders.length === 0) {
      // User in config but no folders specified, apply default access
      if (config.defaultAccess === 'all') {
        return projects;
      } else {
        console.log(`[UserAccess] User "${username}" has no folder rules, defaultAccess is "none", returning empty list`);
        return [];
      }
    }

    // Filter projects based on user's folder patterns
    const filteredProjects = projects.filter(project => {
      const projectPath = project.fullPath || project.path;

      if (!projectPath) {
        // No path to match, fail open (allow access)
        console.warn('[UserAccess] Project has no path, allowing access:', project.name);
        return true;
      }

      // Check if any pattern matches this project
      const hasAccess = userRules.folders.some(pattern => {
        return matchPath(projectPath, pattern);
      });

      return hasAccess;
    });

    console.log(`[UserAccess] User "${username}" has access to ${filteredProjects.length}/${projects.length} projects`);

    return filteredProjects;
  } catch (error) {
    console.error('[UserAccess] Error filtering projects:', error.message);
    // On error, fail open (return all projects)
    return projects;
  }
}
