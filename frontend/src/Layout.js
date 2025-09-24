import React, { useContext } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  AppBar,
  Box,
  Button,
  Container,
  Divider,
  IconButton,
  Stack,
  Toolbar,
  Typography,
  Tooltip,
} from '@mui/material';
import DashboardIcon from '@mui/icons-material/Speed';
import TuneIcon from '@mui/icons-material/Tune';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import TelegramIcon from '@mui/icons-material/Telegram';
import SettingsIcon from '@mui/icons-material/Settings';

import ColorModeContext from './theme/ColorModeContext';

const navItems = [
  { label: 'Overview', to: '/', icon: <DashboardIcon fontSize="small" /> },
  { label: 'Presets', to: '/presets', icon: <TuneIcon fontSize="small" /> },
  { label: 'Telegram', to: '/telegram', icon: <TelegramIcon fontSize="small" /> },
  { label: 'Settings', to: '/settings', icon: <SettingsIcon fontSize="small" /> },
];

const Layout = ({ children }) => {
  const location = useLocation();
  const { mode, toggleColorMode } = useContext(ColorModeContext);
  const isDark = mode === 'dark';
  const navPalette = {
    inactiveColor: 'rgba(255,255,255,0.9)',
    inactiveBg: 'rgba(255,255,255,0.1)',
    hoverBg: 'rgba(255,255,255,0.18)',
    activeBg: 'rgba(255,255,255,0.95)',
    activeColor: '#991b1b',
    border: '1px solid rgba(255,255,255,0.32)',
  };
  const brandRed = '#b91c1c';

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--card-gradient)',
        color: 'var(--text-primary)',
      }}
    >
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          backgroundColor: brandRed,
          color: '#fff',
          borderBottom: '1px solid rgba(255,255,255,0.3)',
          boxShadow: '0 16px 36px rgba(153, 27, 27, 0.35)',
        }}
      >
        <Toolbar sx={{ justifyContent: 'space-between', gap: 3, position: 'relative', zIndex: 1 }}>
          <Stack direction="row" spacing={2.5} alignItems="center">
            <Box
              sx={{
                position: 'relative',
                width: 64,
                height: 64,
                borderRadius: '18px',
                display: 'grid',
                placeItems: 'center',
                border: '1px solid rgba(255,255,255,0.4)',
                backgroundColor: '#ef4444',
                overflow: 'hidden',
              }}
            >
              <Box
                component="img"
                src="https://www.peppercreative.co.il/wp-content/uploads/logo.png"
                alt="Pepper Creative logo"
                sx={{
                  width: '70%',
                  height: '70%',
                  objectFit: 'contain',
                }}
              />
            </Box>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 800,
                letterSpacing: '0.04em',
                color: '#fff',
              }}
            >
              PepperQC
            </Typography>
          </Stack>

          <Stack direction="row" spacing={1.5} alignItems="center">
            {navItems.map((item) => {
              const active = location.pathname === item.to;
              return (
                <Button
                  key={item.to}
                  component={Link}
                  to={item.to}
                  startIcon={item.icon}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 500,
                    borderRadius: '999px',
                    px: 2.5,
                    py: 1,
                    border: navPalette.border,
                    color: active ? navPalette.activeColor : navPalette.inactiveColor,
                    backgroundColor: active ? navPalette.activeBg : navPalette.inactiveBg,
                    transition: 'all 0.2s ease-in-out',
                    '&:hover': {
                      backgroundColor: active ? navPalette.activeBg : navPalette.hoverBg,
                      color: active ? navPalette.activeColor : navPalette.inactiveColor,
                    },
                  }}
                >
                  {item.label}
                </Button>
              );
            })}
            <Tooltip title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
              <IconButton
                onClick={toggleColorMode}
                color="inherit"
                sx={{
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.28)',
                  backgroundColor: 'rgba(255,255,255,0.12)',
                  '&:hover': {
                    backgroundColor: 'rgba(255,255,255,0.2)',
                  },
                }}
              >
                {isDark ? <LightModeIcon /> : <DarkModeIcon />}
              </IconButton>
            </Tooltip>
          </Stack>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ flexGrow: 1, py: { xs: 4, md: 6 }, width: '100%' }}>
        <Box
          sx={{
            backgroundColor: 'var(--card-bg)',
            borderRadius: '24px',
            minHeight: '70vh',
            p: { xs: 3, md: 6 },
            boxShadow: 'var(--shadow-card)',
            border: `1px solid ${isDark ? 'rgba(148, 163, 184, 0.12)' : 'rgba(148,163,184,0.3)'}`,
            color: 'var(--text-primary)',
          }}
        >
          <Stack spacing={3}>
            <Stack spacing={1.5}>
              <Typography variant="h4" sx={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                Media Intelligence
              </Typography>
              <Typography variant="body2" sx={{ color: 'var(--text-muted)' }}>
                Monitor submissions, automate analysis, and accelerate QC workflows.
              </Typography>
            </Stack>
            <Divider sx={{ borderColor: 'var(--border-default)' }} />
            {children}
          </Stack>
        </Box>
      </Container>
    </Box>
  );
};

export default Layout;
