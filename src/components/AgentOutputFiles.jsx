/**
 * AgentOutputFiles.jsx - Agent Output Files Component
 *
 * Displays files created by Claude during agent conversations.
 * Users can download or delete these files.
 */

import React, { useState } from 'react';
import { FolderOutput, Trash2, Download, File, Image, FileText, Code, AlertCircle } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

// File type to icon mapping
const getFileIcon = (filename) => {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (['png', 'jpg', 'jpeg', 'gif'].includes(ext)) return Image;
  if (['md', 'txt', 'pdf'].includes(ext)) return FileText;
  if (['js', 'ts', 'jsx', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'css', 'html', 'sh', 'sql'].includes(ext)) return Code;
  return File;
};

// Format file size
const formatSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

function AgentOutputFiles({
  files = [],
  isLoading = false,
  onDownload,
  onDelete,
  className
}) {
  const [downloadingFile, setDownloadingFile] = useState(null);
  const [deletingFile, setDeletingFile] = useState(null);
  const [error, setError] = useState(null);

  const handleDownload = async (filename) => {
    setDownloadingFile(filename);
    setError(null);
    try {
      const result = await onDownload(filename);
      if (!result.success) {
        setError(result.error);
      }
    } finally {
      setDownloadingFile(null);
    }
  };

  const handleDelete = async (filename) => {
    setDeletingFile(filename);
    setError(null);
    try {
      const result = await onDelete(filename);
      if (!result.success) {
        setError(result.error);
      }
    } finally {
      setDeletingFile(null);
    }
  };

  if (isLoading) {
    return (
      <div className={cn('p-4', className)}>
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-muted rounded w-1/3" />
          <div className="h-8 bg-muted rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Description */}
      <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border bg-muted/30">
        Files created by Claude during conversations. Download or delete as needed.
      </div>

      {/* Error message */}
      {error && (
        <div className="mx-3 mt-3 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-red-500 hover:text-red-700 dark:hover:text-red-200"
          >
            &times;
          </button>
        </div>
      )}

      {/* File list */}
      <div className="flex-1 overflow-auto p-3">
        {files.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <FolderOutput className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No output files yet</p>
            <p className="text-xs mt-1">Files created by Claude will appear here</p>
          </div>
        ) : (
          <div className="space-y-2">
            {files.map((file) => {
              const FileIcon = getFileIcon(file.name);
              const isDownloading = downloadingFile === file.name;
              const isDeleting = deletingFile === file.name;

              return (
                <div
                  key={file.name}
                  className="group flex items-center gap-3 p-2 rounded-lg border border-border hover:border-primary/50 transition-colors"
                >
                  <FileIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" title={file.name}>{file.name}</p>
                    <p className="text-xs text-muted-foreground">{formatSize(file.size)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary"
                      onClick={() => handleDownload(file.name)}
                      disabled={isDownloading}
                      title="Download file"
                    >
                      {isDownloading ? (
                        <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Download className="w-3 h-3" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(file.name)}
                      disabled={isDeleting}
                      title="Delete file"
                    >
                      {isDeleting ? (
                        <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Trash2 className="w-3 h-3" />
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default AgentOutputFiles;
