/**
 * Conversation Adapter Service
 *
 * Unified entry point for all conversation lifecycle management.
 * Handles starting new conversations and resuming existing ones,
 * with centralized lifecycle event handling for:
 * - WebSocket broadcasts (streaming-started, streaming-ended)
 * - Agent run status updates
 * - Push notifications
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { conversationsDb, tasksDb, agentRunsDb, agentsDb } from '../database/db.js';
import { notifyClaudeComplete, updateUserBadge } from './notifications.js';
import { buildAgentContextPrompt } from './documentation.js';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// Session tracking: Map of session IDs to active query instances
const activeSessions = new Map();

// Active streaming sessions: Map of Claude session ID to {taskId, conversationId}
const activeStreamingSessions = new Map();

// Default permission mode - bypassPermissions allows Claude to write files without prompting
const DEFAULT_PERMISSION_MODE = 'bypassPermissions';

/**
 * Validates and normalizes options for conversation functions.
 * Logs warnings for missing options and applies safe defaults.
 *
 * @param {Object} options - Options object to validate
 * @param {string} source - Source identifier for logging (e.g., 'startConversation', 'sendMessage')
 * @returns {Object} Normalized options with defaults applied
 */
function validateAndNormalizeOptions(options = {}, source) {
  const warnings = [];

  // Validate required options
  if (!options.broadcastFn) {
    warnings.push('Missing broadcastFn - WebSocket broadcasts will not work');
  }

  // Normalize permission mode with warning
  if (!options.permissionMode) {
    warnings.push(`Missing permissionMode, defaulting to '${DEFAULT_PERMISSION_MODE}'`);
  }

  // Log warnings if any
  if (warnings.length > 0) {
    console.warn(`[ConversationAdapter] Options validation (${source}):`, warnings.join('; '));
  }

  return {
    ...options,
    permissionMode: options.permissionMode || DEFAULT_PERMISSION_MODE
  };
}

/**
 * Maps options to SDK-compatible format
 */
function mapOptionsToSDK(options = {}) {
  const { sessionId, cwd, permissionMode, customSystemPrompt } = options;

  const sdkOptions = {};

  if (cwd) {
    sdkOptions.cwd = cwd;
  }

  if (permissionMode && permissionMode !== 'default') {
    sdkOptions.permissionMode = permissionMode;
  }

  sdkOptions.model = options.model || 'sonnet';

  if (customSystemPrompt) {
    // Custom agents use full override - plain string replaces the entire system prompt
    sdkOptions.systemPrompt = customSystemPrompt;
  } else {
    sdkOptions.systemPrompt = {
      type: 'preset',
      preset: 'claude_code'
    };
  }

  sdkOptions.settingSources = ['project', 'user', 'local'];

  if (sessionId) {
    sdkOptions.resume = sessionId;
  }

  return sdkOptions;
}

/**
 * Loads MCP server configurations from ~/.claude.json
 */
async function loadMcpConfig(cwd) {
  try {
    const claudeConfigPath = path.join(os.homedir(), '.claude.json');

    try {
      await fs.access(claudeConfigPath);
    } catch {
      return null;
    }

    const configContent = await fs.readFile(claudeConfigPath, 'utf8');
    const claudeConfig = JSON.parse(configContent);

    let mcpServers = {};

    if (claudeConfig.mcpServers && typeof claudeConfig.mcpServers === 'object') {
      mcpServers = { ...claudeConfig.mcpServers };
    }

    if (claudeConfig.claudeProjects && cwd) {
      const projectConfig = claudeConfig.claudeProjects[cwd];
      if (projectConfig?.mcpServers) {
        mcpServers = { ...mcpServers, ...projectConfig.mcpServers };
      }
    }

    return Object.keys(mcpServers).length > 0 ? mcpServers : null;
  } catch (error) {
    console.error('[ConversationAdapter] Error loading MCP config:', error.message);
    return null;
  }
}

/**
 * Handles image processing for SDK queries
 */
