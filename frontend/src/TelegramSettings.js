import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import SendIcon from '@mui/icons-material/Send';
import RefreshIcon from '@mui/icons-material/Refresh';

import {
  createRecipient,
  deleteRecipient,
  deleteTelegramToken,
  fetchTelegramStatus,
  listRecipients,
  sendTestMessage,
  updateRecipient,
  updateTelegramToken,
} from './api/telegramApi';

const emptyForm = {
  display_name: '',
  chat_id: '',
  is_group: false,
  enabled: true,
};

const TelegramSettings = () => {
  const [status, setStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [tokenValue, setTokenValue] = useState('');
  const [tokenError, setTokenError] = useState(null);
  const [tokenSaving, setTokenSaving] = useState(false);
  const [recipients, setRecipients] = useState([]);
  const [loadingRecipients, setLoadingRecipients] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formValues, setFormValues] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [testStates, setTestStates] = useState({});

  const refreshStatus = async () => {
    try {
      setStatusLoading(true);
      const data = await fetchTelegramStatus();
      setStatus(data);
    } catch (error) {
      console.error('Failed to fetch Telegram status', error);
      setStatus({ configured: false, recipient_count: 0, last_tested_at: null });
    } finally {
      setStatusLoading(false);
    }
  };

  const refreshRecipients = async () => {
    try {
      setLoadingRecipients(true);
      const data = await listRecipients();
      setRecipients(data);
    } catch (error) {
      console.error('Failed to fetch Telegram recipients', error);
    } finally {
      setLoadingRecipients(false);
    }
  };

  useEffect(() => {
    refreshStatus();
    refreshRecipients();
  }, []);

  const openCreateDialog = () => {
    setEditing(null);
    setFormValues(emptyForm);
    setFormError(null);
    setDialogOpen(true);
  };

  const openEditDialog = (recipient) => {
    setEditing(recipient);
    setFormValues({
      display_name: recipient.display_name,
      chat_id: recipient.chat_id,
      is_group: recipient.is_group,
      enabled: recipient.enabled,
    });
    setFormError(null);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    if (saving) return;
    setDialogOpen(false);
  };

  const handleFormChange = (field, value) => {
    setFormValues((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        const updated = await updateRecipient(editing.id, formValues);
        setRecipients((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      } else {
        const created = await createRecipient(formValues);
        setRecipients((prev) => [created, ...prev]);
      }
      setDialogOpen(false);
      refreshStatus();
    } catch (error) {
      const message = error.response?.data?.error || 'Unable to save recipient.';
      setFormError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    const target = recipients.find((item) => item.id === id);
    if (!target) return;
    const confirm = window.confirm(`Remove Telegram recipient "${target.display_name}"?`);
    if (!confirm) return;
    try {
      await deleteRecipient(id);
      setRecipients((prev) => prev.filter((item) => item.id !== id));
      refreshStatus();
    } catch (error) {
      console.error('Failed to delete Telegram recipient', error);
    }
  };

  const handleToggleEnabled = async (recipient) => {
    try {
      const updated = await updateRecipient(recipient.id, { enabled: !recipient.enabled });
      setRecipients((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (error) {
      console.error('Failed to update Telegram recipient', error);
    }
  };

  const handleSendTest = async (recipient) => {
    setTestStates((prev) => ({ ...prev, [recipient.id]: 'loading' }));
    try {
      const response = await sendTestMessage(recipient.id);
      if (response.recipient) {
        setRecipients((prev) => prev.map((item) => (item.id === response.recipient.id ? response.recipient : item)));
      }
      setTestStates((prev) => ({ ...prev, [recipient.id]: 'success' }));
      refreshStatus();
    } catch (error) {
      const message = error.response?.data?.error || 'Test message failed.';
      setTestStates((prev) => ({ ...prev, [recipient.id]: message }));
    } finally {
      setTimeout(() => {
        setTestStates((prev) => ({ ...prev, [recipient.id]: undefined }));
      }, 3000);
    }
  };

  const tokenManagedByEnv = status?.token_source === 'environment';
  const canRemoveStoredToken = status?.token_source === 'database';

  const handleTokenSave = async (event) => {
    event?.preventDefault();
    if (!tokenValue.trim()) {
      setTokenError('Enter the bot token.');
      return;
    }
    try {
      setTokenSaving(true);
      setTokenError(null);
      await updateTelegramToken(tokenValue.trim());
      setTokenValue('');
      refreshStatus();
    } catch (error) {
      const message = error.response?.data?.error || 'Unable to update Telegram bot token.';
      setTokenError(message);
    } finally {
      setTokenSaving(false);
    }
  };

  const handleTokenClear = async () => {
    try {
      setTokenSaving(true);
      setTokenError(null);
      await deleteTelegramToken();
      setTokenValue('');
      refreshStatus();
    } catch (error) {
      const message = error.response?.data?.error || 'Unable to remove Telegram bot token.';
      setTokenError(message);
    } finally {
      setTokenSaving(false);
    }
  };

  useEffect(() => {
    if (statusLoading) {
      return;
    }
    setTokenError(null);
    if (tokenManagedByEnv) {
      setTokenValue('');
    }
  }, [statusLoading, tokenManagedByEnv]);

  const statusContent = useMemo(() => {
    if (statusLoading) {
      return <CircularProgress size={18} />;
    }
    if (!status) {
      return <Typography variant="body2">Integration status unavailable.</Typography>;
    }
    const lastTest = status.last_tested_at ? new Date(status.last_tested_at).toLocaleString() : 'Never';
    if (!status.configured) {
      return (
        <Alert severity="warning" sx={{ width: '100%' }}>
          Telegram bot token missing. Provide the token below to enable notifications.
        </Alert>
      );
    }

    const tokenInfo = status.token_source === 'environment'
      ? 'Token provided via environment variable.'
      : status.token_source === 'database'
        ? `Token stored in database${status.token_last_updated_at ? ` (updated ${new Date(status.token_last_updated_at).toLocaleString()})` : ''}.`
        : 'Token source unknown.';

    return (
      <Alert severity="success" sx={{ width: '100%' }}>
        Bot connected. {status.recipient_count} recipient{status.recipient_count === 1 ? '' : 's'} configured. Last test: {lastTest}. {tokenInfo}
      </Alert>
    );
  }, [status, statusLoading]);

  return (
    <Stack spacing={3}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          Telegram Notifications
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => { refreshStatus(); refreshRecipients(); }}>
            Refresh
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreateDialog}>
            Add Recipient
          </Button>
        </Stack>
      </Stack>

      <Card variant="outlined" component="form" onSubmit={handleTokenSave}>
        <CardContent>
          {statusLoading && !status ? (
            <Box sx={{ display: 'grid', placeItems: 'center', py: 4 }}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <Stack spacing={2}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                Bot Configuration
              </Typography>
              {tokenManagedByEnv ? (
                <Alert severity="info">
                  Token is supplied via the backend environment. Update the `TELEGRAM_BOT_TOKEN` variable on the server to change it.
                </Alert>
              ) : null}
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={2}
                alignItems={{ xs: 'stretch', sm: 'center' }}
              >
                <TextField
                  type="password"
                  label="Bot token"
                  placeholder="123456789:ABC..."
                  value={tokenValue}
                  onChange={(event) => setTokenValue(event.target.value)}
                  disabled={tokenManagedByEnv || tokenSaving}
                  fullWidth
                  autoComplete="off"
                  helperText={tokenManagedByEnv ? 'Managed via environment variable.' : 'Paste the token provided by @BotFather.'}
                />
                <Button
                  type="submit"
                  variant="contained"
                  disabled={tokenManagedByEnv || tokenSaving || !tokenValue.trim()}
                >
                  {tokenSaving ? <CircularProgress size={18} /> : 'Save Token'}
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  onClick={handleTokenClear}
                  disabled={tokenManagedByEnv || tokenSaving || !canRemoveStoredToken}
                >
                  Remove Token
                </Button>
              </Stack>
              {tokenError ? <Alert severity="error">{tokenError}</Alert> : null}
              {status?.token_source === 'database' && status.token_last_updated_at ? (
                <Typography variant="body2" color="text.secondary">
                  Last updated {new Date(status.token_last_updated_at).toLocaleString()}.
                </Typography>
              ) : null}
              {status?.token_source === 'unset' ? (
                <Typography variant="body2" color="text.secondary">
                  Store the bot token to enable Telegram notifications.
                </Typography>
              ) : null}
            </Stack>
          )}
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={2}>
            {statusContent}
            <Typography variant="body2" color="text.secondary">
              Add users or group chats using their Telegram chat IDs. The bot must have permission to message the target chat.
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          {loadingRecipients ? (
            <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}>
              <CircularProgress />
            </Box>
          ) : recipients.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <Typography variant="body1" color="text.secondary">
                No Telegram recipients configured yet.
              </Typography>
            </Box>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Chat ID</TableCell>
                  <TableCell align="center">Group</TableCell>
                  <TableCell align="center">Enabled</TableCell>
                  <TableCell>Last Tested</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {recipients.map((recipient) => {
                  const testingState = testStates[recipient.id];
                  const lastTested = recipient.last_tested_at
                    ? new Date(recipient.last_tested_at).toLocaleString()
                    : 'Never';
                  const tooltipTitle = testingState === 'success'
                    ? 'Test message sent'
                    : testingState && testingState !== 'loading'
                      ? testingState
                      : 'Send test message';
                  return (
                    <TableRow key={recipient.id} hover>
                      <TableCell>{recipient.display_name}</TableCell>
                      <TableCell>{recipient.chat_id}</TableCell>
                      <TableCell align="center">{recipient.is_group ? 'Yes' : 'No'}</TableCell>
                      <TableCell align="center">
                        <Switch
                          size="small"
                          checked={recipient.enabled}
                          onChange={() => handleToggleEnabled(recipient)}
                          inputProps={{ 'aria-label': 'Toggle recipient enabled' }}
                        />
                      </TableCell>
                      <TableCell>{lastTested}</TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                          <Tooltip title={tooltipTitle}>
                            <span>
                              <IconButton
                                size="small"
                                onClick={() => handleSendTest(recipient)}
                                disabled={testingState === 'loading'}
                                color={testingState === 'success' ? 'success' : 'default'}
                              >
                                {testingState === 'loading' ? <CircularProgress size={16} /> : <SendIcon fontSize="inherit" />}
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="Edit recipient">
                            <IconButton size="small" onClick={() => openEditDialog(recipient)}>
                              <EditIcon fontSize="inherit" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete recipient">
                            <IconButton size="small" color="error" onClick={() => handleDelete(recipient.id)}>
                              <DeleteIcon fontSize="inherit" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onClose={closeDialog} fullWidth maxWidth="sm">
        <DialogTitle>{editing ? 'Edit Telegram Recipient' : 'Add Telegram Recipient'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              label="Display name"
              fullWidth
              value={formValues.display_name}
              onChange={(event) => handleFormChange('display_name', event.target.value)}
              disabled={saving}
              required
            />
            <TextField
              label="Chat ID"
              fullWidth
              value={formValues.chat_id}
              onChange={(event) => handleFormChange('chat_id', event.target.value)}
              disabled={saving}
              required
              helperText="Use the numeric user ID or group/channel ID the bot should message."
            />
            <FormControlLabel
              control={
                <Switch
                  checked={formValues.is_group}
                  onChange={(event) => handleFormChange('is_group', event.target.checked)}
                  disabled={saving}
                />
              }
              label="This recipient is a group or channel"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={formValues.enabled}
                  onChange={(event) => handleFormChange('enabled', event.target.checked)}
                  disabled={saving}
                />
              }
              label="Receive notifications"
            />
            {formError ? (
              <Alert severity="error">{formError}</Alert>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} variant="contained" disabled={saving}>
            {saving ? <CircularProgress size={18} /> : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};

export default TelegramSettings;
