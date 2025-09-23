import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';

// Import all MUI components for a professional loading state and layout
import {
  Box,
  Breadcrumbs,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Stack,
  Typography,
} from '@mui/material';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/WarningAmber';
import PendingIcon from '@mui/icons-material/Timelapse';
import DownloadIcon from '@mui/icons-material/Download';

import VideoPlayer from './VideoPlayer';
import IssueList from './IssueList';
import FileInfoReport from './FileInfoReport';
import apiClient, { buildApiUrl } from './apiClient';

const getVideoDimensions = (result) => {
  if (result?.file_info?.streams) {
    const videoStream = result.file_info.streams.find(s => s.codec_type === 'video');
    if (videoStream) {
      return { width: videoStream.width, height: videoStream.height };
    }
  }
  return { width: 1920, height: 1080 };
};

const formatValue = (value, digits = 2) => {
  if (value === null || value === undefined) return '—';
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return '—';
  return numeric.toFixed(digits);
};

const formatBounds = (bounds) => {
  if (!bounds || typeof bounds !== 'object') return 'not set';
  const parts = [];
  if (bounds.min !== undefined && bounds.min !== null) parts.push(`>= ${bounds.min}`);
  if (bounds.max !== undefined && bounds.max !== null) parts.push(`<= ${bounds.max}`);
  return parts.length ? parts.join(' ∧ ') : 'not set';
};

const normalizeSeverityKey = (value) => {
  const fallback = 'non_critical';
  if (value === undefined || value === null) return fallback;
  const normalized = String(value).toLowerCase().replace(/[-\s]+/g, '_');
  if (normalized === 'high') return 'critical';
  if (normalized === 'info') return 'informational';
  if (normalized === 'noncritical') return 'non_critical';
  return normalized || fallback;
};