async function handleImages(command, images, cwd) {
  const tempImagePaths = [];
  let tempDir = null;

  if (!images || images.length === 0) {
    return { modifiedCommand: command, tempImagePaths, tempDir };
  }

  try {
    const workingDir = cwd || process.cwd();
    tempDir = path.join(workingDir, '.tmp', 'images', Date.now().toString());
    await fs.mkdir(tempDir, { recursive: true });

    for (const [index, image] of images.entries()) {
      const matches = image.data.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) continue;

      const [, mimeType, base64Data] = matches;
      const extension = mimeType.split('/')[1] || 'png';
      const filename = `image_${index}.${extension}`;
      const filepath = path.join(tempDir, filename);

      await fs.writeFile(filepath, Buffer.from(base64Data, 'base64'));
      tempImagePaths.push(filepath);
    }

    let modifiedCommand = command;
    if (tempImagePaths.length > 0 && command?.trim()) {
      const imageNote = `\n\n[Images provided at the following paths:]\n${tempImagePaths.map((p, i) => `${i + 1}. ${p}`).join('\n')}`;
      modifiedCommand = command + imageNote;
    }

    return { modifiedCommand, tempImagePaths, tempDir };
  } catch (error) {
    console.error('[ConversationAdapter] Error processing images:', error);
    return { modifiedCommand: command, tempImagePaths, tempDir };
  }
}

/**
 * Cleans up temporary image files
 */
async function cleanupTempFiles(tempImagePaths, tempDir) {
  if (!tempImagePaths || tempImagePaths.length === 0) return;

  try {
    for (const imagePath of tempImagePaths) {
      await fs.unlink(imagePath).catch(() => {});
    }
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  } catch (error) {
    console.error('[ConversationAdapter] Error during cleanup:', error);
  }
}

/**
 * Extracts token usage from SDK result messages
 */
function extractTokenBudget(resultMessage) {
  if (resultMessage.type !== 'result' || !resultMessage.modelUsage) {
    return null;
  }

  const modelKey = Object.keys(resultMessage.modelUsage)[0];
  const modelData = resultMessage.modelUsage[modelKey];
  if (!modelData) return null;

  const inputTokens = modelData.cumulativeInputTokens || modelData.inputTokens || 0;
  const outputTokens = modelData.cumulativeOutputTokens || modelData.outputTokens || 0;
  const cacheReadTokens = modelData.cumulativeCacheReadInputTokens || modelData.cacheReadInputTokens || 0;
  const cacheCreationTokens = modelData.cumulativeCacheCreationInputTokens || modelData.cacheCreationInputTokens || 0;

  const totalUsed = inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens;
  const contextWindow = parseInt(process.env.CONTEXT_WINDOW) || 160000;

  return { used: totalUsed, total: contextWindow };
}

// ============================================================================
// LIFECYCLE EVENT HANDLERS (Centralized)
// ============================================================================

/**
 * Handle streaming started event
 * Broadcasts to WebSocket clients
 */
function handleStreamingStarted(context) {
  const { conversationId, taskId, agentId, claudeSessionId, broadcastFn } = context;

  // Track active streaming session (with taskId or agentId)
  activeStreamingSessions.set(claudeSessionId, { taskId, agentId, conversationId });

  // Broadcast to WebSocket clients
  if (broadcastFn) {
    const message = {
      type: 'streaming-started',
      conversationId,
      claudeSessionId
    };
    if (taskId) message.taskId = taskId;
    if (agentId) message.agentId = agentId;

    broadcastFn(conversationId, message);
  }

  console.log(`[ConversationAdapter] Streaming started for conversation ${conversationId}`);
}

/**
 * Handle streaming complete event
 * Updates agent run status, broadcasts to WebSocket, sends notifications
 */
