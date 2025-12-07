/*
 * MessageInput.jsx - Chat Message Input Component
 *
 * Reusable input component for sending messages via WebSocket.
 * Includes file reference dropdown when user types "@".
 */

import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { api } from '../utils/api';

// Helper function to flatten nested file tree
const flattenFileTree = (files, basePath = '') => {
  const result = [];

  for (const file of files) {
    const currentPath = basePath ? `${basePath}/${file.name}` : file.name;

    if (file.type === 'file') {
      result.push({
        name: file.name,
        path: currentPath,
      });
    } else if (file.type === 'directory' && file.children) {
      result.push(...flattenFileTree(file.children, currentPath));
    }
  }

  return result;
};

const MessageInput = memo(function MessageInput({
  input,
  setInput,
  handleSubmit,
  ws,
  isSending,
  isStreaming,
  selectedProject,
}) {
  // File dropdown state
  const [showFileDropdown, setShowFileDropdown] = useState(false);
  const [fileList, setFileList] = useState([]);
  const [filteredFiles, setFilteredFiles] = useState([]);
  const [selectedFileIndex, setSelectedFileIndex] = useState(-1);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [atSymbolPosition, setAtSymbolPosition] = useState(-1);

  const textareaRef = useRef(null);

  // Fetch project files when project changes
  useEffect(() => {
    const fetchProjectFiles = async () => {
      if (!selectedProject?.name) {
        setFileList([]);
        return;
      }

      try {
        const response = await api.getFiles(selectedProject.name);
        if (response.ok) {
          const files = await response.json();
          const flatFiles = flattenFileTree(files);
          setFileList(flatFiles);
        }
      } catch (error) {
        console.error('Error fetching files:', error);
      }
    };

    fetchProjectFiles();
  }, [selectedProject?.name]);

  // Detect @ symbol and filter files
  useEffect(() => {
    // Use cursor position, or input length as fallback when cursor is at end
    const effectiveCursorPos = cursorPosition > 0 ? cursorPosition : input.length;
    const textBeforeCursor = input.slice(0, effectiveCursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);

      // Check if there's a space after the @ symbol (ends the file reference)
      if (!textAfterAt.includes(' ')) {
        setAtSymbolPosition(lastAtIndex);
        setShowFileDropdown(true);

        // Filter files based on text after @
        const searchText = textAfterAt.toLowerCase();
        const filtered = fileList.filter(file =>
          file.name.toLowerCase().includes(searchText) ||
          file.path.toLowerCase().includes(searchText)
        ).slice(0, 10); // Limit to 10 results

        setFilteredFiles(filtered);
        setSelectedFileIndex(-1);
      } else {
        setShowFileDropdown(false);
        setAtSymbolPosition(-1);
      }
    } else {
      setShowFileDropdown(false);
      setAtSymbolPosition(-1);
    }
  }, [input, cursorPosition, fileList]);

  // Handle input change with cursor tracking
  const handleInputChange = useCallback((e) => {
    setInput(e.target.value);
    setCursorPosition(e.target.selectionStart);
  }, [setInput]);

  // Also track cursor on keyup for better compatibility with automated input
  const handleKeyUp = useCallback((e) => {
    setCursorPosition(e.target.selectionStart);
  }, []);

  // Handle file selection
  const selectFile = useCallback((file) => {
    const textBeforeAt = input.slice(0, atSymbolPosition);
    const textAfterAtQuery = input.slice(atSymbolPosition);
    const spaceIndex = textAfterAtQuery.indexOf(' ');
    const textAfterQuery = spaceIndex !== -1 ? textAfterAtQuery.slice(spaceIndex) : '';

    const newInput = textBeforeAt + '@' + file.path + ' ' + textAfterQuery;
    const newCursorPos = textBeforeAt.length + 1 + file.path.length + 1;

    setInput(newInput);
    setCursorPosition(newCursorPos);
    setShowFileDropdown(false);
    setAtSymbolPosition(-1);

    // Set cursor position after render
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        textareaRef.current.focus();
      }
    });
  }, [input, atSymbolPosition, setInput]);

  // Handle keyboard events
  const handleKeyDown = useCallback((e) => {
    // Handle file dropdown navigation
    if (showFileDropdown && filteredFiles.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedFileIndex(prev =>
          prev < filteredFiles.length - 1 ? prev + 1 : 0
        );
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedFileIndex(prev =>
          prev > 0 ? prev - 1 : filteredFiles.length - 1
        );
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && selectedFileIndex !== -1)) {
        e.preventDefault();
        const fileToSelect = selectedFileIndex !== -1
          ? filteredFiles[selectedFileIndex]
          : filteredFiles[0];
        if (fileToSelect) {
          selectFile(fileToSelect);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowFileDropdown(false);
        return;
      }
    }

    // Handle regular Enter to submit (Shift+Enter for new line)
    if (e.key === 'Enter' && !e.shiftKey && !showFileDropdown) {
      e.preventDefault();
      handleSubmit(e);
    }
  }, [showFileDropdown, filteredFiles, selectedFileIndex, selectFile, handleSubmit]);

  return (
    <div className="flex-shrink-0 p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      <form onSubmit={handleSubmit} className="relative">
        {/* File dropdown */}
        {showFileDropdown && filteredFiles.length > 0 && (
          <div className="absolute bottom-full left-0 right-0 mb-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto z-50">
            {filteredFiles.map((file, index) => (
              <div
                key={file.path}
                className={`px-4 py-3 cursor-pointer border-b border-gray-100 dark:border-gray-700 last:border-b-0 ${
                  index === selectedFileIndex
                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  selectFile(file);
                }}
                onMouseDown={(e) => e.preventDefault()}
              >
                <div className="font-medium text-sm text-gray-900 dark:text-white">{file.name}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">{file.path}</div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-3">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onKeyUp={handleKeyUp}
            onClick={(e) => setCursorPosition(e.target.selectionStart)}
            onSelect={(e) => setCursorPosition(e.target.selectionStart)}
            placeholder="Type / for commands, @ for files, or ask Claude anything..."
            className="flex-1 resize-none rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            rows={5}
            disabled={!ws || isSending || isStreaming}
          />
          <button
            type="submit"
            disabled={!input.trim() || !ws || isSending || isStreaming}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSending || isStreaming ? 'Responding...' : 'Send'}
          </button>
        </div>
      </form>
      {!ws && (
        <p className="text-xs text-yellow-600 dark:text-yellow-500 mt-2">
          Connecting to server...
        </p>
      )}
      {isStreaming && (
        <p className="text-xs text-blue-500 dark:text-blue-400 mt-2 flex items-center">
          <span className="inline-block w-2 h-2 bg-blue-500 rounded-full animate-pulse mr-2"></span>
          Claude is responding...
        </p>
      )}
    </div>
  );
});

MessageInput.displayName = 'MessageInput';

export default MessageInput;
