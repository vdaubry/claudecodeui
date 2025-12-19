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
import MainContent from './components/MainContent';
import Settings from './components/Settings';
import ProjectForm from './components/ProjectForm';

import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import { WebSocketProvider } from './contexts/WebSocketContext';
import { TaskContextProvider, useTaskContext } from './contexts/TaskContext';
import { ToastProvider } from './contexts/ToastContext';
import ProtectedRoute from './components/ProtectedRoute';
import useLocalStorage from './hooks/useLocalStorage';

// Main App component
function AppContent() {
  // TaskContext for state management
  const { createProject, updateProject, saveProjectDoc } = useTaskContext();

  // UI state
  const [isMobile, setIsMobile] = useState(false);
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

  return (
    <div className="fixed inset-0 flex bg-background">
      {/* Main Content Area - Full Screen (no sidebar) */}
      <div className="flex-1 flex flex-col min-w-0">
        <MainContent
          isMobile={isMobile}
          isPWA={isPWA}
          onShowSettings={() => setShowSettings(true)}
          onShowProjectForm={() => setShowProjectForm(true)}
          onEditProject={handleEditProject}
          autoExpandTools={autoExpandTools}
          showRawParameters={showRawParameters}
          showThinking={showThinking}
        />
      </div>

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
            <ToastProvider>
              <ProtectedRoute>
                <Router>
                  <Routes>
                    <Route path="/*" element={<AppContent />} />
                  </Routes>
                </Router>
              </ProtectedRoute>
            </ToastProvider>
          </TaskContextProvider>
        </WebSocketProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