async function handleStreamingComplete(context, isError) {
  const { conversationId, taskId, agentId, claudeSessionId, userId, broadcastFn, broadcastToTaskSubscribersFn } = context;

  // Remove from active sessions
  activeStreamingSessions.delete(claudeSessionId);

  // Broadcast streaming-ended to WebSocket clients
  if (broadcastFn) {
    const message = {
      type: 'streaming-ended',
      conversationId
    };
    if (taskId) message.taskId = taskId;
    if (agentId) message.agentId = agentId;

    broadcastFn(conversationId, message);
  }

  console.log(`[ConversationAdapter] Streaming ended for conversation ${conversationId}, isError: ${isError}`);

  // Task-specific logic: check for linked agent runs and handle chaining
  if (taskId) {
    const agentRuns = agentRunsDb.getByTask(taskId);
    const linkedAgentRun = agentRuns.find(r => r.conversation_id === conversationId);

    if (linkedAgentRun) {
      const { id: agentRunId, agent_type: agentType, status } = linkedAgentRun;

      // Only update if still in 'running' status
      if (status === 'running') {
        const newStatus = isError ? 'failed' : 'completed';
        agentRunsDb.updateStatus(agentRunId, newStatus);
        console.log(`[ConversationAdapter] Agent run ${agentRunId} (${agentType}) ${newStatus}`);

        // Broadcast agent run status update to task subscribers
        if (broadcastToTaskSubscribersFn) {
          broadcastToTaskSubscribersFn(taskId, {
            type: 'agent-run-updated',
            agentRun: {
              id: agentRunId,
              status: newStatus,
              agent_type: agentType,
              conversation_id: conversationId
            }
          });
        }

        // Handle agent chaining for implementation/review
        if (!isError && (agentType === 'implementation' || agentType === 'review')) {
          await handleAgentChaining(taskId, agentType, context);
        }
      }
    }

    // Send push notification for task conversations
    if (!isError && userId) {
      const taskInfo = tasksDb.getById(taskId);
      const taskTitle = taskInfo?.title || null;
      const workflowComplete = !!taskInfo?.workflow_complete;
      const agentType = linkedAgentRun?.agent_type || null;

      notifyClaudeComplete(userId, taskTitle, taskId, conversationId, {
        agentType,
        workflowComplete
      }).catch(err => {
        console.error('[ConversationAdapter] Failed to send notification:', err);
      });
    }
  }
  // Agent-specific logic: simpler notification handling (no agent runs/chaining)
  else if (agentId && !isError && userId) {
    const agent = agentsDb.getById(agentId);
    const agentName = agent?.name || 'Custom Agent';

    notifyClaudeComplete(userId, `Agent: ${agentName}`, null, conversationId, {
      agentType: 'custom',
      workflowComplete: false
    }).catch(err => {
      console.error('[ConversationAdapter] Failed to send notification:', err);
    });
  }
}

/**
 * Handle agent chaining (implementation <-> review loop)
 */
async function handleAgentChaining(taskId, agentType, context) {
  const { broadcastFn, userId } = context;

  // Check workflow_complete flag
  const task = tasksDb.getById(taskId);
  if (task?.workflow_complete) {
    console.log(`[ConversationAdapter] Task ${taskId} workflow complete, stopping loop`);
    return;
  }

  // Determine next agent type
  const nextType = agentType === 'implementation' ? 'review' : 'implementation';
  console.log(`[ConversationAdapter] Chaining ${agentType} -> ${nextType} for task ${taskId}`);

  // Import dynamically to avoid circular dependency
  const { startAgentRun, getRunningAgentForTask } = await import('./agentRunner.js');

  // Small delay before starting next agent
  setTimeout(async () => {
    try {
      // Re-check workflow_complete
      const freshTask = tasksDb.getById(taskId);
      if (freshTask?.workflow_complete) {
        console.log(`[ConversationAdapter] Task ${taskId} workflow complete (re-check), stopping loop`);
        return;
      }

      // Check for concurrent runs
      const runningAgent = getRunningAgentForTask(taskId);
      if (runningAgent) {
        console.log(`[ConversationAdapter] Another agent already running, skipping chain`);
        return;
      }

      await startAgentRun(taskId, nextType, { broadcastFn, userId });
    } catch (err) {
      console.error(`[ConversationAdapter] Failed to chain to ${nextType}:`, err);

      // Record the chaining failure
      try {
        const failedRun = agentRunsDb.create(taskId, nextType, null);
        agentRunsDb.updateStatus(failedRun.id, 'failed');
      } catch (recordErr) {
        console.error(`[ConversationAdapter] Failed to record chaining failure:`, recordErr);
      }
    }
  }, 1000);
}

