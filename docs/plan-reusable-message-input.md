# Implementation Plan: Reusable MessageInput in NewSessionModal

## Analysis Summary

After reviewing the codebase, I recommend **refactoring MessageInput to be reusable** in both the ChatInterface and NewSessionModal. This is achievable and preferable because:

1. **Core functionality is self-contained**: File references (@), slash detection (/), and keyboard handling are all internal to MessageInput
2. **Props are already well-defined**: The component uses props for everything that varies by context
3. **Conditional rendering exists**: Features like scroll-to-bottom and token usage already conditionally render

## Recommended Approach: Prop-Based Variant Control

Rather than creating a separate component, use **optional props with sensible defaults** to control which features render. This keeps a single source of truth while allowing different contexts to show/hide features.

### Features to Control

| Feature | ChatInterface | NewSessionModal | Control Mechanism |
|---------|--------------|-----------------|-------------------|
| File references (@) | ✅ | ✅ | Always enabled (no change) |
| Slash commands (/) | ✅ | ✅ | Always enabled (no change) |
| Permission mode selector | ✅ | ✅ | Always enabled (key feature) |
| Token usage pie | ✅ | ❌ | New prop: `showTokenUsage` |
| Slash commands button | ✅ | ✅ | Always enabled (no change) |
| Clear input button | ✅ | ✅ | Always enabled (no change) |
| Scroll to bottom | ✅ | ❌ | Existing prop: `isUserScrolledUp` |
| Submit button text | "Send"/"Responding..." | "Start Conversation"/"Creating..." | New prop: `submitLabel` |
| Connection warning | ✅ | Modal handles separately | New prop: `showConnectionWarning` |
| Streaming indicator | ✅ | ❌ | Existing prop: `isStreaming` |
| Textarea rows | 5 | 3-4 | New prop: `rows` |
| Border/wrapper styling | With border-t | No border | New prop: `variant` ("chat" \| "modal") |

---

## Implementation Steps

### Step 1: Add New Props to MessageInput

```jsx
// New props with defaults
{
  showTokenUsage = true,          // Show/hide token pie chart
  showConnectionWarning = true,   // Show "Connecting..." warning
  submitLabel = 'Send',           // Default submit button text
  submitLabelLoading = 'Responding...', // Loading state text
  rows = 5,                       // Textarea rows
  variant = 'chat',               // 'chat' | 'modal' - controls wrapper styling
}
```

### Step 2: Modify MessageInput Rendering

**Control bar changes:**
```jsx
{/* Token Usage Pie - conditional */}
{showTokenUsage && (
  <TokenUsagePie
    used={tokenBudget?.used || 0}
    total={tokenBudget?.total || 160000}
  />
)}
```

**Wrapper styling by variant:**
```jsx
<div className={
  variant === 'modal'
    ? 'p-0' // No padding/border in modal context
    : 'flex-shrink-0 p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900'
}>
```

**Submit button text:**
```jsx
<button type="submit" ...>
  {isSending || isStreaming ? submitLabelLoading : submitLabel}
</button>
```

**Connection warning:**
```jsx
{showConnectionWarning && !isConnected && (
  <p className="text-xs text-yellow-600...">Connecting to server...</p>
)}
```

### Step 3: Create useSlashCommands Hook (Optional Extraction)

Extract slash command logic into a reusable hook that both ChatInterface and NewSessionModal can use:

