# Removal Plan: UI-Based Claude Configuration Features

This document outlines the complete removal of four features from the Claude Code UI codebase:
1. **MCP API Routes** - Model Context Protocol server management
2. **CLI Authentication API Routes** - Claude CLI credential checking
3. **Agent API Routes** - External agent triggering with API key authentication
4. **GitHub Integration** - GitHub token management, repository cloning, branch/PR creation

## Summary

| Feature | Backend Files | Frontend Files | Tests | Database | Dependencies |
|---------|--------------|----------------|-------|----------|--------------|
| MCP API | 1 file (551 lines) | 1 file (partial) | 1 file (partial) | None | None |
| CLI Auth API | 1 file (67 lines) | 1 file (partial) | None | None | None |
| Agent API | 1 file (1152 lines) | 1 file (entire) | 1 file (partial) | 2 tables | @octokit/rest |
| GitHub Integration | Included in Agent API | 1 file (partial) | None | 1 table | @octokit/rest |

**Total estimated lines to remove:** ~2,900 lines

---

## Phase 1: Backend Route Files

### 1.1 Remove MCP Routes
**File:** `server/routes/mcp.js` (551 lines)
- **Action:** Delete entire file

**Endpoints being removed:**
- `GET /api/mcp/cli/list`
- `POST /api/mcp/cli/add`
- `POST /api/mcp/cli/add-json`
- `DELETE /api/mcp/cli/remove/:name`
- `GET /api/mcp/cli/get/:name`
- `GET /api/mcp/config/read`
- `GET /api/mcp/servers`
- `POST /api/mcp/servers/:serverId/test`
- `GET /api/mcp/servers/:serverId/tools`

### 1.2 Remove CLI Auth Routes
**File:** `server/routes/cli-auth.js` (67 lines)
- **Action:** Delete entire file

**Endpoints being removed:**
- `GET /api/cli/claude/status`

### 1.3 Remove Agent Routes (includes GitHub Integration)
**File:** `server/routes/agent.js` (1152 lines)
- **Action:** Delete entire file

**Endpoints being removed:**
- `POST /api/agent`

**Helper functions being removed:**

*API Key Authentication:*
- `validateExternalApiKey()` (lines 14-30)

*GitHub Integration Functions:*
- `getGitRemoteUrl()` (lines 36-66) - Retrieves git remote URL
- `normalizeGitHubUrl()` (lines 73-81) - Normalizes GitHub URLs (SSH to HTTPS)
- `parseGitHubUrl()` (lines 88-99) - Parses owner/repo from GitHub URLs
- `createGitHubBranch()` (lines 236-263) - Creates branches via Octokit API
- `createGitHubPR()` (lines 276-292) - Creates pull requests via Octokit API
- `cloneGitHubRepo()` (lines 301-381) - Clones repos with token auth

*Branch & Project Management:*
- `autogenerateBranchName()` (lines 106-148)
- `validateBranchName()` (lines 155-186)
- `getCommitMessages()` (lines 194-225)
- `generateProjectPath()` (lines ~102-127)
- `cleanupProject()` (lines 388-414)

**GitHub URL formats supported (being removed):**
- HTTPS: `https://github.com/owner/repo`
- HTTPS with .git: `https://github.com/owner/repo.git`
- SSH: `git@github.com:owner/repo`
- SSH with .git: `git@github.com:owner/repo.git`

---

## Phase 2: Server Index Updates

**File:** `server/index.js`

### 2.1 Remove Imports (lines 61, 64-65)
```
Line 61: import mcpRoutes from './routes/mcp.js';
Line 64: import agentRoutes from './routes/agent.js';
Line 65: import cliAuthRoutes from './routes/cli-auth.js';
```

### 2.2 Remove Route Registrations (lines 176, 185, 191)
```
Line 176: app.use('/api/mcp', authenticateToken, mcpRoutes);
Line 185: app.use('/api/cli', authenticateToken, cliAuthRoutes);
Line 191: app.use('/api/agent', agentRoutes);
```

---

## Phase 3: Database Changes

### 3.1 Remove Database Tables
**File:** `server/database/init.sql`

**Tables to remove:**

1. **`api_keys` table** (lines 21-35)
   - Used exclusively by Agent API for external authentication
   - Indexes: `idx_api_keys_key`, `idx_api_keys_user_id`, `idx_api_keys_active`

2. **`user_credentials` table** (lines 37-52)
   - Currently only stores `github_token` type credentials
   - Only consumer is Agent API via `githubTokensDb`
   - Indexes: `idx_user_credentials_user_id`, `idx_user_credentials_type`, `idx_user_credentials_active`

