import { test, expect } from '@playwright/test';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Agent New Conversation Streaming Test
 *
 * This test specifically verifies that when creating a new agent conversation:
 * 1. The modal form is displayed and submitted
 * 2. ChatInterface displays the initial user message
 * 3. Streamed responses from Claude are properly displayed
 *
 * This catches the bug where session ID mismatch caused messages to be ignored.
 * The bug manifested as: "[useSessionStreaming] Ignoring message for different session"
 */

// Test constants
const TEST_TOKEN = process.env.AUTH_TOKEN || '1f07cec67bcdd51e0fab5f2310169817f5e7abb7293ab1bcf9dfe7d26c50cf5c';
const HELLO_WORLD_PATH = '/home/ubuntu/misc/hello_world';
const DB_PATH = path.join(__dirname, '../server/database/auth.db');

// Timeout constants
const UI_TIMEOUT = 2000;
const UI_TIMEOUT_SLOW = 5000;
const BACKEND_TIMEOUT = 30000;
const STREAMING_TIMEOUT = 60000;

// Helper to get database connection
function getDb() {
  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');
  return db;
}

// Helper to ensure hello_world project directory exists
async function ensureHelloWorldProject() {
  if (!fs.existsSync(HELLO_WORLD_PATH)) {
    fs.mkdirSync(HELLO_WORLD_PATH, { recursive: true });
  }

  const claudeUiDir = path.join(HELLO_WORLD_PATH, '.claude-ui');
  if (!fs.existsSync(claudeUiDir)) {
    fs.mkdirSync(claudeUiDir, { recursive: true });
  }

  const projectDocPath = path.join(claudeUiDir, 'project.md');
  if (!fs.existsSync(projectDocPath)) {
    fs.writeFileSync(projectDocPath, `# Hello World Project\nThis is a simple test project.\n`);
  }

  console.log('Hello World project fixture ready');
}

// Helper to ensure test agent exists (creates project via API if needed)
async function ensureTestAgent() {
  const db = getDb();
  try {
    // Find the hello_world project
    let project = db.prepare('SELECT id FROM projects WHERE repo_folder_path = ?').get(HELLO_WORLD_PATH);

    if (!project) {
      // Create the project via DB (will be created via UI in test if needed)
      console.log('hello_world project not in DB, will be created via UI');
      return null;
    }

    // Check if streaming test agent exists
    const agent = db.prepare('SELECT id FROM agents WHERE project_id = ? AND name = ?').get(project.id, 'Streaming Test Agent');

    if (!agent) {
      // Create the agent
      const result = db.prepare('INSERT INTO agents (project_id, name, created_at, updated_at) VALUES (?, ?, datetime("now"), datetime("now"))').run(project.id, 'Streaming Test Agent');
      console.log('Created Streaming Test Agent with id:', result.lastInsertRowid);
      return result.lastInsertRowid;
    }

    return agent.id;
  } finally {
    db.close();
  }
}

// Helper to clean up test conversations for fresh test runs
async function cleanupTestConversations() {
  const db = getDb();
  try {
    const project = db.prepare('SELECT id FROM projects WHERE repo_folder_path = ?').get(HELLO_WORLD_PATH);
    if (!project) return;

    const agent = db.prepare('SELECT id FROM agents WHERE project_id = ? AND name = ?').get(project.id, 'Streaming Test Agent');
    if (!agent) return;

    // Delete conversations for this agent
    db.prepare('DELETE FROM conversations WHERE agent_id = ?').run(agent.id);
    console.log('Cleaned up test conversations for Streaming Test Agent');
  } finally {
    db.close();
  }
}

// Helper to navigate and authenticate
async function navigateAndAuth(page) {
  await page.goto(`/?token=${TEST_TOKEN}`);
  await page.waitForLoadState('networkidle');

  const loginVisible = await page.locator('text=Welcome Back').isVisible().catch(() => false);
  if (loginVisible) {
    await page.reload();
    await page.waitForLoadState('networkidle');
  }

  await page.waitForSelector('h1:has-text("Claude Code UI")', { timeout: UI_TIMEOUT_SLOW });
}

