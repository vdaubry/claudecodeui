# Agent Output Files Implementation Plan

## Overview

Add output files functionality to agents, enabling Claude to write files to a dedicated `output_files` folder which users can view, download, and delete through a tabbed interface.

## File Structure

```
.claude-ui/agents/agent-{id}/
├── prompt.md           # Existing: agent prompt
├── input_files/        # Existing: user-uploaded files read by Claude
└── output_files/       # NEW: files created by Claude
```

---

## Implementation Steps

### 1. Backend: Documentation Service

**File:** `server/services/documentation.js`

Add output file functions (mirror input file pattern):

```javascript
// Path helper
export function getAgentOutputFilesPath(repoPath, agentId)
  // Returns: {repoPath}/.claude-ui/agents/agent-{agentId}/output_files

// Folder creation
export function ensureAgentOutputFilesFolder(repoPath, agentId)

// List files
export function listAgentOutputFiles(repoPath, agentId)
  // Returns: [{name, size, mimeType}]

// Delete file
export function deleteAgentOutputFile(repoPath, agentId, filename)

// Read file for download
export function readAgentOutputFile(repoPath, agentId, filename)
  // Returns: {buffer, mimeType, filename}
```

**Update `buildAgentContextPrompt`** to add output files section:

```markdown
---

## Output Files

When you create any output files during this conversation, write them to:
{absolute_path_to_output_files}

Use the Write tool to create files in this directory.
```

---

### 2. Backend: API Routes

**File:** `server/routes/agents.js`

Add three new endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/agents/:id/output-files` | GET | List output files |
| `/api/agents/:id/output-files/:filename` | GET | Download file (Content-Disposition: attachment) |
| `/api/agents/:id/output-files/:filename` | DELETE | Delete file |

---

### 3. Frontend: API Client

**File:** `src/utils/api.js`

Add to `agents` object:

```javascript
listOutputFiles: (agentId) => authenticatedFetch(`/api/agents/${agentId}/output-files`),
downloadOutputFile: (agentId, filename) => // triggers download
deleteOutputFile: (agentId, filename) => // DELETE request
```

---

### 4. Frontend: State Management

**File:** `src/contexts/AgentContext.jsx`

Add state and functions:

```javascript
// State
agentOutputFiles: []
isLoadingOutputFiles: false

// Functions
loadAgentOutputFiles(agentId)
downloadAgentOutputFile(agentId, filename)  // triggers browser download
deleteAgentOutputFile(agentId, filename)
```

Update `selectAgent` to load output files.

---

### 5. Frontend: New Components

#### A. Tab Bar Component

**File:** `src/components/AgentFilesTabBar.jsx` (NEW)

Simple tab bar with two tabs:
- "Input Attachments" (Paperclip icon) + count badge
- "Output Files" (FolderOutput icon) + count badge

Props: `activeTab`, `onTabChange`, `inputCount`, `outputCount`

#### B. Output Files Component

**File:** `src/components/AgentOutputFiles.jsx` (NEW)

Similar to AgentAttachments but:
- No upload functionality
- Each file has: icon, name, size, download button, delete button
- Download button triggers browser file download

Props: `files`, `isLoading`, `onDownload`, `onDelete`

---

### 6. Frontend: Integration

**File:** `src/components/AgentDetailView.jsx`

Replace the Attachments Section (lines 118-127) with:

```jsx
{/* Files Section with Tabs */}
<div className="border-t border-border flex-shrink-0">
  <AgentFilesTabBar
    activeTab={filesTab}
    onTabChange={setFilesTab}
    inputCount={agentAttachments.length}
    outputCount={agentOutputFiles.length}
  />
  {filesTab === 'input' ? (
    <AgentAttachments ... />
  ) : (
    <AgentOutputFiles ... />
  )}
</div>
```

Add new props for output files: `agentOutputFiles`, `isLoadingOutputFiles`, `onDownloadOutputFile`, `onDeleteOutputFile`

**File:** `src/pages/AgentDetailPage.jsx`

Wire up new context values and pass props to AgentDetailView.

---

## Files Summary

### Create:
- `src/components/AgentFilesTabBar.jsx`
- `src/components/AgentOutputFiles.jsx`

### Modify:
- `server/services/documentation.js` - add output file functions + update buildAgentContextPrompt
- `server/routes/agents.js` - add 3 API endpoints
- `src/utils/api.js` - add API client functions
- `src/contexts/AgentContext.jsx` - add state and functions
- `src/components/AgentDetailView.jsx` - add tab bar and conditional rendering
- `src/pages/AgentDetailPage.jsx` - wire up new props

---

## Implementation Order

1. Backend: `documentation.js` (functions + prompt update)
2. Backend: `agents.js` (routes)
3. Frontend: `api.js` (API client)
4. Frontend: `AgentContext.jsx` (state)
5. Frontend: `AgentFilesTabBar.jsx` (new component)
6. Frontend: `AgentOutputFiles.jsx` (new component)
7. Frontend: `AgentDetailView.jsx` (integration)
8. Frontend: `AgentDetailPage.jsx` (wiring)
9. Test: `npm run test:run && npm run test:e2e`
