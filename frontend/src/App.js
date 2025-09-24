import React, { useEffect, useMemo, useState } from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline, useMediaQuery } from '@mui/material';

import Dashboard from './Dashboard';
import ReviewPage from './ReviewPage';
import PresetManager from './PresetManager';
import UploadCard from './UploadCard';
import Layout from './Layout';
import TelegramSettings from './TelegramSettings';
import SystemConfiguration from './SystemConfiguration';
import './App.css';
import ColorModeContext from './theme/ColorModeContext';

const themeVarsDark = {
  '--bg-primary': '#020617',
  '--text-primary': '#e2e8f0',
  '--text-muted': 'rgba(148, 163, 184, 0.75)',
  '--text-subtle': 'rgba(148, 163, 184, 0.55)',
  '--card-bg': 'rgba(15, 23, 42, 0.65)',
  '--card-bg-secondary': 'rgba(30, 41, 59, 0.6)',
  '--border-default': 'rgba(148, 163, 184, 0.14)',
  '--border-strong': 'rgba(96, 165, 250, 0.4)',
  '--shadow-card': '0 25px 80px rgba(15, 118, 255, 0.08)',
  '--accent-blue': 'rgba(59, 130, 246, 0.18)',
  '--accent-blue-strong': '#93c5fd',
  '--accent-cyan-bg': 'rgba(15, 118, 255, 0.12)',
  '--accent-cyan-border': 'rgba(96, 165, 250, 0.25)',
  '--chip-bg': 'rgba(96, 165, 250, 0.18)',
  '--chip-text': '#bfdbfe',
  '--issue-time-bg': 'rgba(30, 64, 175, 0.28)',
  '--issue-duration-text': 'rgba(226, 232, 240, 0.7)',
  '--list-hover': 'rgba(59, 130, 246, 0.15)',
  '--list-selected': 'linear-gradient(135deg, rgba(59,130,246,0.3), rgba(147,197,253,0.18))',
  '--status-success-bg': 'rgba(34, 197, 94, 0.15)',
  '--status-success-text': '#4ade80',
  '--status-failure-bg': 'rgba(248, 113, 113, 0.18)',
  '--status-failure-text': '#fca5a5',
  '--status-processing-bg': 'rgba(96, 165, 250, 0.18)',
  '--status-processing-text': '#93c5fd',
  '--status-queued-bg': 'rgba(160, 174, 192, 0.2)',
  '--status-queued-text': '#cbd5f5',
  '--card-gradient': 'radial-gradient(circle at top, #1f2937 0%, #0b1220 45%, #05070d 100%)',
  '--appbar-gradient': 'linear-gradient(135deg, rgba(59,130,246,0.7), rgba(99,102,241,0.7))',
  '--card-hover-border': 'rgba(148, 163, 184, 0.12)',
  '--metric-card-bg': 'rgba(12, 20, 34, 0.8)',
  '--metric-card-border': 'rgba(148, 163, 184, 0.18)',
};

