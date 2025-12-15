/**
 * PUSH NOTIFICATION SERVICE
 * =========================
 *
 * Handles push notifications via OneSignal for:
 * - Banner notifications (Claude response complete)
 * - Silent badge updates (in_progress task count)
 *
 * Uses OneSignal's external_id feature to link iOS devices to backend user IDs.
 */

import * as OneSignal from '@onesignal/node-onesignal';
import { tasksDb } from '../database/db.js';

// OneSignal configuration from environment
const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID;
const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY;

let client = null;

/**
 * Get or create the OneSignal client
 * @returns {OneSignal.DefaultApi|null} OneSignal API client or null if not configured
 */
function getClient() {
    if (!client && ONESIGNAL_APP_ID && ONESIGNAL_REST_API_KEY) {
        const configuration = OneSignal.createConfiguration({
            restApiKey: ONESIGNAL_REST_API_KEY,
        });
        client = new OneSignal.DefaultApi(configuration);
        console.log('[OneSignal] Client initialized');
    }
    return client;
}

/**
 * Check if OneSignal is configured
 * @returns {boolean}
 */
function isConfigured() {
    return !!(ONESIGNAL_APP_ID && ONESIGNAL_REST_API_KEY);
}

/**
 * Convert backend user ID to OneSignal external_id format
 * Uses "user_" prefix to avoid OneSignal blocking simple IDs like "1"
 * @param {string|number} userId - Backend user ID
 * @returns {string} OneSignal-compatible external_id
 */
function toExternalId(userId) {
    return `user_${userId}`;
}

/**
 * Send a banner notification when Claude completes a response
 * @param {string|number} userId - Backend user ID (external_id in OneSignal)
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {object} data - Additional data payload for deep linking
 * @returns {Promise<object|null>} OneSignal response or null on failure
 */
async function sendBannerNotification(userId, title, message, data = {}) {
    const onesignalClient = getClient();

    if (!onesignalClient) {
        console.log('[OneSignal] Not configured, skipping banner notification');
        return null;
    }

    try {
        const notification = new OneSignal.Notification();
        notification.app_id = ONESIGNAL_APP_ID;
        notification.headings = { en: title };
        notification.contents = { en: message };
        notification.include_aliases = {
            external_id: [toExternalId(userId)]
        };
        notification.target_channel = 'push';
        notification.data = data;

        // iOS-specific settings for visible notification
        notification.ios_sound = 'default';
        notification.ios_interruption_level = 'active';

        const response = await onesignalClient.createNotification(notification);
        console.log(`[OneSignal] Banner notification sent to user ${userId}:`, response.id);
        return response;
    } catch (error) {
        console.error('[OneSignal] Failed to send banner notification:', error.message);
        return null;
    }
}

/**
 * Send a silent notification to update badge count
 * @param {string|number} userId - Backend user ID (external_id in OneSignal)
 * @param {number} badgeCount - Number to display on app badge
 * @returns {Promise<object|null>} OneSignal response or null on failure
 */
async function sendBadgeUpdate(userId, badgeCount) {
    const onesignalClient = getClient();

    if (!onesignalClient) {
        console.log('[OneSignal] Not configured, skipping badge update');
        return null;
    }

    try {
        const notification = new OneSignal.Notification();
        notification.app_id = ONESIGNAL_APP_ID;
        notification.include_aliases = {
            external_id: [toExternalId(userId)]
        };
        notification.target_channel = 'push';

        // Silent notification settings (iOS content-available)
        notification.content_available = true;

        // Badge settings - set to exact count (snake_case for SDK)
        notification.ios_badge_type = 'SetTo';
        notification.ios_badge_count = badgeCount;

        // Empty content for silent push (no visible alert)
        notification.contents = { en: '' };

        const response = await onesignalClient.createNotification(notification);
        console.log(`[OneSignal] Badge update sent to user ${userId}: count=${badgeCount}`);
        return response;
    } catch (error) {
        console.error('[OneSignal] Failed to send badge update:', error.message);
        return null;
    }
}

/**
 * Get count of in_progress tasks for a user
 * @param {number} userId - Database user ID
 * @returns {number} Count of in_progress tasks
 */
function getInProgressTaskCount(userId) {
    try {
        const tasks = tasksDb.getAll(userId, 'in_progress');
        return tasks.length;
    } catch (error) {
        console.error('[OneSignal] Failed to get in_progress task count:', error.message);
        return 0;
    }
}

/**
 * Update badge for a user based on their current in_progress tasks count
 * @param {number} userId - Database user ID
 * @returns {Promise<object|null>} OneSignal response or null
 */
async function updateUserBadge(userId) {
    const count = getInProgressTaskCount(userId);
    return sendBadgeUpdate(userId, count);
}

/**
 * Send notification when Claude finishes responding
 * @param {number} userId - Database user ID
 * @param {string|null} taskTitle - Task title for context (optional)
 * @param {number} taskId - Task ID for deep linking
 * @param {number} conversationId - Conversation ID for deep linking
 * @returns {Promise<object|null>} OneSignal response or null
 */
async function notifyClaudeComplete(userId, taskTitle, taskId, conversationId) {
    const title = 'Claude Response Ready';
    const message = taskTitle
        ? `Response ready for: ${taskTitle}`
        : 'Claude has finished responding';

    return sendBannerNotification(userId, title, message, {
        type: 'claude_complete',
        taskId: String(taskId),
        conversationId: String(conversationId)
    });
}

/**
 * Handle notification for task status change
 * Updates badge when task enters or leaves in_progress state
 * @param {number} userId - Database user ID
 * @param {string} oldStatus - Previous task status
 * @param {string} newStatus - New task status
 * @returns {Promise<object|null>} OneSignal response or null
 */
async function notifyTaskStatusChange(userId, oldStatus, newStatus) {
    // Update badge when status changes to/from in_progress
    if (oldStatus === 'in_progress' || newStatus === 'in_progress') {
        return updateUserBadge(userId);
    }
    return null;
}

export {
    isConfigured,
    sendBannerNotification,
    sendBadgeUpdate,
    getInProgressTaskCount,
    updateUserBadge,
    notifyClaudeComplete,
    notifyTaskStatusChange
};
