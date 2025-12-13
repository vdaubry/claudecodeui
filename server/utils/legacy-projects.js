/**
 * LEGACY PROJECT UTILITIES
 * =========================
 *
 * This file contains legacy utility functions for backward compatibility
 * with routes that still use the old encoded project name convention.
 *
 * In the new task-based system, projects are stored in the database with
 * their actual repo_folder_path. These utilities are kept for legacy routes
 * (git.js) that still use encoded project names.
 *
 * TODO: Migrate these routes to use database-backed projects and remove this file.
 */

import { promises as fs } from 'fs';
import fsSync from 'fs';
import path from 'path';
import readline from 'readline';
import os from 'os';

// Cache for extracted project directories
const projectDirectoryCache = new Map();

/**
 * Extract the actual project directory from an encoded project name.
 *
 * Claude CLI stores projects in ~/.claude/projects/ with directory names
 * that are encoded paths (/ replaced with -). This function reads the JSONL
 * files to find the actual cwd path.
 *
 * @param {string} projectName - Encoded project name (e.g., "home-ubuntu-myproject")
 * @returns {Promise<string>} Actual project path (e.g., "/home/ubuntu/myproject")
 */
async function extractProjectDirectory(projectName) {
  // Check cache first
  if (projectDirectoryCache.has(projectName)) {
    return projectDirectoryCache.get(projectName);
  }

  const projectDir = path.join(os.homedir(), '.claude', 'projects', projectName);
  const cwdCounts = new Map();
  let latestTimestamp = 0;
  let latestCwd = null;
  let extractedPath;

  try {
    // Check if the project directory exists
    await fs.access(projectDir);

    const files = await fs.readdir(projectDir);
    const jsonlFiles = files.filter(file => file.endsWith('.jsonl'));

    if (jsonlFiles.length === 0) {
      // Fall back to decoded project name if no sessions
      extractedPath = projectName.replace(/-/g, '/');
    } else {
      // Process all JSONL files to collect cwd values
      for (const file of jsonlFiles) {
        const jsonlFile = path.join(projectDir, file);
        const fileStream = fsSync.createReadStream(jsonlFile);
        const rl = readline.createInterface({
          input: fileStream,
          crlfDelay: Infinity
        });

        for await (const line of rl) {
          if (line.trim()) {
            try {
              const entry = JSON.parse(line);

              if (entry.cwd) {
                // Count occurrences of each cwd
                cwdCounts.set(entry.cwd, (cwdCounts.get(entry.cwd) || 0) + 1);

                // Track the most recent cwd
                const timestamp = new Date(entry.timestamp || 0).getTime();
                if (timestamp > latestTimestamp) {
                  latestTimestamp = timestamp;
                  latestCwd = entry.cwd;
                }
              }
            } catch (parseError) {
              // Skip malformed lines
            }
          }
        }
      }

      // Determine the best cwd to use
      if (cwdCounts.size === 0) {
        // No cwd found, fall back to decoded project name
        extractedPath = projectName.replace(/-/g, '/');
      } else if (cwdCounts.size === 1) {
        // Only one cwd, use it
        extractedPath = Array.from(cwdCounts.keys())[0];
      } else {
        // Multiple cwd values - prefer the most recent one if it has reasonable usage
        const mostRecentCount = cwdCounts.get(latestCwd) || 0;
        const maxCount = Math.max(...cwdCounts.values());

        // Use most recent if it has at least 25% of the max count
        if (mostRecentCount >= maxCount * 0.25) {
          extractedPath = latestCwd;
        } else {
          // Otherwise use the most frequently used cwd
          for (const [cwd, count] of cwdCounts.entries()) {
            if (count === maxCount) {
              extractedPath = cwd;
              break;
            }
          }
        }

        // Fallback (shouldn't reach here)
        if (!extractedPath) {
          extractedPath = latestCwd || projectName.replace(/-/g, '/');
        }
      }
    }

    // Cache the result
    projectDirectoryCache.set(projectName, extractedPath);

    return extractedPath;

  } catch (error) {
    // If the directory doesn't exist, just use the decoded project name
    if (error.code === 'ENOENT') {
      extractedPath = projectName.replace(/-/g, '/');
    } else {
      console.error(`Error extracting project directory for ${projectName}:`, error);
      // Fall back to decoded project name for other errors
      extractedPath = projectName.replace(/-/g, '/');
    }

    // Cache the fallback result too
    projectDirectoryCache.set(projectName, extractedPath);

    return extractedPath;
  }
}

/**
 * Clear the project directory cache.
 * Called when project configuration changes.
 */
function clearProjectDirectoryCache() {
  projectDirectoryCache.clear();
}

export {
  extractProjectDirectory,
  clearProjectDirectoryCache
};
