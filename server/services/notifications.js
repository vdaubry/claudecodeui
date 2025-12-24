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

// OneSignal client singleton
let client = null;
let clientAppId = null;

/**
 * Get OneSignal configuration from environment
 * Read at runtime to ensure .env is loaded first
 */
function getConfig() {
    return {
        appId: process.env.ONESIGNAL_APP_ID,
        restApiKey: process.env.ONESIGNAL_REST_API_KEY
    };
}

/**
 * Get or create the OneSignal client
 * @returns {OneSignal.DefaultApi|null} OneSignal API client or null if not configured
 */
function getClient() {
    const { appId, restApiKey } = getConfig();

    if (!client && appId && restApiKey) {
        const configuration = OneSignal.createConfiguration({
            restApiKey: restApiKey,
        });
        client = new OneSignal.DefaultApi(configuration);
        clientAppId = appId;
        console.log('[OneSignal] Client initialized with app:', appId);
    }
    return client;
}

/**
 * Get the app ID for notifications
 * @returns {string|null}
 */
function getAppId() {
    if (clientAppId) return clientAppId;
    return getConfig().appId;
}

/**
 * Check if OneSignal is configured
 * @returns {boolean}
 */
function isConfigured() {
    const { appId, restApiKey } = getConfig();
    return !!(appId && restApiKey);
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
        notification.app_id = getAppId();
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
        console.log(`[OneSignal] Banner notification sent to user ${userId}: id=${response.id}, projectId=${data.projectId}, taskId=${data.taskId}, agentId=${data.agentId}, conversationId=${data.conversationId}, deepLink=${data.deepLink}`);
        return response;
    } catch (error) {
        console.error('[OneSignal] Failed to send banner notification:', error.message);
        return null;
    }
}

/**
 * Send a silent notification to update badge count
 * Uses content_available for iOS background processing
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

    console.log(`[OneSignal] Sending silent badge update to user ${userId}: count=${badgeCount}`);

    try {
        const notification = new OneSignal.Notification();
        notification.app_id = getAppId();
        notification.include_aliases = {
            external_id: [toExternalId(userId)]
        };
        notification.target_channel = 'push';

        // Silent notification (content-available for iOS background processing)
        notification.content_available = true;

        // Badge settings - set to exact count (snake_case for SDK)
        notification.ios_badge_type = 'SetTo';
        notification.ios_badge_count = badgeCount;

        // Empty content for silent push
        notification.contents = { en: '' };

        const response = await onesignalClient.createNotification(notification);
        console.log(`[OneSignal] Badge update sent to user ${userId}: count=${badgeCount}, id=${response.id}`);
        return response;
    } catch (error) {
        console.error('[OneSignal] Failed to send badge update:', error.message);
        if (error.body) {
            console.error('[OneSignal] Error details:', JSON.stringify(error.body, null, 2));
        }
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
 * @param {number} projectId - Project ID for deep linking
 * @param {object} options - Additional options
 * @param {string|null} options.agentType - Agent type ('planification', 'implementation', 'review', or null for user)
 * @param {boolean} options.workflowComplete - Whether workflow_complete was just set to true
 * @param {number|null} options.agentId - Agent ID for deep linking (for custom agent conversations)
 * @returns {Promise<object|null>} OneSignal response or null
 */
async function notifyClaudeComplete(userId, taskTitle, taskId, conversationId, projectId, options = {}) {
    const { agentType = null, workflowComplete = false, agentId = null } = options;

    // Determine if we should send notification
    // 1. User-initiated conversations (no agent) - always notify
    // 2. Planification agent - always notify when complete
    // 3. Implementation/Review agents - only notify when workflow_complete becomes true
    if (agentType === 'implementation' || agentType === 'review') {
        if (!workflowComplete) {
            console.log(`[OneSignal] Skipping notification for ${agentType} agent (workflow not complete, loop continues)`);
            return null;
        }
        console.log(`[OneSignal] Workflow complete, sending notification for ${agentType} agent`);
    }

    const title = workflowComplete
        ? 'Task Workflow Complete'
        : 'Claude Response Ready';
    const message = taskTitle
        ? (workflowComplete ? `Task ready for review: ${taskTitle}` : `Response ready for: ${taskTitle}`)
        : (workflowComplete ? 'Task workflow complete, ready for review' : 'Claude has finished responding');

    // Build deep link URL for iOS app
    let deepLink = null;
    if (projectId && taskId) {
        deepLink = `claudeui://projects/${projectId}/tasks/${taskId}/chat/${conversationId}`;
    } else if (projectId && agentId) {
        deepLink = `claudeui://projects/${projectId}/agents/${agentId}/chat/${conversationId}`;
    }

    return sendBannerNotification(userId, title, message, {
        type: workflowComplete ? 'workflow_complete' : 'claude_complete',
        taskId: taskId ? String(taskId) : null,
        agentId: agentId ? String(agentId) : null,
        conversationId: String(conversationId),
        projectId: projectId ? String(projectId) : null,
        deepLink
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
    console.log(`[OneSignal] Task status changed for user ${userId}: ${oldStatus} -> ${newStatus}`);

    // Update badge when status changes to/from in_progress
    if (oldStatus === 'in_progress' || newStatus === 'in_progress') {
        console.log('[OneSignal] Status involves in_progress, updating badge...');
        return updateUserBadge(userId);
    }

    console.log('[OneSignal] Status change does not involve in_progress, skipping badge update');
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
