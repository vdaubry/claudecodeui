#!/usr/bin/env node

import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { userDb, initializeDatabase } from '../server/database/db.js';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

/**
 * Generate a secure random password
 * @param {number} length - Password length (default: 16)
 * @returns {string} Generated password
 */
function generatePassword(length = 16) {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  const randomBytes = crypto.randomBytes(length);
  let password = '';

  for (let i = 0; i < length; i++) {
    password += charset[randomBytes[i] % charset.length];
  }

  return password;
}

/**
 * Create a new user
 * @param {string} username - The username to create
 */
async function createUser(username) {
  // Validate username
  if (!username) {
    console.error(`${colors.red}Error:${colors.reset} Username is required`);
    console.log(`\nUsage: node scripts/create-user.js <username>`);
    process.exit(1);
  }

  if (username.length < 3) {
    console.error(`${colors.red}Error:${colors.reset} Username must be at least 3 characters`);
    process.exit(1);
  }

  // Check if username already exists
  const existingUser = userDb.getUserByUsername(username);
  if (existingUser) {
    console.error(`${colors.red}Error:${colors.reset} Username "${username}" already exists`);
    process.exit(1);
  }

  // Generate password
  const password = generatePassword(16);

  // Hash password (same as auth.js - 12 salt rounds)
  const saltRounds = 12;
  const passwordHash = await bcrypt.hash(password, saltRounds);

  // Create user
  try {
    const user = userDb.createUser(username, passwordHash);

    console.log('');
    console.log(`${colors.green}${colors.bright}User created successfully!${colors.reset}`);
    console.log('');
    console.log(`${colors.dim}${'─'.repeat(40)}${colors.reset}`);
    console.log(`  ${colors.cyan}Username:${colors.reset} ${colors.bright}${username}${colors.reset}`);
    console.log(`  ${colors.cyan}Password:${colors.reset} ${colors.bright}${password}${colors.reset}`);
    console.log(`  ${colors.cyan}User ID:${colors.reset}  ${user.id}`);
    console.log(`${colors.dim}${'─'.repeat(40)}${colors.reset}`);
    console.log('');
    console.log(`${colors.yellow}Store this password securely - it cannot be retrieved later.${colors.reset}`);
    console.log('');

  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      console.error(`${colors.red}Error:${colors.reset} Username "${username}" already exists`);
    } else {
      console.error(`${colors.red}Error:${colors.reset} Failed to create user:`, error.message);
    }
    process.exit(1);
  }
}

// Main
const username = process.argv[2];

// Initialize database (ensures schema exists)
await initializeDatabase();

// Create the user
await createUser(username);
