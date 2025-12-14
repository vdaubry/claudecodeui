/**
 * App.jsx - Main Application Component
 *
 * Task-driven workflow architecture:
 * - Projects, Tasks, Conversations managed via TaskContext
 * - Full-screen Dashboard replaces sidebar
 * - MainContent renders views: Dashboard -> TaskDetail -> Chat
 */

import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import MainContent from './components/MainContent';
import MobileNav from './components/MobileNav';
import Settings from './components/Settings';
import ProjectForm from './components/ProjectForm';

import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import { WebSocketProvider } from './contexts/WebSocketContext';
import { TaskContextProvider, useTaskContext } from './contexts/TaskContext';
import ProtectedRoute from './components/ProtectedRoute';
import { useVersionCheck } from './hooks/useVersionCheck';
import useLocalStorage from './hooks/useLocalStorage';
import { authenticatedFetch } from './utils/api';

// Main App component
function AppContent() {
  const { updateAvailable, latestVersion, currentVersion, releaseInfo } = useVersionCheck('siteboon', 'claudecodeui');
  const [showVersionModal, setShowVersionModal] = useState(false);

  // TaskContext for state management
  const { createProject, updateProject, saveProjectDoc } = useTaskContext();

  // UI state
  const [isMobile, setIsMobile] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState('tools');

  // Display settings
  const [autoExpandTools, setAutoExpandTools] = useLocalStorage('autoExpandTools', false);
  const [showRawParameters, setShowRawParameters] = useLocalStorage('showRawParameters', false);
  const [showThinking, setShowThinking] = useLocalStorage('showThinking', true);

  // Project form modal state
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  // Detect if running as PWA
  const [isPWA, setIsPWA] = useState(false);

  useEffect(() => {
    const checkPWA = () => {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                          window.navigator.standalone ||
                          document.referrer.includes('android-app://');
      setIsPWA(isStandalone);

      if (isStandalone) {
        document.documentElement.classList.add('pwa-mode');
        document.body.classList.add('pwa-mode');
      } else {
        document.documentElement.classList.remove('pwa-mode');
        document.body.classList.remove('pwa-mode');
      }
    };

    checkPWA();
    window.matchMedia('(display-mode: standalone)').addEventListener('change', checkPWA);

    return () => {
      window.matchMedia('(display-mode: standalone)').removeEventListener('change', checkPWA);
    };
  }, []);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Expose openSettings function globally for component access
  window.openSettings = useCallback((tab = 'tools') => {
    setSettingsInitialTab(tab);
    setShowSettings(true);
  }, []);

  // Handle project creation/update from modal
  const handleProjectSubmit = async ({ name, repoFolderPath, documentation }) => {
    setIsCreatingProject(true);
    try {
      let result;
      if (editingProject) {
        // Update existing project
        result = await updateProject(editingProject.id, { name });
        if (result.success && documentation !== undefined) {
          // Save documentation separately
          await saveProjectDoc(editingProject.id, documentation);
        }
      } else {
        // Create new project
        result = await createProject(name, repoFolderPath, documentation);
      }
      if (result.success) {
        setShowProjectForm(false);
        setEditingProject(null);
      }
      return result;
    } finally {
      setIsCreatingProject(false);
    }
  };

  // Handle opening project edit form
  const handleEditProject = useCallback((project) => {
    setEditingProject(project);
    setShowProjectForm(true);
  }, []);

  // Version Upgrade Modal Component
  const VersionUpgradeModal = () => {
    const [isUpdating, setIsUpdating] = useState(false);
    const [updateOutput, setUpdateOutput] = useState('');

    if (!showVersionModal) return null;

    const cleanChangelog = (body) => {
      if (!body) return '';
      return body
        .replace(/\b[0-9a-f]{40}\b/gi, '')
        .replace(/(?:^|\s|-)([0-9a-f]{7,10})\b/gi, '')
        .replace(/\*\*Full Changelog\*\*:.*$/gim, '')
        .replace(/https?:\/\/github\.com\/[^\/]+\/[^\/]+\/compare\/[^\s)]+/gi, '')
        .replace(/\n\s*\n\s*\n/g, '\n\n')
        .trim();
    };

    const handleUpdateNow = async () => {
      setIsUpdating(true);
      setUpdateOutput('Starting update...\n');

      try {
        const response = await authenticatedFetch('/api/system/update', { method: 'POST' });
        const data = await response.json();

        if (response.ok) {
          setUpdateOutput(prev => prev + data.output + '\n\n Update completed! Please restart the server.\n');
        } else {
          setUpdateOutput(prev => prev + '\n Update failed: ' + (data.error || 'Unknown error') + '\n');
        }
      } catch (error) {
        setUpdateOutput(prev => prev + '\n Update failed: ' + error.message + '\n');
      } finally {
        setIsUpdating(false);
      }
    };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <button
          className="fixed inset-0 bg-black/50 backdrop-blur-sm"
          onClick={() => setShowVersionModal(false)}
          aria-label="Close"
        />
        <div className="relative bg-card rounded-lg shadow-xl border border-border w-full max-w-2xl mx-4 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Update Available</h2>
                <p className="text-sm text-muted-foreground">{releaseInfo?.title || 'A new version is ready'}</p>
              </div>
            </div>
            <button
              onClick={() => setShowVersionModal(false)}
              className="p-2 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
              <span className="text-sm font-medium">Current Version</span>
              <span className="text-sm font-mono">{currentVersion}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
              <span className="text-sm font-medium text-blue-700 dark:text-blue-300">Latest Version</span>
              <span className="text-sm font-mono text-blue-900 dark:text-blue-100">{latestVersion}</span>
            </div>
          </div>

          {releaseInfo?.body && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium">What's New:</h3>
              <div className="bg-muted rounded-lg p-4 border border-border max-h-64 overflow-y-auto">
                <div className="text-sm text-muted-foreground whitespace-pre-wrap">{cleanChangelog(releaseInfo.body)}</div>
              </div>
            </div>
          )}

          {updateOutput && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Update Progress:</h3>
              <div className="bg-gray-900 rounded-lg p-4 border border-gray-700 max-h-48 overflow-y-auto">
                <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap">{updateOutput}</pre>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              onClick={() => setShowVersionModal(false)}
              className="flex-1 px-4 py-2 text-sm font-medium bg-muted hover:bg-accent rounded-md transition-colors"
            >
              {updateOutput ? 'Close' : 'Later'}
            </button>
            {!updateOutput && (
              <button
                onClick={handleUpdateNow}
                disabled={isUpdating}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-md transition-colors flex items-center justify-center gap-2"
              >
                {isUpdating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Updating...
                  </>
                ) : (
                  'Update Now'
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 flex bg-background">
      {/* Main Content Area - Full Screen (no sidebar) */}
      <div className={`flex-1 flex flex-col min-w-0 ${isMobile && !isInputFocused ? 'pb-mobile-nav' : ''}`}>
        <MainContent
          isMobile={isMobile}
          isPWA={isPWA}
          onShowSettings={() => setShowSettings(true)}
          onShowProjectForm={() => setShowProjectForm(true)}
          onEditProject={handleEditProject}
          autoExpandTools={autoExpandTools}
          showRawParameters={showRawParameters}
          showThinking={showThinking}
          updateAvailable={updateAvailable}
          latestVersion={latestVersion}
          releaseInfo={releaseInfo}
          onShowVersionModal={() => setShowVersionModal(true)}
        />
      </div>

      {/* Mobile Bottom Navigation */}
      {isMobile && (
        <MobileNav
          activeTab="chat"
          setActiveTab={() => {}}
          isInputFocused={isInputFocused}
        />
      )}

      {/* Settings Modal */}
      <Settings
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        projects={[]}
        initialTab={settingsInitialTab}
      />

      {/* Project Form Modal */}
      <ProjectForm
        isOpen={showProjectForm}
        onClose={() => {
          setShowProjectForm(false);
          setEditingProject(null);
        }}
        onSubmit={handleProjectSubmit}
        initialData={editingProject}
        isSubmitting={isCreatingProject}
      />

      {/* Version Upgrade Modal */}
      <VersionUpgradeModal />
    </div>
  );
}

// Root App component with providers
function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <WebSocketProvider>
          <TaskContextProvider>
            <ProtectedRoute>
              <Router>
                <Routes>
                  <Route path="/*" element={<AppContent />} />
                </Routes>
              </Router>
            </ProtectedRoute>
          </TaskContextProvider>
        </WebSocketProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
