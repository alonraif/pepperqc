import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  Grid,
  IconButton,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Security as SecurityIcon,
  Telegram as TelegramIcon,
  Refresh as RefreshIcon,
  CheckCircle as CheckIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  Save as SaveIcon,
  Tune as TuneIcon,
} from '@mui/icons-material';

const SystemConfiguration = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // SSL Form state
  const [sslForm, setSslForm] = useState({
    hostname: '',
    email: '',
  });

  const [sslEnabled, setSslEnabled] = useState(false);

  const fetchConfiguration = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await fetch('/api/system/config');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load configuration');
      }

      setConfig(data);
      setSslForm({
        hostname: data.ssl?.hostname || '',
        email: data.ssl?.email || '',
      });
      setSslEnabled(Boolean(data.ssl?.hostname));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfiguration();
  }, []);

  const handleSslSave = async () => {
    try {
      setSaving(true);
      setError('');
      setSuccess('');

      const payload = sslEnabled ? sslForm : { hostname: '', email: '' };

      const response = await fetch('/api/system/config/ssl', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update SSL configuration');
      }

      setSuccess(data.message);
      await fetchConfiguration(); // Refresh configuration
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSslRenew = async () => {
    try {
      setSaving(true);
      setError('');
      setSuccess('');

      const response = await fetch('/api/system/config/ssl/renew', {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to renew certificate');
      }

      setSuccess(data.message);
      await fetchConfiguration();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const getCertificateStatusInfo = (certStatus) => {
    if (!certStatus) return null;

    if (!certStatus.has_certificate) {
      return { color: 'warning', icon: WarningIcon, text: 'No certificate' };
    }

    if (certStatus.days_remaining === null) {
      return { color: 'info', icon: CheckIcon, text: 'Certificate installed' };
    }

    if (certStatus.days_remaining < 7) {
      return { color: 'error', icon: ErrorIcon, text: `Expires in ${certStatus.days_remaining} days` };
    }

    if (certStatus.days_remaining < 30) {
      return { color: 'warning', icon: WarningIcon, text: `Expires in ${Math.round(certStatus.days_remaining)} days` };
    }

    return { color: 'success', icon: CheckIcon, text: `Valid for ${Math.round(certStatus.days_remaining)} days` };
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  const certStatusInfo = config?.ssl?.certificate_status ? getCertificateStatusInfo(config.ssl.certificate_status) : null;

  return (
    <Box>
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 600, mb: 3 }}>
        System Configuration
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* QC Analysis Presets */}
        <Grid item xs={12}>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 3 }}>
                <TuneIcon color="primary" />
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  QC Analysis Presets
                </Typography>
              </Stack>

              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Configure quality control analysis settings, thresholds, and severity levels for media processing.
              </Typography>

              <Button
                variant="outlined"
                component="a"
                href="#/presets"
                startIcon={<TuneIcon />}
                sx={{ mr: 2 }}
              >
                Manage QC Presets
              </Button>

              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                Set up QCTools tests, FFmpeg detectors, severity thresholds, and analysis parameters.
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* SSL/HTTPS Configuration */}
        <Grid item xs={12} md={6}>
          <Card sx={{ height: 'fit-content' }}>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 3 }}>
                <SecurityIcon color="primary" />
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  SSL/HTTPS Configuration
                </Typography>
                <Tooltip title="Refresh status">
                  <IconButton size="small" onClick={fetchConfiguration}>
                    <RefreshIcon />
                  </IconButton>
                </Tooltip>
              </Stack>

              <FormControlLabel
                control={
                  <Switch
                    checked={sslEnabled}
                    onChange={(e) => setSslEnabled(e.target.checked)}
                    color="primary"
                  />
                }
                label="Enable HTTPS with Let's Encrypt"
                sx={{ mb: 3 }}
              />

              {sslEnabled && (
                <Stack spacing={3}>
                  <TextField
                    label="Domain Name"
                    value={sslForm.hostname}
                    onChange={(e) => setSslForm({ ...sslForm, hostname: e.target.value })}
                    placeholder="example.com"
                    helperText="The domain name for your PepperQC instance"
                    fullWidth
                    required
                  />

                  <TextField
                    label="Email Address"
                    type="email"
                    value={sslForm.email}
                    onChange={(e) => setSslForm({ ...sslForm, email: e.target.value })}
                    placeholder="admin@example.com"
                    helperText="Required for Let's Encrypt certificate notifications"
                    fullWidth
                    required
                  />

                  {certStatusInfo && (
                    <Box>
                      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                        Certificate Status
                      </Typography>
                      <Chip
                        icon={<certStatusInfo.icon />}
                        label={certStatusInfo.text}
                        color={certStatusInfo.color}
                        variant="outlined"
                        sx={{ mb: 2 }}
                      />
                      {config?.ssl?.certificate_status?.expires_at && (
                        <Typography variant="body2" color="text.secondary">
                          Expires: {new Date(config.ssl.certificate_status.expires_at).toLocaleDateString()}
                        </Typography>
                      )}
                    </Box>
                  )}
                </Stack>
              )}

              <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
                <Button
                  variant="contained"
                  startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />}
                  onClick={handleSslSave}
                  disabled={saving || (sslEnabled && (!sslForm.hostname || !sslForm.email))}
                >
                  {sslEnabled ? 'Enable SSL' : 'Disable SSL'}
                </Button>

                {sslEnabled && config?.ssl?.hostname && (
                  <Button
                    variant="outlined"
                    startIcon={saving ? <CircularProgress size={20} /> : <RefreshIcon />}
                    onClick={handleSslRenew}
                    disabled={saving}
                  >
                    Renew Certificate
                  </Button>
                )}
              </Stack>

              {!sslEnabled && (
                <Alert severity="info" sx={{ mt: 2 }}>
                  PepperQC will be accessible over HTTP only. For production use, enable HTTPS.
                </Alert>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Telegram Configuration */}
        <Grid item xs={12} md={6}>
          <Card sx={{ height: 'fit-content' }}>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 3 }}>
                <TelegramIcon color="primary" />
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  Telegram Notifications
                </Typography>
                {config?.telegram?.configured && (
                  <Chip label="Configured" color="success" size="small" />
                )}
              </Stack>

              <Stack spacing={2}>
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">
                    Status
                  </Typography>
                  <Typography variant="body1">
                    {config?.telegram?.configured ? 'Connected' : 'Not configured'}
                  </Typography>
                </Box>

                {config?.telegram?.configured && (
                  <>
                    <Box>
                      <Typography variant="subtitle2" color="text.secondary">
                        Recipients
                      </Typography>
                      <Typography variant="body1">
                        {config.telegram.recipient_count || 0} configured
                      </Typography>
                    </Box>

                    <Box>
                      <Typography variant="subtitle2" color="text.secondary">
                        Token Source
                      </Typography>
                      <Chip
                        label={config.telegram.token_source}
                        size="small"
                        variant="outlined"
                      />
                    </Box>

                    {config.telegram.last_tested_at && (
                      <Box>
                        <Typography variant="subtitle2" color="text.secondary">
                          Last Tested
                        </Typography>
                        <Typography variant="body2">
                          {new Date(config.telegram.last_tested_at).toLocaleDateString()}
                        </Typography>
                      </Box>
                    )}
                  </>
                )}

                <Button
                  variant="outlined"
                  component="a"
                  href="#/telegram-settings"
                  sx={{ mt: 2 }}
                >
                  {config?.telegram?.configured ? 'Manage Telegram Settings' : 'Configure Telegram'}
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* System Information */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                System Information
              </Typography>

              <Grid container spacing={3}>
                <Grid item xs={12} sm={4}>
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      Version
                    </Typography>
                    <Typography variant="body1">
                      {config?.system?.version || 'Unknown'}
                    </Typography>
                  </Box>
                </Grid>

                <Grid item xs={12} sm={4}>
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      Environment
                    </Typography>
                    <Chip
                      label={config?.system?.environment || 'production'}
                      size="small"
                      color={config?.system?.environment === 'development' ? 'warning' : 'default'}
                    />
                  </Box>
                </Grid>

                <Grid item xs={12} sm={4}>
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      Last Updated
                    </Typography>
                    <Typography variant="body2">
                      {new Date().toLocaleDateString()}
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default SystemConfiguration;