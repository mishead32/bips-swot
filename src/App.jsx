import { Navigate, Route, Routes } from 'react-router-dom';
import { isConfigured } from './lib/supabase';
import { AuthProvider, useAuth } from './lib/auth';
import { ToastProvider, Spinner } from './components/ui';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import SwotEntry from './pages/entry/SwotEntry';
import StudentSheet from './pages/StudentSheet';
import Admin from './pages/admin/Admin';

function NotConfigured() {
  return (
    <div className="center-screen">
      <div className="card setup-card">
        <h2>Almost there — keys missing</h2>
        <p>The website cannot find your Supabase keys.</p>
        <ol>
          <li>Open <b>vercel.com</b> → your <b>bips-swot</b> project → <b>Settings</b> → <b>Environment Variables</b>.</li>
          <li>Check both are added: <code>REACT_APP_SUPABASE_URL</code> and <code>REACT_APP_SUPABASE_ANON_KEY</code>.</li>
          <li>Go to <b>Deployments</b> → click <b>⋯</b> on the latest one → <b>Redeploy</b>.</li>
        </ol>
      </div>
    </div>
  );
}

function Gate() {
  const { session, profile, profileError, loading, masters, isAdmin, signOut } = useAuth();
  if (loading) return <div className="center-screen"><Spinner text="Opening BIPS SWOT…" /></div>;
  if (!session) return <Login />;
  if (!profile) {
    return (
      <div className="center-screen">
        <div className="card setup-card">
          <h2>Account not ready</h2>
          <p>{profileError || 'Loading your profile…'}</p>
          <button className="btn btn-primary" onClick={signOut}>Back to login</button>
        </div>
      </div>
    );
  }
  if (!masters) return <div className="center-screen"><Spinner text="Loading classes…" /></div>;
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/entry" element={<SwotEntry />} />
        <Route path="/sheet" element={<StudentSheet />} />
        <Route path="/admin/*" element={isAdmin ? <Admin /> : <Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  if (!isConfigured) return <NotConfigured />;
  return (
    <ToastProvider>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </ToastProvider>
  );
}
