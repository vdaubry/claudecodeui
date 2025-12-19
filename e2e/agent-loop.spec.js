/**
 * Agent Loop Integration Test
 *
 * Tests the complete backend agent loop:
 * 1. Create project and task via API
 * 2. Start planification agent via API
 * 3. Wait for planification to complete (poll database)
 * 4. Start implementation agent via API (triggers auto-loop)
 * 5. Wait for workflow_complete = true (poll database)
 * 6. Verify hello.py was created
 * 7. Cleanup: delete test project
 *
 * Uses Playwright's request API (no browser) for HTTP calls.
 * Makes real Claude API calls - expect 1-2 minutes runtime.
 */

import { test, expect } from '@playwright/test';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test constants
const TEST_TOKEN = 'claude-ui-test-token-2024';
const DB_PATH = path.join(__dirname, '../server/database/auth.db');
const BASE_URL = 'http://localhost:3002';

// Timeout constants
const PLANIFICATION_TIMEOUT = 120000; // 2 minutes for planification
const LOOP_TIMEOUT = 180000;          // 3 minutes for implementation + review loop
const POLL_INTERVAL = 2000;           // Poll every 2 seconds

// Create a unique temp folder for each test run
function createTempProjectFolder() {
  const tempBase = os.tmpdir();
  const folderName = `hello-world-e2e-${Date.now()}`;
  const folderPath = path.join(tempBase, folderName);
  fs.mkdirSync(folderPath, { recursive: true });
  return folderPath;
}

// Get database connection
function getDb() {
  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');
  return db;
}

// Poll database until condition is met or timeout
async function pollDatabase(checkFn, timeout, interval = POLL_INTERVAL) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const result = checkFn();
    if (result) {
      return result;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error(`Polling timed out after ${timeout}ms`);
}

