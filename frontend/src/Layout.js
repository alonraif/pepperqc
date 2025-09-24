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
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import SettingsIcon from '@mui/icons-material/Settings';

import ColorModeContext from './theme/ColorModeContext';

const navItems = [
  { label: 'Overview', to: '/', icon: <DashboardIcon fontSize="small" /> },
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
        <Toolbar
          sx={{
            justifyContent: 'space-between',
            gap: { xs: 1, sm: 2, md: 3 },
            position: 'relative',
            zIndex: 1,
            px: { xs: 1, sm: 2 },
            minHeight: { xs: 56, sm: 64 }
          }}
        >
          <Stack direction="row" spacing={{ xs: 1, sm: 2, md: 2.5 }} alignItems="center">
            <Box
              sx={{
                position: 'relative',
                width: { xs: 40, sm: 48, md: 64 },
                height: { xs: 40, sm: 48, md: 64 },
                borderRadius: { xs: '12px', sm: '15px', md: '18px' },
                display: 'grid',
                placeItems: 'center',
                border: '1px solid rgba(255,255,255,0.4)',
                backgroundColor: '#ef4444',
                overflow: 'hidden',
                flexShrink: 0,
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
                fontSize: { xs: '1.1rem', sm: '1.25rem', md: '1.25rem' },
                display: { xs: 'none', sm: 'block' }
              }}
            >
              PepperQC
            </Typography>
          </Stack>

          <Stack direction="row" spacing={{ xs: 0.5, sm: 1, md: 1.5 }} alignItems="center">
            {navItems.map((item) => {
              const active = location.pathname === item.to;
              return (
                <Button
                  key={item.to}
                  component={Link}
                  to={item.to}
                  startIcon={<Box sx={{ display: { xs: 'none', sm: 'block' } }}>{item.icon}</Box>}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 500,
                    borderRadius: '999px',
                    px: { xs: 1, sm: 2, md: 2.5 },
                    py: { xs: 0.5, sm: 0.75, md: 1 },
                    border: navPalette.border,
                    color: active ? navPalette.activeColor : navPalette.inactiveColor,
                    backgroundColor: active ? navPalette.activeBg : navPalette.inactiveBg,
                    transition: 'all 0.2s ease-in-out',
                    fontSize: { xs: '0.75rem', sm: '0.875rem', md: '0.875rem' },
                    minWidth: { xs: 'auto', sm: 'auto' },
                    '&:hover': {
                      backgroundColor: active ? navPalette.activeBg : navPalette.hoverBg,
                      color: active ? navPalette.activeColor : navPalette.inactiveColor,
                    },
                  }}
                >
                  <Box sx={{ display: { xs: 'block', sm: 'none' } }}>
                    {item.icon}
                  </Box>
                  <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
                    {item.label}
                  </Box>
                </Button>
              );
            })}
            <Tooltip title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
              <IconButton
                onClick={toggleColorMode}
                color="inherit"
                size="medium"
                sx={{
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.28)',
                  backgroundColor: 'rgba(255,255,255,0.12)',
                  width: { xs: 36, sm: 40, md: 48 },
                  height: { xs: 36, sm: 40, md: 48 },
                  '&:hover': {
                    backgroundColor: 'rgba(255,255,255,0.2)',
                  },
                }}
              >
                {isDark ?
                  <LightModeIcon sx={{ fontSize: { xs: '1rem', sm: '1.25rem', md: '1.5rem' } }} /> :
                  <DarkModeIcon sx={{ fontSize: { xs: '1rem', sm: '1.25rem', md: '1.5rem' } }} />
                }
              </IconButton>
            </Tooltip>
          </Stack>
        </Toolbar>
      </AppBar>

      <Container
        maxWidth="xl"
        sx={{
          flexGrow: 1,
          py: { xs: 2, sm: 4, md: 6 },
          px: { xs: 1, sm: 2, md: 3 },
          width: '100%'
        }}
      >
        <Box
          sx={{
            backgroundColor: 'var(--card-bg)',
            borderRadius: { xs: '16px', sm: '20px', md: '24px' },
            minHeight: '70vh',
            p: { xs: 2, sm: 4, md: 6 },
            boxShadow: 'var(--shadow-card)',
            border: `1px solid ${isDark ? 'rgba(148, 163, 184, 0.12)' : 'rgba(148,163,184,0.3)'}`,
            color: 'var(--text-primary)',
          }}
        >
          <Stack spacing={{ xs: 2, sm: 2.5, md: 3 }}>
            <Stack spacing={1.5}>
              <Typography
                variant="h4"
                sx={{
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  fontSize: { xs: '1.5rem', sm: '2rem', md: '2.125rem' }
                }}
              >
                Media Intelligence
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  color: 'var(--text-muted)',
                  fontSize: { xs: '0.875rem', sm: '0.875rem', md: '0.875rem' }
                }}
              >
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