// ============================================================================
// MAIN ENTRY POINTS
// ============================================================================

/**
 * Start a new conversation for a task
 *
 * @param {number} taskId - Task ID
 * @param {string} message - First message to send
 * @param {Object} options - Options
 * @param {Function} options.broadcastFn - WebSocket broadcast function
 * @param {number} options.userId - User ID for notifications
 * @param {string} options.customSystemPrompt - Custom system prompt
 * @param {string} options.permissionMode - Permission mode (default: 'bypassPermissions')
 * @param {number} options.conversationId - Existing conversation ID (optional)
 * @param {Array} options.images - Images to include (optional)
 * @returns {Promise<{conversationId: number, claudeSessionId: string}>}
 */
export async function startConversation(taskId, message, options = {}) {
  // Validate and normalize options
  const normalizedOptions = validateAndNormalizeOptions(options, 'startConversation');
  const { broadcastFn, broadcastToTaskSubscribersFn, userId, customSystemPrompt, permissionMode, images } = normalizedOptions;

  // Get task and project info
  const taskWithProject = tasksDb.getWithProject(taskId);
  if (!taskWithProject) {
    throw new Error(`Task ${taskId} not found`);
  }

  const projectPath = taskWithProject.repo_folder_path;

  // Create or use existing conversation
  let conversationId = options.conversationId;
  if (!conversationId) {
    const conversation = conversationsDb.create(taskId);
    conversationId = conversation.id;
    console.log(`[ConversationAdapter] Created conversation ${conversationId} for task ${taskId}`);
  }

  // Build SDK options (permissionMode already validated/normalized)
  const sdkOptions = mapOptionsToSDK({
    cwd: projectPath,
    permissionMode,
    customSystemPrompt
  });

  // Load MCP configuration
  const mcpServers = await loadMcpConfig(projectPath);
  if (mcpServers) {
    sdkOptions.mcpServers = mcpServers;
  }

  // Handle images
  const imageResult = await handleImages(message, images, projectPath);
  const finalMessage = imageResult.modifiedCommand;
  const { tempImagePaths, tempDir } = imageResult;

  // Create SDK query instance
  const queryInstance = query({
    prompt: finalMessage,
    options: sdkOptions
  });

  // Process streaming
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Session creation timeout'));
    }, 30000);

    let claudeSessionId = null;
    let sessionCreatedBroadcast = false;

    const context = {
      conversationId,
      taskId,
      claudeSessionId: null,
      userId,
      broadcastFn,
      broadcastToTaskSubscribersFn
    };

    (async () => {
      try {
        for await (const sdkMessage of queryInstance) {
          // Capture session ID from first message
          if (sdkMessage.session_id && !claudeSessionId) {
            claudeSessionId = sdkMessage.session_id;
            context.claudeSessionId = claudeSessionId;
            clearTimeout(timeout);

            // Track session
            activeSessions.set(claudeSessionId, {
              instance: queryInstance,
              startTime: Date.now(),
              status: 'active',
              tempImagePaths,
              tempDir
            });

            // Update conversation with Claude session ID
            conversationsDb.updateClaudeId(conversationId, claudeSessionId);
            console.log(`[ConversationAdapter] Updated conversation ${conversationId} with session ${claudeSessionId}`);

            // Handle streaming started
            handleStreamingStarted(context);

            // Broadcast conversation-created
            if (broadcastFn) {
              broadcastFn(conversationId, {
                type: 'conversation-created',
                conversationId,
                claudeSessionId
              });
            }

            // Broadcast conversation-added to task subscribers (for live updates on Task Detail page)
            if (broadcastToTaskSubscribersFn) {
              broadcastToTaskSubscribersFn(taskId, {
                type: 'conversation-added',
                conversation: {
                  id: conversationId,
                  task_id: taskId,
                  claude_conversation_id: claudeSessionId,
                  created_at: new Date().toISOString()
                }
              });
            }

            // Resolve immediately with IDs
            resolve({ conversationId, claudeSessionId });
          }

          // Broadcast message to WebSocket clients
          if (broadcastFn) {
            broadcastFn(conversationId, {
              type: 'claude-response',
              data: sdkMessage
            });

            // Broadcast session-created once
            if (claudeSessionId && !sessionCreatedBroadcast) {
              sessionCreatedBroadcast = true;
              broadcastFn(conversationId, {
                type: 'session-created',
                sessionId: claudeSessionId
              });
            }

            // Extract and send token budget from result message
            if (sdkMessage.type === 'result') {
              const tokenBudget = extractTokenBudget(sdkMessage);
              if (tokenBudget) {
                broadcastFn(conversationId, {
                  type: 'token-budget',
                  data: tokenBudget
                });
              }
            }

            // Try to extract token count from assistant message (if SDK includes it)
            if (sdkMessage.type === 'assistant' && sdkMessage.message?.usage) {
              const usage = sdkMessage.message.usage;
              const tokens = (usage.input_tokens || 0) + (usage.output_tokens || 0);
              if (tokens > 0) {
                broadcastFn(conversationId, {
                  type: 'claude-status',
                  data: {
                    tokens: tokens,
                    text: 'Generating...',
                    can_interrupt: true
                  }
                });
              }
            }
          }
        }

        // Clean up session
        if (claudeSessionId) {
          activeSessions.delete(claudeSessionId);
        }

        // Clean up temp files
        await cleanupTempFiles(tempImagePaths, tempDir);

        // Broadcast completion
        if (broadcastFn) {
          broadcastFn(conversationId, {
            type: 'claude-complete',
            sessionId: claudeSessionId,
            exitCode: 0,
            isNewSession: true
          });
        }

        // Handle streaming complete (centralized lifecycle)
        await handleStreamingComplete(context, false);

      } catch (error) {
        console.error('[ConversationAdapter] Streaming error:', error);

        // Clean up
        if (claudeSessionId) {
          activeSessions.delete(claudeSessionId);
        }
        await cleanupTempFiles(tempImagePaths, tempDir);

        // If not resolved yet, reject
        if (!claudeSessionId) {
          clearTimeout(timeout);
          reject(error);
          return;
        }

        // Broadcast error
        if (broadcastFn) {
          broadcastFn(conversationId, {
            type: 'claude-error',
            error: error.message
          });
        }

        // Handle streaming complete with error
        await handleStreamingComplete(context, true);
      }
    })();
  });
}