### 3.2 Remove Database Operations
**File:** `server/database/db.js`

**Objects to remove:**

1. **`apiKeysDb` object** (lines 211-282)
   - `generateApiKey()` - Generates `ck_` prefixed keys
   - `createApiKey()`
   - `getApiKeys()`
   - `validateApiKey()` - Validates and updates last_used
   - `deleteApiKey()`
   - `toggleApiKey()`

2. **`credentialsDb` object** (lines 284-347)
   - `createCredential()`
   - `getCredentials()`
   - `getActiveCredential()`
   - `deleteCredential()`
   - `toggleCredential()`

3. **`githubTokensDb` object** (lines 350-366)
   - `createGithubToken()` - Wrapper for createCredential
   - `getGithubTokens()` - Wrapper for getCredentials
   - `getActiveGithubToken()` - Used by Agent API for repo cloning
   - `deleteGithubToken()`
   - `toggleGithubToken()`

**Exports to remove (around line 640):**
```
apiKeysDb,
credentialsDb,
githubTokensDb,
```

---

## Phase 4: Settings Routes Updates

**File:** `server/routes/settings.js` (178 lines)

### 4.1 Remove Import (line 2)
```
Remove: import { apiKeysDb, credentialsDb } from '../database/db.js';
```

### 4.2 Remove API Key Endpoints (lines 11-87)
- `GET /api/settings/api-keys` (lines 11-26)
- `POST /api/settings/api-keys` (lines 28-50)
- `DELETE /api/settings/api-keys/:keyId` (lines 52-68)
- `PATCH /api/settings/api-keys/:keyId/toggle` (lines 70-87)

### 4.3 Remove Credentials Endpoints (lines 90-178)
GitHub token management endpoints:
- `GET /api/settings/credentials` (lines 91-102)
- `POST /api/settings/credentials` (lines 104-136)
- `DELETE /api/settings/credentials/:credentialId` (lines 139-154)
- `PATCH /api/settings/credentials/:credentialId/toggle` (lines 156-177)

**Note:** After removing these endpoints, the settings.js file will be significantly smaller. Verify remaining functionality before deciding whether to keep or remove the file entirely.

---

## Phase 5: Frontend Components

### 5.1 Remove MCP UI from Settings
**File:** `src/components/Settings.jsx` (1584 lines)

**State variables to remove (lines 21-45):**
- `mcpServers` (line 21)
- `showMcpForm` (line 22)
- `editingMcpServer` (line 23)
- `mcpFormData` (lines 24-39)
- `mcpLoading` (line 40)
- `mcpTestResults` (line 41)
- `mcpServerTools` (line 42)
- `mcpToolsLoading` (line 43)
- `jsonValidationError` (line 45)

**Functions to remove (lines 79-240, 356-536):**
- `fetchMcpServers()` (lines 80-132)
- `saveMcpServer()` (lines 135-174)
- `deleteMcpServer()` (lines 176-199)
- `testMcpServer()` (lines 201-218)
- `discoverMcpTools()` (lines 221-238)
- `resetMcpForm()` (lines 357-376)
- `openMcpForm()` (lines 379-396)
- `handleMcpSubmit()` (lines 398-462)
- `updateMcpConfig()` (lines 464-470)
- `getTransportIcon()` (lines 472-487)
- `validateMcpJsonConfig()` (lines 489-536)

**In `loadSettings()` function, remove (line 294):**
- `await fetchMcpServers();`

**JSX to remove (lines 983-1522):**
- MCP Server Management section (lines 983-1171)
- MCP Server Form Modal (lines 1173-1522)

**Imports to clean up (line 5):**
Remove `Server` from lucide-react imports if no longer used.

### 5.2 Remove CLI Auth from Onboarding
**File:** `src/components/Onboarding.jsx` (166 lines)

**State to remove (lines 10-15):**
- `claudeAuthStatus` state object

**Function to remove (lines 24-52):**
- `checkClaudeAuthStatus()`

**useEffect to remove (lines 19-22):**
- The effect that calls `checkClaudeAuthStatus()`

**JSX to remove (lines 96-130):**
- Auth Status Card section (lines 97-126)
- "You can configure Claude CLI..." text (lines 128-130)

### 5.3 Remove CredentialsSettings Component (includes GitHub Integration)
**File:** `src/components/CredentialsSettings.jsx` (404 lines)
- **Action:** Delete entire file

**Features being removed:**

*API Keys Management UI:*
- State: `apiKeys`, `showNewKeyForm`, `newKeyName`, `copiedKey`, `newlyCreatedKey`
- Functions: `createApiKey()`, `deleteApiKey()`, `toggleApiKey()`
- JSX: API Keys section (lines 156-272)

