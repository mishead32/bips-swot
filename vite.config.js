import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// envPrefix lets the app read REACT_APP_SUPABASE_URL / REACT_APP_SUPABASE_ANON_KEY
// (the names used in the setup guide) as well as VITE_* names.
export default defineConfig({
  plugins: [react()],
  envPrefix: ['VITE_', 'REACT_APP_'],
});