/**
 * Start a new conversation for a custom agent
 *
 * @param {number} agentId - Agent ID
 * @param {string} message - First message to send
 * @param {Object} options - Options
 * @param {Function} options.broadcastFn - WebSocket broadcast function
 * @param {number} options.userId - User ID for notifications
 * @param {string} options.permissionMode - Permission mode (default: 'bypassPermissions')
 * @param {number} options.conversationId - Existing conversation ID (optional)
 * @param {Array} options.images - Images to include (optional)
 * @returns {Promise<{conversationId: number, claudeSessionId: string}>}
 */
export async function startAgentConversation(agentId, message, options = {}) {
  // Validate and normalize options
  const normalizedOptions = validateAndNormalizeOptions(options, 'startAgentConversation');
  const { broadcastFn, broadcastToTaskSubscribersFn, userId, permissionMode, images } = normalizedOptions;

  // Get agent and project info
  const agentWithProject = agentsDb.getWithProject(agentId);
  if (!agentWithProject) {
    throw new Error(`Agent ${agentId} not found`);
  }

  const projectPath = agentWithProject.repo_folder_path;

  // Build context prompt from project doc + agent prompt (similar to task conversations)
  const agentContextPrompt = buildAgentContextPrompt(projectPath, agentId);

  // Create or use existing conversation
  let conversationId = options.conversationId;
  if (!conversationId) {
    const conversation = conversationsDb.createForAgent(agentId);
    conversationId = conversation.id;
    console.log(`[ConversationAdapter] Created conversation ${conversationId} for agent ${agentId}`);
  }

  // Build SDK options - agent context (project doc + agent prompt) becomes the system prompt
  const sdkOptions = mapOptionsToSDK({
    cwd: projectPath,
    permissionMode,
    customSystemPrompt: agentContextPrompt || undefined
  });

  // Load MCP configuration
  const mcpServers = await loadMcpConfig(projectPath);
  if (mcpServers) {
    sdkOptions.mcpServers = mcpServers;
  }

  // Handle images
  const imageResult = await handleImages(message, images, projectPath);
  const finalMessage = imageResult.modifiedCommand;
  const { tempImagePaths, tempDir } = imageResult;

  // Create SDK query instance
  const queryInstance = query({
    prompt: finalMessage,
    options: sdkOptions
  });

  // Process streaming
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Session creation timeout'));
    }, 30000);

    let claudeSessionId = null;
    let sessionCreatedBroadcast = false;

    // Context for lifecycle events - agentId instead of taskId
    const context = {
      conversationId,
      agentId,
      taskId: null, // No task for agent conversations
      claudeSessionId: null,
      userId,
      broadcastFn,
      broadcastToTaskSubscribersFn
    };

    (async () => {
      try {
        for await (const sdkMessage of queryInstance) {
          // Capture session ID from first message
          if (sdkMessage.session_id && !claudeSessionId) {
            claudeSessionId = sdkMessage.session_id;
            context.claudeSessionId = claudeSessionId;
            clearTimeout(timeout);

            // Track session
            activeSessions.set(claudeSessionId, {
              instance: queryInstance,
              startTime: Date.now(),
              status: 'active',
              tempImagePaths,
              tempDir
            });

            // Update conversation with Claude session ID
            conversationsDb.updateClaudeId(conversationId, claudeSessionId);
            console.log(`[ConversationAdapter] Updated conversation ${conversationId} with session ${claudeSessionId}`);

            // Track active streaming session (for agent, taskId is null)
            activeStreamingSessions.set(claudeSessionId, { taskId: null, agentId, conversationId });

            // Broadcast conversation-created
            if (broadcastFn) {
              broadcastFn(conversationId, {
                type: 'streaming-started',
                agentId,
                conversationId,
                claudeSessionId
              });

              broadcastFn(conversationId, {
                type: 'conversation-created',
                conversationId,
                claudeSessionId
              });
            }

            // Resolve immediately with IDs
            resolve({ conversationId, claudeSessionId });
          }

          // Broadcast message to WebSocket clients
          if (broadcastFn) {
            broadcastFn(conversationId, {
              type: 'claude-response',
              data: sdkMessage
            });

            // Broadcast session-created once
            if (claudeSessionId && !sessionCreatedBroadcast) {
              sessionCreatedBroadcast = true;
              broadcastFn(conversationId, {
                type: 'session-created',
                sessionId: claudeSessionId
              });
            }

            // Extract and send token budget from result message
            if (sdkMessage.type === 'result') {
              const tokenBudget = extractTokenBudget(sdkMessage);
              if (tokenBudget) {
                broadcastFn(conversationId, {
                  type: 'token-budget',
                  data: tokenBudget
                });
              }
            }
          }
        }

        // Clean up session
        if (claudeSessionId) {
          activeSessions.delete(claudeSessionId);
          activeStreamingSessions.delete(claudeSessionId);
        }

        // Clean up temp files
        await cleanupTempFiles(tempImagePaths, tempDir);

        // Broadcast completion
        if (broadcastFn) {
          broadcastFn(conversationId, {
            type: 'streaming-ended',
            agentId,
            conversationId
          });

          broadcastFn(conversationId, {
            type: 'claude-complete',
            sessionId: claudeSessionId,
            exitCode: 0,
            isNewSession: true
          });
        }

        // Send push notification (for agent conversations)
        if (userId) {
          const agentName = agentWithProject.name;
          notifyClaudeComplete(userId, `Agent: ${agentName}`, null, conversationId, {
            agentType: 'custom',
            workflowComplete: false
          }).catch(err => {
            console.error('[ConversationAdapter] Failed to send notification:', err);
          });
        }

        console.log(`[ConversationAdapter] Agent conversation ${conversationId} completed`);

      } catch (error) {
        console.error('[ConversationAdapter] Agent streaming error:', error);

        // Clean up
        if (claudeSessionId) {
          activeSessions.delete(claudeSessionId);
          activeStreamingSessions.delete(claudeSessionId);
        }
        await cleanupTempFiles(tempImagePaths, tempDir);

        // If not resolved yet, reject
        if (!claudeSessionId) {
          clearTimeout(timeout);
          reject(error);
          return;
        }

        // Broadcast error
        if (broadcastFn) {
          broadcastFn(conversationId, {
            type: 'streaming-ended',
            agentId,
            conversationId
          });

          broadcastFn(conversationId, {
            type: 'claude-error',
            error: error.message
          });
        }
      }
    })();
  });
}

