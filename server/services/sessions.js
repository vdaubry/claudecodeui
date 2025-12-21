/**
 * SESSION MESSAGE READING SERVICE
 * ================================
 *
 * This module provides functionality to read messages from Claude CLI's JSONL session files.
 * Used for loading conversation history when resuming a conversation.
 *
 * Claude stores conversation data in:
 * - ~/.claude/projects/{encoded-project-name}/*.jsonl
 *
 * The JSONL files contain entries with:
 * - sessionId: The Claude session ID
 * - message: The message content
 * - timestamp: When the message was sent
 */

import { promises as fs } from 'fs';
import fsSync from 'fs';
import path from 'path';
import readline from 'readline';
import os from 'os';

/**
 * Parse a JSONL file and extract session information
 * @param {string} filePath - Path to the JSONL file
 * @returns {Promise<{sessions: Array, entries: Array}>} Parsed sessions and entries
 */
async function parseJsonlSessions(filePath) {
  const sessions = new Map();
  const entries = [];
  const pendingSummaries = new Map(); // leafUuid -> summary for entries without sessionId

  try {
    const fileStream = fsSync.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      if (line.trim()) {
        try {
          const entry = JSON.parse(line);
          entries.push(entry);

          // Handle summary entries that don't have sessionId yet
          if (entry.type === 'summary' && entry.summary && !entry.sessionId && entry.leafUuid) {
            pendingSummaries.set(entry.leafUuid, entry.summary);
          }

          if (entry.sessionId) {
            if (!sessions.has(entry.sessionId)) {
              sessions.set(entry.sessionId, {
                id: entry.sessionId,
                summary: 'New Session',
                messageCount: 0,
                lastActivity: new Date(),
                cwd: entry.cwd || '',
                lastUserMessage: null,
                lastAssistantMessage: null
              });
            }

            const session = sessions.get(entry.sessionId);

            // Apply pending summary if this entry has a parentUuid that matches a pending summary
            if (session.summary === 'New Session' && entry.parentUuid && pendingSummaries.has(entry.parentUuid)) {
              session.summary = pendingSummaries.get(entry.parentUuid);
            }

            // Update summary from summary entries with sessionId
            if (entry.type === 'summary' && entry.summary) {
              session.summary = entry.summary;
            }

            // Track last user and assistant messages (skip system messages)
            if (entry.message?.role === 'user' && entry.message?.content) {
              const content = entry.message.content;

              // Extract text from array format if needed
              let textContent = content;
              if (Array.isArray(content) && content.length > 0 && content[0].type === 'text') {
                textContent = content[0].text;
              }

              const isSystemMessage = typeof textContent === 'string' && (
                textContent.startsWith('<command-name>') ||
                textContent.startsWith('<command-message>') ||
                textContent.startsWith('<command-args>') ||
                textContent.startsWith('<local-command-stdout>') ||
                textContent.startsWith('<system-reminder>') ||
                textContent.startsWith('Caveat:') ||
                textContent.startsWith('This session is being continued from a previous') ||
                textContent.startsWith('Invalid API key') ||
                textContent.includes('{"subtasks":') || // Filter Task Master prompts
                textContent.includes('CRITICAL: You MUST respond with ONLY a JSON') || // Filter Task Master system prompts
                textContent === 'Warmup' // Explicitly filter out "Warmup"
              );

              if (typeof textContent === 'string' && textContent.length > 0 && !isSystemMessage) {
                session.lastUserMessage = textContent;
              }
            } else if (entry.message?.role === 'assistant' && entry.message?.content) {
              // Skip API error messages using the isApiErrorMessage flag
              if (entry.isApiErrorMessage === true) {
                // Skip this message entirely
              } else {
                // Track last assistant text message
                let assistantText = null;

                if (Array.isArray(entry.message.content)) {
                  for (const part of entry.message.content) {
                    if (part.type === 'text' && part.text) {
                      assistantText = part.text;
                    }
                  }
                } else if (typeof entry.message.content === 'string') {
                  assistantText = entry.message.content;
                }

                // Additional filter for assistant messages with system content
                const isSystemAssistantMessage = typeof assistantText === 'string' && (
                  assistantText.startsWith('Invalid API key') ||
                  assistantText.includes('{"subtasks":') ||
                  assistantText.includes('CRITICAL: You MUST respond with ONLY a JSON')
                );

                if (assistantText && !isSystemAssistantMessage) {
                  session.lastAssistantMessage = assistantText;
                }
              }
            }

            session.messageCount++;

            if (entry.timestamp) {
              session.lastActivity = new Date(entry.timestamp);
            }
          }
        } catch (parseError) {
          // Skip malformed lines silently
        }
      }
    }

    // After processing all entries, set final summary based on last message if no summary exists
    for (const session of sessions.values()) {
      if (session.summary === 'New Session') {
        // Prefer last user message, fall back to last assistant message
        const lastMessage = session.lastUserMessage || session.lastAssistantMessage;
        if (lastMessage) {
          session.summary = lastMessage.length > 50 ? lastMessage.substring(0, 50) + '...' : lastMessage;
        }
      }
    }

    // Filter out sessions that contain JSON responses (Task Master errors)
    const allSessions = Array.from(sessions.values());
    const filteredSessions = allSessions.filter(session => {
      const shouldFilter = session.summary.startsWith('{ "');
      return !shouldFilter;
    });

    return {
      sessions: filteredSessions,
      entries: entries
    };

  } catch (error) {
    console.error('Error reading JSONL file:', error);
    return { sessions: [], entries: [] };
  }
}