const themeVarsLight = {
  '--bg-primary': '#f8fafc',
  '--text-primary': '#0f172a',
  '--text-muted': 'rgba(71, 85, 105, 0.85)',
  '--text-subtle': 'rgba(100, 116, 139, 0.65)',
  '--card-bg': 'rgba(255, 255, 255, 0.95)',
  '--card-bg-secondary': 'rgba(248, 250, 252, 0.95)',
  '--border-default': 'rgba(148, 163, 184, 0.3)',
  '--border-strong': 'rgba(59, 130, 246, 0.45)',
  '--shadow-card': '0 18px 50px rgba(15, 118, 255, 0.12)',
  '--accent-blue': 'rgba(59, 130, 246, 0.12)',
  '--accent-blue-strong': '#2563eb',
  '--accent-cyan-bg': 'rgba(14, 165, 233, 0.12)',
  '--accent-cyan-border': 'rgba(14, 165, 233, 0.3)',
  '--chip-bg': 'rgba(59, 130, 246, 0.12)',
  '--chip-text': '#1d4ed8',
  '--issue-time-bg': 'rgba(191, 219, 254, 0.5)',
  '--issue-duration-text': 'rgba(71, 85, 105, 0.85)',
  '--list-hover': 'rgba(59, 130, 246, 0.12)',
  '--list-selected': 'linear-gradient(135deg, rgba(59,130,246,0.18), rgba(147,197,253,0.25))',
  '--status-success-bg': 'rgba(34, 197, 94, 0.2)',
  '--status-success-text': '#15803d',
  '--status-failure-bg': 'rgba(248, 113, 113, 0.22)',
  '--status-failure-text': '#b91c1c',
  '--status-processing-bg': 'rgba(59, 130, 246, 0.18)',
  '--status-processing-text': '#1d4ed8',
  '--status-queued-bg': 'rgba(226, 232, 240, 0.6)',
  '--status-queued-text': '#1e293b',
  '--card-gradient': 'radial-gradient(circle at top, rgba(148,163,184,0.35) 0%, rgba(226,232,240,0.9) 55%, #f8fafc 100%)',
  '--appbar-gradient': 'linear-gradient(135deg, rgba(59,130,246,0.35), rgba(99,102,241,0.35))',
  '--card-hover-border': 'rgba(59, 130, 246, 0.25)',
  '--metric-card-bg': 'rgba(255, 255, 255, 0.9)',
  '--metric-card-border': 'rgba(148, 163, 184, 0.25)',
};

const DashboardView = () => (
  <div className="dashboard-grid">
    <UploadCard />
    <div className="card dashboard-card">
      <Dashboard />
    </div>
  </div>
);

function App() {
  const storedMode = typeof window !== 'undefined' ? localStorage.getItem('pepperqc.colorMode') : null;
  const systemPrefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const [mode, setMode] = useState(() => storedMode || (systemPrefersDark ? 'dark' : 'light'));

  useEffect(() => {
    localStorage.setItem('pepperqc.colorMode', mode);
  }, [mode]);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', mode);
    const vars = mode === 'dark' ? themeVarsDark : themeVarsLight;
    Object.entries(vars).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
  }, [mode]);

  const colorMode = useMemo(
    () => ({
      mode,
      toggleColorMode: () => {
        setMode((prev) => (prev === 'light' ? 'dark' : 'light'));
      },
    }),
    [mode]
  );

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode,
          ...(mode === 'light'
            ? {
                background: {
                  default: '#f8fafc',
                  paper: '#ffffff',
                },
                text: {
                  primary: '#0f172a',
                  secondary: 'rgba(71, 85, 105, 0.85)',
                },
                primary: {
                  main: '#2563eb',
                },
                secondary: {
                  main: '#d97706',
                },
              }
            : {
                background: {
                  default: '#020617',
                  paper: '#111827',
                },
                text: {
                  primary: '#e2e8f0',
                  secondary: 'rgba(148, 163, 184, 0.75)',
                },
                primary: {
                  main: '#60a5fa',
                },
                secondary: {
                  main: '#fbbf24',
                },
              }),
        },
        typography: {
          fontFamily: [
            'Inter',
            '-apple-system',
            'BlinkMacSystemFont',
            '"Segoe UI"',
            'sans-serif',
          ].join(','),
        },
      }),
    [mode]
  );

  return (
    <ColorModeContext.Provider value={colorMode}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Router>
          <Layout>
            <Routes>
              <Route path="/review/:jobId" element={<ReviewPage />} />
              <Route path="/presets" element={<PresetManager />} />
              <Route path="/telegram" element={<TelegramSettings />} />
              <Route path="/telegram-settings" element={<TelegramSettings />} />
              <Route path="/settings" element={<SystemConfiguration />} />
              <Route path="/" element={<DashboardView />} />
            </Routes>
          </Layout>
        </Router>
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}

export default App;
