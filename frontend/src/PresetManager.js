import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  InputLabel,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import SaveIcon from '@mui/icons-material/Save';
import SaveAsIcon from '@mui/icons-material/SaveAs';
import LayersIcon from '@mui/icons-material/Layers';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';

import apiClient from './apiClient';

const PRESET_NEW = 'new';
const DEFAULT_PANELS = ['Tiled Center Column'];

const buildInitialForm = (catalog) => ({
  name: '',
  video_tracks: 'first',
  audio_tracks: 'first',
  panels: DEFAULT_PANELS,
  filters: (catalog.qctools || []).map((test) => ({
    id: test.id,
    enabled: Boolean(test.default_enabled),
    metrics: Object.fromEntries(
      (test.metrics || []).map((metric) => {
        const defaults = metric.default || {};
        const hasMin = Object.prototype.hasOwnProperty.call(defaults, 'min');
        const hasMax = Object.prototype.hasOwnProperty.call(defaults, 'max');
        return [
          metric.key,
          {
            nonCritical: {
              min: hasMin ? String(defaults.min) : '',
              max: hasMax ? String(defaults.max) : '',
            },
            critical: {
              min: '',
              max: '',
            },
            defaultSeverity: 'non_critical',
          },
        ];
      })
    ),
  })),
  ffmpeg: (catalog.ffmpeg || []).map((detector) => ({
    id: detector.id,
    enabled: Boolean(detector.default_enabled),
    params: Object.fromEntries(
      (detector.params || []).map((param) => [
        param.key,
        param.default !== undefined && param.default !== null ? String(param.default) : '',
      ])
    ),
    defaultSeverity: 'non_critical',
  })),
  is_default: false,
});

const toFloatOrNull = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const normalizePayload = (form, catalog) => ({
  video_tracks: form.video_tracks,
  audio_tracks: form.audio_tracks,
  panels: form.panels || [],
  filters: form.filters.map((filter) => ({
    id: filter.id,
    enabled: Boolean(filter.enabled),
    metrics: Object.fromEntries(
      Object.entries(filter.metrics || {}).map(([key, value]) => {
        const normalizeBounds = (bounds) => {
          const result = {};
          const minValue = toFloatOrNull(bounds?.min);
          const maxValue = toFloatOrNull(bounds?.max);
          if (minValue !== null) result.min = minValue;
          if (maxValue !== null) result.max = maxValue;
          return result;
        };

        const nonCriticalBounds = normalizeBounds(value?.nonCritical || {});
        const criticalBounds = normalizeBounds(value?.critical || {});
        const thresholdBounds = normalizeBounds(value?.nonCritical || {});
        const defaultSeverity = value?.defaultSeverity === 'critical' ? 'critical' : 'non_critical';

        const payload = {
          severity: {
            non_critical: nonCriticalBounds,
            critical: criticalBounds,
          },
          default_severity: defaultSeverity,
        };

        if (Object.keys(thresholdBounds).length > 0) {
          payload.threshold = thresholdBounds;
        }
        return [key, payload];
      })
    ),
  })),
  ffmpeg: form.ffmpeg.map((detector) => {
    const detectorMeta = (catalog.ffmpeg || []).find((meta) => meta.id === detector.id);
    const params = Object.fromEntries(
      Object.entries(detector.params || {}).map(([key, value]) => {
        const paramMeta = detectorMeta?.params?.find((param) => param.key === key);
        const type = paramMeta?.type ?? 'number';
        if (type === 'text') {
          const textValue = typeof value === 'string' ? value.trim() : value ?? '';
          return [key, textValue];
        }
        if (type === 'integer') {
          const numeric = toFloatOrNull(value);
          return [key, numeric !== null ? Math.round(numeric) : null];
        }
        const numeric = toFloatOrNull(value);
        return [key, numeric];
      })
    );
    return {
      id: detector.id,
      enabled: Boolean(detector.enabled),
      params,
      default_severity: detector.defaultSeverity === 'critical' ? 'critical' : 'non_critical',
    };
  }),
});