*GitHub Token Management UI:*
- State: `githubCredentials`, `showNewGithubForm`, `newGithubName`, `newGithubToken`, `newGithubDescription`
- Functions: `createGithubCredential()`, `deleteGithubCredential()`, `toggleGithubCredential()`
- JSX: GitHub Credentials section (lines 273-385)
- External link to: `https://github.com/settings/tokens`

### 5.4 Remove API Tab from Settings
**File:** `src/components/Settings.jsx`

**Remove tab button (lines 558-568):**
- The "API & Tokens" tab button

**Remove tab content (lines 1526-1531):**
- The `{activeTab === 'api' && ...}` block

**Remove imports (lines 5, 7):**
- `Key` from lucide-react (line 5)
- `import CredentialsSettings from './CredentialsSettings';` (line 7)

---

## Phase 6: Test Files

### 6.1 Update Settings Tests
**File:** `src/components/Settings.test.jsx` (253 lines)

**Remove MCP-related tests (lines 99-161):**
- `describe('MCP Server JSON Validation', ...)` block
- `validateMcpJson` test helper function

### 6.2 Update Auth Middleware Tests
**File:** `server/middleware/auth.test.js`

**Review tests for `validateApiKey`:**
- Lines 34-66: `describe('validateApiKey', ...)`
- These test the environment-based API key (not agent API keys)
- **Keep these tests** - they test `middleware/auth.js` validateApiKey, not agent functionality

---

## Phase 7: Dependencies Cleanup

### 7.1 Remove NPM Package
**File:** `package.json`

**Package to remove:**
- `@octokit/rest` (line 56, version ^22.0.0)
  - Used only by Agent API for GitHub operations
  - Handles: branch creation, PR creation, ref retrieval

**Command:**
```bash
npm uninstall @octokit/rest
```

### 7.2 Remove Unused Imports
After all changes, scan for unused imports in affected files:
- `lucide-react` icons in Settings.jsx (`Server`, `Key`, `Github`)
- Database imports in settings routes

### 7.3 Database Migration Consideration
If removing tables from `init.sql`:
- Existing databases will still have these tables
- Consider adding a migration script or documenting manual cleanup
- Tables can be dropped safely as they're no longer referenced

**SQL cleanup for existing databases:**
```sql
DROP TABLE IF EXISTS api_keys;
DROP TABLE IF EXISTS user_credentials;
```

---

## Execution Order

1. **Phase 1:** Delete backend route files (mcp.js, cli-auth.js, agent.js)
2. **Phase 2:** Update server/index.js imports and route registrations
3. **Phase 3:** Update database files (init.sql, db.js)
4. **Phase 4:** Update settings routes
5. **Phase 5:** Update frontend components
6. **Phase 6:** Update test files
7. **Phase 7:** Remove dependencies and final cleanup

---

## Verification Steps

After removal:
1. Run `npm run test:run` - All unit tests should pass
2. Run `npm run test:e2e` - All E2E tests should pass
3. Run `npm run build` - Build should succeed without errors
4. Manual testing:
   - Settings panel should only show "Tools" and "Appearance" tabs
   - Onboarding should complete without Claude CLI status check
   - No console errors related to removed endpoints

---

## Files Summary

### Files to DELETE (4 files, ~2,174 lines):
| File | Lines | Feature |
|------|-------|---------|
| `server/routes/mcp.js` | 551 | MCP API |
| `server/routes/cli-auth.js` | 67 | CLI Auth API |
| `server/routes/agent.js` | 1,152 | Agent API + GitHub |
| `src/components/CredentialsSettings.jsx` | 404 | API Keys + GitHub UI |

### Files to MODIFY (7 files):
| File | Changes |
|------|---------|
| `server/index.js` | Remove 3 imports, 3 route registrations |
| `server/database/init.sql` | Remove 2 tables + indexes |
| `server/database/db.js` | Remove apiKeysDb, credentialsDb, githubTokensDb objects |
| `server/routes/settings.js` | Remove API key + credentials endpoints |
| `src/components/Settings.jsx` | Remove MCP UI + API tab |
| `src/components/Onboarding.jsx` | Remove CLI auth status check |
| `src/components/Settings.test.jsx` | Remove MCP validation tests |

### Dependencies to REMOVE:
| Package | Version | Reason |
|---------|---------|--------|
| `@octokit/rest` | ^22.0.0 | Only used by Agent API |

### Database Tables to REMOVE:
| Table | Purpose |
|-------|---------|
| `api_keys` | External API authentication for Agent |
| `user_credentials` | GitHub token storage |