/**
 * Get messages for a specific Claude session with pagination support
 * @param {string} claudeSessionId - The Claude session ID
 * @param {string} projectFolderPath - The project's repo folder path
 * @param {number|null} limit - Maximum number of messages to return (null for all)
 * @param {number} offset - Number of messages to skip from the end
 * @returns {Promise<Object|Array>} Messages with pagination info, or array if no limit
 */
async function getSessionMessages(claudeSessionId, projectFolderPath, limit = null, offset = 0) {
  // Encode the project path to match Claude's directory naming convention
  // Claude uses the absolute path with / replaced by - and _ replaced by -
  // The leading dash is preserved (e.g., /home/user/project -> -home-user-project)
  const encodedPath = projectFolderPath.replace(/\//g, '-').replace(/_/g, '-');
  const projectDir = path.join(os.homedir(), '.claude', 'projects', encodedPath);

  try {
    const files = await fs.readdir(projectDir);
    // agent-*.jsonl files contain session start data at this point
    const jsonlFiles = files.filter(file => file.endsWith('.jsonl') && !file.startsWith('agent-'));

    if (jsonlFiles.length === 0) {
      return { messages: [], total: 0, hasMore: false };
    }

    const messages = [];

    // Process all JSONL files to find messages for this session
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
            if (entry.sessionId === claudeSessionId) {
              messages.push(entry);
            }
          } catch (parseError) {
            console.warn('Error parsing line:', parseError.message);
          }
        }
      }
    }

    // Sort messages by timestamp
    const sortedMessages = messages.sort((a, b) =>
      new Date(a.timestamp || 0) - new Date(b.timestamp || 0)
    );

    const total = sortedMessages.length;

    // If no limit is specified, return all messages (backward compatibility)
    if (limit === null) {
      return sortedMessages;
    }

    // Apply pagination - for recent messages, we need to slice from the end
    // offset 0 should give us the most recent messages
    const startIndex = Math.max(0, total - offset - limit);
    const endIndex = total - offset;
    const paginatedMessages = sortedMessages.slice(startIndex, endIndex);
    const hasMore = startIndex > 0;

    return {
      messages: paginatedMessages,
      total,
      hasMore,
      offset,
      limit
    };
  } catch (error) {
    console.error(`Error reading messages for session ${claudeSessionId}:`, error);
    return limit === null ? [] : { messages: [], total: 0, hasMore: false };
  }
}

/**
 * Extract token usage from session messages
 * Based on Claude's statusline-command.sh logic:
 * - Finds the most recent main chain entry with usage data
 * - Excludes sidechains and API errors
 * - Returns input_tokens + cache_read_input_tokens + cache_creation_input_tokens
 *
 * @param {string} claudeSessionId - The Claude session ID
 * @param {string} projectFolderPath - The project's repo folder path
 * @returns {Promise<Object>} Token usage metadata
 */
async function getSessionTokenUsage(claudeSessionId, projectFolderPath) {
  const encodedPath = projectFolderPath.replace(/\//g, '-').replace(/_/g, '-');
  const projectDir = path.join(os.homedir(), '.claude', 'projects', encodedPath);

  try {
    const files = await fs.readdir(projectDir);
    const jsonlFiles = files.filter(file => file.endsWith('.jsonl') && !file.startsWith('agent-'));

    if (jsonlFiles.length === 0) {
      return { tokens: 0, contextWindow: 200000 };
    }

    const entries = [];

    // Collect all entries for this session
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
            if (entry.sessionId === claudeSessionId) {
              entries.push(entry);
            }
          } catch (parseError) {
            // Skip malformed lines
          }
        }
      }
    }

    // Filter to main chain entries only (exclude sidechains and API errors)
    // and find entries with usage data
    const usageEntries = entries.filter(entry =>
      entry.message?.usage &&
      entry.isSidechain !== true &&
      entry.isApiErrorMessage !== true &&
      entry.timestamp
    );

    if (usageEntries.length === 0) {
      return { tokens: 0, contextWindow: 200000 };
    }

    // Sort by timestamp to find most recent
    usageEntries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Get the most recent entry with usage
    const latestEntry = usageEntries[0];
    const usage = latestEntry.message.usage;

    // Calculate context length (input tokens only, like statusline script)
    const inputTokens = usage.input_tokens || 0;
    const cacheReadTokens = usage.cache_read_input_tokens || 0;
    const cacheCreationTokens = usage.cache_creation_input_tokens || 0;
    const outputTokens = usage.output_tokens || 0;

    const contextUsed = inputTokens + cacheReadTokens + cacheCreationTokens;
    const totalUsed = contextUsed + outputTokens;

    return {
      tokens: totalUsed,
      contextUsed,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheCreationTokens,
      contextWindow: 200000
    };
  } catch (error) {
    console.error(`Error extracting token usage for session ${claudeSessionId}:`, error);
    return { tokens: 0, contextWindow: 200000 };
  }
}

export {
  parseJsonlSessions,
  getSessionMessages,
  getSessionTokenUsage
};
