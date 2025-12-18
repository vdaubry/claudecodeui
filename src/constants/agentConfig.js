/**
 * Agent Configuration Constants
 *
 * Defines agent types and their message generators for use across components.
 * Used by AgentSection.jsx for UI and MainContent.jsx for auto-chaining.
 */

/**
 * Generate the planification agent message with task doc path
 * Uses @agent-Plan to direct Claude SDK to use the planification sub-agent
 */
export const generatePlanificationMessage = (taskDocPath) => `@agent-Plan You are helping me plan the implementation of a task. Your goal is to create a comprehensive onboarding document that any developer can use to complete this task.

## Your Process

### 1. Ask Clarifying Questions First
Before creating any plan, ask me all questions you need to fully understand:
- The exact requirements and expected behavior
- Edge cases and error handling
- Any constraints or preferences
- Integration points with existing code

Do NOT proceed to planning until you have asked and received answers to your clarifying questions.

### 2. Explore the Codebase
Once you understand the requirements, explore the codebase to understand:
- Current implementation patterns
- Relevant files and components
- Testing patterns used in the project

### 3. Create the Implementation Plan
After gathering all information, update the task documentation file at:
\`${taskDocPath}\`

Structure the document as an onboarding guide for a new developer with these sections:

#### Overview
- Summary of what this task accomplishes
- Initial user request and context
- Key decisions made during planning

#### Implementation Plan
- Phase-by-phase breakdown with clear steps
- Files to modify/create for each phase
- Technical approach and architecture decisions

#### Testing Strategy
- **Unit Tests**: List specific unit tests to create or update
- **Manual Testing (Playwright MCP)**: Detailed scenarios including:
  - Navigation steps
  - Expected behavior to verify
  - Element selectors to check

#### To-Do List
Track progress with checkboxes. Include ALL steps:

**Implementation:**
- [ ] Phase 1: [description]
- [ ] Phase 2: [description]
- [ ] ...

**Testing:**
- [ ] Unit test: [test description]
- [ ] Unit test: [test description]
- [ ] Playwright: [scenario description]
- [ ] Playwright: [scenario description]

The documentation must be complete enough that a developer who understands the codebase but knows nothing about this specific task can implement it independently. This allows pausing and resuming implementation while maintaining clear progress tracking.

Please start by asking your clarifying questions.`;

/**
 * Generate the implementation agent message with task doc path
 * Uses @agent-Implement to direct Claude SDK to implement without asking questions
 * Updated to check Review Findings section for issues from previous review
 * @param {string} taskDocPath - Path to task documentation file
 * @param {number} taskId - Task ID for workflow completion command
 */
export const generateImplementationMessage = (taskDocPath, taskId) => `@agent-Implement Read the task documentation at \`${taskDocPath}\` and implement the next unchecked phase from the To-Do List.

## Instructions
1. Read the task documentation file
2. Check if a "Review Findings" section exists
   - If it does, pay special attention to documented issues
   - Address any issues from the previous review first
3. Find the To-Do List section
4. Identify the first unchecked item ([ ])
5. Implement that specific phase following the plan
6. Mark the item as completed ([x]) when done
7. Do NOT ask any questions - proceed directly with implementation

## Workflow Completion
After implementing, check if ALL To-Do items (both Implementation and Testing sections) are now marked as complete [x].
If the entire task is complete with no remaining work:
\`\`\`bash
node scripts/complete-workflow.js ${taskId}
\`\`\`
This signals that the automated agent loop should stop and await user review.

Start implementing now.`;

/**
 * Generate the review agent message with task doc path
 * Uses @agent-Review to review implementation and run tests
 * Updates Review Findings section and marks failed items for retry
 * @param {string} taskDocPath - Path to task documentation file
 * @param {number} taskId - Task ID for workflow completion command
 */
export const generateReviewMessage = (taskDocPath, taskId) => `@agent-Review You are a code reviewer for a task implementation. Your goal is to verify the implementation against the task documentation and update the docs with your findings.

## Your Process

### 1. Read Task Documentation
Read the task documentation at \`${taskDocPath}\` to understand:
- What was supposed to be implemented
- The testing strategy defined
- Items marked as completed ([x]) in the To-Do List

### 2. Review Implementation
For each recently completed item (marked [x]):
- Verify the code changes match what was planned
- Check for any gaps or missing functionality
- Identify any issues or potential bugs

### 3. Run Unit Tests
Run the project's unit tests to ensure they pass:
\`\`\`bash
npm test
\`\`\`
- Report any failures or issues found

### 4. Manual Testing with Playwright MCP
Follow the manual testing scenarios from the Testing Strategy section:
- Use Playwright MCP to navigate the UI
- Verify each scenario works as expected
- Document any failures or unexpected behavior

### 5. Update Task Documentation
Update the task documentation file at \`${taskDocPath}\`:

#### If issues are found:
1. **Update or create** a "Review Findings" section (replace any previous findings):

\`\`\`markdown
## Review Findings

**Date:** [current date]
**Status:** NEEDS_WORK

### Unit Tests
- Result: [PASS/FAIL]
- Failures: [list any test failures]

### Manual Testing
- [x] Scenario 1: [PASS - description]
- [ ] Scenario 2: [FAIL - what went wrong]

### Implementation Gaps
- [List specific gaps between plan and implementation]

### Issues to Address
- [List specific issues that need fixing]
\`\`\`

2. **Mark the failed item as unchecked** in the To-Do List:
   - Change \`[x] Phase N: description\` back to \`[ ] Phase N: description\`
   - This allows the implementation agent to retry

#### If no issues are found:
1. Update "Review Findings" section with:
\`\`\`markdown
## Review Findings

**Date:** [current date]
**Status:** PASS

### Unit Tests
- Result: PASS

### Manual Testing
- All scenarios passed

### Notes
- [Any observations or minor suggestions]
\`\`\`

## Important Constraints
- Do NOT fix any code or specs - only document findings
- Do NOT implement anything - only review and test
- Always update (not append to) the Review Findings section
- Mark items as unchecked if they need rework

## Workflow Completion
If ALL of the following conditions are met:
1. All unit tests pass
2. All manual testing scenarios pass
3. No implementation issues found
4. ALL To-Do items (Implementation and Testing) are marked complete [x]

Then run this command to mark the workflow as complete:
\`\`\`bash
node scripts/complete-workflow.js ${taskId}
\`\`\`
This signals that the automated agent loop should stop and await final user review.

Start reviewing now.`;

/**
 * Agent type identifiers
 */
export const AGENT_TYPE = {
  PLANIFICATION: 'planification',
  IMPLEMENTATION: 'implementation',
  REVIEW: 'review'
};
