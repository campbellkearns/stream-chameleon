import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import LiveController from './pages/LiveController';
import Presets from './pages/Presets';
import WebMCPHub from './pages/WebMCPHub';
import CreateProfile from './pages/CreateProfile';
import EditProfile from './pages/EditProfile';
import AuthPage from './pages/AuthPage';
import AuthCallback from './pages/AuthCallback';
import SupportPage from './pages/SupportPage';
import { initializeRepositories } from './repositories';

// Import test functions in development
if (import.meta.env.DEV) {
  import('./lib/test/repositoryTests');
  import('./lib/test/authTests');
  import('./lib/test/epic3Tests');
}

function App(): JSX.Element {
  useEffect(() => {
    // Initialize repositories on app start
    initializeRepositories().then((status) => {
      console.log('🚀 Repository initialization:', status);
      if (!status.allReady) {
        console.warn('⚠️ Some repositories failed to initialize');
      }
    }).catch((error) => {
      console.error('💥 Repository initialization failed:', error);
    });
  }, []);

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<LiveController />} />
        <Route path="presets" element={<Presets />} />
        <Route path="webmcp" element={<WebMCPHub />} />
        <Route path="profile/new" element={<CreateProfile />} />
        <Route path="profile/:id/edit" element={<EditProfile />} />
        <Route path="support" element={<SupportPage />} />
        <Route path="auth" element={<AuthPage />} />
      </Route>
      {/* OAuth callback route outside of Layout */}
      <Route path="/auth/callback" element={<AuthCallback />} />
    </Routes>
  );
}

export default App