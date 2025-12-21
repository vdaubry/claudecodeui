# Agent File Attachments - Implementation Plan

## Overview

Add file attachments to Custom Agents. Users can upload files that Claude will automatically read at the start of each conversation.

**Storage**: `.claude-ui/agents/agent-{id}/input_files/`
**Constraints**: Max 5 MB, common formats (text, images, PDFs, code files)
**Behavior**: Claude reads ALL files at conversation start

---

## Phase 1: Backend Service Functions

### File: `/server/services/documentation.js`

1. Add constant and path helper:
```javascript
const INPUT_FILES_FOLDER = 'input_files';

function getAgentInputFilesPath(repoPath, agentId) {
  return path.join(repoPath, CLAUDE_UI_FOLDER, AGENTS_FOLDER, `agent-${agentId}`, INPUT_FILES_FOLDER);
}
```

2. Add new exported functions:
- `ensureAgentInputFilesFolder(repoPath, agentId)` - Create input_files directory
- `listAgentInputFiles(repoPath, agentId)` - Return `[{name, size, mimeType}]`
- `saveAgentInputFile(repoPath, agentId, filename, buffer)` - Save uploaded file
- `deleteAgentInputFile(repoPath, agentId, filename)` - Delete file

3. Add validation config:
```javascript
export const ATTACHMENT_CONFIG = {
  maxSizeBytes: 5 * 1024 * 1024,
  allowedExtensions: [
    '.txt', '.md', '.json', '.yaml', '.yml', '.csv',
    '.png', '.jpg', '.jpeg', '.gif', '.pdf',
    '.js', '.ts', '.jsx', '.tsx', '.py', '.rb', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.css', '.html', '.sh', '.sql'
  ]
};
```

4. Update `buildAgentContextPrompt()` to add input_files instructions:
```javascript
// After existing sections, add:
const inputFiles = listAgentInputFiles(repoPath, agentId);
if (inputFiles.length > 0) {
  const inputFilesPath = getAgentInputFilesPath(repoPath, agentId);
  sections.push(`## Input Files

IMPORTANT: At the start of this conversation, you MUST read ALL files in:
${inputFilesPath}

Files: ${inputFiles.map(f => f.name).join(', ')}

Use the Read tool to read each file before proceeding.`);
}
```

---

## Phase 2: Backend API Routes

### File: `/server/routes/agents.js`

Add multer configuration and 3 new endpoints:

```javascript
// GET /api/agents/:id/attachments
// List all attachments for an agent
// Returns: [{name, size, mimeType}]

// POST /api/agents/:id/attachments
// Upload attachment (multer single file)
// Validate: size <= 5MB, extension in allowlist
// Returns: {success: true, file: {name, size, mimeType}}

// DELETE /api/agents/:id/attachments/:filename
// Delete attachment by filename
// Returns: {success: true}
```

---

## Phase 3: Frontend API

### File: `/src/utils/api.js`

Add to `agents` object:
```javascript
listAttachments: (agentId) => authenticatedFetch(`/api/agents/${agentId}/attachments`),

uploadAttachment: (agentId, file) => {
  const formData = new FormData();
  formData.append('file', file);
  return authenticatedFetch(`/api/agents/${agentId}/attachments`, {
    method: 'POST',
    body: formData,
  });
},

deleteAttachment: (agentId, filename) =>
  authenticatedFetch(`/api/agents/${agentId}/attachments/${encodeURIComponent(filename)}`, {
    method: 'DELETE',
  }),
```

---

## Phase 4: Frontend State

### File: `/src/contexts/AgentContext.jsx`

Add state:
```javascript
const [agentAttachments, setAgentAttachments] = useState([]);
const [isLoadingAttachments, setIsLoadingAttachments] = useState(false);
```

Add methods:
- `loadAgentAttachments(agentId)` - Fetch and set attachments
- `uploadAgentAttachment(agentId, file)` - Upload and append to list
- `deleteAgentAttachment(agentId, filename)` - Delete and remove from list

Update `selectAgent()` to also call `loadAgentAttachments(agent.id)` in parallel.

Export new state/methods in context value.

---

## Phase 5: Frontend Component

### New File: `/src/components/AgentAttachments.jsx`

Component structure:
```
┌─────────────────────────────────┐
│ 📎 Attachments (N)              │  Header
├─────────────────────────────────┤
│ Files here are read by Claude   │  Description
├─────────────────────────────────┤
│ 📄 file1.txt          2.1 KB 🗑 │  File list with
│ 🖼️ image.png         156 KB 🗑 │  delete buttons
│ 📄 data.json          4.5 KB 🗑 │
├─────────────────────────────────┤
│ [⬆️ Add Attachment]             │  Upload button
│ Max 5 MB per file               │
└─────────────────────────────────┘
```

Props:
- `attachments` - Array of {name, size, mimeType}
- `isLoading` - Loading state
- `onUpload(file)` - Upload callback
- `onDelete(filename)` - Delete callback

Features:
- File type icons (Image, FileText, Code, File)
- Size formatting (B, KB, MB)
- Client-side validation before upload
- Loading/deleting states
- Error display

---

## Phase 6: Integration

### File: `/src/components/AgentDetailView.jsx`

Add import:
```javascript
import AgentAttachments from './AgentAttachments';
```

Add new props:
```javascript
agentAttachments = [],
isLoadingAttachments = false,
onUploadAttachment,
onDeleteAttachment,
```

Update layout - add Attachments section below MarkdownEditor:
```jsx
{/* Right panel - Agent Prompt + Attachments */}
<div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
  {/* Existing: Agent Prompt Section */}
  <div className="flex flex-col flex-1 min-h-0">
    ...MarkdownEditor...
  </div>

  {/* NEW: Attachments Section */}
  <div className="border-t border-border">
    <AgentAttachments
      attachments={agentAttachments}
      isLoading={isLoadingAttachments}
      onUpload={onUploadAttachment}
      onDelete={onDeleteAttachment}
      className="max-h-64"
    />
  </div>
</div>
```

### File: `/src/pages/AgentDetailPage.jsx`

Wire up context to AgentDetailView:
```javascript
const {
  agentAttachments,
  isLoadingAttachments,
  uploadAgentAttachment,
  deleteAgentAttachment,
  selectedAgent
} = useAgentContext();

const handleUploadAttachment = async (file) => {
  return await uploadAgentAttachment(selectedAgent.id, file);
};

const handleDeleteAttachment = async (filename) => {
  return await deleteAgentAttachment(selectedAgent.id, filename);
};
```

---

## Files Summary

| File | Action |
|------|--------|
| `/server/services/documentation.js` | Modify - Add input_files functions, update buildAgentContextPrompt() |
| `/server/routes/agents.js` | Modify - Add 3 attachment endpoints |
| `/src/utils/api.js` | Modify - Add attachment API methods |
| `/src/contexts/AgentContext.jsx` | Modify - Add attachments state/methods |
| `/src/components/AgentAttachments.jsx` | Create - New component |
| `/src/components/AgentDetailView.jsx` | Modify - Integrate AgentAttachments |
| `/src/pages/AgentDetailPage.jsx` | Modify - Wire up context |

---

## Testing

1. Upload various file types and verify storage
2. Verify file size limit enforcement
3. Delete files and verify removal
4. Start agent conversation and verify Claude reads files
5. E2E test the full workflow