```jsx
// src/hooks/useSlashCommands.js
export function useSlashCommands(projectPath) {
  const [slashCommands, setSlashCommands] = useState([]);
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const [slashPosition, setSlashPosition] = useState(-1);
  const [commandQuery, setCommandQuery] = useState('');
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(-1);

  // Fetch commands when project changes
  useEffect(() => {
    const fetchCommands = async () => {
      if (!projectPath) return;
      try {
        const response = await api.getCommands(projectPath);
        if (response.ok) {
          const data = await response.json();
          const allCommands = [...(data.builtIn || []), ...(data.custom || [])];
          setSlashCommands(allCommands);
        }
      } catch (error) {
        console.error('Error fetching commands:', error);
      }
    };
    fetchCommands();
  }, [projectPath]);

  const filteredCommands = useMemo(() => {
    if (!commandQuery) return slashCommands;
    return slashCommands.filter(cmd =>
      cmd.name.toLowerCase().includes(commandQuery.toLowerCase())
    );
  }, [slashCommands, commandQuery]);

  const handleSlashDetected = useCallback((position, query) => {
    if (position >= 0) {
      setSlashPosition(position);
      setCommandQuery(query);
      setShowCommandMenu(true);
      setSelectedCommandIndex(-1);
    } else {
      setSlashPosition(-1);
      setCommandQuery('');
      setShowCommandMenu(false);
    }
  }, []);

  const handleCommandSelect = useCallback((command, index, isHover, input, setInput) => {
    if (isHover) {
      setSelectedCommandIndex(index);
      return;
    }
    const beforeSlash = slashPosition >= 0 ? input.slice(0, slashPosition) : input;
    const afterCursor = slashPosition >= 0 ? input.slice(slashPosition + 1 + commandQuery.length) : '';
    const newInput = beforeSlash + '/' + command.name + ' ' + afterCursor.trim();
    setInput(newInput.trim() + ' ');
    setShowCommandMenu(false);
    setSlashPosition(-1);
    setCommandQuery('');
    setSelectedCommandIndex(-1);
  }, [slashPosition, commandQuery]);

  const handleCloseCommandMenu = useCallback(() => {
    setShowCommandMenu(false);
    setSlashPosition(-1);
    setCommandQuery('');
    setSelectedCommandIndex(-1);
  }, []);

  const handleToggleCommandMenu = useCallback(() => {
    const isOpening = !showCommandMenu;
    setShowCommandMenu(isOpening);
    if (isOpening) {
      setCommandQuery('');
      setSelectedCommandIndex(-1);
    }
  }, [showCommandMenu]);

  return {
    slashCommands,
    showCommandMenu,
    filteredCommands,
    selectedCommandIndex,
    handleSlashDetected,
    handleCommandSelect,
    handleCloseCommandMenu,
    handleToggleCommandMenu,
  };
}
```

### Step 4: Update NewSessionModal

```jsx
import MessageInput from './MessageInput';
import CommandMenu from './CommandMenu';
import { useSlashCommands } from '../hooks/useSlashCommands';

export default function NewSessionModal({ isOpen, onClose, project, onSessionCreated }) {
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [permissionMode, setPermissionMode] = useState('default');
  const { sendMessage, subscribe, unsubscribe, isConnected } = useWebSocket();
  const textareaRef = useRef(null);
  const pendingSessionRef = useRef(false);
  const inputRef = useRef('');

  // Use the slash commands hook
  const {
    slashCommands,
    showCommandMenu,
    filteredCommands,
    selectedCommandIndex,
    handleSlashDetected,
    handleCommandSelect,
    handleCloseCommandMenu,
    handleToggleCommandMenu,
  } = useSlashCommands(project?.path || project?.fullPath);

  // Existing session-created handler...
  useEffect(() => {
    // ... (existing logic)
  }, [isOpen, subscribe, unsubscribe, onSessionCreated]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() || isSending || !isConnected) return;

    pendingSessionRef.current = true;
    inputRef.current = input.trim();
    setIsSending(true);

    sendMessage('claude-command', {
      command: input.trim(),
      options: {
        projectPath: project.path,
        cwd: project.fullPath || project.path,
        sessionId: undefined,
        resume: false,
        permissionMode: permissionMode  // ← Now included!
      }
    });

    if (!sent) {
      pendingSessionRef.current = false;
      setIsSending(false);
    }
  };

  // Calculate command menu position relative to modal
  const getCommandMenuPosition = useCallback(() => {
    if (!textareaRef.current) return { top: 0, left: 0 };
    const rect = textareaRef.current.getBoundingClientRect();
    return {
      top: rect.top - 8,  // Position above textarea
      left: rect.left,
      bottom: window.innerHeight - rect.top + 8
    };
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={!isSending ? onClose : undefined} />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 w-full max-w-2xl mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">New Conversation</h2>
          <button onClick={onClose} disabled={isSending} className="...">
            {/* X icon */}
          </button>
        </div>

        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Start a new conversation in <span className="font-medium">{project?.displayName || project?.name}</span>
        </p>

        {/* CommandMenu rendered at modal level for z-index */}
        <CommandMenu
          commands={filteredCommands}
          selectedIndex={selectedCommandIndex}
          onSelect={(cmd, idx, isHover) => handleCommandSelect(cmd, idx, isHover, input, setInput)}
          onClose={handleCloseCommandMenu}
          position={getCommandMenuPosition()}
          isOpen={showCommandMenu}
        />

        {/* Reusable MessageInput */}
        <MessageInput
          input={input}
          setInput={setInput}
          handleSubmit={handleSubmit}
          isConnected={isConnected}
          isSending={isSending}
          isStreaming={false}
          selectedProject={project}
          permissionMode={permissionMode}
          onModeChange={setPermissionMode}
          tokenBudget={null}
          slashCommands={slashCommands}
          showCommandMenu={showCommandMenu}
          onToggleCommandMenu={handleToggleCommandMenu}
          isUserScrolledUp={false}
          onScrollToBottom={null}
          onSlashDetected={handleSlashDetected}
          textareaRef={textareaRef}
          selectedCommandIndex={selectedCommandIndex}
          filteredCommands={filteredCommands}
          onCommandSelect={(cmd, idx, isHover) => handleCommandSelect(cmd, idx, isHover, input, setInput)}
          onCloseCommandMenu={handleCloseCommandMenu}
          // Modal-specific props:
          showTokenUsage={false}
          showConnectionWarning={false}
          submitLabel="Start Conversation"
          submitLabelLoading="Creating..."
          rows={4}
          variant="modal"
        />

        {/* Modal-specific connection warning */}
        {!isConnected && (
          <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <p className="text-sm text-yellow-700 dark:text-yellow-400">
              Waiting for connection to server...
            </p>
          </div>
        )}

        {/* Footer buttons - these can be removed if MessageInput handles submit */}
        <div className="flex justify-end gap-3 mt-4">
          <button type="button" onClick={onClose} disabled={isSending} className="...">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
```

