import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  FormControl,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import ShieldIcon from '@mui/icons-material/Shield';

import apiClient from './apiClient';

const makeFileKey = (file) => `${file.name}-${file.lastModified}-${file.size}`;

const truncateFileName = (name, maxLength = 48) => {
  if (!name || name.length <= maxLength) {
    return name;
  }
  const extensionIndex = name.lastIndexOf('.');
  const extension = extensionIndex > -1 ? name.slice(extensionIndex) : '';
  const base = extensionIndex > -1 ? name.slice(0, extensionIndex) : name;
  const baseLimit = Math.max(0, maxLength - extension.length - 1);
  if (base.length <= baseLimit || baseLimit <= 0) {
    return `${name.slice(0, maxLength - 1)}…`;
  }
  const front = Math.ceil(baseLimit / 2);
  const back = Math.floor(baseLimit / 2);
  return `${base.slice(0, front)}…${base.slice(base.length - back)}${extension}`;
};

const formatSpeedMbps = (speed) => {
  if (!speed || !Number.isFinite(speed) || speed <= 0) {
    return '';
  }
  if (speed >= 100) {
    return `${speed.toFixed(0)} Mb/s`;
  }
  if (speed >= 10) {
    return `${speed.toFixed(1)} Mb/s`;
  }
  return `${speed.toFixed(2)} Mb/s`;
};

