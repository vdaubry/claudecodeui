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
const UI_TIMEOUT_SLOW = 3000;   // 3 seconds for slower UI operations (page loads)
const BACKEND_TIMEOUT = 30000;  // 30 seconds max for backend to respond
const STREAMING_TIMEOUT = 60000; // 60 seconds for longer streaming responses

// Helper to clean up test data before tests
async function cleanupTestData() {
  // 1. Delete all files in hello_world folder
  if (fs.existsSync(HELLO_WORLD_PATH)) {
    const files = fs.readdirSync(HELLO_WORLD_PATH);
    for (const file of files) {
      const filePath = path.join(HELLO_WORLD_PATH, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        fs.rmSync(filePath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(filePath);
      }
    }
  } else {
    // Create the directory if it doesn't exist
    fs.mkdirSync(HELLO_WORLD_PATH, { recursive: true });
  }

  // 2. Delete hello_world project from database
  if (fs.existsSync(DB_PATH)) {
    const db = new Database(DB_PATH);
    db.pragma('foreign_keys = ON');

    // Find and delete the project by repo path
    const project = db.prepare('SELECT id FROM projects WHERE repo_folder_path = ?').get(HELLO_WORLD_PATH);
    if (project) {
      // Delete cascades to tasks and conversations
      db.prepare('DELETE FROM projects WHERE id = ?').run(project.id);
    }

    db.close();
  }
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

// Helper to navigate back to Dashboard from any view
async function navigateToDashboard(page) {
  // Click back button until we reach Dashboard
  let attempts = 0;
  while (attempts < 5) {
    const isDashboard = await page.locator('h1:has-text("Claude Code UI")').isVisible().catch(() => false);
    if (isDashboard) break;

    const backButton = page.locator('button').filter({ has: page.locator('svg.lucide-arrow-left') }).first();
    const hasBackButton = await backButton.isVisible().catch(() => false);
    if (hasBackButton) {
      await backButton.click();
      await page.waitForTimeout(300);
    } else {
      break;
    }
    attempts++;
  }

  await expect(page.locator('h1:has-text("Claude Code UI")')).toBeVisible({ timeout: UI_TIMEOUT_SLOW });
}

// Helper to navigate to board view for hello world project
async function navigateToBoardView(page) {
  // Find the project card in the grid
  const projectCard = page.locator('[data-testid="project-card-grid-hello-world"]');
  await expect(projectCard).toBeVisible({ timeout: UI_TIMEOUT });

  // Click to navigate to board view
  await projectCard.click();

  // Wait for board view to load - look for the project name in header and board columns
  await expect(page.locator('h1:has-text("hello world")')).toBeVisible({ timeout: UI_TIMEOUT_SLOW });
  await expect(page.locator('[data-testid="board-column-pending"]')).toBeVisible({ timeout: UI_TIMEOUT_SLOW });
}

// Helper to get task card within board view
function getHelloWorldTaskCard(page) {
  // Look for task card with "Hello World" title in any column
  return page.locator('[data-testid^="board-task-card-"]').filter({ hasText: 'Hello World' }).first();
}

test.describe('Hello World Workflow', () => {
  test.beforeAll(async () => {
    await cleanupTestData();
  });

  test.afterAll(async () => {
    // Clean up all test data after tests complete
    await cleanupTestData();
  });

  // Test 1: Setup - Create project, task, and navigate to task detail
  test('setup: create project and task', async ({ page }) => {
    test.setTimeout(30000);

    // Step 1: Navigate and authenticate
    await navigateAndAuth(page);
    await expect(page.locator('h1:has-text("Claude Code UI")')).toBeVisible({ timeout: UI_TIMEOUT_SLOW });

    // Step 2: Click "New Project" button
    await page.waitForSelector('button:has-text("New Project")', { state: 'visible', timeout: UI_TIMEOUT });
    await page.click('button:has-text("New Project")');

    // Wait for project form modal
    await expect(page.locator('text=Create New Project')).toBeVisible({ timeout: UI_TIMEOUT });

    // Step 3: Fill out project form
    await page.fill('input#project-name', 'hello world');
    await page.fill('input#repo-path', HELLO_WORLD_PATH);
    await page.click('button[type="submit"]:has-text("Create Project")');

    // Wait for modal to close and project card to appear in the grid
    await expect(page.locator('text=Create New Project')).not.toBeVisible({ timeout: UI_TIMEOUT });
    await expect(page.locator('[data-testid="project-card-grid-hello-world"]')).toBeVisible({ timeout: UI_TIMEOUT });

    // Step 4: Click on project card to navigate to board view
    await navigateToBoardView(page);

    // Step 5: Click "New Task" button in board view header
    const newTaskBtn = page.locator('button:has-text("New Task")');
    await expect(newTaskBtn).toBeVisible({ timeout: UI_TIMEOUT });
    await newTaskBtn.click();

    // Wait for task form modal
    await expect(page.locator('text=Create New Task')).toBeVisible({ timeout: UI_TIMEOUT });

    // Step 6: Fill out task form
    await page.fill('input#task-title', 'Hello World');
    await page.fill('textarea#task-documentation', 'A simple command line hello world');
    await page.click('button[type="submit"]:has-text("Create Task")');

    // Wait for modal to close
    await expect(page.locator('text=Create New Task')).not.toBeVisible({ timeout: UI_TIMEOUT });

    // Step 7: Wait for task card to appear in the pending column and click to navigate to Task Detail
    const taskCard = getHelloWorldTaskCard(page);
    await expect(taskCard).toBeVisible({ timeout: 5000 });
    await taskCard.click();

    // Wait for Task Detail view
    await expect(page.locator('h1:has-text("Hello World")')).toBeVisible({ timeout: UI_TIMEOUT_SLOW });
    await expect(page.locator('h3:has-text("Conversations")')).toBeVisible({ timeout: UI_TIMEOUT });

    console.log('Setup complete: Project and task created.');
  });

  // Test 2: New conversation WebSocket streaming (Modal flow)
  test('websocket: new conversation streaming', async ({ page }) => {
    test.setTimeout(60000);

    // Navigate to the task detail
    await navigateAndAuth(page);
    await navigateToBoardView(page);

    const taskCard = getHelloWorldTaskCard(page);
    await expect(taskCard).toBeVisible({ timeout: UI_TIMEOUT });
    await taskCard.click();
    await expect(page.locator('h1:has-text("Hello World")')).toBeVisible({ timeout: UI_TIMEOUT_SLOW });

    // Click "New Chat" - should open modal
    await page.click('button:has-text("New Chat")');

    // Wait for modal to appear
    await expect(page.locator('h2:has-text("New Conversation")')).toBeVisible({ timeout: UI_TIMEOUT });
    console.log('New conversation modal opened.');

    // Find the textarea in the modal and type message
    const modalInput = page.locator('.fixed textarea').first();
    await expect(modalInput).toBeVisible({ timeout: UI_TIMEOUT });
    await modalInput.fill('What is 1+1?');

    // Submit the message (press Enter or click Start Conversation)
    await modalInput.press('Enter');
    console.log('Message submitted.');

    // Wait for modal to close and chat to appear with streaming
    await expect(page.locator('h2:has-text("New Conversation")')).not.toBeVisible({ timeout: BACKEND_TIMEOUT });

    // Verify we're in the chat interface (textarea should be visible)
    await expect(page.locator('textarea').first()).toBeVisible({ timeout: UI_TIMEOUT });

    // Verify user message appears in chat
    await expect(page.locator('text=What is 1+1?')).toBeVisible({ timeout: UI_TIMEOUT });
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
    }).toPass({ timeout: BACKEND_TIMEOUT });

    console.log('Streaming completed.');

    // Verify assistant response with correct answer
    const assistantMessages = page.locator('.chat-message.assistant');
    await expect(async () => {
      const count = await assistantMessages.count();
      expect(count).toBeGreaterThan(0);
    }).toPass({ timeout: UI_TIMEOUT_SLOW });

    await expect(async () => {
      const textContent = await assistantMessages.allTextContents();
      const combinedText = textContent.join(' ').toLowerCase();
      expect(combinedText).toContain('2');
    }).toPass({ timeout: UI_TIMEOUT });

    console.log('Test completed: New conversation modal flow verified.');
  });

  // Test 3: Live indicator + WebSocket reconnection
  test('websocket: live indicator and reconnection', async ({ page }) => {
    test.setTimeout(120000);

    // Navigate to the task detail
    await navigateAndAuth(page);
    await navigateToBoardView(page);

    const taskCard = getHelloWorldTaskCard(page);
    await expect(taskCard).toBeVisible({ timeout: UI_TIMEOUT });
    await taskCard.click();
    await expect(page.locator('h1:has-text("Hello World")')).toBeVisible({ timeout: UI_TIMEOUT_SLOW });

    // Click "New Chat" - should open modal
    await page.click('button:has-text("New Chat")');

    // Wait for modal to appear
    await expect(page.locator('h2:has-text("New Conversation")')).toBeVisible({ timeout: UI_TIMEOUT });

    // Find the textarea in the modal and type message
    // Use sleep command to control exactly how long streaming takes (deterministic timing for LIVE badge test)
    const modalInput = page.locator('.fixed textarea').first();
    await expect(modalInput).toBeVisible({ timeout: UI_TIMEOUT });
    await modalInput.fill('Run the command: sleep 15 && echo "done"');

    // Submit the message
    await modalInput.press('Enter');
    console.log('Message submitted via modal.');

    // Wait for modal to close and chat to appear
    await expect(page.locator('h2:has-text("New Conversation")')).not.toBeVisible({ timeout: BACKEND_TIMEOUT });

    // Verify user message appears in chat
    await expect(page.locator('text=sleep 15')).toBeVisible({ timeout: UI_TIMEOUT });
    console.log('User message visible in chat.');

    // Wait for streaming to start
    await expect(async () => {
      const respondingVisible = await page.locator('text=Claude is responding').isVisible().catch(() => false);
      const respondingBtnVisible = await page.locator('text=Responding').isVisible().catch(() => false);
      const toolCallsVisible = await page.locator('.chat-message.tool').first().isVisible().catch(() => false);
      const assistantMsgVisible = await page.locator('.chat-message.assistant').first().isVisible().catch(() => false);
      expect(respondingVisible || respondingBtnVisible || toolCallsVisible || assistantMsgVisible).toBeTruthy();
    }).toPass({ timeout: BACKEND_TIMEOUT });

    console.log('Streaming started! Navigating to Dashboard to check live indicator.');

    // Navigate back to Dashboard
    await navigateToDashboard(page);

    // Verify live indicator is displayed on the project card in the grid
    // The project card has a live indicator (pulsing red dot) when any task has live streaming
    await expect(async () => {
      const projectCard = page.locator('[data-testid="project-card-grid-hello-world"]');
      // Check for pulsing red indicator on project card
      const liveIndicator = projectCard.locator('.animate-ping, .bg-red-500, .bg-red-400').first();
      const hasLiveIndicator = await liveIndicator.isVisible().catch(() => false);
      expect(hasLiveIndicator).toBeTruthy();
    }).toPass({ timeout: 10000 });

    console.log('Live indicator is displayed on project card! Navigating to board view to check task-level indicator.');

    // Navigate to board view
    await navigateToBoardView(page);

    // Check for live indicator on the task card in board view
    await expect(async () => {
      const taskCardInBoard = getHelloWorldTaskCard(page);
      // BoardTaskCard shows pulsing red indicator when live
      const liveIndicator = taskCardInBoard.locator('.animate-ping, .bg-red-500, .bg-red-400').first();
      const hasLiveIndicator = await liveIndicator.isVisible().catch(() => false);
      expect(hasLiveIndicator).toBeTruthy();
    }).toPass({ timeout: 5000 });

    console.log('Live indicator is displayed on task card! Navigating to chat.');

    // Navigate back to the chat by clicking on the task card, then the conversation
    const taskCardAgain = getHelloWorldTaskCard(page);
    await expect(taskCardAgain).toBeVisible({ timeout: UI_TIMEOUT });
    await taskCardAgain.click();
    await expect(page.locator('h1:has-text("Hello World")')).toBeVisible({ timeout: UI_TIMEOUT_SLOW });

    // Wait for conversations list to load
    await expect(page.locator('h3:has-text("Conversations")')).toBeVisible({ timeout: UI_TIMEOUT });

    // Click on the latest conversation (wait for it to appear)
    const conversationRow = page.locator('[data-testid^="conversation-row-"]').first();
    await expect(conversationRow).toBeVisible({ timeout: 5000 });
    await conversationRow.click();

    // Verify we're in the chat view
    await expect(page.locator('textarea').first()).toBeVisible({ timeout: UI_TIMEOUT });

    // Wait for messages to load - the conversation might still be streaming
    // Give it enough time for the WebSocket to reconnect and messages to load
    const assistantMessages = page.locator('.chat-message.assistant');
    await expect(async () => {
      const count = await assistantMessages.count();
      expect(count).toBeGreaterThan(0);
    }).toPass({ timeout: BACKEND_TIMEOUT });

    console.log('Reconnected to streaming conversation.');

    // Wait for streaming to complete
    await expect(async () => {
      const respondingVisible = await page.locator('text=Claude is responding').isVisible().catch(() => false);
      const respondingBtnVisible = await page.locator('text=Responding').isVisible().catch(() => false);
      expect(respondingVisible || respondingBtnVisible).toBeFalsy();
    }).toPass({ timeout: STREAMING_TIMEOUT });

    console.log('Streaming completed. Checking live indicator disappears.');

    // Navigate back to Dashboard and verify live indicator is gone
    await navigateToDashboard(page);

    // Verify live indicator disappears from project card
    await expect(async () => {
      const projectCard = page.locator('[data-testid="project-card-grid-hello-world"]');
      // The animate-ping class is specific to live indicators
      const liveIndicator = projectCard.locator('.animate-ping').first();
      const hasLiveIndicator = await liveIndicator.isVisible().catch(() => false);
      expect(hasLiveIndicator).toBeFalsy();
    }).toPass({ timeout: 30000, intervals: [1000] });

    console.log('Test completed: Live indicator appeared and disappeared correctly.');
  });

  // Test 4: Completed conversation history loading
  test('history: load completed conversation', async ({ page }) => {
    test.setTimeout(30000);

    // Navigate to the task detail
    await navigateAndAuth(page);
    await navigateToBoardView(page);

    const taskCard = getHelloWorldTaskCard(page);
    await expect(taskCard).toBeVisible({ timeout: UI_TIMEOUT });
    await taskCard.click();
    await expect(page.locator('h1:has-text("Hello World")')).toBeVisible({ timeout: UI_TIMEOUT_SLOW });

    // Verify we have conversations from previous tests
    await expect(page.locator('h3:has-text("Conversations")')).toBeVisible({ timeout: UI_TIMEOUT });

    // Click on a completed conversation (should have at least 2 from previous tests)
    const conversationRows = page.locator('[data-testid^="conversation-row-"]');
    await expect(async () => {
      const count = await conversationRows.count();
      expect(count).toBeGreaterThanOrEqual(1);
    }).toPass({ timeout: UI_TIMEOUT });

    // Click on the first conversation (most recent from test 3)
    await conversationRows.first().click();

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

    console.log('Test completed: Completed conversation history loaded correctly.');
  });

  // Test 5: View toggle between Project and Status views
  test('navigation: view toggle between Project and Status views', async ({ page }) => {
    test.setTimeout(15000);

    await navigateAndAuth(page);
    await expect(page.locator('h1:has-text("Claude Code UI")')).toBeVisible({ timeout: UI_TIMEOUT_SLOW });

    // Find view toggle buttons
    const byProjectBtn = page.locator('button:has-text("By Project")');
    const inProgressBtn = page.locator('button:has-text("In Progress")');

    await expect(byProjectBtn).toBeVisible({ timeout: UI_TIMEOUT });
    await expect(inProgressBtn).toBeVisible({ timeout: UI_TIMEOUT });

    // Verify project card grid is visible initially
    await expect(page.locator('[data-testid="project-card-grid-hello-world"]')).toBeVisible({ timeout: UI_TIMEOUT });

    // Switch to In Progress view
    await inProgressBtn.click();

    // Switch back to By Project view
    await byProjectBtn.click();
    await expect(page.locator('h1:has-text("Claude Code UI")')).toBeVisible({ timeout: UI_TIMEOUT });

    // Verify project card grid is visible again
    await expect(page.locator('[data-testid="project-card-grid-hello-world"]')).toBeVisible({ timeout: UI_TIMEOUT });

    console.log('View toggle test completed!');
  });
});
