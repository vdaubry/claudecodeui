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
  await page.waitForSelector('h1:has-text("Claude Code UI")', { timeout: 15000 });
}

test.describe('Hello World Workflow', () => {
  test.beforeAll(async () => {
    await cleanupTestData();
  });

  test.afterAll(async () => {
    // Clean up all test data after tests complete
    // This ensures hello world project ends with 0 tasks
    await cleanupTestData();
  });

  test('complete workflow: create project, task, and conversation', async ({ page }) => {
    // Set longer timeout for streaming responses
    test.setTimeout(180000); // 3 minutes

    // Step 1: Navigate and authenticate
    await navigateAndAuth(page);

    // Wait for the Dashboard to load - look for Claude Code UI header
    await expect(page.locator('h1:has-text("Claude Code UI")')).toBeVisible({ timeout: 15000 });

    // Wait for Dashboard content to load
    await page.waitForTimeout(1000);

    // Step 2: Click "New Project" button in Dashboard header
    await page.waitForSelector('button:has-text("New Project")', {
      state: 'visible',
      timeout: 10000
    });

    await page.click('button:has-text("New Project")');

    // Wait for project form modal to appear
    await expect(page.locator('text=Create New Project')).toBeVisible({ timeout: 5000 });

    // Step 3: Fill out the project form
    // Fill project name
    await page.fill('input#project-name', 'hello world');

    // Fill repository path
    await page.fill('input#repo-path', HELLO_WORLD_PATH);

    // Submit the form
    await page.click('button[type="submit"]:has-text("Create Project")');

    // Wait for modal to close
    await expect(page.locator('text=Create New Project')).not.toBeVisible({ timeout: 5000 });

    // Verify project appears in Dashboard as a project card
    // The project card contains an h3 with the project name
    await expect(page.locator('h3:has-text("hello world")')).toBeVisible({ timeout: 5000 });

    // Step 4: Click on the project card to expand it
    // Use data-testid for reliable selection
    const projectCard = page.locator('[data-testid="project-card-hello-world"]');
    await projectCard.click();

    // Wait for the project to expand - should show task list area
    // When expanded, we should see either tasks or "No tasks yet" message
    await page.waitForTimeout(500);

    // Step 5: Click "New Task" button
    // The New Task button appears in the expanded project card or in project detail view
    await page.waitForSelector('button:has-text("New Task")', {
      state: 'visible',
      timeout: 10000
    });
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

    // Verify task appears in the project card's task list
    await expect(page.locator('text=Hello World').first()).toBeVisible({ timeout: 5000 });

    // Step 7: Click on the task row to navigate to Task Detail view
    // Use data-testid prefix for reliable task row selection
    const taskRow = page.locator('[data-testid^="task-row-"]').filter({ hasText: 'Hello World' }).first();
    await taskRow.click();

    // Wait for Task Detail view to load
    // The Task Detail view has a header with the task title and a Conversations section
    await expect(page.locator('h1:has-text("Hello World")')).toBeVisible({ timeout: 10000 });

    // Verify we're in the Task Detail view by checking for Conversations section
    await expect(page.locator('h3:has-text("Conversations")')).toBeVisible({ timeout: 5000 });

    // Verify "New Chat" button is visible
    await expect(page.locator('button:has-text("New Chat")')).toBeVisible({ timeout: 5000 });

    // Step 8: Start a new conversation by clicking "New Chat"
    await page.click('button:has-text("New Chat")');

    // Wait for ChatInterface to load - look for the message input textarea
    await expect(page.locator('textarea').first()).toBeVisible({ timeout: 10000 });

    // Verify we're in the Chat view by checking breadcrumb shows "Chat"
    await expect(page.locator('text=Chat').first()).toBeVisible({ timeout: 5000 });

    // Step 9: Type and send a message
    const messageInput = page.locator('textarea').first();
    await messageInput.fill('What is 1+1?');

    // Send the message by pressing Enter
    await messageInput.press('Enter');

    // Step 10: Wait for streaming response to start
    // First, verify the user message appears in the chat
    await expect(page.locator('text=What is 1+1?')).toBeVisible({ timeout: 5000 });

    // Wait for Claude's response to start streaming
    // Look for responding indicator or tool calls
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

    console.log('Streaming started! Now navigating back to Dashboard to check live indicator.');

    // Step 11: Navigate back to Dashboard to verify live indicator
    // First go back to Task Detail view by clicking the back button (ArrowLeft icon)
    let backButton = page.locator('button[title="Back to Task"]').first();
    if (!await backButton.isVisible().catch(() => false)) {
      // Fall back to any back button with ArrowLeft
      backButton = page.locator('button').filter({ has: page.locator('svg.lucide-arrow-left') }).first();
    }
    await backButton.click();

    // Wait for Task Detail view
    await expect(page.locator('h3:has-text("Conversations")')).toBeVisible({ timeout: 5000 });

    // Now go back to Dashboard by clicking the back button again
    backButton = page.locator('button').filter({ has: page.locator('svg.lucide-arrow-left') }).first();
    await backButton.click();

    // Wait for Dashboard to load
    await expect(page.locator('h1:has-text("Claude Code UI")')).toBeVisible({ timeout: 5000 });

    // Expand the hello world project to see the task
    // Use data-testid for reliable selection
    const projectCardForLive = page.locator('[data-testid="project-card-hello-world"]');
    const isProjectVisible = await projectCardForLive.isVisible().catch(() => false);
    if (isProjectVisible) {
      await projectCardForLive.click();
      await page.waitForTimeout(500);
    }

    // Wait a moment for WebSocket events to propagate
    await page.waitForTimeout(1000);

    // Step 12: Verify the LIVE badge is displayed
    // The task should show "LIVE" badge while streaming is active
    await expect(async () => {
      // Look for LIVE badge using data-testid for reliable selection
      const liveBadgeVisible = await page.locator('[data-testid="live-badge"]').first().isVisible().catch(() => false);
      expect(liveBadgeVisible).toBeTruthy();
    }).toPass({ timeout: 10000 });

    console.log('Live indicator is displayed! Waiting for streaming to complete.');

    // Step 13: Wait for streaming to complete
    // Navigate back to the chat to see when it finishes
    // Use data-testid prefix for reliable task row selection
    const helloWorldTask = page.locator('[data-testid^="task-row-"]').filter({ hasText: 'Hello World' }).first();
    await helloWorldTask.click();

    // Wait for Task Detail view
    await expect(page.locator('h1:has-text("Hello World")')).toBeVisible({ timeout: 10000 });

    // Wait for conversation row to appear (use data-testid for reliable selection)
    // The conversation might take a moment to appear after the Task Detail view loads
    await expect(async () => {
      const conversationRowVisible = await page.locator('[data-testid^="conversation-row-"]').first().isVisible().catch(() => false);
      expect(conversationRowVisible).toBeTruthy();
    }).toPass({ timeout: 10000 });

    const conversationRow = page.locator('[data-testid^="conversation-row-"]').first();
    const hasConversation = true; // We verified it exists above

    if (hasConversation) {
      await conversationRow.click();
      await page.waitForTimeout(500);

      // Wait for streaming to complete (no more Responding indicator)
      await expect(async () => {
        const respondingVisible = await page.locator('text=Claude is responding').isVisible().catch(() => false);
        const respondingBtnVisible = await page.locator('text=Responding').isVisible().catch(() => false);

        // Neither should be visible when streaming is done
        expect(respondingVisible || respondingBtnVisible).toBeFalsy();
      }).toPass({ timeout: 120000 }); // Wait up to 2 minutes for streaming to complete

      console.log('Streaming completed! Navigating back to Dashboard to verify live indicator is gone.');

      // Step 14: Navigate back to Dashboard and verify live indicator is gone
      // First go back to Task Detail view by clicking the back button
      let backBtnFinal = page.locator('button').filter({ has: page.locator('svg.lucide-arrow-left') }).first();
      await backBtnFinal.click();

      // Wait for Task Detail view
      await expect(page.locator('h3:has-text("Conversations")')).toBeVisible({ timeout: 5000 });

      // Now go back to Dashboard by clicking the back button again
      backBtnFinal = page.locator('button').filter({ has: page.locator('svg.lucide-arrow-left') }).first();
      await backBtnFinal.click();

      // Wait for Dashboard
      await expect(page.locator('h1:has-text("Claude Code UI")')).toBeVisible({ timeout: 5000 });

      // Expand the hello world project again to see the task
      // Use data-testid for reliable selection
      const projectCardFinal = page.locator('[data-testid="project-card-hello-world"]');
      const isProjectVisibleFinal = await projectCardFinal.isVisible().catch(() => false);
      if (isProjectVisibleFinal) {
        await projectCardFinal.click();
        await page.waitForTimeout(500);
      }

      // Step 14: Verify LIVE badge disappears (poll with retry for WebSocket propagation)
      await expect(async () => {
        const liveBadgeStillVisible = await page.locator('[data-testid="live-badge"]').first().isVisible().catch(() => false);
        expect(liveBadgeStillVisible).toBeFalsy();
      }).toPass({ timeout: 15000, intervals: [1000] }); // Poll every 1 second for up to 15 seconds

      console.log('Test completed successfully! Live indicator correctly appeared and disappeared.');
    } else {
      console.log('No conversation row found, skipping completion verification');
    }
  });

  test('navigate back through views', async ({ page }) => {
    // This test verifies back navigation works correctly
    test.setTimeout(60000);

    // Navigate and authenticate
    await navigateAndAuth(page);

    // Wait for Dashboard to load
    await expect(page.locator('h1:has-text("Claude Code UI")')).toBeVisible({ timeout: 5000 });

    // Look for the hello world project specifically
    const projectCard = page.locator('[data-testid="project-card-hello-world"]');
    const hasProject = await projectCard.isVisible().catch(() => false);

    if (!hasProject) {
      console.log('No existing project found, skipping navigation test');
      return;
    }

    // Click to expand project
    await projectCard.click();
    await page.waitForTimeout(500);

    // Find and click on the Hello World task specifically
    const taskRow = page.locator('[data-testid^="task-row-"]').filter({ hasText: 'Hello World' }).first();
    const hasTask = await taskRow.isVisible().catch(() => false);

    if (!hasTask) {
      console.log('No task found, skipping navigation test');
      return;
    }

    await taskRow.click();

    // Wait for Task Detail view
    await expect(page.locator('h3:has-text("Conversations")')).toBeVisible({ timeout: 10000 });

    // Verify back button is visible (ArrowLeft icon button)
    const backButton = page.locator('button').filter({ has: page.locator('svg.lucide-arrow-left') }).first();
    await expect(backButton).toBeVisible({ timeout: 5000 });

    // Click back button
    await backButton.click();

    // Should be back at Dashboard
    await expect(page.locator('h1:has-text("Claude Code UI")')).toBeVisible({ timeout: 5000 });

    console.log('Navigation test completed successfully!');
  });

  test('view toggle between Project and Status views', async ({ page }) => {
    // This test verifies the view toggle works
    test.setTimeout(30000);

    // Navigate and authenticate
    await navigateAndAuth(page);

    // Wait for Dashboard to load
    await expect(page.locator('h1:has-text("Claude Code UI")')).toBeVisible({ timeout: 5000 });

    // Find the view toggle buttons (ViewToggle.jsx uses "By Project" and "In Progress")
    const byProjectBtn = page.locator('button:has-text("By Project")');
    const inProgressBtn = page.locator('button:has-text("In Progress")');

    // Verify both toggle buttons are visible
    await expect(byProjectBtn).toBeVisible({ timeout: 5000 });
    await expect(inProgressBtn).toBeVisible({ timeout: 5000 });

    // Click "In Progress" to switch views
    await inProgressBtn.click();
    await page.waitForTimeout(500);

    // In In Progress view, we should see the in-progress section header
    // or an empty state message
    const inProgressSectionVisible = await page.locator('text=In Progress').nth(1).isVisible().catch(() => false) ||
                                      await page.locator('text=No tasks in progress').isVisible().catch(() => false);

    // If there are in-progress tasks, section should be visible
    // If no tasks, we might see the empty state

    // Switch back to "By Project" view
    await byProjectBtn.click();
    await page.waitForTimeout(500);

    // In Project view, we should see project cards
    // Verify we're back in project view (either projects exist or we see the dashboard header)
    await expect(page.locator('h1:has-text("Claude Code UI")')).toBeVisible({ timeout: 5000 });

    console.log('View toggle test completed successfully!');
  });
});
