import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { useAppContext } from './context/AppContext';

// Public pages
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';

// App pages (authenticated)
import Home from './pages/Home';
import Learn from './pages/Learn';
import Practice from './pages/Practice';
import Quiz from './pages/Quiz';
import AdaptiveQuiz from './pages/AdaptiveQuiz';
import QuickRecall from './pages/QuickRecall';
import Flashcards from './pages/Flashcards';
import MistakeReview from './pages/MistakeReview';
import LearningWin from './pages/LearningWin';
import LearningTwin from './pages/LearningTwin';
import Progress from './pages/Progress';
import Planner from './pages/Planner';
import ZoomClasses from './pages/ZoomClasses';
import Materials from './pages/Materials';
import Insights from './pages/Insights';
import Friends from './pages/Friends';
import Settings from './pages/Settings';
import Profile from './pages/Profile';

/** Redirect to /login if not authenticated */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isAuthLoading } = useAppContext();
  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

/** Redirect to /home if already authenticated */
function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isAuthLoading } = useAppContext();
  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }
  return isAuthenticated ? <Navigate to="/home" replace /> : <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<PublicOnlyRoute><Landing /></PublicOnlyRoute>} />
      <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
      <Route path="/register" element={<PublicOnlyRoute><Register /></PublicOnlyRoute>} />
      <Route path="/forgot-password" element={<PublicOnlyRoute><ForgotPassword /></PublicOnlyRoute>} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Protected app routes */}
      <Route path="/home" element={<ProtectedRoute><Home /></ProtectedRoute>} />
      <Route path="/learn" element={<ProtectedRoute><Learn /></ProtectedRoute>} />
      <Route path="/practice" element={<ProtectedRoute><Practice /></ProtectedRoute>} />
      <Route path="/practice/quiz" element={<ProtectedRoute><Quiz /></ProtectedRoute>} />
      <Route path="/practice/adaptive-quiz" element={<ProtectedRoute><AdaptiveQuiz /></ProtectedRoute>} />
      <Route path="/practice/quick-recall" element={<ProtectedRoute><QuickRecall /></ProtectedRoute>} />
      <Route path="/practice/flashcards" element={<ProtectedRoute><Flashcards /></ProtectedRoute>} />
      <Route path="/practice/mistake-review" element={<ProtectedRoute><MistakeReview /></ProtectedRoute>} />
      <Route path="/learning-win" element={<ProtectedRoute><LearningWin /></ProtectedRoute>} />
      <Route path="/learning-twin" element={<ProtectedRoute><LearningTwin /></ProtectedRoute>} />
      <Route path="/progress" element={<ProtectedRoute><Progress /></ProtectedRoute>} />
      <Route path="/planner" element={<ProtectedRoute><Planner /></ProtectedRoute>} />
      <Route path="/zoom" element={<ProtectedRoute><ZoomClasses /></ProtectedRoute>} />
      <Route path="/materials" element={<ProtectedRoute><Materials /></ProtectedRoute>} />
      <Route path="/insights" element={<ProtectedRoute><Insights /></ProtectedRoute>} />
      <Route path="/friends" element={<ProtectedRoute><Friends /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AppProvider>
  );
}

export default App;
