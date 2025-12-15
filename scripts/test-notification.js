#!/usr/bin/env node
/**
 * Test Push Notification Script
 *
 * Sends a test push notification to a specific user via OneSignal.
 *
 * Usage:
 *   node scripts/test-notification.js <username>
 *   node scripts/test-notification.js dev-box
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

async function sendTestNotification(username) {
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

    // Initialize OneSignal client
    const configuration = OneSignal.createConfiguration({
        restApiKey: ONESIGNAL_REST_API_KEY,
    });
    const client = new OneSignal.DefaultApi(configuration);

    // Send banner notification
    console.log('📤 Sending test banner notification...');
    try {
        const notification = new OneSignal.Notification();
        notification.app_id = ONESIGNAL_APP_ID;
        notification.headings = { en: 'Test Notification' };
        notification.contents = { en: `Hello ${user.username}! This is a test notification from Claude Tasks.` };
        notification.include_aliases = {
            external_id: [externalId]
        };
        notification.target_channel = 'push';
        notification.ios_sound = 'default';
        notification.data = {
            type: 'test',
            timestamp: new Date().toISOString()
        };

        console.log('   Payload:', JSON.stringify({
            app_id: notification.app_id,
            headings: notification.headings,
            contents: notification.contents,
            include_aliases: notification.include_aliases,
            target_channel: notification.target_channel
        }, null, 2));

        const response = await client.createNotification(notification);
        console.log('✅ Banner notification sent!');
        console.log('   Full response:', JSON.stringify(response, null, 2));
        console.log(`   Notification ID: ${response.id}`);
        console.log(`   Recipients: ${response.recipients || 'unknown'}`);
    } catch (error) {
        console.error('❌ Failed to send banner notification:', error.message);
        if (error.body) {
            console.error('   Details:', JSON.stringify(error.body, null, 2));
        }
    }

    // Send badge update notification
    // Try multiple approaches to see which works

    // Approach 1: Badge with visible notification (minimal content)
    console.log('📤 Approach 1: Badge with minimal visible notification...');
    try {
        const badgeNotification1 = new OneSignal.Notification();
        badgeNotification1.app_id = ONESIGNAL_APP_ID;
        badgeNotification1.include_aliases = {
            external_id: [externalId]
        };
        badgeNotification1.target_channel = 'push';
        badgeNotification1.headings = { en: 'Badge Test' };
        badgeNotification1.contents = { en: 'Testing badge update' };
        badgeNotification1.ios_badge_type = 'SetTo';
        badgeNotification1.ios_badge_count = 3;

        console.log('   Payload:', JSON.stringify({
            app_id: badgeNotification1.app_id,
            include_aliases: badgeNotification1.include_aliases,
            headings: badgeNotification1.headings,
            contents: badgeNotification1.contents,
            ios_badge_type: badgeNotification1.ios_badge_type,
            ios_badge_count: badgeNotification1.ios_badge_count
        }, null, 2));

        const response1 = await client.createNotification(badgeNotification1);
        console.log('✅ Approach 1 sent!');
        console.log('   Full response:', JSON.stringify(response1, null, 2));
    } catch (error) {
        console.error('❌ Approach 1 failed:', error.message);
        if (error.body) {
            console.error('   Details:', JSON.stringify(error.body, null, 2));
        }
    }

    console.log('\n📱 Check your iOS device for the notification!');
    console.log('   Note: Push notifications only work on real devices, not simulators.');
}

// Main
const username = process.argv[2];
if (!username) {
    console.log('Usage: node scripts/test-notification.js <username>');
    console.log('Example: node scripts/test-notification.js dev-box');
    process.exit(1);
}

sendTestNotification(username);
