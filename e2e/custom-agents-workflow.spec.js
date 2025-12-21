import { test, expect } from '@playwright/test';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test constants - AUTH_TOKEN from environment (set in .env)
const TEST_TOKEN = process.env.AUTH_TOKEN || '1f07cec67bcdd51e0fab5f2310169817f5e7abb7293ab1bcf9dfe7d26c50cf5c';
const HELLO_WORLD_PATH = '/home/ubuntu/misc/hello_world';
const DB_PATH = path.join(__dirname, '../server/database/auth.db');

// Timeout constants
const UI_TIMEOUT = 2000;        // 2 seconds for UI operations (clicks, navigation, modals)
const UI_TIMEOUT_SLOW = 5000;   // 5 seconds for slower UI operations (page loads)
const BACKEND_TIMEOUT = 30000;  // 30 seconds max for backend to respond
const STREAMING_TIMEOUT = 120000; // 120 seconds for agent responses (may involve file reads)

// Helper to get database connection
function getDb() {
  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');
  return db;
}

// Helper to clean up agent test data (without affecting the hello_world project)
async function cleanupAgentTestData() {
  if (fs.existsSync(DB_PATH)) {
    const db = getDb();
    try {
      // Find the hello_world project
      const project = db.prepare('SELECT id FROM projects WHERE repo_folder_path = ?').get(HELLO_WORLD_PATH);
      if (project) {
        // Delete all agents for this project (cascade deletes conversations)
        db.prepare('DELETE FROM agents WHERE project_id = ?').run(project.id);
        console.log(`Deleted test agents for project ${project.id}`);
      }
    } finally {
      db.close();
    }
  }

  // Clean up agent prompt files
  const agentsDir = path.join(HELLO_WORLD_PATH, '.claude-ui', 'agents');
  if (fs.existsSync(agentsDir)) {
    fs.rmSync(agentsDir, { recursive: true, force: true });
    console.log('Deleted agents directory');
  }
}

// Helper to set up the hello_world project if it doesn't exist
async function ensureHelloWorldProject() {
  // Ensure the directory exists
  if (!fs.existsSync(HELLO_WORLD_PATH)) {
    fs.mkdirSync(HELLO_WORLD_PATH, { recursive: true });
  }

  // Create a simple project.md file so the agent has context about the project
  const claudeUiDir = path.join(HELLO_WORLD_PATH, '.claude-ui');
  if (!fs.existsSync(claudeUiDir)) {
    fs.mkdirSync(claudeUiDir, { recursive: true });
  }

  const projectDocPath = path.join(claudeUiDir, 'project.md');
  if (!fs.existsSync(projectDocPath)) {
    fs.writeFileSync(projectDocPath, `# Hello World Project

This is a simple "Hello World" project for testing purposes.

## Overview
The project demonstrates basic programming concepts with a classic "Hello, World!" example.

## Purpose
- Learning and testing
- Demonstrating basic code execution
- E2E test fixture for the Claude Code UI
`);
  }

  // Also create a simple hello.py file as additional context
  const helloPyPath = path.join(HELLO_WORLD_PATH, 'hello.py');
  if (!fs.existsSync(helloPyPath)) {
    fs.writeFileSync(helloPyPath, `# A simple Hello World program
print("Hello, World!")
`);
  }

  console.log('Hello World project fixture ready');
}

// Helper to navigate and authenticate
async function navigateAndAuth(page) {
  await page.goto(`/?token=${TEST_TOKEN}`);
  await page.waitForLoadState('networkidle');

  // Check if we got the login page (token might not have been processed yet)
  const loginVisible = await page.locator('text=Welcome Back').isVisible().catch(() => false);

  if (loginVisible) {
    // Reload the page - the token should now be in localStorage
    await page.reload();
    await page.waitForLoadState('networkidle');
  }

  // Wait for the Dashboard to load
  await page.waitForSelector('h1:has-text("Claude Code UI")', { timeout: UI_TIMEOUT_SLOW });
}

// Helper to navigate to board view for hello world project
async function navigateToBoardView(page) {
  // Find the project card in the grid
  const projectCard = page.locator('[data-testid="project-card-grid-hello-world"]');
  await expect(projectCard).toBeVisible({ timeout: UI_TIMEOUT_SLOW });

  // Click to navigate to board view
  await projectCard.click();

  // Wait for board view to load - look for the project name in header
  await expect(page.locator('h1:has-text("hello world")')).toBeVisible({ timeout: UI_TIMEOUT_SLOW });
}