/**
 * Send a message to an existing conversation (resume)
 *
 * @param {number} conversationId - Conversation ID
 * @param {string} message - Message to send
 * @param {Object} options - Options
 * @param {Function} options.broadcastFn - WebSocket broadcast function
 * @param {number} options.userId - User ID for notifications
 * @param {Array} options.images - Images to include (optional)
 * @param {string} options.permissionMode - Permission mode (default: 'bypassPermissions')
 * @returns {Promise<void>}
 */
export async function sendMessage(conversationId, message, options = {}) {
  // Validate and normalize options
  const normalizedOptions = validateAndNormalizeOptions(options, 'sendMessage');
  const { broadcastFn, broadcastToTaskSubscribersFn, userId, images, permissionMode } = normalizedOptions;

  // Get conversation
  const conversation = conversationsDb.getById(conversationId);
  if (!conversation) {
    throw new Error(`Conversation ${conversationId} not found`);
  }

  if (!conversation.claude_conversation_id) {
    throw new Error(`Conversation ${conversationId} has no Claude session ID yet`);
  }

  const claudeSessionId = conversation.claude_conversation_id;
  const taskId = conversation.task_id;
  const agentId = conversation.agent_id;

  // Get project path based on whether this is a task or agent conversation
  let projectPath;
  if (taskId) {
    const taskWithProject = tasksDb.getWithProject(taskId);
    if (!taskWithProject) {
      throw new Error(`Task ${taskId} not found`);
    }
    projectPath = taskWithProject.repo_folder_path;
  } else if (agentId) {
    const agentWithProject = agentsDb.getWithProject(agentId);
    if (!agentWithProject) {
      throw new Error(`Agent ${agentId} not found`);
    }
    projectPath = agentWithProject.repo_folder_path;
  } else {
    throw new Error(`Conversation ${conversationId} has no task_id or agent_id`);
  }

  // Build SDK options for resume (permissionMode already validated/normalized)
  const sdkOptions = mapOptionsToSDK({
    cwd: projectPath,
    sessionId: claudeSessionId,
    permissionMode
  });

  // Load MCP configuration
  const mcpServers = await loadMcpConfig(projectPath);
  if (mcpServers) {
    sdkOptions.mcpServers = mcpServers;
  }

  // Handle images
  const imageResult = await handleImages(message, images, projectPath);
  const finalMessage = imageResult.modifiedCommand;
  const { tempImagePaths, tempDir } = imageResult;

  // Context for lifecycle events
  const context = {
    conversationId,
    taskId,
    agentId,
    claudeSessionId,
    userId,
    broadcastFn,
    broadcastToTaskSubscribersFn
  };

  // Handle streaming started (handles both task and agent conversations)
  handleStreamingStarted(context);

  // Create SDK query instance
  const queryInstance = query({
    prompt: finalMessage,
    options: sdkOptions
  });

  // Track session
  activeSessions.set(claudeSessionId, {
    instance: queryInstance,
    startTime: Date.now(),
    status: 'active',
    tempImagePaths,
    tempDir
  });

  try {
    let sessionCreatedBroadcast = false;

    for await (const sdkMessage of queryInstance) {
      // Broadcast message to WebSocket clients
      if (broadcastFn) {
        broadcastFn(conversationId, {
          type: 'claude-response',
          data: sdkMessage
        });

        // Broadcast session-created once (for resumed sessions)
        if (sdkMessage.session_id && !sessionCreatedBroadcast) {
          sessionCreatedBroadcast = true;
          broadcastFn(conversationId, {
            type: 'session-created',
            sessionId: claudeSessionId
          });
        }

        // Extract and send token budget
        if (sdkMessage.type === 'result') {
          const tokenBudget = extractTokenBudget(sdkMessage);
          if (tokenBudget) {
            broadcastFn(conversationId, {
              type: 'token-budget',
              data: tokenBudget
            });
          }
        }
      }
    }

    // Clean up session
    activeSessions.delete(claudeSessionId);

    // Clean up temp files
    await cleanupTempFiles(tempImagePaths, tempDir);

    // Broadcast completion
    if (broadcastFn) {
      broadcastFn(conversationId, {
        type: 'claude-complete',
        sessionId: claudeSessionId,
        exitCode: 0,
        isNewSession: false
      });
    }

    // Handle streaming complete (centralized lifecycle)
    await handleStreamingComplete(context, false);

  } catch (error) {
    console.error('[ConversationAdapter] Resume streaming error:', error);

    // Clean up
    activeSessions.delete(claudeSessionId);
    await cleanupTempFiles(tempImagePaths, tempDir);

    // Broadcast error
    if (broadcastFn) {
      broadcastFn(conversationId, {
        type: 'claude-error',
        error: error.message
      });
    }

    // Handle streaming complete with error
    await handleStreamingComplete(context, true);

    throw error;
  }
}

