#!/usr/bin/env node
/**
 * Test Silent Badge Notification Script
 *
 * Sends a silent push notification to update the app badge count.
 * This tests whether iOS can receive badge-only updates without a visible notification.
 *
 * Usage:
 *   node scripts/test-badge.js <username> [badge_count]
 *   node scripts/test-badge.js dev-box 5
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env
try {
    const envPath = path.join(__dirname, '../.env');
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
        const trimmedLine = line.trim();
        if (trimmedLine && !trimmedLine.startsWith('#')) {
            const [key, ...valueParts] = trimmedLine.split('=');
            if (key && valueParts.length > 0 && !process.env[key]) {
                process.env[key] = valueParts.join('=').trim();
            }
        }
    });
} catch (e) {
    console.error('Error loading .env file:', e.message);
    process.exit(1);
}

// Import after env is loaded
import * as OneSignal from '@onesignal/node-onesignal';
import Database from 'better-sqlite3';

const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID;
const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY;
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '../server/database/auth.db');

async function sendSilentBadge(username, badgeCount) {
    // Validate OneSignal configuration
    if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
        console.error('❌ OneSignal not configured. Set ONESIGNAL_APP_ID and ONESIGNAL_REST_API_KEY in .env');
        process.exit(1);
    }

    // Find user in database
    console.log(`🔍 Looking up user: ${username}`);
    const db = new Database(DB_PATH);
    const user = db.prepare('SELECT id, username FROM users WHERE username = ?').get(username);
    db.close();

    if (!user) {
        console.error(`❌ User "${username}" not found in database`);
        process.exit(1);
    }

    console.log(`✅ Found user: ${user.username} (id: ${user.id})`);

    // Convert to OneSignal external_id format (must match nativeBridge.js)
    const externalId = `user_${user.id}`;
    console.log(`📱 OneSignal external_id: ${externalId}`);
    console.log(`🔢 Badge count to set: ${badgeCount}`);

    // Initialize OneSignal client
    const configuration = OneSignal.createConfiguration({
        restApiKey: ONESIGNAL_REST_API_KEY,
    });
    const client = new OneSignal.DefaultApi(configuration);

    // Send silent badge notification
    console.log('\n📤 Sending silent badge notification...');
    try {
        const notification = new OneSignal.Notification();
        notification.app_id = ONESIGNAL_APP_ID;
        notification.include_aliases = {
            external_id: [externalId]
        };
        notification.target_channel = 'push';

        // Silent notification (content-available for iOS background processing)
        notification.content_available = true;

        // Badge settings
        notification.ios_badge_type = 'SetTo';
        notification.ios_badge_count = badgeCount;

        // Empty content for silent push
        notification.contents = { en: '' };

        const payload = {
            app_id: notification.app_id,
            include_aliases: notification.include_aliases,
            target_channel: notification.target_channel,
            content_available: notification.content_available,
            ios_badge_type: notification.ios_badge_type,
            ios_badge_count: notification.ios_badge_count,
            contents: notification.contents
        };

        console.log('   Payload:', JSON.stringify(payload, null, 2));

        const response = await client.createNotification(notification);
        console.log('✅ Silent badge notification sent!');
        console.log('   Full response:', JSON.stringify(response, null, 2));
        console.log(`   Notification ID: ${response.id}`);
        console.log(`   Recipients: ${response.recipients || 'unknown'}`);

        if (response.id) {
            console.log('\n📱 Check your iOS device for the badge update!');
            console.log('   The app icon should show a badge with the number:', badgeCount);
            console.log('   Note: No visible notification banner should appear.');
        }
    } catch (error) {
        console.error('❌ Failed to send silent badge notification:', error.message);
        if (error.body) {
            console.error('   Details:', JSON.stringify(error.body, null, 2));
        }
    }
}

// Main
const username = process.argv[2];
const badgeCount = parseInt(process.argv[3], 10) || 3;

if (!username) {
    console.log('Usage: node scripts/test-badge.js <username> [badge_count]');
    console.log('Example: node scripts/test-badge.js dev-box 5');
    process.exit(1);
}

sendSilentBadge(username, badgeCount);
