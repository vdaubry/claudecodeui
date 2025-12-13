import { test, expect } from '@playwright/test';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test constants
const TEST_TOKEN = 'claude-ui-test-token-2024';
const HELLO_WORLD_PATH = '/home/ubuntu/misc/hello_world';
const DB_PATH = path.join(__dirname, '../server/database/auth.db');

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

test.describe('Hello World Workflow', () => {
  test.beforeAll(async () => {
    await cleanupTestData();
  });

  test('complete workflow: create project, task, and conversation', async ({ page }) => {
    // Set longer timeout for streaming responses
    test.setTimeout(180000); // 3 minutes

    // Step 1: Navigate to app with auth token
    await page.goto(`/?token=${TEST_TOKEN}`);

    // Wait for the auth check to complete - look for either login page or main app
    // The token from URL should be stored in localStorage and trigger authentication
    await page.waitForLoadState('networkidle');

    // Check if we got the login page (token might not have been processed yet)
    const loginVisible = await page.locator('text=Welcome Back').isVisible().catch(() => false);

    if (loginVisible) {
      // Reload the page - the token should now be in localStorage
      await page.reload();
      await page.waitForLoadState('networkidle');
    }

    // Wait for the main app to load - look for Claude Code UI header (first one, desktop header)
    await expect(page.locator('text=Claude Code UI').first()).toBeVisible({ timeout: 15000 });

    // Wait for projects to load (sidebar should show either projects or "No projects yet")
    await page.waitForSelector('text=New Project, text=No projects yet, text=Loading projects...', {
      state: 'visible',
      timeout: 10000
    }).catch(() => {});

    // Step 2: Click "New Project" button in sidebar
    // Wait for the button to be visible and clickable
    await page.waitForSelector('button:has-text("New Project"), button:has-text("Create Project")', {
      state: 'visible',
      timeout: 10000
    });

    // Try clicking "New Project" first, fall back to "Create Project"
    const newProjectBtn = page.locator('button:has-text("New Project")');
    const createProjectBtn = page.locator('button:has-text("Create Project")');

    if (await newProjectBtn.isVisible()) {
      await newProjectBtn.click();
    } else {
      await createProjectBtn.click();
    }

    // Wait for project form modal to appear
    await expect(page.locator('text=Create New Project')).toBeVisible({ timeout: 5000 });

    // Step 3: Fill out the project form
    // Fill project name
    await page.fill('input#project-name', 'hello world');

    // Fill repository path
    await page.fill('input#repo-path', HELLO_WORLD_PATH);

    // Submit the form - click button with "Create Project" text that is the submit button
    await page.click('button[type="submit"]:has-text("Create Project")');

    // Wait for modal to close and project to appear in sidebar
    await expect(page.locator('text=Create New Project')).not.toBeVisible({ timeout: 5000 });

    // Verify project appears in sidebar - look for button containing project name
    await expect(page.locator('button').filter({ hasText: 'hello world' }).first()).toBeVisible({ timeout: 5000 });

    // Step 4: Click on the project to expand it and view project detail
    await page.locator('button').filter({ hasText: 'hello world' }).first().click();

    // Wait for project detail view to load - look for heading with project name
    await expect(page.locator('h1').filter({ hasText: 'hello world' })).toBeVisible({ timeout: 5000 });

    // Step 5: Click "New Task" button
    await page.click('button:has-text("New Task")');

    // Wait for task form modal
    await expect(page.locator('text=Create New Task')).toBeVisible({ timeout: 5000 });

    // Step 6: Fill out the task form
    // Fill task title
    await page.fill('input#task-title', 'Hello World');

    // Fill task documentation
    await page.fill('textarea#task-documentation', 'A simple command line hello world');

    // Submit the form
    await page.click('button[type="submit"]:has-text("Create Task")');

    // Wait for modal to close
    await expect(page.locator('text=Create New Task')).not.toBeVisible({ timeout: 5000 });

    // Verify task appears in the tasks list
    // Look for task in the project detail view - it's a clickable div/button in the task list
    await expect(page.locator('text=Hello World').first()).toBeVisible({ timeout: 5000 });

    // Step 7: Click on the task row in the main content area
    // The task card is a div with cursor-pointer class containing "Hello World"
    // Use a locator that finds the clickable task card with cursor-pointer
    const taskCard = page.locator('div.cursor-pointer').filter({ hasText: 'Hello World' }).first();
    await taskCard.click();

    // Wait for task detail view - should show conversation list
    // The task detail view has a "Conversations" section header
    await expect(page.locator('h3:has-text("Conversations")').first()).toBeVisible({ timeout: 10000 });

    // Verify "No conversations yet" or "New Chat" button is visible
    const noConvosVisible = await page.locator('text=No conversations yet').isVisible().catch(() => false);
    const newChatVisible = await page.locator('button:has-text("New Chat")').isVisible().catch(() => false);
    expect(noConvosVisible || newChatVisible).toBeTruthy();

    // Verify "New Chat" button is visible
    await expect(page.locator('button:has-text("New Chat")')).toBeVisible({ timeout: 5000 });

    // Step 8: Start a new conversation
    await page.click('button:has-text("New Chat")');

    // Wait for ChatInterface to load - look for the message input
    // The placeholder might vary, so we'll use a more flexible selector
    await expect(page.locator('textarea').first()).toBeVisible({ timeout: 10000 });

    // Step 9: Type and send a message
    const messageInput = page.locator('textarea').first();
    await messageInput.fill('Build the hello world');

    // Send the message by pressing Enter
    await messageInput.press('Enter');

    // Step 10: Wait for streaming response
    // First, verify the user message appears in the chat
    await expect(page.locator('text=Build the hello world')).toBeVisible({ timeout: 5000 });

    // Wait for Claude's response to start streaming
    // This could take 30-60 seconds to get a response from the Claude API
    // We can detect the response by looking for:
    // 1. "Claude is responding..." status
    // 2. Tool call indicators (like "Write", "Read", "Bash")
    // 3. Or actual response text content

    // Wait for either the responding indicator or tool calls to appear
    await expect(async () => {
      // Check for responding indicator
      const respondingVisible = await page.locator('text=Claude is responding').isVisible().catch(() => false);
      const respondingBtnVisible = await page.locator('text=Responding').isVisible().catch(() => false);

      // Check for tool calls (Write, Read, Bash, etc.) which indicate Claude is working
      const toolCallsVisible = await page.locator('text=Write').first().isVisible().catch(() => false) ||
                               await page.locator('text=Read').first().isVisible().catch(() => false) ||
                               await page.locator('text=Bash').first().isVisible().catch(() => false);

      // At least one of these should be visible
      expect(respondingVisible || respondingBtnVisible || toolCallsVisible).toBeTruthy();
    }).toPass({ timeout: 90000 }); // Wait up to 90 seconds for streaming response

    console.log('Test completed successfully! Claude started responding to the message.');
  });
});
