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
    <Box sx={{ maxWidth: 1200, margin: '0 auto', p: 3 }}>
      {/* Page Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, color: 'text.primary', mb: 1 }}>
          Settings
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Configure your PepperQC instance, SSL certificates, and notification settings
        </Typography>
      </Box>

      {/* Alert Messages */}
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

      <Stack spacing={4}>
        {/* Analysis Configuration Section */}
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 3, color: 'text.primary' }}>
            Analysis Configuration
          </Typography>

          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Grid container spacing={3} alignItems="center">
                <Grid item xs={12} md={8}>
                  <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 1 }}>
                    <TuneIcon color="primary" />
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                      QC Analysis Presets
                    </Typography>
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    Configure quality control tests, thresholds, and severity levels for media analysis
                  </Typography>
                </Grid>
                <Grid item xs={12} md={4} sx={{ textAlign: { xs: 'left', md: 'right' } }}>
                  <Button
                    variant="contained"
                    component="a"
                    href="#/presets"
                    startIcon={<TuneIcon />}
                    size="large"
                  >
                    Manage Presets
                  </Button>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Box>

        {/* Security & Access Section */}
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 3, color: 'text.primary' }}>
            Security & Access
          </Typography>

          <Card>
            <CardContent sx={{ p: 4 }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 4 }}>
                <Stack direction="row" alignItems="center" spacing={2}>
                  <SecurityIcon color="primary" fontSize="large" />
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                      SSL/HTTPS Configuration
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Automatic SSL certificates with Let's Encrypt
                    </Typography>
                  </Box>
                </Stack>
                <Tooltip title="Refresh certificate status">
                  <IconButton onClick={fetchConfiguration}>
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
                    size="large"
                  />
                }
                label={
                  <Typography variant="body1" sx={{ fontWeight: 500 }}>
                    Enable HTTPS with automatic SSL certificates
                  </Typography>
                }
                sx={{ mb: 3 }}
              />

              {sslEnabled && (
                <Box sx={{ pl: 4, borderLeft: 2, borderColor: 'primary.main', mb: 3 }}>
                  <Grid container spacing={3}>
                    <Grid item xs={12} md={6}>
                      <TextField
                        label="Domain Name"
                        value={sslForm.hostname}
                        onChange={(e) => setSslForm({ ...sslForm, hostname: e.target.value })}
                        placeholder="pepperqc.example.com"
                        helperText="Your domain must point to this server"
                        fullWidth
                        required
                        size="large"
                      />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <TextField
                        label="Email Address"
                        type="email"
                        value={sslForm.email}
                        onChange={(e) => setSslForm({ ...sslForm, email: e.target.value })}
                        placeholder="admin@example.com"
                        helperText="For Let's Encrypt notifications"
                        fullWidth
                        required
                        size="large"
                      />
                    </Grid>
                  </Grid>

                  {certStatusInfo && (
                    <Box sx={{ mt: 3, p: 3, bgcolor: 'background.default', borderRadius: 2 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                        Certificate Status
                      </Typography>
                      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 1 }}>
                        <Chip
                          icon={<certStatusInfo.icon />}
                          label={certStatusInfo.text}
                          color={certStatusInfo.color}
                          size="medium"
                        />
                      </Stack>
                      {config?.ssl?.certificate_status?.expires_at && (
                        <Typography variant="body2" color="text.secondary">
                          Expires: {new Date(config.ssl.certificate_status.expires_at).toLocaleDateString()}
                        </Typography>
                      )}
                    </Box>
                  )}
                </Box>
              )}

              <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
                <Button
                  variant="contained"
                  size="large"
                  startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />}
                  onClick={handleSslSave}
                  disabled={saving || (sslEnabled && (!sslForm.hostname || !sslForm.email))}
                >
                  {sslEnabled ? 'Enable SSL' : 'Disable SSL'}
                </Button>

                {sslEnabled && config?.ssl?.hostname && (
                  <Button
                    variant="outlined"
                    size="large"
                    startIcon={saving ? <CircularProgress size={20} /> : <RefreshIcon />}
                    onClick={handleSslRenew}
                    disabled={saving}
                  >
                    Renew Certificate
                  </Button>
                )}
              </Stack>

              {!sslEnabled && (
                <Alert severity="info" sx={{ mt: 3 }}>
                  <strong>HTTP Mode:</strong> Your PepperQC instance will be accessible over HTTP only.
                  For production environments, we recommend enabling HTTPS.
                </Alert>
              )}
            </CardContent>
          </Card>
        </Box>

        {/* Notifications Section */}
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 3, color: 'text.primary' }}>
            Notifications
          </Typography>

          <Card>
            <CardContent>
              <Grid container spacing={3} alignItems="center">
                <Grid item xs={12} md={8}>
                  <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
                    <TelegramIcon color="primary" fontSize="large" />
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 600 }}>
                        Telegram Bot
                        {config?.telegram?.configured && (
                          <Chip label="Active" color="success" size="small" sx={{ ml: 2 }} />
                        )}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Receive notifications when jobs complete or encounter issues
                      </Typography>
                    </Box>
                  </Stack>

                  {config?.telegram?.configured && (
                    <Box sx={{ mt: 2 }}>
                      <Grid container spacing={2}>
                        <Grid item xs={6} sm={3}>
                          <Typography variant="body2" color="text.secondary">Recipients</Typography>
                          <Typography variant="body1" sx={{ fontWeight: 500 }}>
                            {config.telegram.recipient_count || 0}
                          </Typography>
                        </Grid>
                        <Grid item xs={6} sm={3}>
                          <Typography variant="body2" color="text.secondary">Token Source</Typography>
                          <Chip
                            label={config.telegram.token_source}
                            size="small"
                            variant="outlined"
                          />
                        </Grid>
                        {config.telegram.last_tested_at && (
                          <Grid item xs={12} sm={6}>
                            <Typography variant="body2" color="text.secondary">Last Tested</Typography>
                            <Typography variant="body2">
                              {new Date(config.telegram.last_tested_at).toLocaleDateString()}
                            </Typography>
                          </Grid>
                        )}
                      </Grid>
                    </Box>
                  )}
                </Grid>
                <Grid item xs={12} md={4} sx={{ textAlign: { xs: 'left', md: 'right' } }}>
                  <Button
                    variant={config?.telegram?.configured ? "outlined" : "contained"}
                    component="a"
                    href="#/telegram-settings"
                    size="large"
                    startIcon={<TelegramIcon />}
                  >
                    {config?.telegram?.configured ? 'Manage Settings' : 'Configure Bot'}
                  </Button>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Box>

        {/* System Information Section */}
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 3, color: 'text.primary' }}>
            System Information
          </Typography>

          <Card>
            <CardContent>
              <Grid container spacing={4}>
                <Grid item xs={12} sm={4}>
                  <Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      Version
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                      {config?.system?.version || 'Unknown'}
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      Environment
                    </Typography>
                    <Chip
                      label={config?.system?.environment || 'production'}
                      color={config?.system?.environment === 'development' ? 'warning' : 'default'}
                      size="medium"
                    />
                  </Box>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      Last Updated
                    </Typography>
                    <Typography variant="body1">
                      {new Date().toLocaleDateString()}
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Box>
      </Stack>
    </Box>
  );
};

export default SystemConfiguration;