// Helper to switch to Custom Agents tab
async function switchToAgentsTab(page) {
  const agentsTabButton = page.locator('button:has-text("Custom Agents")');
  await expect(agentsTabButton).toBeVisible({ timeout: UI_TIMEOUT });
  await agentsTabButton.click();

  // Wait for the tab to be active (should show empty state or agents grid)
  await page.waitForTimeout(300); // Brief wait for tab switch animation
}

test.describe('Custom Agents Workflow', () => {
  test.beforeAll(async () => {
    // Ensure hello_world project exists with documentation
    await ensureHelloWorldProject();
    // Clean up any leftover agent data
    await cleanupAgentTestData();
  });

  test.afterAll(async () => {
    // Clean up agent data after tests complete
    await cleanupAgentTestData();
  });

  // Test 1: Setup - Create hello_world project if needed and create a custom agent
  test('setup: create hello world project and coding teacher agent', async ({ page }) => {
    test.setTimeout(60000);

    // Step 1: Navigate and authenticate
    await navigateAndAuth(page);
    await expect(page.locator('h1:has-text("Claude Code UI")')).toBeVisible({ timeout: UI_TIMEOUT_SLOW });

    // Step 2: Check if hello_world project exists, create if not
    // Wait for page to fully load first
    await page.waitForTimeout(500);
    const projectCardExists = await page.locator('[data-testid="project-card-grid-hello-world"]').isVisible().catch(() => false);

    if (!projectCardExists) {
      console.log('Creating hello_world project...');

      // Click "New Project" button
      await page.waitForSelector('button:has-text("New Project")', { state: 'visible', timeout: UI_TIMEOUT });
      await page.click('button:has-text("New Project")');

      // Wait for project form modal
      await expect(page.locator('text=Create New Project')).toBeVisible({ timeout: UI_TIMEOUT });

      // Fill out project form
      await page.fill('input#project-name', 'hello world');
      await page.fill('input#repo-path', HELLO_WORLD_PATH);
      await page.click('button[type="submit"]:has-text("Create Project")');

      // Wait for either modal to close OR error message
      // If error "already exists" appears, just close the modal
      const errorVisible = await page.locator('text=already exists').isVisible({ timeout: 2000 }).catch(() => false);
      if (errorVisible) {
        console.log('Project already exists, closing modal...');
        // Close the modal
        await page.click('button:has-text("Cancel")');
        await expect(page.locator('text=Create New Project')).not.toBeVisible({ timeout: UI_TIMEOUT });
      } else {
        // Wait for modal to close and project card to appear
        await expect(page.locator('text=Create New Project')).not.toBeVisible({ timeout: UI_TIMEOUT_SLOW });
      }

      await expect(page.locator('[data-testid="project-card-grid-hello-world"]')).toBeVisible({ timeout: UI_TIMEOUT_SLOW });
    }

    console.log('hello_world project exists');

    // Step 3: Navigate to board view
    await navigateToBoardView(page);

    // Step 4: Switch to Custom Agents tab
    await switchToAgentsTab(page);

    // Step 5: Click "New Agent" or "Create Your First Agent" button
    const newAgentBtn = page.locator('button:has-text("New Agent")').or(page.locator('button:has-text("Create Your First Agent")'));
    await expect(newAgentBtn.first()).toBeVisible({ timeout: UI_TIMEOUT_SLOW });
    await newAgentBtn.first().click();

    // Wait for agent form modal
    await expect(page.locator('text=Create New Agent')).toBeVisible({ timeout: UI_TIMEOUT });
    console.log('Agent creation modal opened.');

    // Step 6: Fill out agent form
    await page.fill('input#agent-name', 'Coding Teacher');
    await page.click('button[type="submit"]:has-text("Create Agent")');

    // Wait for modal to close
    await expect(page.locator('text=Create New Agent')).not.toBeVisible({ timeout: UI_TIMEOUT });

    // Step 7: Wait for agent card to appear
    await expect(page.locator('[data-testid^="agent-card-"]').filter({ hasText: 'Coding Teacher' })).toBeVisible({ timeout: UI_TIMEOUT_SLOW });
    console.log('Coding Teacher agent created.');
  });

  // Test 2: Set agent prompt and create conversation
  test('agent conversation: ask about project with custom system prompt', async ({ page }) => {
    test.setTimeout(STREAMING_TIMEOUT + 30000);

    // Navigate to the board view and agents tab
    await navigateAndAuth(page);
    await navigateToBoardView(page);
    await switchToAgentsTab(page);

    // Click on the Coding Teacher agent card
    const agentCard = page.locator('[data-testid^="agent-card-"]').filter({ hasText: 'Coding Teacher' });
    await expect(agentCard).toBeVisible({ timeout: UI_TIMEOUT_SLOW });
    await agentCard.click();

    // Wait for agent detail view to load
    await expect(page.locator('h1:has-text("Coding Teacher")')).toBeVisible({ timeout: UI_TIMEOUT_SLOW });
    console.log('Navigated to Coding Teacher agent detail view.');

    // Set the agent prompt via the Edit button
    const editButton = page.locator('button:has-text("Edit")').first();
    await expect(editButton).toBeVisible({ timeout: UI_TIMEOUT });
    await editButton.click();

    // Wait for textarea to appear (inline editing mode)
    const promptTextarea = page.locator('textarea').first();
    await expect(promptTextarea).toBeVisible({ timeout: UI_TIMEOUT });

    // Clear and set the prompt
    await promptTextarea.fill('You are a coding teacher helping junior developers learn programming concepts. When asked about this project, always mention "hello world" in your explanation since this is a Hello World project. Keep explanations simple and beginner-friendly.');

    // Save the prompt
    const saveButton = page.locator('button:has-text("Save")');
    await expect(saveButton).toBeVisible({ timeout: UI_TIMEOUT });
    await saveButton.click();

    // Wait for save to complete (edit mode should close)
    await expect(page.locator('button:has-text("Edit")')).toBeVisible({ timeout: UI_TIMEOUT });
    console.log('Agent prompt saved.');

    // Click "New Chat" button
    const newChatBtn = page.locator('button:has-text("New Chat")');
    await expect(newChatBtn).toBeVisible({ timeout: UI_TIMEOUT });
    await newChatBtn.click();

    // Wait for the new conversation modal
    await expect(page.locator('h2:has-text("New Agent Conversation")')).toBeVisible({ timeout: UI_TIMEOUT });
    console.log('New conversation modal opened.');

    // Find the textarea in the modal and type message
    const modalInput = page.locator('.fixed textarea').first();
    await expect(modalInput).toBeVisible({ timeout: UI_TIMEOUT });
    await modalInput.fill('What does this project mean?');

    // Wait for submit button to be enabled (WebSocket connected) and click it
    const submitButton = page.locator('button:has-text("Start Conversation")');
    await expect(submitButton).toBeEnabled({ timeout: BACKEND_TIMEOUT });
    await submitButton.click();
    console.log('Message submitted.');

    // Wait for modal to close and navigation to chat page
    await expect(page.locator('h2:has-text("New Agent Conversation")')).not.toBeVisible({ timeout: BACKEND_TIMEOUT });

    // Wait for navigation to chat page (should happen automatically after modal closes)
    await expect(async () => {
      const url = page.url();
      expect(url).toContain('/chat/');
    }).toPass({ timeout: BACKEND_TIMEOUT });
    console.log('Navigated to chat page.');

    // Wait for chat interface to fully load
    await page.waitForLoadState('networkidle', { timeout: BACKEND_TIMEOUT });

    // Wait for the chat interface to appear with proper timeout
    await expect(page.locator('textarea').first()).toBeVisible({ timeout: BACKEND_TIMEOUT });

    // Verify user message appears in chat
    await expect(page.locator('text=What does this project mean?')).toBeVisible({ timeout: UI_TIMEOUT_SLOW });
    console.log('User message visible in chat.');

    // Wait for streaming to start or complete
    await expect(async () => {
      const respondingVisible = await page.locator('text=Claude is responding').isVisible().catch(() => false);
      const respondingBtnVisible = await page.locator('text=Responding').isVisible().catch(() => false);
      const toolCallsVisible = await page.locator('.chat-message.tool').first().isVisible().catch(() => false);
      const assistantMsgVisible = await page.locator('.chat-message.assistant').first().isVisible().catch(() => false);
      expect(respondingVisible || respondingBtnVisible || toolCallsVisible || assistantMsgVisible).toBeTruthy();
    }).toPass({ timeout: BACKEND_TIMEOUT });

    console.log('Streaming started!');

    // Wait for streaming to complete
    await expect(async () => {
      const respondingVisible = await page.locator('text=Claude is responding').isVisible().catch(() => false);
      const respondingBtnVisible = await page.locator('text=Responding').isVisible().catch(() => false);
      expect(respondingVisible || respondingBtnVisible).toBeFalsy();
    }).toPass({ timeout: STREAMING_TIMEOUT });

    console.log('Streaming completed.');

    // Verify assistant response exists
    const assistantMessages = page.locator('.chat-message.assistant');
    await expect(async () => {
      const count = await assistantMessages.count();
      expect(count).toBeGreaterThan(0);
    }).toPass({ timeout: UI_TIMEOUT_SLOW });

    // Verify the response contains "hello world" (case-insensitive)
    // The agent should mention hello world since the prompt instructs it to do so
    await expect(async () => {
      const textContent = await assistantMessages.allTextContents();
      const combinedText = textContent.join(' ').toLowerCase();
      // Check for "hello world" or "hello, world" or just that it understood it's about hello world
      const containsHelloWorld = combinedText.includes('hello world') ||
                                  combinedText.includes('hello, world') ||
                                  combinedText.includes('helloworld');
      expect(containsHelloWorld).toBeTruthy();
    }).toPass({ timeout: UI_TIMEOUT_SLOW });

    console.log('Test completed: Agent response contains "hello world".');
  });

  // Test 3: Verify conversation history loads correctly
  test('history: load completed agent conversation', async ({ page }) => {
    test.setTimeout(60000);

    // Navigate to the agent detail view
    await navigateAndAuth(page);
    await navigateToBoardView(page);
    await switchToAgentsTab(page);

    // Check if agent exists, if not skip this test (depends on test 2)
    const agentCardExists = await page.locator('[data-testid^="agent-card-"]').filter({ hasText: 'Coding Teacher' }).isVisible().catch(() => false);
    if (!agentCardExists) {
      console.log('Skipping history test: Coding Teacher agent not found (test 2 may have failed)');
      test.skip();
      return;
    }

    // Click on the Coding Teacher agent card
    const agentCard = page.locator('[data-testid^="agent-card-"]').filter({ hasText: 'Coding Teacher' });
    await expect(agentCard).toBeVisible({ timeout: UI_TIMEOUT_SLOW });
    await agentCard.click();

    // Wait for agent detail view to load
    await expect(page.locator('h1:has-text("Coding Teacher")')).toBeVisible({ timeout: UI_TIMEOUT_SLOW });

    // Verify we have at least one conversation from the previous test
    await expect(page.locator('h3:has-text("Conversations")')).toBeVisible({ timeout: UI_TIMEOUT });

    // Click on the conversation
    const conversationRow = page.locator('[data-testid^="conversation-row-"]').first();
    await expect(conversationRow).toBeVisible({ timeout: UI_TIMEOUT_SLOW });
    await conversationRow.click();

    // Verify chat interface loads
    await expect(page.locator('textarea').first()).toBeVisible({ timeout: UI_TIMEOUT });

    // Verify message history loaded (should see user message and assistant response)
    await expect(async () => {
      const userMessages = await page.locator('.chat-message.user').count();
      const assistantMessages = await page.locator('.chat-message.assistant').count();
      expect(userMessages).toBeGreaterThan(0);
      expect(assistantMessages).toBeGreaterThan(0);
    }).toPass({ timeout: UI_TIMEOUT_SLOW });

    // Verify NOT streaming (completed conversation)
    const respondingVisible = await page.locator('text=Claude is responding').isVisible().catch(() => false);
    const respondingBtnVisible = await page.locator('text=Responding').isVisible().catch(() => false);
    expect(respondingVisible || respondingBtnVisible).toBeFalsy();

    console.log('Test completed: Agent conversation history loaded correctly.');
  });
});