test.describe('Agent Loop Integration', () => {
  let projectPath;
  let projectId;
  let taskId;
  let request;

  test.beforeAll(async ({ playwright }) => {
    // Create API request context with auth token
    request = await playwright.request.newContext({
      baseURL: BASE_URL,
      extraHTTPHeaders: {
        'Authorization': `Bearer ${TEST_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    // Create unique temp folder for test project
    projectPath = createTempProjectFolder();
    console.log(`Test project folder: ${projectPath}`);
  });

  test.afterAll(async () => {
    // Cleanup: delete project from database (cascades to tasks, agent_runs, conversations)
    if (projectId) {
      const db = getDb();
      try {
        db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
        console.log(`Deleted test project ${projectId} from database`);
      } catch (err) {
        console.error('Failed to delete test project:', err);
      } finally {
        db.close();
      }
    }

    // Cleanup: delete temp project folder
    if (projectPath && fs.existsSync(projectPath)) {
      try {
        fs.rmSync(projectPath, { recursive: true, force: true });
        console.log(`Deleted test project folder: ${projectPath}`);
      } catch (err) {
        console.error('Failed to delete project folder:', err);
      }
    }

    // Dispose request context
    if (request) {
      await request.dispose();
    }
  });

  test('complete agent loop: planification -> implementation -> review -> hello.py', async () => {
    // Total test timeout: planification + loop + buffer
    test.setTimeout(PLANIFICATION_TIMEOUT + LOOP_TIMEOUT + 30000);

    // ========================================
    // STEP 1: Create Project via API
    // ========================================
    console.log('Step 1: Creating project via API...');

    const createProjectResponse = await request.post('/api/projects', {
      data: {
        name: 'Hello World E2E Test',
        repoFolderPath: projectPath,
      },
    });

    expect(createProjectResponse.ok(), `Failed to create project: ${await createProjectResponse.text()}`).toBeTruthy();
    const project = await createProjectResponse.json();
    projectId = project.id;
    console.log(`Created project with ID: ${projectId}`);

    // ========================================
    // STEP 2: Create Task via API with documentation
    // ========================================
    console.log('Step 2: Creating task via API...');

    const createTaskResponse = await request.post(`/api/projects/${projectId}/tasks`, {
      data: {
        title: 'Hello World Python',
      },
    });

    expect(createTaskResponse.ok(), `Failed to create task: ${await createTaskResponse.text()}`).toBeTruthy();
    const task = await createTaskResponse.json();
    taskId = task.id;
    console.log(`Created task with ID: ${taskId}`);

    // Save task documentation
    const taskDocumentation = `# Hello World Python Project

## Goal
Create a simple Python "Hello World" command-line application.

## Requirements
- Create a file named hello.py in the project root
- The script should print "Hello, World!" when executed
- Keep it extremely simple - just a single print statement
- No dependencies, no virtual environment, no complexity

## Success Criteria
- hello.py exists and is non-empty
- Running "python hello.py" prints "Hello, World!"

## To-Do List

**Implementation:**
- [ ] Create hello.py with print("Hello, World!")

**Testing:**
- [ ] Verify hello.py exists
- [ ] Run python hello.py and confirm output`;

    const saveDocResponse = await request.put(`/api/tasks/${taskId}/documentation`, {
      data: { content: taskDocumentation },
    });

    expect(saveDocResponse.ok(), `Failed to save task doc: ${await saveDocResponse.text()}`).toBeTruthy();
    console.log('Task documentation saved');

    // ========================================
    // STEP 3: Start Planification Agent via API
    // ========================================
    console.log('Step 3: Starting planification agent...');

    const startPlanResponse = await request.post(`/api/tasks/${taskId}/agent-runs`, {
      data: { agentType: 'planification' },
    });

    expect(startPlanResponse.ok(), `Failed to start planification: ${await startPlanResponse.text()}`).toBeTruthy();
    const planificationRun = await startPlanResponse.json();
    console.log(`Planification agent started with run ID: ${planificationRun.id}`);

    // ========================================
    // STEP 4: Wait for Planification to Complete
    // ========================================
    console.log('Step 4: Waiting for planification agent to complete...');

    const db = getDb();

    try {
      await pollDatabase(() => {
        const run = db.prepare('SELECT * FROM task_agent_runs WHERE id = ?').get(planificationRun.id);
        if (run && run.status === 'completed') {
          console.log('Planification agent completed');
          return run;
        }
        if (run && run.status === 'failed') {
          throw new Error('Planification agent failed');
        }
        console.log(`Planification status: ${run?.status || 'unknown'}`);
        return null;
      }, PLANIFICATION_TIMEOUT);
    } finally {
      db.close();
    }

    // ========================================
    // STEP 5: Ensure workflow_complete is false
    // ========================================
    console.log('Step 5: Ensuring workflow is not marked complete...');

    // Check current state and reset if needed
    const workflowResponse = await request.put(`/api/tasks/${taskId}/workflow-complete`, {
      data: { complete: false },
    });
    expect(workflowResponse.ok(), `Failed to reset workflow: ${await workflowResponse.text()}`).toBeTruthy();

    // ========================================
    // STEP 6: Start Implementation Agent (triggers auto-loop)
    // ========================================
    console.log('Step 6: Starting implementation agent (triggers auto-loop)...');

    const startImplResponse = await request.post(`/api/tasks/${taskId}/agent-runs`, {
      data: { agentType: 'implementation' },
    });

    expect(startImplResponse.ok(), `Failed to start implementation: ${await startImplResponse.text()}`).toBeTruthy();
    const implementationRun = await startImplResponse.json();
    console.log(`Implementation agent started with run ID: ${implementationRun.id}`);

    // ========================================
    // STEP 7: Wait for Loop to Complete (workflow_complete = true)
    // ========================================
    console.log('Step 7: Waiting for agent loop to complete (workflow_complete = true)...');

    const dbLoop = getDb();

    try {
      await pollDatabase(() => {
        // Check workflow_complete flag
        const taskRow = dbLoop.prepare('SELECT workflow_complete FROM tasks WHERE id = ?').get(taskId);
        if (taskRow && taskRow.workflow_complete === 1) {
          console.log('Workflow marked as complete!');
          return true;
        }

        // Log agent runs status for debugging
        const runs = dbLoop.prepare('SELECT id, agent_type, status FROM task_agent_runs WHERE task_id = ? ORDER BY id DESC LIMIT 5').all(taskId);
        console.log('Recent agent runs:', runs.map(r => `${r.agent_type}:${r.status}`).join(', '));

        return null;
      }, LOOP_TIMEOUT);
    } finally {
      dbLoop.close();
    }

    // ========================================
    // STEP 8: Verify hello.py was created
    // ========================================
    console.log('Step 8: Verifying hello.py was created...');

    // Check for hello.py or common variations
    const possibleFiles = ['hello.py', 'hello_world.py', 'main.py'];
    let foundFile = null;
    let fileContent = '';

    for (const filename of possibleFiles) {
      const filePath = path.join(projectPath, filename);
      if (fs.existsSync(filePath)) {
        foundFile = filePath;
        fileContent = fs.readFileSync(filePath, 'utf8');
        break;
      }
    }

    // List all files in project folder for debugging
    const projectFiles = fs.readdirSync(projectPath);
    console.log(`Files in project folder: ${projectFiles.join(', ') || '(empty)'}`);

    // Assertions
    expect(foundFile, `No Python file was created. Files found: ${projectFiles.join(', ')}`).not.toBeNull();
    expect(fileContent.length, 'Python file is empty').toBeGreaterThan(0);
    expect(fileContent.toLowerCase(), 'File does not contain "print" statement').toContain('print');

    console.log(`SUCCESS! Found ${path.basename(foundFile)} with content:`);
    console.log(fileContent);

    // ========================================
    // STEP 9: Verify agent_runs table has expected entries
    // ========================================
    console.log('Step 9: Verifying agent runs in database...');

    const dbVerify = getDb();
    try {
      const allRuns = dbVerify.prepare('SELECT * FROM task_agent_runs WHERE task_id = ? ORDER BY id').all(taskId);
      console.log(`Total agent runs: ${allRuns.length}`);

      // Should have at least: planification, implementation, review
      expect(allRuns.length, 'Expected at least 3 agent runs').toBeGreaterThanOrEqual(3);

      // Verify we have each type
      const runTypes = allRuns.map(r => r.agent_type);
      expect(runTypes, 'Missing planification agent run').toContain('planification');
      expect(runTypes, 'Missing implementation agent run').toContain('implementation');
      expect(runTypes, 'Missing review agent run').toContain('review');

      // Log final state
      console.log('Agent runs:');
      allRuns.forEach(run => {
        console.log(`  - ${run.id}: ${run.agent_type} (${run.status})`);
      });
    } finally {
      dbVerify.close();
    }

    console.log('TEST PASSED: Full agent loop completed successfully!');
  });
});