/**
 * Abort an active session
 */
export async function abortSession(sessionId) {
  const session = activeSessions.get(sessionId);
  if (!session) {
    console.log(`[ConversationAdapter] Session ${sessionId} not found`);
    return false;
  }

  try {
    console.log(`[ConversationAdapter] Aborting session: ${sessionId}`);
    await session.instance.interrupt();
    session.status = 'aborted';
    await cleanupTempFiles(session.tempImagePaths, session.tempDir);
    activeSessions.delete(sessionId);
    activeStreamingSessions.delete(sessionId);
    return true;
  } catch (error) {
    console.error(`[ConversationAdapter] Error aborting session ${sessionId}:`, error);
    return false;
  }
}

/**
 * Check if a session is active
 */
export function isSessionActive(sessionId) {
  const session = activeSessions.get(sessionId);
  return session && session.status === 'active';
}

/**
 * Get all active session IDs
 */
export function getActiveSessions() {
  return Array.from(activeSessions.keys());
}

/**
 * Get active streaming session by conversation ID
 */
export function getActiveStreamingByConversation(conversationId) {
  for (const [sessionId, data] of activeStreamingSessions.entries()) {
    if (data.conversationId === conversationId) {
      return { sessionId, ...data };
    }
  }
  return null;
}

/**
 * Get all active streaming sessions
 * Returns array of {sessionId, taskId, conversationId}
 */
export function getAllActiveStreamingSessions() {
  const sessions = [];
  for (const [sessionId, data] of activeStreamingSessions.entries()) {
    sessions.push({
      sessionId,
      taskId: data.taskId,
      conversationId: data.conversationId
    });
  }
  return sessions;
}