test.describe('Agent New Conversation Streaming', () => {
  test.beforeAll(async () => {
    await ensureHelloWorldProject();
    await ensureTestAgent();
    await cleanupTestConversations();
  });

  test.afterAll(async () => {
    await cleanupTestConversations();
  });

  test('streamed messages are displayed when creating a new agent conversation', async ({ page }) => {
    test.setTimeout(STREAMING_TIMEOUT + 30000);

    // Collect console messages to check for session ID mismatch errors
    const consoleMessages = [];
    page.on('console', msg => {
      consoleMessages.push({ type: msg.type(), text: msg.text() });
    });

    // Step 1: Navigate and authenticate
    await navigateAndAuth(page);
    console.log('Step 1: Authenticated');

    // Step 2: Navigate to hello_world project (create if needed)
    await page.waitForTimeout(500);
    let projectCard = page.locator('[data-testid="project-card-grid-hello-world"]');
    const projectExists = await projectCard.isVisible().catch(() => false);

    if (!projectExists) {
      console.log('Creating hello_world project via UI...');
      await page.waitForSelector('button:has-text("New Project")', { state: 'visible', timeout: UI_TIMEOUT });
      await page.click('button:has-text("New Project")');
      await expect(page.locator('text=Create New Project')).toBeVisible({ timeout: UI_TIMEOUT });
      await page.fill('input#project-name', 'hello world');
      await page.fill('input#repo-path', HELLO_WORLD_PATH);
      await page.click('button[type="submit"]:has-text("Create Project")');

      const errorVisible = await page.locator('text=already exists').isVisible({ timeout: 2000 }).catch(() => false);
      if (errorVisible) {
        await page.click('button:has-text("Cancel")');
        await expect(page.locator('text=Create New Project')).not.toBeVisible({ timeout: UI_TIMEOUT });
      } else {
        await expect(page.locator('text=Create New Project')).not.toBeVisible({ timeout: UI_TIMEOUT_SLOW });
      }
      projectCard = page.locator('[data-testid="project-card-grid-hello-world"]');
    }

    await expect(projectCard).toBeVisible({ timeout: UI_TIMEOUT_SLOW });
    await projectCard.click();
    await expect(page.locator('h1:has-text("hello world")')).toBeVisible({ timeout: UI_TIMEOUT_SLOW });
    console.log('Step 2: Navigated to project');

    // Step 3: Switch to Custom Agents tab
    const agentsTabButton = page.locator('button:has-text("Custom Agents")');
    await expect(agentsTabButton).toBeVisible({ timeout: UI_TIMEOUT });
    await agentsTabButton.click();
    await page.waitForTimeout(300);
    console.log('Step 3: Switched to agents tab');

    // Step 4: Click on Streaming Test Agent (or create it if needed)
    let agentCard = page.locator('[data-testid^="agent-card-"]').filter({ hasText: 'Streaming Test Agent' });
    const agentExists = await agentCard.isVisible({ timeout: 2000 }).catch(() => false);

    if (!agentExists) {
      // Create the agent via UI
      const newAgentBtn = page.locator('button:has-text("New Agent")').or(page.locator('button:has-text("Create Your First Agent")'));
      await newAgentBtn.first().click();
      await expect(page.locator('text=Create New Agent')).toBeVisible({ timeout: UI_TIMEOUT });
      await page.fill('input#agent-name', 'Streaming Test Agent');
      await page.click('button[type="submit"]:has-text("Create Agent")');
      await expect(page.locator('text=Create New Agent')).not.toBeVisible({ timeout: UI_TIMEOUT });
      agentCard = page.locator('[data-testid^="agent-card-"]').filter({ hasText: 'Streaming Test Agent' });
    }

    await expect(agentCard).toBeVisible({ timeout: UI_TIMEOUT_SLOW });
    await agentCard.click();
    await expect(page.locator('h1:has-text("Streaming Test Agent")')).toBeVisible({ timeout: UI_TIMEOUT_SLOW });
    console.log('Step 4: Navigated to agent detail view');

    // Step 5: Click "New Chat" button - Modal should be displayed
    const newChatBtn = page.locator('button:has-text("New Chat")');
    await expect(newChatBtn).toBeVisible({ timeout: UI_TIMEOUT });
    await newChatBtn.click();

    // ASSERTION: Modal form should be displayed
    await expect(page.locator('h2:has-text("New Agent Conversation")')).toBeVisible({ timeout: UI_TIMEOUT });
    console.log('Step 5: New conversation modal displayed');

    // Step 6: Type message and submit form
    const testMessage = 'Say exactly: "Streaming test successful"';
    const modalInput = page.locator('.fixed textarea').first();
    await expect(modalInput).toBeVisible({ timeout: UI_TIMEOUT });
    await modalInput.fill(testMessage);

    const submitButton = page.locator('button:has-text("Start Conversation")');
    await expect(submitButton).toBeEnabled({ timeout: BACKEND_TIMEOUT });
    await submitButton.click();
    console.log('Step 6: Form submitted');

    // Step 7: Wait for navigation to ChatInterface
    await expect(page.locator('h2:has-text("New Agent Conversation")')).not.toBeVisible({ timeout: BACKEND_TIMEOUT });
    await expect(async () => {
      const url = page.url();
      expect(url).toContain('/chat/');
    }).toPass({ timeout: BACKEND_TIMEOUT });
    console.log('Step 7: Navigated to ChatInterface');

    // ASSERTION: Initial user message should be displayed in ChatInterface
    await expect(page.locator('.chat-message.user')).toBeVisible({ timeout: UI_TIMEOUT_SLOW });
    await expect(page.locator(`text=${testMessage}`)).toBeVisible({ timeout: UI_TIMEOUT_SLOW });
    console.log('Step 8: User message visible in ChatInterface');

    // Step 9: Wait for streaming to start
    // We should see either the "Responding" button, thinking indicator, or actual content appearing
    await expect(async () => {
      const thinkingVisible = await page.locator('text=Thinking').isVisible().catch(() => false);
      const respondingVisible = await page.locator('button:has-text("Responding")').isVisible().catch(() => false);
      const assistantVisible = await page.locator('.chat-message.assistant').isVisible().catch(() => false);
      const toolVisible = await page.locator('.chat-message.tool').isVisible().catch(() => false);
      expect(thinkingVisible || respondingVisible || assistantVisible || toolVisible).toBeTruthy();
    }).toPass({ timeout: BACKEND_TIMEOUT });
    console.log('Step 9: Streaming started');

    // Step 10: Wait for streaming to complete
    await expect(async () => {
      const respondingBtnVisible = await page.locator('button:has-text("Responding")').isVisible().catch(() => false);
      const thinkingVisible = await page.locator('text=Thinking...').isVisible().catch(() => false);
      expect(respondingBtnVisible || thinkingVisible).toBeFalsy();
    }).toPass({ timeout: STREAMING_TIMEOUT });
    console.log('Step 10: Streaming completed');

    // CRITICAL ASSERTION: Streamed assistant response should be visible
    const assistantMessages = page.locator('.chat-message.assistant');
    await expect(async () => {
      const count = await assistantMessages.count();
      expect(count).toBeGreaterThan(0);
    }).toPass({ timeout: UI_TIMEOUT_SLOW });

    // Verify the response has actual content
    const responseText = await assistantMessages.first().textContent();
    expect(responseText.length).toBeGreaterThan(0);
    console.log('Step 11: Assistant response visible with content');

    // CRITICAL ASSERTION: Check console for session ID mismatch errors
    // This is the bug we're specifically testing for
    const sessionMismatchErrors = consoleMessages.filter(msg =>
      msg.text.includes('Ignoring message for different session')
    );

    if (sessionMismatchErrors.length > 0) {
      console.error('SESSION ID MISMATCH DETECTED:', sessionMismatchErrors);
    }

    expect(sessionMismatchErrors.length).toBe(0);
    console.log('Step 12: No session ID mismatch errors in console');

    console.log('TEST PASSED: Agent new conversation streaming works correctly');
  });

  test('resume ongoing agent conversation with new message', async ({ page }) => {
    test.setTimeout(STREAMING_TIMEOUT + 60000);

    /**
     * Scenario 2: Resume ongoing conversation
     * - Load previous messages via REST API
     * - Send a NEW follow-up message
     * - Verify new response streams via WebSocket
     */

    // Collect console messages to check for errors
    const consoleMessages = [];
    page.on('console', msg => {
      consoleMessages.push({ type: msg.type(), text: msg.text() });
    });

    // Step 1: Navigate and authenticate
    await navigateAndAuth(page);
    console.log('Resume test Step 1: Authenticated');

    // Step 2: Navigate to project
    await page.waitForTimeout(500);
    const projectCard = page.locator('[data-testid="project-card-grid-hello-world"]');
    await expect(projectCard).toBeVisible({ timeout: UI_TIMEOUT_SLOW });
    await projectCard.click();
    await expect(page.locator('h1:has-text("hello world")')).toBeVisible({ timeout: UI_TIMEOUT_SLOW });
    console.log('Resume test Step 2: Navigated to project');

    // Step 3: Switch to Custom Agents tab
    const agentsTabButton = page.locator('button:has-text("Custom Agents")');
    await expect(agentsTabButton).toBeVisible({ timeout: UI_TIMEOUT });
    await agentsTabButton.click();
    await page.waitForTimeout(500);
    console.log('Resume test Step 3: Switched to agents tab');

    // Step 4: Find and click on Streaming Test Agent
    const agentCard = page.locator('[data-testid^="agent-card-"]').filter({ hasText: 'Streaming Test Agent' });

    // Wait for agent card with retry
    await expect(async () => {
      const visible = await agentCard.isVisible();
      expect(visible).toBeTruthy();
    }).toPass({ timeout: UI_TIMEOUT_SLOW });

    await agentCard.click();
    await expect(page.locator('h1:has-text("Streaming Test Agent")')).toBeVisible({ timeout: UI_TIMEOUT_SLOW });
    console.log('Resume test Step 4: Navigated to agent detail view');

    // Step 5: Wait for conversations list to load and find a conversation
    // Use retry logic since the API call takes time
    const conversationRow = page.locator('[data-testid^="conversation-row-"]').first();

    await expect(async () => {
      const count = await page.locator('[data-testid^="conversation-row-"]').count();
      expect(count).toBeGreaterThan(0);
    }).toPass({ timeout: BACKEND_TIMEOUT });

    console.log('Resume test Step 5: Found conversation to resume');

    // Step 6: Click on the conversation row to open it (not Resume button, just click the row)
    await conversationRow.click();

    // Wait for navigation to chat page
    await expect(async () => {
      const url = page.url();
      expect(url).toContain('/chat/');
    }).toPass({ timeout: BACKEND_TIMEOUT });
    console.log('Resume test Step 6: Navigated to chat page');

    // Step 7: CRITICAL - Verify previous messages are loaded via REST API
    // This confirms the REST loading part of resume flow
    await expect(page.locator('.chat-message.user').first()).toBeVisible({ timeout: UI_TIMEOUT_SLOW });
    await expect(page.locator('.chat-message.assistant').first()).toBeVisible({ timeout: UI_TIMEOUT_SLOW });

    const initialUserMsgCount = await page.locator('.chat-message.user').count();
    const initialAssistantMsgCount = await page.locator('.chat-message.assistant').count();
    expect(initialUserMsgCount).toBeGreaterThan(0);
    expect(initialAssistantMsgCount).toBeGreaterThan(0);
    console.log(`Resume test Step 7: Previous messages loaded (${initialUserMsgCount} user, ${initialAssistantMsgCount} assistant)`);

    // Step 8: Send a NEW follow-up message
    const chatInput = page.locator('textarea').first();
    await expect(chatInput).toBeVisible({ timeout: UI_TIMEOUT });

    const followUpMessage = 'This is a follow-up message to test resume flow';
    await chatInput.fill(followUpMessage);

    const sendButton = page.locator('[data-testid="message-submit-button"]');
    await expect(sendButton).toBeEnabled({ timeout: UI_TIMEOUT });
    await sendButton.click();
    console.log('Resume test Step 8: Follow-up message sent');

    // Step 9: Verify the new user message appears
    await expect(page.locator(`text=${followUpMessage}`)).toBeVisible({ timeout: UI_TIMEOUT_SLOW });
    console.log('Resume test Step 9: New user message visible');

    // Step 10: Wait for streaming to start (WebSocket flow)
    await expect(async () => {
      const thinkingVisible = await page.locator('text=Thinking').isVisible().catch(() => false);
      const respondingVisible = await page.locator('button:has-text("Responding")').isVisible().catch(() => false);
      const newAssistantMsg = await page.locator('.chat-message.assistant').count();
      // Either streaming indicator OR a new assistant message appeared
      expect(thinkingVisible || respondingVisible || newAssistantMsg > initialAssistantMsgCount).toBeTruthy();
    }).toPass({ timeout: BACKEND_TIMEOUT });
    console.log('Resume test Step 10: Streaming started for follow-up');

    // Step 11: Wait for streaming to complete
    await expect(async () => {
      const respondingBtnVisible = await page.locator('button:has-text("Responding")').isVisible().catch(() => false);
      const thinkingVisible = await page.locator('text=Thinking...').isVisible().catch(() => false);
      expect(respondingBtnVisible || thinkingVisible).toBeFalsy();
    }).toPass({ timeout: STREAMING_TIMEOUT });
    console.log('Resume test Step 11: Streaming completed');

    // Step 12: CRITICAL - Verify we now have MORE messages (new response was streamed)
    const finalUserMsgCount = await page.locator('.chat-message.user').count();
    const finalAssistantMsgCount = await page.locator('.chat-message.assistant').count();

    expect(finalUserMsgCount).toBeGreaterThan(initialUserMsgCount);
    expect(finalAssistantMsgCount).toBeGreaterThan(initialAssistantMsgCount);
    console.log(`Resume test Step 12: New messages received (${finalUserMsgCount} user, ${finalAssistantMsgCount} assistant)`);

    // Step 13: Check for session ID mismatch errors
    const sessionMismatchErrors = consoleMessages.filter(msg =>
      msg.text.includes('Ignoring message for different session')
    );

    if (sessionMismatchErrors.length > 0) {
      console.error('SESSION ID MISMATCH DETECTED:', sessionMismatchErrors);
    }

    expect(sessionMismatchErrors.length).toBe(0);
    console.log('Resume test Step 13: No session ID mismatch errors');

    console.log('TEST PASSED: Resume ongoing agent conversation works correctly');
  });
});