const PresetManager = () => {
  const [catalog, setCatalog] = useState({ qctools: [], ffmpeg: [] });
  const [presets, setPresets] = useState([]);
  const [form, setForm] = useState(null);
  const [selectedPresetId, setSelectedPresetId] = useState(PRESET_NEW);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingAsNew, setSavingAsNew] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const catalogResponse = await apiClient.get('/api/qctools/tests');
        const loadedCatalog = {
          qctools: catalogResponse.data?.qctools || [],
          ffmpeg: catalogResponse.data?.ffmpeg || [],
        };
        setCatalog(loadedCatalog);
        setForm(buildInitialForm(loadedCatalog));
        setSelectedPresetId(PRESET_NEW);
      } catch (err) {
        setError('Unable to load QCTools catalog.');
      }
    };
    load();
  }, []);

  useEffect(() => {
    if ((catalog.qctools?.length || 0) > 0 || (catalog.ffmpeg?.length || 0) > 0) {
      fetchPresets().catch(() => setError('Could not fetch presets.'));
    }
  }, [catalog]);

  const fetchPresets = async () => {
    const response = await apiClient.get('/api/presets');
    setPresets(response.data);
    return response.data;
  };

  const handleToggle = (testId) => (event) => {
    setForm((prev) => ({
      ...prev,
      filters: prev.filters.map((filter) =>
        filter.id === testId ? { ...filter, enabled: event.target.checked } : filter
      ),
    }));
  };

  const handleDetectorToggle = (detectorId) => (event) => {
    setForm((prev) => ({
      ...prev,
      ffmpeg: prev.ffmpeg.map((detector) =>
        detector.id === detectorId ? { ...detector, enabled: event.target.checked } : detector
      ),
    }));
  };

  const handleSeverityThresholdChange = (testId, metricKey, severityKey, bound) => (event) => {
    const value = event.target.value;
    setForm((prev) => ({
      ...prev,
      filters: prev.filters.map((filter) => {
        if (filter.id !== testId) return filter;
        const currentMetric =
          filter.metrics[metricKey] || {
            nonCritical: { min: '', max: '' },
            critical: { min: '', max: '' },
            defaultSeverity: 'non_critical',
          };
        return {
          ...filter,
          metrics: {
            ...filter.metrics,
            [metricKey]: {
              ...currentMetric,
              [severityKey]: {
                ...(currentMetric[severityKey] || { min: '', max: '' }),
                [bound]: value,
              },
            },
          },
        };
      }),
    }));
  };

  const handleDefaultSeverityToggle = (testId, metricKey) => (event) => {
    const nextValue = event.target.checked ? 'critical' : 'non_critical';
    setForm((prev) => ({
      ...prev,
      filters: prev.filters.map((filter) => {
        if (filter.id !== testId) return filter;
        const currentMetric =
          filter.metrics[metricKey] || {
            nonCritical: { min: '', max: '' },
            critical: { min: '', max: '' },
            defaultSeverity: 'non_critical',
          };
        return {
          ...filter,
          metrics: {
            ...filter.metrics,
            [metricKey]: {
              ...currentMetric,
              defaultSeverity: nextValue,
            },
          },
        };
      }),
    }));
  };

  const handleDetectorParamChange = (detectorId, paramKey) => (event) => {
    const value = event.target.value;
    setForm((prev) => ({
      ...prev,
      ffmpeg: prev.ffmpeg.map((detector) => {
        if (detector.id !== detectorId) return detector;
        return {
          ...detector,
          params: {
            ...detector.params,
            [paramKey]: value,
          },
        };
      }),
    }));
  };

  const handleDetectorSeverityToggle = (detectorId) => (event) => {
    const nextValue = event.target.checked ? 'critical' : 'non_critical';
    setForm((prev) => ({
      ...prev,
      ffmpeg: prev.ffmpeg.map((detector) => {
        if (detector.id !== detectorId) return detector;
        return {
          ...detector,
          defaultSeverity: nextValue,
        };
      }),
    }));
  };

  const handleTracksChange = (type) => (event, value) => {
    if (!value) return;
    setForm((prev) => ({ ...prev, [`${type}_tracks`]: value }));
  };

  const applyPresetToForm = (preset) => {
    const nextForm = buildInitialForm(catalog);
    nextForm.name = preset.name;
    nextForm.video_tracks = preset.parameters?.video_tracks || 'first';
    nextForm.audio_tracks = preset.parameters?.audio_tracks || 'first';
    nextForm.panels = preset.parameters?.panels || DEFAULT_PANELS;
    nextForm.is_default = Boolean(preset.is_default);

    const presetFilterMap = Object.fromEntries(
      (preset.parameters?.filters || []).map((filter) => [filter.id, filter])
    );
    nextForm.filters = nextForm.filters.map((filter) => {
      const existing = presetFilterMap[filter.id];
      if (!existing) return filter;
      const testMeta = catalog.qctools.find((test) => test.id === filter.id);
      const updatedMetrics = {};
      (testMeta?.metrics || []).forEach((metric) => {
        const metricConfig = existing.metrics?.[metric.key] || {};
        const severityConfig = metricConfig.severity || {};
        const thresholdConfig = metricConfig.threshold || metricConfig;

        const toStringValue = (value) =>
          value !== undefined && value !== null && value !== '' ? String(value) : '';

        const nonCriticalConfig = severityConfig.non_critical || {};
        const criticalConfig = severityConfig.critical || {};

        updatedMetrics[metric.key] = {
          nonCritical: {
            min: toStringValue(
              nonCriticalConfig.min !== undefined ? nonCriticalConfig.min : thresholdConfig.min
            ),
            max: toStringValue(
              nonCriticalConfig.max !== undefined ? nonCriticalConfig.max : thresholdConfig.max
            ),
          },
          critical: {
            min: toStringValue(criticalConfig.min),
            max: toStringValue(criticalConfig.max),
          },
          defaultSeverity:
            metricConfig.default_severity === 'critical' ? 'critical' : 'non_critical',
        };
      });
      return {
        id: filter.id,
        enabled: Boolean(existing.enabled),
        metrics: updatedMetrics,
      };
    });

    const presetDetectorMap = Object.fromEntries(
      (preset.parameters?.ffmpeg || []).map((detector) => [detector.id, detector])
    );
    nextForm.ffmpeg = nextForm.ffmpeg.map((detector) => {
      const existing = presetDetectorMap[detector.id];
      if (!existing) return detector;
      const detectorMeta = catalog.ffmpeg.find((meta) => meta.id === detector.id);
      const params = {};
      (detectorMeta?.params || []).forEach((param) => {
        const currentValue = existing.params?.[param.key];
        params[param.key] =
          currentValue !== undefined && currentValue !== null
            ? String(currentValue)
            : param.default !== undefined && param.default !== null
            ? String(param.default)
            : '';
      });
      return {
        id: detector.id,
        enabled: Boolean(existing.enabled),
        params,
        defaultSeverity: existing.default_severity === 'critical' ? 'critical' : 'non_critical',
      };
    });

    setForm(nextForm);
    setSelectedPresetId(String(preset.id));
  };

  const resetForm = () => {
    setForm(buildInitialForm(catalog));
    setSelectedPresetId(PRESET_NEW);
    setError('');
  };

  const handlePresetDropdownChange = (event) => {
    const value = event.target.value;
    setError('');
    if (value === PRESET_NEW) {
      resetForm();
      return;
    }
    const preset = presets.find((p) => String(p.id) === String(value));
    if (preset) {
      applyPresetToForm(preset);
    }
  };

  const currentPayload = useMemo(
    () => (form ? normalizePayload(form, catalog) : null),
    [form, catalog]
  );
  const defaultPayload = useMemo(
    () => normalizePayload(buildInitialForm(catalog), catalog),
    [catalog]
  );

  const hasChanges = useMemo(() => {
    if (!form || !currentPayload) return false;
    const currentIsDefault = Boolean(form.is_default);

    if (selectedPresetId === PRESET_NEW) {
      const baseMatch = JSON.stringify(currentPayload) === JSON.stringify(defaultPayload);
      return !baseMatch || currentIsDefault;
    }

    const selected = presets.find((preset) => String(preset.id) === String(selectedPresetId));
    if (!selected) {
      const baseMatch = JSON.stringify(currentPayload) === JSON.stringify(defaultPayload);
      return !baseMatch || currentIsDefault;
    }

    const selectedIsDefault = Boolean(selected.is_default);
    const payloadChanged = JSON.stringify(currentPayload) !== JSON.stringify(selected.parameters || {});
    return payloadChanged || currentIsDefault !== selectedIsDefault;
  }, [form, currentPayload, defaultPayload, presets, selectedPresetId]);

  const ffmpegTests = catalog.ffmpeg || [];
  const qctoolsTests = catalog.qctools || [];
  const hasFfmpegTests = ffmpegTests.length > 0;
  const hasQctoolsTests = qctoolsTests.length > 0;

  const handleSave = async ({ saveAsNew = false } = {}) => {
    if (!form?.name) {
      setError('Please provide a preset name.');
      return;
    }
    if (!currentPayload) return;

    if (saveAsNew) {
      setSavingAsNew(true);
    } else {
      setSaving(true);
    }
    setError('');

    try {
      if (saveAsNew || selectedPresetId === PRESET_NEW) {
        const response = await apiClient.post('/api/presets', {
          name: form.name,
          parameters: currentPayload,
          is_default: Boolean(form.is_default),
        });
        const data = await fetchPresets();
        const created = data.find((preset) => String(preset.id) === String(response.data.id));
        if (created) {
          applyPresetToForm(created);
        } else {
          resetForm();
        }
      } else {
        await apiClient.put(`/api/presets/${selectedPresetId}`, {
          name: form.name,
          parameters: currentPayload,
          is_default: form.is_default,
        });
        const data = await fetchPresets();
        const updated = data.find((preset) => String(preset.id) === String(selectedPresetId));
        if (updated) {
          applyPresetToForm(updated);
        }
      }
    } catch (err) {
      setError(
        err?.response?.data?.error || 'Failed to save preset. Ensure the name is unique and values are valid.'
      );
    } finally {
      setSaving(false);
      setSavingAsNew(false);
    }
  };

  if (!form) {
    return (
      <Box sx={{ py: 6, textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading QCTools catalog…
      </Box>
    );
  }

  return (
    <Stack spacing={4}>
      <Stack direction="row" alignItems="center" spacing={2}>
        <AutoAwesomeIcon sx={{ color: 'var(--accent-blue-strong)' }} />
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 600, color: 'var(--text-primary)' }}>
            Preset Orchestrator
          </Typography>
          <Typography variant="body2" sx={{ color: 'var(--text-muted)' }}>
            Pair QCTools filters with FFmpeg detectors and share reusable templates.
          </Typography>
        </Box>
      </Stack>

      <FormControl fullWidth variant="outlined">
        <InputLabel id="preset-picker-label">Load Preset</InputLabel>
        <Select
          labelId="preset-picker-label"
          value={selectedPresetId}
          label="Load Preset"
          onChange={handlePresetDropdownChange}
          sx={{ borderRadius: '14px', background: 'var(--card-bg-secondary)' }}
        >
          <MenuItem value={PRESET_NEW}>+ Create New Preset</MenuItem>
          {presets.map((preset) => (
            <MenuItem key={preset.id} value={String(preset.id)}>
              {preset.name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {error && (
        <Box
          sx={{
            borderRadius: '14px',
            padding: 2,
            background: 'rgba(248,113,113,0.12)',
            border: '1px solid rgba(248,113,113,0.35)',
            color: '#dc2626',
          }}
        >
          {error}
        </Box>
      )}

      <Grid container spacing={4}>
        <Grid item xs={12} md={5}>
          <Box
            sx={{
              borderRadius: '18px',
              background: 'var(--card-bg)',
              border: '1px solid var(--border-default)',
              p: 3,
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
            }}
          >
            <Stack spacing={1.5}>
              <TextField
                label="Preset Name"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                fullWidth
                required
                variant="outlined"
                InputProps={{ sx: { borderRadius: '14px', color: 'var(--text-primary)' } }}
              />
          <Typography variant="caption" sx={{ color: 'var(--text-subtle)' }}>
            Select an existing preset to review enabled tests or craft a new configuration below.
          </Typography>
        </Stack>

        <Stack direction="row" spacing={1.5} alignItems="center">
          <Switch
            checked={Boolean(form.is_default)}
            onChange={(event) => setForm((prev) => ({ ...prev, is_default: event.target.checked }))}
            size="small"
          />
          <Stack>
            <Typography variant="body2" sx={{ color: 'var(--text-primary)', fontWeight: 500, fontSize: '0.85rem' }}>
              Mark as default preset
            </Typography>
            <Typography variant="caption" sx={{ color: 'var(--text-muted)' }}>
              New uploads fall back to this preset when none is selected.
            </Typography>
          </Stack>
        </Stack>

        <Stack spacing={1}>
          <Typography variant="caption" sx={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.12 }}>
            Video Tracks
          </Typography>
              <ToggleButtonGroup
                value={form.video_tracks}
                exclusive
                onChange={handleTracksChange('video')}
                size="small"
                color="primary"
              >
                <ToggleButton value="first">First</ToggleButton>
                <ToggleButton value="all">All</ToggleButton>
              </ToggleButtonGroup>
            </Stack>

            <Stack spacing={1}>
              <Typography variant="caption" sx={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.12 }}>
                Audio Tracks
              </Typography>
              <ToggleButtonGroup
                value={form.audio_tracks}
                exclusive
                onChange={handleTracksChange('audio')}
                size="small"
                color="primary"
              >
                <ToggleButton value="first">First</ToggleButton>
                <ToggleButton value="all">All</ToggleButton>
              </ToggleButtonGroup>
            </Stack>

            <Divider sx={{ borderColor: 'var(--border-default)' }} />

            <Stack direction="row" spacing={2}>
              <Button
                variant="contained"
                disabled={!hasChanges || saving}
                onClick={() => handleSave({ saveAsNew: false })}
                startIcon={<SaveIcon />}
                sx={{
                  textTransform: 'none',
                  alignSelf: 'flex-start',
                  px: 3,
                  py: 1.5,
                  fontWeight: 600,
                  borderRadius: '14px',
                  background: hasChanges ? 'linear-gradient(135deg, #8b5cf6, #6366f1)' : 'var(--list-hover)',
                  color: hasChanges ? '#ffffff' : 'var(--text-subtle)',
                }}
              >
                {saving ? 'Saving…' : 'Save Preset'}
              </Button>
              <Button
                variant="outlined"
                disabled={savingAsNew}
                onClick={() => handleSave({ saveAsNew: true })}
                startIcon={<SaveAsIcon />}
                sx={{
                  textTransform: 'none',
                  alignSelf: 'flex-start',
                  px: 3,
                  py: 1.5,
                  fontWeight: 600,
                  borderRadius: '14px',
                  color: 'var(--accent-blue-strong)',
                  borderColor: 'var(--border-strong)',
                  '&:hover': {
                    borderColor: 'var(--border-strong)',
                    background: 'var(--chip-bg)',
                  },
                }}
              >
                {savingAsNew ? 'Saving…' : 'Save As New'}
              </Button>
              <Button
                variant="text"
                onClick={resetForm}
                sx={{
                  textTransform: 'none',
                  alignSelf: 'flex-start',
                  px: 3,
                  py: 1.5,
                  fontWeight: 600,
                  borderRadius: '14px',
                  color: 'var(--text-subtle)',
                }}
              >
                Reset
              </Button>
            </Stack>
          </Box>
        </Grid>

        <Grid item xs={12} md={7}>

          <Stack spacing={3}>
            {hasFfmpegTests && (
              <Stack key="provider-ffmpeg" spacing={2}>
                <Typography
                  variant="subtitle2"
                  sx={{
                    color: 'var(--text-subtle)',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: 0.6,
                  }}
                >
                  FFmpeg Detectors
                </Typography>
                <Stack spacing={3}>
                  {ffmpegTests.map((detector) => {
                    const formDetector = form.ffmpeg.find((d) => d.id === detector.id);
                    if (!formDetector) return null;
                    return (
                      <Box
                        key={detector.id}
                        sx={{
                          borderRadius: '18px',
                          background: 'var(--card-bg-secondary)',
                          border: formDetector.enabled
                            ? '1px solid var(--border-strong)'
                            : '1px solid var(--border-default)',
                          p: 3,
                        }}
                      >
                        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2}>
                          <Box>
                            <Typography variant="h6" sx={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                              {detector.name}
                            </Typography>
                            <Typography variant="body2" sx={{ color: 'var(--text-muted)' }}>
                              {detector.description}
                            </Typography>
                          </Box>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Typography variant="caption" sx={{ color: 'var(--text-muted)', letterSpacing: 0.2 }}>
                              {formDetector.enabled ? 'Enabled' : 'Disabled'}
                            </Typography>
                            <Switch checked={formDetector.enabled} onChange={handleDetectorToggle(detector.id)} />
                          </Stack>
                        </Stack>

                        {formDetector.enabled && (
                          <Box sx={{ mt: 3 }}>
                            <Stack spacing={2}>
                              <FormControlLabel
                                control={
                                  <Switch
                                    checked={formDetector.defaultSeverity === 'critical'}
                                    onChange={handleDetectorSeverityToggle(detector.id)}
                                    size="small"
                                  />
                                }
                                label={`Default severity: ${
                                  formDetector.defaultSeverity === 'critical' ? 'Critical' : 'Non-critical'
                                }`}
                                sx={{
                                  '& .MuiFormControlLabel-label': {
                                    color: 'var(--text-muted)',
                                    fontSize: '0.8rem',
                                    fontWeight: 500,
                                  },
                                }}
                              />
                              <Grid container spacing={2}>
                                {(detector.params || []).map((param) => (
                                  <Grid item xs={12} md={4} key={param.key} className="threshold-field">
                                    <TextField
                                      label={param.label}
                                      type={param.type === 'number' ? 'number' : 'text'}
                                      size="small"
                                      value={formDetector.params[param.key] ?? ''}
                                      onChange={handleDetectorParamChange(detector.id, param.key)}
                                      InputProps={{ sx: { borderRadius: '10px', color: 'var(--text-primary)' } }}
                                      helperText={param.hint}
                                    />
                                  </Grid>
                                ))}
                              </Grid>
                            </Stack>
                          </Box>
                        )}
                      </Box>
                    );
                  })}
                </Stack>
              </Stack>
            )}

            {hasFfmpegTests && hasQctoolsTests && (
              <Divider key="provider-divider" sx={{ borderColor: 'var(--border-default)' }} />
            )}

            {hasQctoolsTests && (
              <Stack key="provider-qctools" spacing={2}>
                <Typography
                  variant="subtitle2"
                  sx={{
                    color: 'var(--text-subtle)',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: 0.6,
                  }}
                >
                  QCTools Metrics
                </Typography>
                <Stack spacing={3}>
                  {qctoolsTests.map((test) => {
                    const formFilter = form.filters.find((f) => f.id === test.id);
                    if (!formFilter) return null;
                    return (
                      <Box
                        key={test.id}
                        sx={{
                          borderRadius: '18px',
                          background: 'var(--card-bg-secondary)',
                          border: formFilter.enabled
                            ? '1px solid var(--border-strong)'
                            : '1px solid var(--border-default)',
                          p: 3,
                          transition: 'border-color 0.2s ease',
                        }}
                      >
                        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2}>
                          <Box>
                            <Typography variant="h6" sx={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                              {test.name}
                            </Typography>
                            <Typography variant="body2" sx={{ color: 'var(--text-muted)' }}>
                              {test.description}
                            </Typography>
                          </Box>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Typography variant="caption" sx={{ color: 'var(--text-muted)', letterSpacing: 0.2 }}>
                              {formFilter.enabled ? 'Enabled' : 'Disabled'}
                            </Typography>
                            <Switch checked={formFilter.enabled} onChange={handleToggle(test.id)} />
                          </Stack>
                        </Stack>

                        {formFilter.enabled && (
                          <Box sx={{ mt: 3 }}>
                            <Grid container spacing={2}>
                              {(test.metrics || []).map((metric) => {
                                const metricConfig =
                                  formFilter.metrics[metric.key] || {
                                    nonCritical: { min: '', max: '' },
                                    critical: { min: '', max: '' },
                                    defaultSeverity: 'non_critical',
                                  };
                                const nonCriticalValues = metricConfig.nonCritical || { min: '', max: '' };
                                const criticalValues = metricConfig.critical || { min: '', max: '' };
                                const defaultSeverity = metricConfig.defaultSeverity || 'non_critical';

                                return (
                                  <Grid item xs={12} key={metric.key} className="threshold-field">
                                    <Stack
                                      spacing={2}
                                      sx={{
                                        borderRadius: '14px',
                                        background: 'var(--card-bg-secondary)',
                                        border: '1px solid var(--border-default)',
                                        p: 2.5,
                                      }}
                                    >
                                      <Stack spacing={0.5}>
                                        <Typography sx={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                          {metric.label}
                                        </Typography>
                                        <Typography variant="caption" sx={{ color: 'var(--text-subtle)' }}>
                                          Key: {metric.key}
                                        </Typography>
                                        {metric.hint && (
                                          <Typography variant="caption" sx={{ color: 'var(--text-subtle)' }}>
                                            {metric.hint}
                                          </Typography>
                                        )}
                                      </Stack>

                                      <FormControlLabel
                                        control={
                                          <Switch
                                            checked={defaultSeverity === 'critical'}
                                            onChange={handleDefaultSeverityToggle(test.id, metric.key)}
                                            size="small"
                                          />
                                        }
                                        label={`Default severity: ${
                                          defaultSeverity === 'critical' ? 'Critical' : 'Non-critical'
                                        }`}
                                        sx={{
                                          '& .MuiFormControlLabel-label': {
                                            color: 'var(--text-muted)',
                                            fontSize: '0.8rem',
                                            fontWeight: 500,
                                          },
                                        }}
                                      />

                                      <Grid container spacing={2}>
                                        <Grid item xs={12} md={6}>
                                          <Stack spacing={1}>
                                            <Typography
                                              variant="subtitle2"
                                              sx={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.85rem' }}
                                            >
                                              Non-critical threshold
                                            </Typography>
                                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                                              <TextField
                                                label="Min"
                                                variant="outlined"
                                                size="small"
                                                type="number"
                                                value={nonCriticalValues.min}
                                                onChange={handleSeverityThresholdChange(test.id, metric.key, 'nonCritical', 'min')}
                                                InputProps={{ sx: { borderRadius: '10px', color: 'var(--text-primary)' } }}
                                                placeholder={
                                                  metric.default && metric.default.min !== undefined
                                                    ? String(metric.default.min)
                                                    : ''
                                                }
                                              />
                                              <TextField
                                                label="Max"
                                                variant="outlined"
                                                size="small"
                                                type="number"
                                                value={nonCriticalValues.max}
                                                onChange={handleSeverityThresholdChange(test.id, metric.key, 'nonCritical', 'max')}
                                                InputProps={{ sx: { borderRadius: '10px', color: 'var(--text-primary)' } }}
                                                placeholder={
                                                  metric.default && metric.default.max !== undefined
                                                    ? String(metric.default.max)
                                                    : ''
                                                }
                                              />
                                            </Stack>
                                            <Typography variant="caption" sx={{ color: 'var(--text-subtle)' }}>
                                              Events breaching these bounds are reported as non-critical findings.
                                            </Typography>
                                          </Stack>
                                        </Grid>
                                        <Grid item xs={12} md={6}>
                                          <Stack spacing={1}>
                                            <Typography
                                              variant="subtitle2"
                                              sx={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.85rem' }}
                                            >
                                              Critical threshold
                                            </Typography>
                                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                                              <TextField
                                                label="Min"
                                                variant="outlined"
                                                size="small"
                                                type="number"
                                                value={criticalValues.min}
                                                onChange={handleSeverityThresholdChange(test.id, metric.key, 'critical', 'min')}
                                                InputProps={{ sx: { borderRadius: '10px', color: 'var(--text-primary)' } }}
                                                placeholder=""
                                              />
                                              <TextField
                                                label="Max"
                                                variant="outlined"
                                                size="small"
                                                type="number"
                                                value={criticalValues.max}
                                                onChange={handleSeverityThresholdChange(test.id, metric.key, 'critical', 'max')}
                                                InputProps={{ sx: { borderRadius: '10px', color: 'var(--text-primary)' } }}
                                                placeholder=""
                                              />
                                            </Stack>
                                            <Typography variant="caption" sx={{ color: 'var(--text-subtle)' }}>
                                              Leave blank to rely on non-critical bounds; supply stricter limits to escalate to critical.
                                            </Typography>
                                          </Stack>
                                        </Grid>
                                      </Grid>
                                    </Stack>
                                  </Grid>
                                );
                              })}
                            </Grid>
                          </Box>
                        )}
                      </Box>
                    );
                  })}
                </Stack>
              </Stack>
            )}
          </Stack>
        </Grid>
      </Grid>

      <Divider sx={{ borderColor: 'var(--border-default)' }} />

      <Box
        sx={{
          borderRadius: '18px',
          background: 'var(--card-bg-secondary)',
          border: '1px solid var(--border-default)',
          p: 3,
        }}
      >
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, color: 'var(--text-primary)' }}>
            Existing Presets
          </Typography>
          <Chip label={`${presets.length} total`} size="small" sx={{ background: 'var(--chip-bg)', color: 'var(--chip-text)' }} />
        </Stack>
        <List className="preset-list">
          {presets.length > 0 ? (
            presets.map((preset) => {
              const qcEnabled = (preset.parameters?.filters || []).filter((f) => f.enabled).length;
              const ffmpegEnabled = (preset.parameters?.ffmpeg || []).filter((detector) => detector.enabled).length;
              const enabledCount = qcEnabled + ffmpegEnabled;
              const isSelected = String(preset.id) === String(selectedPresetId);
              return (
                <ListItem disablePadding key={preset.id}>
                  <ListItemButton
                    selected={isSelected}
                    onClick={() => applyPresetToForm(preset)}
                    sx={{
                      borderRadius: '12px',
                      mb: 1,
                      backgroundColor: isSelected ? 'var(--list-selected)' : 'transparent',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <ListItemIcon>
                      <LayersIcon sx={{ color: isSelected ? 'var(--accent-blue-strong)' : 'var(--text-subtle)' }} />
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography sx={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            {preset.name}
                          </Typography>
                          {preset.is_default && (
                            <Chip
                              size="small"
                              label="Default"
                              sx={{
                                background: 'rgba(59,130,246,0.15)',
                                color: 'var(--accent-blue-strong)',
                                fontWeight: 500,
                                height: 22,
                              }}
                            />
                          )}
                        </Stack>
                      }
                      secondary={`${enabledCount} tests enabled`}
                      secondaryTypographyProps={{ sx: { color: 'var(--text-muted)' } }}
                    />
                    <Tooltip title="Duplicate preset">
                      <IconButton
                        size="small"
                        onClick={(event) => {
                          event.stopPropagation();
                          applyPresetToForm(preset);
                          setForm((prev) => ({ ...prev, name: `${preset.name} Copy` }));
                          setSelectedPresetId(PRESET_NEW);
                        }}
                        sx={{ color: 'var(--text-subtle)' }}
                      >
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete preset (not yet implemented)">
                      <span>
                        <IconButton size="small" sx={{ color: '#f87171', ml: 1 }} disabled>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </ListItemButton>
                </ListItem>
              );
            })
          ) : (
            <Typography sx={{ color: 'var(--text-muted)' }}>
              No presets created yet.
            </Typography>
          )}
        </List>
      </Box>
    </Stack>
  );
};

export default PresetManager;