const computeSeverityCountsFromIssues = (issues) => {
  const counts = { critical: 0, non_critical: 0, informational: 0 };
  if (!Array.isArray(issues)) return counts;
  issues.forEach((issue) => {
    const key = normalizeSeverityKey(issue?.severity);
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
};

const mergeSeverityCounts = (...sources) => {
  const merged = { critical: 0, non_critical: 0, informational: 0 };
  sources.forEach((source) => {
    if (!source || typeof source !== 'object') return;
    Object.entries(source).forEach(([rawKey, rawValue]) => {
      if (typeof rawValue !== 'number' || Number.isNaN(rawValue)) return;
      const key = normalizeSeverityKey(rawKey);
      merged[key] = Math.max(rawValue, merged[key] || 0);
    });
  });
  return merged;
};

const ReviewPage = () => {
  const { jobId } = useParams();
  const [jobDetails, setJobDetails] = useState(null);
  const [error, setError] = useState('');
  const [seekTime, setSeekTime] = useState(null);
  const mainRef = useRef(null);
  const issuesCardRef = useRef(null);

  useEffect(() => {
    const fetchJobDetails = async () => {
      try {
        const response = await apiClient.get(`/api/jobs/${jobId}`);
        setJobDetails(response.data);
        if (['QUEUED', 'PROCESSING'].includes(response.data.status)) {
          setTimeout(fetchJobDetails, 3000);
        }
      } catch (err) {
        setError('Could not fetch job details. It may have been deleted or an error occurred.');
      }
    };
    fetchJobDetails();
  }, [jobId]);

  const handleIssueClick = (time) => {
    setSeekTime(time);
    setTimeout(() => setSeekTime(null), 10);
  };

  useEffect(() => {
    if (!jobDetails || !mainRef.current || !issuesCardRef.current) return;

    const result = jobDetails.result || {};
    const { width, height } = getVideoDimensions(result);
    const verticalLayout = height > width;

    const applyHeight = () => {
      if (verticalLayout) {
        issuesCardRef.current.style.height = 'auto';
        return;
      }
      const measured = mainRef.current?.offsetHeight || 0;
      if (measured > 0) {
        issuesCardRef.current.style.height = `${measured}px`;
      }
    };

    applyHeight();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(applyHeight);
      observer.observe(mainRef.current);
      return () => observer.disconnect();
    }

    const handleResize = () => applyHeight();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [jobDetails]);

  // --- THE FIX: A professional loading and error state ---
  if (error) {
    return (
      <Box sx={{ textAlign: 'center', mt: 4 }}>
        <Typography variant="h6" color="error">{error}</Typography>
        <Button component={Link} to="/" variant="contained" sx={{ mt: 2 }}>
          Back to Dashboard
        </Button>
      </Box>
    );
  }

  if (!jobDetails) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <CircularProgress />
        <Typography sx={{ ml: 2 }}>Loading Job Details...</Typography>
      </Box>
    );
  }

  const analysisResult = jobDetails.result || {};
  const { width, height } = getVideoDimensions(analysisResult);
  const isVertical = height > width;
  const videoUrl = buildApiUrl(`/api/videos/${jobDetails.id}`);
  const qctoolsReport = analysisResult.qctools_report;
  const metricSummaries = analysisResult.filters || [];
  const statistics = analysisResult.statistics || {};
  const issues = Array.isArray(analysisResult.issues) ? analysisResult.issues : [];
  const canDownloadReport = ['SUCCESS', 'FAILURE'].includes(jobDetails.status);
  const reportUrl = buildApiUrl(`/api/jobs/${jobDetails.id}/report`);
  const severitySummary = analysisResult.severity_summary || {};
  const severityCounts = mergeSeverityCounts(
    severitySummary.counts,
    jobDetails.severity_counts,
    {
      critical: jobDetails.critical_issues,
      non_critical: jobDetails.non_critical_issues,
      informational: jobDetails.informational_issues,
    },
    computeSeverityCountsFromIssues(issues)
  );
  const criticalCount = severityCounts.critical || 0;
  const nonCriticalCount = severityCounts.non_critical || 0;
  const severity =
    jobDetails.status === 'SUCCESS'
      ? jobDetails.severity || severitySummary.overall || (jobDetails.has_issues ? 'non_critical' : 'clear')
      : null;

  const successToneMap = {
    clear: { label: 'QC clear', icon: <CheckCircleIcon fontSize="small" />, color: 'success' },
    non_critical: {
      label: 'QC complete — non-critical findings',
      icon: <WarningIcon fontSize="small" />,
      color: 'warning',
    },
    critical: {
      label: 'QC complete — critical findings',
      icon: <WarningIcon fontSize="small" />,
      color: 'error',
    },
  };

  const baseStatusTone = {
    FAILURE: { label: 'Failed QC', icon: <WarningIcon fontSize="small" />, color: 'error' },
    PROCESSING: { label: 'Processing', icon: <PendingIcon fontSize="small" />, color: 'warning' },
    QUEUED: { label: 'Queued', icon: <PendingIcon fontSize="small" />, color: 'info' },
  };

  const statusTone =
    jobDetails.status === 'SUCCESS'
      ? successToneMap[severity] || successToneMap.clear
      : baseStatusTone[jobDetails.status] || { label: jobDetails.status, icon: null, color: 'default' };

  const severityMessageMap = {
    clear: '',
    non_critical: 'Non-critical deviations detected — confirm flagged timecodes before delivery.',
    critical: 'Critical thresholds breached — block distribution until remediation.',
  };
  const severityMessage = severity ? severityMessageMap[severity] : '';

  return (
    <Stack spacing={4} className="card">
      <Stack spacing={1.5}>
        <Breadcrumbs separator={<NavigateNextIcon fontSize="small" sx={{ color: 'var(--text-subtle)' }} />}>
          <Button
            component={Link}
            to="/"
            size="small"
            sx={{
              textTransform: 'none',
              color: 'var(--text-muted)',
              px: 0,
              minWidth: 0,
            }}
          >
            Dashboard
          </Button>
          <Typography sx={{ color: 'var(--text-muted)' }}>Review</Typography>
        </Breadcrumbs>

        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={1.5}
          justifyContent="space-between"
          alignItems={{ xs: 'flex-start', md: 'center' }}
        >
          <Typography
            variant="h6"
            sx={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '1.1rem', letterSpacing: 0.2 }}
          >
            {jobDetails.filename}
          </Typography>
          <Button
            variant="outlined"
            size="small"
            startIcon={<DownloadIcon />}
            component="a"
            href={canDownloadReport ? reportUrl : undefined}
            target="_blank"
            rel="noopener"
            download
            disabled={!canDownloadReport}
            sx={{
              textTransform: 'none',
              borderRadius: '999px',
              color: canDownloadReport ? 'var(--accent-blue-strong)' : 'var(--text-subtle)',
              borderColor: canDownloadReport ? 'var(--border-strong)' : 'var(--border-default)',
            }}
          >
            Download Report
          </Button>
        </Stack>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2.5} alignItems={{ xs: 'flex-start', md: 'center' }}>
          <Stack spacing={0.75} alignItems={{ xs: 'flex-start', md: 'flex-start' }}>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1}
              alignItems={{ xs: 'flex-start', sm: 'center' }}
              flexWrap="wrap"
            >
              <Chip
                icon={statusTone.icon}
                label={statusTone.label}
                color={statusTone.color}
                sx={{ textTransform: 'uppercase', letterSpacing: 0.12, fontSize: 11, fontWeight: 600, height: 26 }}
              />
              {jobDetails.status === 'SUCCESS' && (
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  <Chip
                    size="small"
                    label={`Critical ${criticalCount}`}
                    color="error"
                    variant={criticalCount > 0 ? 'filled' : 'outlined'}
                    sx={{ fontWeight: 600, height: 24 }}
                  />
                  <Chip
                    size="small"
                    label={`Non-critical ${nonCriticalCount}`}
                    color="warning"
                    variant={nonCriticalCount > 0 ? 'filled' : 'outlined'}
                    sx={{ fontWeight: 600, height: 24 }}
                  />
                </Stack>
              )}
            </Stack>
            {jobDetails.status === 'SUCCESS' && severityMessage && (
              <Typography
                variant="caption"
                sx={{
                  color:
                    severity === 'critical'
                      ? 'var(--status-critical-text)'
                      : severity === 'non_critical'
                      ? 'var(--status-warning-text)'
                      : 'var(--text-muted)',
                  fontWeight: 500,
                  letterSpacing: 0.2,
                }}
              >
                {severityMessage}
              </Typography>
            )}
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'flex-start', sm: 'center' }}>
            <Typography variant="body2" sx={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Started: {new Date(jobDetails.created_at).toLocaleString()}
            </Typography>
            <Typography variant="body2" sx={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Preset: <strong>{jobDetails.preset_name}</strong>
            </Typography>
          </Stack>
        </Stack>
      </Stack>

      <Divider sx={{ borderColor: 'var(--border-default)' }} />

      {jobDetails.status === 'SUCCESS' && jobDetails.result ? (
        <div className={`results-layout ${isVertical ? 'vertical' : ''}`}>
          <div className="results-main" ref={mainRef}>
            <div className="video-player-section">
              <VideoPlayer
                videoUrl={videoUrl}
                issues={issues}
                width={width}
                height={height}
                seekTime={seekTime}
                onMarkerClick={handleIssueClick}
              />
            </div>
            <Box className="file-intel-section">
              <Typography
                variant="subtitle1"
                sx={{ fontWeight: 600, color: 'var(--text-primary)', mb: 1.5, letterSpacing: 0.25 }}
              >
                File Intelligence
              </Typography>
              <FileInfoReport fileInfo={analysisResult.file_info} qctoolsReport={qctoolsReport} />
            </Box>
            {metricSummaries.length > 0 && (
              <div className="metrics-section">
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                  <Typography
                    variant="subtitle1"
                    sx={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '1rem', letterSpacing: 0.25 }}
                  >
                    QC Metrics
                  </Typography>
                  <Chip
                    label={`${statistics.frames || '—'} frames analysed`}
                    size="small"
                    sx={{ background: 'var(--accent-cyan-bg)', color: 'var(--accent-blue-strong)', fontSize: '0.75rem', height: 26 }}
                  />
                </Stack>
                <div className="metrics-grid">
                  {metricSummaries.map((filter) => (
                    <div className="metric-card" key={filter.id}>
                      <Typography sx={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem', letterSpacing: 0.2 }}>
                        {filter.name}
                      </Typography>
                      <Typography variant="body2" sx={{ color: 'var(--text-muted)' }}>
                        {filter.description}
                      </Typography>
                      <Divider sx={{ my: 1.5, borderColor: 'var(--border-default)' }} />
                      <Stack spacing={1.5}>
                        {filter.metrics.map((metric) => (
                          <Stack key={metric.key} spacing={0.5}>
                            <Typography sx={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                              {metric.label}
                            </Typography>
                            <Stack direction="row" spacing={2} sx={{ color: 'var(--text-muted)' }}>
                              <Typography variant="caption">Min {formatValue(metric.min)}</Typography>
                              <Typography variant="caption">Avg {formatValue(metric.average)}</Typography>
                              <Typography variant="caption">Max {formatValue(metric.max)}</Typography>
                            </Stack>
                            <Stack spacing={0.3}>
                              <Typography
                                variant="caption"
                                sx={{ color: 'var(--text-subtle)', fontFamily: 'IBM Plex Mono, monospace' }}
                              >
                                Detection: {formatBounds(metric.threshold)}
                              </Typography>
                              <Typography
                                variant="caption"
                                sx={{ color: 'var(--status-warning-text)', fontFamily: 'IBM Plex Mono, monospace' }}
                              >
                                Non-critical: {formatBounds(metric.severity?.non_critical)}
                              </Typography>
                              <Typography
                                variant="caption"
                                sx={{ color: 'var(--status-critical-text)', fontFamily: 'IBM Plex Mono, monospace' }}
                              >
                                Critical: {formatBounds(metric.severity?.critical)}
                              </Typography>
                            </Stack>
                          </Stack>
                        ))}
                      </Stack>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="issues-column">
            <div className="issues-card" ref={issuesCardRef}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" className="issues-header">
                <Typography
                  variant="subtitle1"
                  sx={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '1rem', letterSpacing: 0.25 }}
                >
                  Detected Issues
                </Typography>
                <Chip
                  label={`${(analysisResult.issues || []).length} events`}
                  size="small"
                  sx={{ background: 'var(--chip-bg)', color: 'var(--chip-text)', fontSize: '0.75rem', height: 26 }}
                />
              </Stack>
              <Box className="issues-scroll">
                <IssueList issues={issues} onIssueClick={handleIssueClick} />
              </Box>
            </div>
          </div>
        </div>
      ) : jobDetails.status === 'FAILURE' ? (
        <Box sx={{ my: 4, textAlign: 'center' }}>
          <WarningIcon sx={{ fontSize: 46, color: '#f87171', mb: 1 }} />
          <Typography color="error" sx={{ mb: 2 }}>
            Analysis failed.
          </Typography>
          {analysisResult?.error && (
            <Typography sx={{ maxWidth: 480, mx: 'auto', color: 'var(--text-muted)' }}>
              {analysisResult.error}
            </Typography>
          )}
        </Box>
      ) : (
        <Box sx={{ my: 4, textAlign: 'center' }}>
          <CircularProgress sx={{ color: 'var(--accent-blue-strong)' }} />
          <Typography sx={{ mt: 2, color: 'var(--text-muted)' }}>
            Analysis is in progress. The page will auto-refresh.
          </Typography>
        </Box>
      )}
    </Stack>
  );
};

export default ReviewPage;
