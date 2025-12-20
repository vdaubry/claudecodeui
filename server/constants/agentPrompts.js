/**
 * Agent Prompt Constants (Server-Side)
 *
 * Agent message generators for the backend agent runner.
 * Moved from src/constants/agentConfig.js as part of the server-side chaining refactor.
 */

/**
 * Generate the planification agent message with task doc path
 * Uses @agent-Plan to direct Claude SDK to use the planification sub-agent
 */
export function generatePlanificationMessage(taskDocPath) {
  return `@agent-Plan You are helping me plan the implementation of a task. Your goal is to create a comprehensive onboarding document that any developer can use to complete this task.

## Your Process

### 1. Explore the Codebase
Explore the codebase to understand:
- Current implementation patterns
- Relevant files and components
- Testing patterns used in the project

### 2. Ask Clarifying Questions (Major Decisions Only)
Before creating any plan, ask me ONLY about significant decisions that would substantially impact the implementation.

**Do ask about:**
- Major architectural or design decisions with multiple valid approaches
- Ambiguous requirements that could be interpreted in fundamentally different ways
- Potential flaws or challenges in the requirements that need resolution
- Trade-offs that require user input (e.g., performance vs. simplicity)

**Do NOT ask about:**
- Implementation details you can reasonably infer from the codebase
- Edge cases that have standard solutions
- Minor UI/UX details unless they're core to the feature
- Technical choices where there's an obvious best practice

Make reasonable assumptions for anything not in the "Do ask" list. If you have multiple questions, group them into a single, focused set (aim for 2-4 questions maximum).

Do NOT proceed to planning until you have asked and received answers to your clarifying questions.

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
}

/**
 * Generate the implementation agent message with task doc path
 * Uses @agent-Implement to direct Claude SDK to implement without asking questions
 * Updated to check Review Findings section for issues from previous review
 * @param {string} taskDocPath - Path to task documentation file
 * @param {number} taskId - Task ID for workflow completion command
 */
export function generateImplementationMessage(taskDocPath, taskId) {
  return `@agent-Implement Read the task documentation at \`${taskDocPath}\` and implement the next unchecked phase from the To-Do List.

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

Start implementing now.`;
}

/**
 * Generate the review agent message with task doc path
 * Uses @agent-Review to review implementation and run tests
 * Updates Review Findings section and marks failed items for retry
 * @param {string} taskDocPath - Path to task documentation file
 * @param {number} taskId - Task ID for workflow completion command
 */
export function generateReviewMessage(taskDocPath, taskId) {
  return `@agent-Review You are a code reviewer for a task implementation. Your goal is to verify the implementation of completed items against the task documentation and update the docs with your findings.

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

### 5. Evaluate Completion Status

> **⚠️ CRITICAL DECISION POINT**
> This step determines whether the feature is ready for user review or needs more work.

Check if the feature is still in progress (some items marked as not done, [ ], etc): 
- If so, you can stop here : complete your report with your findings regarding completed tasks and mention that some tasks are not completed yet. Instruct the implementation agent to implement them (do not list them all).
- If all items are marked as done, then based on your findings from steps 2-4, determine if the feature is **READY** or **NEEDS_WORK**:

**READY** - All of the following must be true:
- All unit tests pass
- All manual testing scenarios pass
- No implementation issues found
- ALL To-Do items (Implementation and Testing) are marked complete [x]

**NEEDS_WORK** - Any of the following:
- Unit tests fail
- Manual testing reveals issues
- Implementation gaps or bugs found
- To-Do items still unchecked

### 6. Update Task Documentation
Update the task documentation file at \`${taskDocPath}\`:

**The "Review Findings" section must reflect ONLY the current state of testing.**
- If a "Review Findings" section already exists, REPLACE it entirely with your new findings
- Do NOT append to previous findings or keep history
- Each review should completely overwrite the previous review

#### If NEEDS_WORK:
1. **REPLACE** the entire "Review Findings" section with:

\`\`\`markdown
## Review Findings

**Status:** NEEDS_WORK

### Unit Tests
- Result: [PASS/FAIL]
- Failures: [list any test failures]

### Manual Testing
- [x] Scenario 1: [PASS - description]
- [ ] Scenario 2: [FAIL - what went wrong]

### Issues to Address
- [List specific issues that need fixing]
\`\`\`

2. **Mark the failed item as unchecked** in the To-Do List:
   - Change \`[x] Phase N: description\` back to \`[ ] Phase N: description\`
   - This allows the implementation agent to retry

#### If READY:
2. **Run the completion command** to signal the workflow is complete:
\`\`\`bash
node /home/ubuntu/claudecodeui/scripts/complete-workflow.js ${taskId}
\`\`\`
This stops the automated agent loop and awaits final user review.

## Important Constraints
- Do NOT fix any code or specs - only document findings
- Do NOT implement anything - only review and test
- **ALWAYS REPLACE (never append to) the Review Findings section**
- Mark items as unchecked if they need rework

Start reviewing now.`;
}

/**
 * Agent type identifiers
 */
export const AGENT_TYPE = {
  PLANIFICATION: 'planification',
  IMPLEMENTATION: 'implementation',
  REVIEW: 'review'
};