### Step 5: Refactor ChatInterface

Extract the slash command logic to use the new hook:

```jsx
// In ChatInterface.jsx
import { useSlashCommands } from '../hooks/useSlashCommands';

// Replace local state with hook
const {
  slashCommands,
  showCommandMenu,
  filteredCommands,
  selectedCommandIndex,
  handleSlashDetected,
  handleCommandSelect,
  handleCloseCommandMenu,
  handleToggleCommandMenu,
} = useSlashCommands(selectedProject?.path);

// The MessageInput usage remains mostly unchanged
<MessageInput
  // ... existing props
  showTokenUsage={true}         // Explicit but same as default
  showConnectionWarning={true}  // Explicit but same as default
  variant="chat"                // Explicit but same as default
/>
```

---

## File Changes Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `src/components/MessageInput.jsx` | Modify | Add new props for variant control, conditional rendering |
| `src/hooks/useSlashCommands.js` | Create | New hook extracting slash command logic |
| `src/components/NewSessionModal.jsx` | Modify | Replace textarea with MessageInput, add hook usage |
| `src/components/ChatInterface.jsx` | Modify | Use new hook, simplify slash command state |

---

## Benefits of This Approach

1. **Single source of truth**: One MessageInput component to maintain
2. **Feature parity**: Users get the same experience in both contexts
3. **Permission mode in new sessions**: Users can select mode before starting conversation
4. **Reduced code duplication**: Slash command logic centralized in hook
5. **Type-ahead features**: @ files and / commands work immediately in modal
6. **Consistent UX**: Same keyboard shortcuts (Tab for mode, Enter to submit)

---

## Alternative Considered: Separate Components

I considered keeping separate components but rejected it because:
- Duplicates file reference logic (~50 lines)
- Duplicates slash command detection logic (~40 lines)
- Duplicates keyboard handling logic (~80 lines)
- Two places to fix bugs
- Features diverge over time

The prop-based variant approach adds ~20 lines to MessageInput but saves ~170 lines of duplication.

---

## Implementation Order

1. Create `useSlashCommands` hook (low risk, enables testing)
2. Add new props to `MessageInput` with defaults (backward compatible)
3. Update `ChatInterface` to use hook (refactor, no functional change)
4. Update `NewSessionModal` to use MessageInput (feature addition)
5. Test both contexts work correctly
