/**
 * App.jsx - Main Application Component
 *
 * Task-driven workflow architecture:
 * - Projects, Tasks, Conversations managed via TaskContext
 * - URL-based routing with React Router
 * - Routes: Dashboard -> Board -> TaskDetail -> Chat
 */

import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import { WebSocketProvider } from './contexts/WebSocketContext';
import { TaskContextProvider } from './contexts/TaskContext';
import { AgentContextProvider } from './contexts/AgentContext';
import { ToastProvider } from './contexts/ToastContext';
import ProtectedRoute from './components/ProtectedRoute';

// Page components
import {
  DashboardPage,
  BoardPage,
  TaskDetailPage,
  AgentDetailPage,
  ChatPage,
  ProjectEditPageWrapper,
  TaskEditPageWrapper,
  AgentEditPageWrapper
} from './pages';

// App wrapper for PWA detection and global settings
function AppWrapper({ children }) {
  useEffect(() => {
    const checkPWA = () => {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                          window.navigator.standalone ||
                          document.referrer.includes('android-app://');

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

  return (
    <div className="fixed inset-0 flex bg-background">
      <div className="flex-1 flex flex-col min-w-0">
        {children}
      </div>
    </div>
  );
}

// Root App component with providers and routes
function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <WebSocketProvider>
          <TaskContextProvider>
            <AgentContextProvider>
              <ToastProvider>
                <ProtectedRoute>
                <Router>
                  <AppWrapper>
                    <Routes>
                      {/* Dashboard - home page */}
                      <Route path="/" element={<DashboardPage />} />

                      {/* Board View - Kanban for a project */}
                      <Route path="/projects/:projectId" element={<BoardPage />} />

                      {/* Project Edit */}
                      <Route path="/projects/:projectId/edit" element={<ProjectEditPageWrapper />} />

                      {/* Task Detail */}
                      <Route path="/projects/:projectId/tasks/:taskId" element={<TaskDetailPage />} />

                      {/* Task Edit */}
                      <Route path="/projects/:projectId/tasks/:taskId/edit" element={<TaskEditPageWrapper />} />

                      {/* Task Chat */}
                      <Route path="/projects/:projectId/tasks/:taskId/chat/:conversationId" element={<ChatPage />} />

                      {/* Agent Detail */}
                      <Route path="/projects/:projectId/agents/:agentId" element={<AgentDetailPage />} />

                      {/* Agent Edit */}
                      <Route path="/projects/:projectId/agents/:agentId/edit" element={<AgentEditPageWrapper />} />

                      {/* Agent Chat */}
                      <Route path="/projects/:projectId/agents/:agentId/chat/:conversationId" element={<ChatPage />} />

                      {/* Catch-all redirect to dashboard */}
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                  </AppWrapper>
                </Router>
                </ProtectedRoute>
              </ToastProvider>
            </AgentContextProvider>
          </TaskContextProvider>
        </WebSocketProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