const formatFileSize = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const decimals = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(decimals)} ${units[unitIndex]}`;
};

const nowMs = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

const UploadCard = () => {
  const [files, setFiles] = useState([]);
  const [presets, setPresets] = useState([]);
  const [selectedPreset, setSelectedPreset] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [lastDispatchSummary, setLastDispatchSummary] = useState(null);
  const [uploadStatuses, setUploadStatuses] = useState({});
  const fileInputRef = useRef(null);
  const uploadStartTimesRef = useRef({});

  // Fetch all available presets from the API when the component loads
  useEffect(() => {
    const fetchPresets = async () => {
      try {
        const response = await apiClient.get('/api/presets');
        setPresets(response.data);
        if (response.data.length > 0) {
          const defaultPreset = response.data.find((preset) => preset.is_default);
          const initialPreset = defaultPreset || response.data[0];
          setSelectedPreset(String(initialPreset.id));
        }
      } catch (err) {
        console.error("Failed to fetch presets", err);
        setError("Could not load presets from server.");
      }
    };
    fetchPresets();
  }, []);

  const captureFiles = (fileList) => {
    if (!fileList) return;
    const incoming = Array.from(fileList).filter((file) => file && file.name);
    if (!incoming.length) return;
    setLastDispatchSummary(null);
    setFiles((prev) => {
      const existingKeys = new Set(prev.map((f) => makeFileKey(f)));
      const merged = [...prev];
      incoming.forEach((file) => {
        const key = makeFileKey(file);
        if (!existingKeys.has(key)) {
          merged.push(file);
          existingKeys.add(key);
        }
      });

      setUploadStatuses((prevStatuses) => {
        const nextStatuses = {};
        merged.forEach((file) => {
          const key = makeFileKey(file);
          nextStatuses[key] = prevStatuses[key] || {
            progress: 0,
            speedMbps: 0,
            status: 'pending',
            total: file.size || 0,
          };
        });
        return nextStatuses;
      });

      return merged;
    });
    setError('');
  };

  const handleFileChange = (e) => {
    captureFiles(e.target.files);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    captureFiles(event.dataTransfer.files);
  };

  const handleDragOver = (event) => {
    event.preventDefault();
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!files.length) {
      setError('Please select at least one file.');
      return;
    }
    if (!selectedPreset) {
      setError('Please select a QC preset.');
      return;
    }

    setIsUploading(true);
    setError('');

    const jobIds = [];
    const failures = [];

    for (const file of files) {
      const key = makeFileKey(file);
      const startTime = nowMs();
      uploadStartTimesRef.current[key] = startTime;

      setUploadStatuses((prevStatuses) => {
        const previous = prevStatuses[key] || {};
        return {
          ...prevStatuses,
          [key]: {
            ...previous,
            status: 'uploading',
            progress: previous.progress || 0,
            speedMbps: 0,
            total: previous.total || file.size || 0,
          },
        };
      });

      const formData = new FormData();
      formData.append('file', file);
      formData.append('preset_id', selectedPreset);
      try {
        const response = await apiClient.post('/api/jobs', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (event) => {
            setUploadStatuses((prevStatuses) => {
              const previous = prevStatuses[key] || {};
              const loaded =
                typeof event.loaded === 'number' ? event.loaded : previous.loaded || 0;
              const eventTotal = typeof event.total === 'number' ? event.total : 0;
              const fileSize = typeof file.size === 'number' ? file.size : 0;
              const prevTotal = typeof previous.total === 'number' ? previous.total : 0;
              const total = Math.max(prevTotal, eventTotal, fileSize, loaded);
              const elapsedSeconds = Math.max(
                (nowMs() - (uploadStartTimesRef.current[key] || startTime)) / 1000,
                0.0001,
              );
              const progress =
                total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : previous.progress || 0;
              const speedMbps = (loaded * 8) / (elapsedSeconds * 1_000_000);

              return {
                ...prevStatuses,
                [key]: {
                  ...previous,
                  status: 'uploading',
                  progress,
                  speedMbps,
                  loaded,
                  total,
                },
              };
            });
          },
        });

        const jobId = response?.data?.job_id;
        if (jobId) {
          jobIds.push({ jobId, filename: file.name });
          window.dispatchEvent(new Event('new-upload'));
        }

        setUploadStatuses((prevStatuses) => {
          const previous = prevStatuses[key] || {};
          return {
            ...prevStatuses,
            [key]: {
              ...previous,
              status: 'success',
              progress: 100,
              speedMbps: 0,
            },
          };
        });
      } catch (err) {
        console.error(`Upload failed for ${file.name}`, err);
        failures.push(file.name);
        setUploadStatuses((prevStatuses) => {
          const previous = prevStatuses[key] || {};
          return {
            ...prevStatuses,
            [key]: {
              ...previous,
              status: 'error',
              speedMbps: 0,
            },
          };
        });
      } finally {
        delete uploadStartTimesRef.current[key];
      }
    }

    window.dispatchEvent(new CustomEvent('jobs-dispatched', {
      detail: { jobIds: jobIds.map((j) => j.jobId) },
    }));

    const message = jobIds.length === 0
      ? failures.length > 0
        ? 'No jobs queued — all submissions failed.'
        : 'Queue idle — ready to receive jobs.'
      : `${jobIds.length} job(s) queued`;

    setLastDispatchSummary({ successes: jobIds, failures, message });

    setFiles([]);
    setUploadStatuses({});
    uploadStartTimesRef.current = {};
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    const defaultPreset = presets.find((preset) => preset.is_default);
    if (defaultPreset) {
      setSelectedPreset(String(defaultPreset.id));
    }
    setIsUploading(false);
  };

  return (
    <Box className="card" sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Stack direction="row" alignItems="center" spacing={2}>
        <Box
          sx={{
            width: 42,
            height: 42,
            borderRadius: '14px',
            background: 'var(--accent-blue)',
            display: 'grid',
            placeItems: 'center',
            color: 'var(--accent-blue-strong)',
          }}
        >
          <CloudUploadIcon />
        </Box>
        <Box>
          <Typography
            variant="subtitle1"
            sx={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '1.05rem', letterSpacing: 0.3 }}
          >
            Launch New Analysis
          </Typography>
          <Typography variant="body2" sx={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Drag a mezzanine file or browse your library to begin automated QC.
          </Typography>
        </Box>
      </Stack>

      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        multiple
        onChange={handleFileChange}
      />

      <Box
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={handleBrowseClick}
        sx={{
          borderRadius: '18px',
          border: '1px dashed var(--border-strong)',
          background: 'var(--card-bg-secondary)',
          p: 3,
          textAlign: 'center',
          position: 'relative',
          cursor: 'pointer',
        }}
      >
        <Stack spacing={1.5} alignItems="center">
          <Typography
            variant="subtitle1"
            sx={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.98rem', letterSpacing: 0.2 }}
          >
            {files.length === 0
              ? 'Drop your media here'
              : files.length === 1
              ? truncateFileName(files[0].name, 42)
              : `${files.length} files selected`}
          </Typography>
          <Typography variant="body2" sx={{ color: 'var(--text-muted)', maxWidth: 320, fontSize: '0.82rem' }}>
            {files.length === 0
              ? 'Supported: ProRes, DNx, H.264/5, MXF, MOV, MKV (multi-select enabled)'
              : 'Click to add more files or press backspace to clear.'}
          </Typography>
          <Button
            variant="contained"
            startIcon={<CloudUploadIcon />}
            sx={{
              textTransform: 'none',
              px: 3,
              background: 'linear-gradient(135deg, #6366f1, #38bdf8)',
              borderRadius: '999px',
            }}
            onClick={(event) => {
              event.stopPropagation();
              handleBrowseClick();
            }}
          >
            Browse Library
          </Button>
        </Stack>
      </Box>

      {files.length > 0 && (
        <Stack spacing={1.2}>
          {files.map((file) => {
            const key = makeFileKey(file);
            const status = uploadStatuses[key] || {
              status: 'pending',
              progress: 0,
              speedMbps: 0,
              total: file.size || 0,
            };
            const statusState = status.status || 'pending';
            const progressValue = Number.isFinite(status.progress)
              ? Math.min(100, Math.max(0, status.progress))
              : 0;
            const speedLabel =
              statusState === 'uploading' ? formatSpeedMbps(status.speedMbps) : '';
            const statusLabelMap = {
              pending: 'Queued for upload',
              uploading: `Uploading — ${progressValue}%`,
              success: 'Upload complete',
              error: 'Upload failed',
            };
            const statusLabel = statusLabelMap[statusState] || 'Queued for upload';
            const statusColor =
              statusState === 'error'
                ? 'var(--status-failure-text)'
                : statusState === 'success'
                ? 'var(--accent-blue-strong)'
                : 'var(--text-muted)';
            const sizeLabel = formatFileSize(file.size);
            return (
              <Box
                key={key}
                sx={{
                  borderRadius: '16px',
                  border: '1px solid var(--border-default)',
                  background: 'var(--card-bg-secondary)',
                  p: 2,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1.25,
                }}
              >
                <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
                  <Tooltip title={file.name} placement="top-start">
                    <Typography
                      sx={{
                        color: 'var(--text-primary)',
                        fontWeight: 600,
                        fontSize: '0.9rem',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: '100%',
                      }}
                    >
                      {truncateFileName(file.name, 60)}
                    </Typography>
                  </Tooltip>
                  {sizeLabel && (
                    <Typography variant="caption" sx={{ color: 'var(--text-muted)' }}>
                      {sizeLabel}
                    </Typography>
                  )}
                </Stack>
                <LinearProgress
                  variant="determinate"
                  value={progressValue}
                  sx={{
                    height: 6,
                    borderRadius: 999,
                    backgroundColor: 'var(--accent-cyan-bg)',
                    '& .MuiLinearProgress-bar': {
                      borderRadius: 999,
                      transition: 'transform 0.3s ease',
                      background:
                        statusState === 'error'
                          ? '#f87171'
                          : statusState === 'success'
                          ? 'linear-gradient(90deg, #22c55e, #16a34a)'
                          : 'linear-gradient(90deg, #38bdf8, #6366f1)',
                    },
                  }}
                />
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Typography variant="caption" sx={{ color: statusColor, fontWeight: 500 }}>
                    {statusLabel}
                  </Typography>
                  {speedLabel && (
                    <Typography variant="caption" sx={{ color: 'var(--text-muted)' }}>
                      {speedLabel}
                    </Typography>
                  )}
                </Stack>
              </Box>
            );
          })}
        </Stack>
      )}

      <Stack spacing={2}>
        <FormControl fullWidth variant="outlined">
          <InputLabel id="preset-select-label">QC Preset</InputLabel>
          <Select
            labelId="preset-select-label"
            value={selectedPreset}
            label="QC Preset"
            onChange={(e) => setSelectedPreset(e.target.value)}
            disabled={presets.length === 0}
            sx={{ borderRadius: '14px', background: 'var(--card-bg-secondary)' }}
          >
            {presets.length === 0 ? (
              <MenuItem disabled>Loading presets...</MenuItem>
            ) : (
              presets.map((preset) => (
                <MenuItem key={preset.id} value={String(preset.id)}>
                  {preset.name}
                </MenuItem>
              ))
            )}
          </Select>
        </FormControl>

        <Button
          type="button"
          variant="contained"
          disabled={!files.length || !selectedPreset || isUploading}
          onClick={handleSubmit}
          startIcon={isUploading ? <CircularProgress size={18} color="inherit" /> : <ShieldIcon />}
          sx={{
            alignSelf: 'flex-start',
            textTransform: 'none',
            px: 4,
            py: 1.5,
            fontWeight: 600,
            background: 'linear-gradient(135deg, #0ea5e9, #2563eb)',
            borderRadius: '14px',
            boxShadow: '0 10px 35px rgba(37,99,235,0.35)',
            '&:disabled': {
              background: 'var(--list-hover)',
              color: 'var(--text-subtle)',
            },
          }}
        >
          {isUploading
            ? 'Dispatching...'
            : files.length > 1
            ? `Dispatch ${files.length} Jobs`
            : 'Start Analysis'}
        </Button>

        {error && (
          <Typography color="error" sx={{ mt: 1 }}>
            {error}
          </Typography>
        )}

        {lastDispatchSummary && lastDispatchSummary.failures.length > 0 && (
          <Typography variant="body2" sx={{ color: '#f87171', mt: 1 }}>
            Failed: {lastDispatchSummary.failures.join(', ')}
          </Typography>
        )}
      </Stack>
    </Box>
  );
};

export default UploadCard;
