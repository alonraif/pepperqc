import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Grow,
  Grid,
  IconButton,
  LinearProgress,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PendingIcon from '@mui/icons-material/Timelapse';
import WarningIcon from '@mui/icons-material/WarningAmber';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DownloadIcon from '@mui/icons-material/Download';

import apiClient, { buildApiUrl } from './apiClient';

const statusClassMap = {
  SUCCESS: 'status-success',
  FAILURE: 'status-failure',
  PROCESSING: 'status-processing',
  QUEUED: 'status-queued',
};

const statusIcon = {
  SUCCESS: <CheckCircleIcon fontSize="small" sx={{ color: 'currentColor' }} />,
  FAILURE: <WarningIcon fontSize="small" sx={{ color: 'currentColor' }} />,
  PROCESSING: <PendingIcon fontSize="small" sx={{ color: 'currentColor' }} />,
  QUEUED: <CloudUploadIcon fontSize="small" sx={{ color: 'currentColor' }} />,
};

const truncateJobFilename = (name, maxLength = 42) => {
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

const Dashboard = () => {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState({});
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [now, setNow] = useState(() => Date.now());
  const [uploadSummary, setUploadSummary] = useState('Queue idle — ready to receive jobs.');

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const inProgressJobs = useMemo(
    () => jobs.filter((job) => ['PROCESSING', 'QUEUED'].includes(job.status)),
    [jobs]
  );

  const completedJobs = useMemo(
    () => jobs.filter((job) => !['PROCESSING', 'QUEUED'].includes(job.status)),
    [jobs]
  );

  const parseTimestamp = useCallback((value) => {
    if (!value) return NaN;
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string') {
      const normalized = value.endsWith('Z') || value.includes('+') ? value : `${value}Z`;
      const parsed = Date.parse(normalized);
      return Number.isNaN(parsed) ? NaN : parsed;
    }
    return NaN;
  }, []);

  const formatElapsedTime = useCallback(
    (createdAt) => {
      const started = parseTimestamp(createdAt);
      if (!Number.isFinite(started)) return '00:00:00';
      const diffSeconds = Math.max(0, Math.floor((now - started) / 1000));
      const hours = Math.floor(diffSeconds / 3600);
      const minutes = Math.floor((diffSeconds % 3600) / 60);
      const seconds = diffSeconds % 60;
      return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
    },
    [now, parseTimestamp]
  );

  const getProgressValue = useCallback(
    (job) => {
      const reported = Number(job.percent);
      if (!Number.isNaN(reported) && reported >= 0) {
        const bounded = Math.min(100, Math.max(0, reported));
        return job.status === 'QUEUED' && bounded < 5 ? 5 : bounded;
      }

      const createdAt = parseTimestamp(job.created_at);
      if (!Number.isFinite(createdAt)) {
        return job.status === 'QUEUED' ? 5 : 10;
      }

      const elapsedSeconds = Math.max(0, (now - createdAt) / 1000);
      const ramp = Math.min(60, (elapsedSeconds / 240) * 60);
      return job.status === 'QUEUED' ? Math.max(5, ramp) : Math.max(10, ramp);
    },
    [now, parseTimestamp]
  );

  const fetchJobs = useCallback(async () => {
    try {
      const response = await apiClient.get('/api/jobs');
      setJobs(response.data);
      setError('');
    } catch (err) {
      console.error('Failed to fetch jobs', err);
      setError('Failed to load jobs. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 5000);
    const handleNewUpload = () => fetchJobs();
    const handleJobsDispatched = (event) => {
      if (event?.detail?.jobIds?.length) {
        setUploadSummary(`${event.detail.jobIds.length} job(s) queued`);
      }
    };
    window.addEventListener('new-upload', handleNewUpload);
    window.addEventListener('jobs-dispatched', handleJobsDispatched);
    return () => {
      clearInterval(interval);
      window.removeEventListener('new-upload', handleNewUpload);
      window.removeEventListener('jobs-dispatched', handleJobsDispatched);
    };
  }, [fetchJobs]);

  const handleDelete = async (jobId) => {
    try {
      setDeleting((prev) => ({ ...prev, [jobId]: true }));
      await apiClient.delete(`/api/jobs/${jobId}`);
      fetchJobs();
    } catch (err) {
      console.error('Failed to delete job', err);
      setError('Unable to delete the selected job.');
    } finally {
      setDeleting((prev) => ({ ...prev, [jobId]: false }));
    }
  };

  const summary = useMemo(() => {
    const total = jobs.length;
    const resolveSeverity = (job) => {
      if (job.severity) return job.severity;
      const counts = job.severity_counts || {};
      const critical = job.critical_issues ?? counts.critical ?? 0;
      const nonCritical = job.non_critical_issues ?? counts.non_critical ?? 0;
      if (critical > 0) return 'critical';
      if (nonCritical > 0 || job.has_issues) return 'non_critical';
      return 'clear';
    };

    const successClear = jobs.filter((j) => j.status === 'SUCCESS' && resolveSeverity(j) === 'clear').length;
    const successFlagged = jobs.filter((j) => j.status === 'SUCCESS' && resolveSeverity(j) !== 'clear').length;
    const processing = jobs.filter((j) => ['PROCESSING', 'QUEUED'].includes(j.status)).length;
    const failed = jobs.filter((j) => j.status === 'FAILURE').length;
    const latestPreset = jobs[0]?.preset_name || 'Default';

    const throughput = total ? Math.round((successClear / total) * 100) : 0;

    return { total, successClear, successFlagged, processing, failed, throughput, latestPreset };
  }, [jobs]);

  useEffect(() => {
    const inFlight = jobs.filter((job) => ['PROCESSING', 'QUEUED'].includes(job.status)).length;
    if (inFlight > 0) {
      setUploadSummary(`${inFlight} job(s) in flight`);
    } else {
      setUploadSummary('Queue idle — ready to receive jobs.');
    }
  }, [jobs]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 220 }}>
        <CircularProgress size={28} sx={{ color: 'var(--accent-blue-strong)' }} />
        <Typography sx={{ ml: 2, color: 'var(--text-muted)' }}>Calibrating dashboard…</Typography>
      </Box>
    );
  }

  return (
    <Stack spacing={4}>
      <Grid container spacing={3}>
        <Grid item xs={12} md={3}>
          <AnalyticsTile
            title="Total Jobs"
            value={summary.total}
            caption="Tracked in the last window"
            icon={<CloudUploadIcon />}
            gradients={{
              dark: 'linear-gradient(135deg, rgba(59,130,246,0.25), rgba(96,165,250,0.08))',
              light: 'linear-gradient(135deg, rgba(59,130,246,0.18), rgba(59,130,246,0.05))',
            }}
          />
        </Grid>
        <Grid item xs={12} md={3}>
          <AnalyticsTile
            title="QC Clear"
            value={summary.successClear}
            caption={`Flagged • ${summary.successFlagged}`}
            icon={<CheckCircleIcon />}
            gradients={{
              dark: 'linear-gradient(135deg, rgba(34,197,94,0.25), rgba(16,185,129,0.08))',
              light: 'linear-gradient(135deg, rgba(34,197,94,0.2), rgba(134,239,172,0.12))',
            }}
          />
        </Grid>
        <Grid item xs={12} md={3}>
          <AnalyticsTile
            title="In Pipeline"
            value={summary.processing}
            caption="Processing & queued"
            icon={<PendingIcon />}
            gradients={{
              dark: 'linear-gradient(135deg, rgba(249,115,22,0.22), rgba(234,179,8,0.08))',
              light: 'linear-gradient(135deg, rgba(249,115,22,0.18), rgba(251,191,36,0.1))',
            }}
          />
        </Grid>
        <Grid item xs={12} md={3}>
          <AnalyticsTile
            title="Success Rate"
            value={`${summary.throughput}%`}
            caption={`Using preset • ${summary.latestPreset}`}
            icon={<Chip label="Live" color="primary" size="small" />}
            gradients={{
              dark: 'linear-gradient(135deg, rgba(168,85,247,0.24), rgba(14,165,233,0.08))',
              light: 'linear-gradient(135deg, rgba(168,85,247,0.18), rgba(14,165,233,0.12))',
            }}
          />
        </Grid>
      </Grid>

      <Box
        sx={{
          borderRadius: '18px',
          background: 'var(--card-bg-secondary)',
          border: `1px solid ${isDark ? 'rgba(148,163,184,0.18)' : 'rgba(148,163,184,0.28)'}`,
          p: { xs: 2.5, md: 3 },
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.85rem',
          color: 'var(--text-muted)',
        }}
      >
        <Stack spacing={0.3}>
          <Typography sx={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>
            {uploadSummary}
          </Typography>
          <Typography variant="caption" sx={{ color: 'var(--text-muted)' }}>
            Overview refreshes automatically every few seconds.
          </Typography>
        </Stack>
        <Chip
          size="small"
          label="Live"
          sx={{ background: 'rgba(34,197,94,0.18)', color: '#16a34a', fontWeight: 600, height: 22 }}
        />
      </Box>

      {inProgressJobs.length > 0 && (
        <Box
          sx={{
            borderRadius: '18px',
            background: 'var(--card-bg-secondary)',
            border: `1px solid ${isDark ? 'rgba(148,163,184,0.25)' : 'rgba(148,163,184,0.25)'}`,
            p: { xs: 3, md: 4 },
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2.5 }}>
            <Typography
              variant="subtitle1"
              sx={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '1rem', letterSpacing: 0.3 }}
            >
              Jobs in Progress
            </Typography>
            <Chip
              label={`${inProgressJobs.length}`}
              size="small"
              sx={{ background: 'var(--chip-bg)', color: 'var(--chip-text)', fontWeight: 500, fontSize: '0.75rem' }}
            />
          </Stack>
          <Stack spacing={2.5}>
            {inProgressJobs.map((job, index) => {
              const rawProgress = getProgressValue(job);
              const progressValue = job.status === 'QUEUED' ? Math.min(rawProgress, 45) : rawProgress;
              const elapsedLabel = formatElapsedTime(job.created_at);
              const statusDescriptor = job.status === 'PROCESSING' ? 'Processing' : 'Queued';
              const progressLabel = job.status === 'PROCESSING'
                ? `${Math.round(progressValue)}%`
                : 'Awaiting worker';
              const presetLabel = job.preset_name || 'Default';
              const currentTest = job.current_test || (job.status === 'QUEUED' ? 'Waiting in queue' : 'Spinning up');

              return (
                <Grow in key={job.id} timeout={280 + index * 100}>
                  <Box
                    sx={{
                      borderRadius: '16px',
                      background: isDark ? 'rgba(30,64,175,0.28)' : 'rgba(59,130,246,0.12)',
                      border: isDark ? '1px solid rgba(147,197,253,0.3)' : '1px solid rgba(59,130,246,0.28)',
                      p: { xs: 2, md: 2.5 },
                      backdropFilter: 'blur(12px)',
                    }}
                  >
                    <Stack spacing={1.5}>
                      <Stack
                        direction={{ xs: 'column', md: 'row' }}
                        justifyContent="space-between"
                        alignItems={{ xs: 'flex-start', md: 'center' }}
                        spacing={1.5}
                      >
                        <Stack spacing={0.4}>
                          <Tooltip title={job.filename} placement="top-start">
                            <Typography
                              sx={{
                                fontWeight: 600,
                                color: 'var(--text-primary)',
                                fontSize: '0.98rem',
                                letterSpacing: 0.2,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                maxWidth: { xs: '100%', md: 360 },
                              }}
                            >
                              {truncateJobFilename(job.filename, 48)}
                            </Typography>
                          </Tooltip>
                          <Stack direction="row" spacing={1.5} alignItems="center">
                            <Chip
                              size="small"
                              label={statusDescriptor}
                              sx={{
                                background: isDark ? 'rgba(59,130,246,0.2)' : 'rgba(59,130,246,0.18)',
                                color: isDark ? '#bfdbfe' : '#1d4ed8',
                                fontWeight: 500,
                                fontSize: '0.7rem',
                              }}
                            />
                            <Typography
                              variant="caption"
                              sx={{ color: 'var(--text-muted)', letterSpacing: 0.3, fontSize: '0.78rem' }}
                            >
                              Elapsed {elapsedLabel}
                            </Typography>
                          </Stack>
                        </Stack>
                        <Stack spacing={0.5} alignItems={{ xs: 'flex-start', md: 'flex-end' }}>
                          <Typography sx={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            {progressLabel}
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{ color: 'var(--text-muted)', letterSpacing: 0.25, fontSize: '0.72rem' }}
                          >
                            Preset · {presetLabel}
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{ color: 'var(--text-primary)', fontWeight: 500, fontSize: '0.74rem' }}
                          >
                            {currentTest}
                          </Typography>
                        </Stack>
                      </Stack>
                      <LinearProgress
                        variant="determinate"
                        value={progressValue}
                        sx={{
                          height: 6,
                          borderRadius: 999,
                          backgroundColor: isDark ? 'rgba(15,23,42,0.65)' : 'rgba(148,163,184,0.18)',
                          '& .MuiLinearProgress-bar': {
                            borderRadius: 999,
                            transition: 'transform 0.4s ease',
                            background: 'linear-gradient(90deg, #38bdf8, #6366f1)',
                          },
                        }}
                      />
                    </Stack>
                  </Box>
                </Grow>
              );
            })}
          </Stack>
        </Box>
      )}

      <Stack spacing={1.5} direction="row" alignItems="center" justifyContent="space-between">
        <Typography
          variant="subtitle1"
          sx={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '1rem', letterSpacing: 0.3 }}
        >
          Recent Activity
        </Typography>
        <Tooltip title="Refresh" placement="left">
          <IconButton onClick={fetchJobs} size="small" sx={{ color: 'var(--accent-blue-strong)' }}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>

      {error && (
        <Typography color="error" sx={{ mb: 2 }}>
          {error}
        </Typography>
      )}

      {jobs.length === 0 ? (
        <Box sx={{
          borderRadius: '18px',
          background: 'var(--card-bg-secondary)',
          border: `1px dashed ${isDark ? 'rgba(148,163,184,0.3)' : 'rgba(59,130,246,0.3)'}`,
          p: 4,
          textAlign: 'center',
        }}>
          <Typography sx={{ color: 'var(--text-muted)' }}>
            No jobs yet—drop a file to start the first QC pass.
          </Typography>
        </Box>
      ) : completedJobs.length === 0 ? (
        <Box sx={{
          borderRadius: '18px',
          background: 'var(--card-bg-secondary)',
          border: `1px solid ${isDark ? 'rgba(148,163,184,0.18)' : 'rgba(59,130,246,0.18)'}`,
          p: 4,
          textAlign: 'center',
          color: 'var(--text-muted)',
        }}>
          Completed runs will appear here once processing finishes.
        </Box>
      ) : (
        <Stack className="job-list" spacing={1.2} sx={{ width: '100%' }}>
          {completedJobs.map((job) => {
            const status = job.status;
            const isProcessing = status === 'PROCESSING';

            const severityCounts = job.severity_counts || {};
            const criticalCount = job.critical_issues ?? severityCounts.critical ?? 0;
            const derivedNonCritical = job.non_critical_issues ?? severityCounts.non_critical;
            const fallbackNonCritical = job.has_issues ? Number(job.issues_count) - Number(criticalCount || 0) : 0;
            const nonCriticalCount =
              derivedNonCritical !== undefined && derivedNonCritical !== null
                ? derivedNonCritical
                : Math.max(fallbackNonCritical, 0);

            const severityKey =
              status === 'SUCCESS'
                ? job.severity || (criticalCount > 0 ? 'critical' : nonCriticalCount > 0 ? 'non_critical' : 'clear')
                : null;

            const formatCountLabel = (count, singular, plural, fallbackLabel) => {
              if (!count || count < 0) return fallbackLabel;
              return `${count} ${count === 1 ? singular : plural}`;
            };

            const severityDetail = {
              clear: {
                label: 'QC clear',
                className: 'status-success',
                icon: <CheckCircleIcon fontSize="small" sx={{ color: 'currentColor' }} />,
                message: '',
              },
              non_critical: {
                label: formatCountLabel(nonCriticalCount, 'non-critical event', 'non-critical events', 'Non-critical events'),
                className: 'status-warning',
                icon: <WarningIcon fontSize="small" sx={{ color: 'currentColor' }} />,
                message: 'Non-critical anomalies detected — verify affected segments before release.',
              },
              critical: {
                label: formatCountLabel(criticalCount, 'critical issue', 'critical issues', 'Critical issues'),
                className: 'status-critical',
                icon: <WarningIcon fontSize="small" sx={{ color: 'currentColor' }} />,
                message: 'Critical thresholds breached — block distribution until remediation.',
              },
            }[severityKey || 'clear'];

            let statusLabel;
            let chipClassName = statusClassMap[status] || '';
            let chipIcon = statusIcon[status] || null;

            if (isProcessing) {
              statusLabel = `${status} • ${job.percent || 0}%`;
            } else if (status === 'SUCCESS') {
              statusLabel = `Success • ${severityDetail.label}`;
              chipClassName = severityDetail.className;
              chipIcon = severityDetail.icon;
            } else {
              statusLabel = status;
            }

            const createdAtMs = parseTimestamp(job.created_at);
            const createdAtDisplay = Number.isFinite(createdAtMs)
              ? new Date(createdAtMs).toLocaleString(undefined, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                  second: '2-digit',
                })
              : job.created_at;
            const canDownloadReport = !['PROCESSING', 'QUEUED'].includes(status);
            const reportUrl = buildApiUrl(`/api/jobs/${job.id}/report`);
            const advisoryMessage =
              status === 'SUCCESS' && severityKey && severityKey !== 'clear' ? severityDetail.message : null;
            return (
              <Box key={job.id} className="job-card">
                <Stack spacing={0.8} sx={{ width: '100%' }}>
                  <Stack
                    direction={{ xs: 'column', md: 'row' }}
                    spacing={{ xs: 1, md: 2 }}
                    alignItems={{ xs: 'flex-start', md: 'center' }}
                    justifyContent="space-between"
                  >
                    <Stack
                      direction={{ xs: 'column', md: 'row' }}
                      spacing={0.75}
                      alignItems={{ xs: 'flex-start', md: 'center' }}
                      sx={{ flexGrow: 1, minWidth: 0 }}
                    >
                            <Tooltip title={job.filename} placement="top-start">
                              <Box
                                component={Link}
                                to={`/review/${job.id}`}
                                sx={{
                                  textDecoration: 'none',
                                  color: 'var(--text-primary)',
                                  fontWeight: 600,
                                  fontSize: '0.95rem',
                                  letterSpacing: 0.2,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  display: 'inline-block',
                                  maxWidth: { xs: '100%', md: 240, lg: 320 },
                                }}
                              >
                              {truncateJobFilename(job.filename)}
                            </Box>
                          </Tooltip>
                      <Chip
                        icon={chipIcon}
                        label={statusLabel}
                        className={`job-status ${chipClassName}`}
                        sx={{
                          fontWeight: 500,
                          fontSize: 11,
                          px: 1.25,
                          height: 24,
                        }}
                      />
                    </Stack>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Button
                        size="small"
                        variant="text"
                        startIcon={<DownloadIcon fontSize="small" />}
                        component={canDownloadReport ? 'a' : 'button'}
                        href={canDownloadReport ? reportUrl : undefined}
                        target={canDownloadReport ? '_blank' : undefined}
                        rel={canDownloadReport ? 'noopener' : undefined}
                        download={canDownloadReport || undefined}
                        disabled={!canDownloadReport}
                        sx={{
                          textTransform: 'none',
                          color: canDownloadReport ? 'var(--accent-blue-strong)' : 'var(--text-subtle)',
                          fontWeight: 600,
                        }}
                      >
                        Download report
                      </Button>
                      <Tooltip title="Delete job">
                        <span>
                          <IconButton
                            size="small"
                            onClick={() => handleDelete(job.id)}
                            disabled={Boolean(deleting[job.id])}
                            sx={{ color: 'rgba(148,163,184,0.8)' }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Stack>
                  </Stack>
                  <Typography variant="body2" sx={{ color: 'rgba(148,163,184,0.7)', fontSize: '0.78rem' }}>
                    {createdAtDisplay}
                  </Typography>
                  {isProcessing ? (
                    <LinearProgress
                      variant="determinate"
                      value={Number(job.percent) || 0}
                      sx={{
                        mt: 0.5,
                        height: 5,
                        borderRadius: 999,
                        backgroundColor: 'var(--accent-cyan-bg)',
                        '& .MuiLinearProgress-bar': {
                          background: 'linear-gradient(90deg, #38bdf8, #6366f1)',
                        },
                      }}
                    />
                  ) : advisoryMessage ? (
                    <Typography
                      variant="body2"
                      sx={{
                        mt: 0.5,
                        color:
                          severityKey === 'critical'
                            ? 'var(--status-critical-text)'
                            : 'var(--status-warning-text)',
                        fontWeight: 600,
                        letterSpacing: 0.25,
                        textTransform: 'uppercase',
                        fontSize: '0.75rem',
                      }}
                    >
                      {advisoryMessage}
                    </Typography>
                  ) : null}
                </Stack>
              </Box>
            );
          })}
        </Stack>
      )}
    </Stack>
  );
};

const AnalyticsTile = ({ title, value, caption, icon, gradients }) => {
  const theme = useTheme();
  const background = gradients ? gradients[theme.palette.mode] : 'var(--card-bg-secondary)';
  return (
    <Box
      sx={{
        borderRadius: '18px',
        p: 3,
        background,
        border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(148,163,184,0.12)' : 'rgba(148,163,184,0.25)'}`,
        boxShadow: theme.palette.mode === 'dark' ? '0 18px 40px rgba(15, 118, 255, 0.18)' : '0 16px 36px rgba(59,130,246,0.18)',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        color: 'var(--text-primary)',
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
        <Typography sx={{ color: 'var(--text-muted)', letterSpacing: 0.35, fontSize: '0.75rem' }}>
          {title}
        </Typography>
        <Box sx={{ color: theme.palette.mode === 'dark' ? '#ffffff' : theme.palette.primary.dark }}>{icon}</Box>
      </Stack>
      <Typography sx={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '1.65rem', lineHeight: 1.1 }}>
        {value}
      </Typography>
      <Typography variant="caption" sx={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
        {caption}
      </Typography>
    </Box>
  );
};

export default Dashboard;
