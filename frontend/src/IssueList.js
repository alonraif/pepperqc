import React from 'react';
import { Box, Chip, Stack, Typography } from '@mui/material';
import MovieFilterIcon from '@mui/icons-material/MovieFilter';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import AcUnitIcon from '@mui/icons-material/AcUnit';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';

const iconMap = {
  black: <VisibilityOffIcon fontSize="small" />,
  mute: <MusicNoteIcon fontSize="small" />,
  freeze: <AcUnitIcon fontSize="small" />,
  graphic: <MovieFilterIcon fontSize="small" />,
  signalstats: <VisibilityOffIcon fontSize="small" />,
  blockdetect: <MovieFilterIcon fontSize="small" />,
  blurdetect: <AcUnitIcon fontSize="small" />,
  astats: <MusicNoteIcon fontSize="small" />,
  ebur128: <MusicNoteIcon fontSize="small" />,
};

const severityTokens = {
  critical: { label: 'CRITICAL', chipColor: '#b91c1c', chipBg: 'rgba(239,68,68,0.16)' },
  non_critical: { label: 'NON-CRITICAL', chipColor: '#b45309', chipBg: 'rgba(245,158,11,0.18)' },
  informational: { label: 'INFO', chipColor: '#0369a1', chipBg: 'rgba(59,130,246,0.18)' },
};

const formatTime = (timeInSeconds) => {
  if (timeInSeconds === undefined || timeInSeconds === null) {
    return '—';
  }
  const minutes = Math.floor(timeInSeconds / 60);
  const seconds = Math.floor(timeInSeconds % 60).toString().padStart(2, '0');
  const ms = Math.floor((timeInSeconds % 1) * 1000).toString().padStart(3, '0');
  return `${minutes}:${seconds}.${ms}`;
};

const humanize = (value) => (typeof value === 'string' ? value.split('_').join(' ') : value);

const describeBounds = (bounds) => {
  if (!bounds || typeof bounds !== 'object') return '—';
  const parts = [];
  if (bounds.min !== undefined && bounds.min !== null) parts.push(`≥ ${bounds.min}`);
  if (bounds.max !== undefined && bounds.max !== null) parts.push(`≤ ${bounds.max}`);
  return parts.length ? parts.join(' and ') : '—';
};

const formatDetailValue = (value) => {
  if (value === undefined || value === null || value === '') return null;
  if (Array.isArray(value)) {
    const entries = value
      .map((item) => (typeof item === 'object' ? formatDetailValue(item) : String(item)))
      .filter(Boolean);
    return entries.length ? entries.join(', ') : null;
  }
  if (typeof value === 'object') {
    if ('min' in value || 'max' in value) return describeBounds(value);
    const entries = Object.entries(value)
      .map(([key, item]) => {
        const formatted = formatDetailValue(item);
        return formatted ? `${humanize(key)}: ${formatted}` : null;
      })
      .filter(Boolean);
    return entries.length ? entries.join(' • ') : null;
  }
  return String(value);
};

const buildRows = (issue) => {
  const rows = [];
  const addRow = (label, value) => {
    const formatted = formatDetailValue(value);
    if (formatted) rows.push({ label, value: formatted });
  };

  addRow('Start', formatTime(issue.start_time));
  addRow('End', formatTime(issue.end_time));
  addRow('Duration', issue.duration !== undefined ? `${issue.duration.toFixed(3)} s` : null);
  addRow('Source', issue.source || issue.filter || '—');
  addRow('Metric', issue.metric_key);
  addRow('Event ID', issue.id);

  const detailsObject =
    issue.details && typeof issue.details === 'object' && !Array.isArray(issue.details)
      ? issue.details
      : null;

  if (detailsObject) {
    const { peak, condition, severity_rule, severity_bounds, ...rest } = detailsObject;
    addRow('Peak', peak);
    addRow('Condition', condition);

    if (severity_rule && typeof severity_rule === 'object') {
      if (severity_rule.type === 'above_max') {
        addRow('Severity Rule', `Escalates when value exceeds ${severity_rule.boundary}`);
      } else if (severity_rule.type === 'below_min') {
        addRow('Severity Rule', `Escalates when value drops below ${severity_rule.boundary}`);
      } else {
        addRow('Severity Rule', JSON.stringify(severity_rule));
      }
    }

    if (severity_bounds && typeof severity_bounds === 'object') {
      Object.entries(severity_bounds).forEach(([key, value]) => {
        addRow(`${humanize(key)} bounds`, describeBounds(value));
      });
    }

    Object.entries(rest).forEach(([key, value]) => {
      const formatted = formatDetailValue(value);
      if (formatted) {
        addRow(humanize(key), formatted);
      }
    });
  }

  if (typeof issue.details === 'string') {
    addRow('Detail', issue.details);
  }

  if (!rows.length) {
    addRow('Notes', 'No additional metadata');
  }

  return rows;
};

const IssueList = ({ issues, onIssueClick }) => {
  if (!issues || issues.length === 0) {
    return (
      <Stack
        className="issue-list-empty"
        sx={{ flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center' }}
      >
        <Typography variant="body2" sx={{ color: 'var(--text-muted)' }}>
          No anomalies detected across signal probes.
        </Typography>
      </Stack>
    );
  }

  const entriesClass = `issue-list-body${issues.length === 1 ? ' single' : ''}`;

  return (
    <Stack spacing={1.5} className={entriesClass} sx={{ flex: 1, minHeight: 0 }}>
      {issues.map((issue, index) => {
          const severityKey = String(issue.severity || 'non_critical').toLowerCase();
          const normalizedSeverity = severityTokens[severityKey]
            ? severityKey
            : severityKey === 'info'
            ? 'informational'
            : 'non_critical';
          const severityTheme = severityTokens[normalizedSeverity];

          const typeLabel = humanize(
            issue.filter || (typeof issue.event === 'string' ? issue.event.split('_')[0] : 'Issue')
          );
          const eventLabel = humanize(issue.event || issue.filter || 'Issue');
          const rows = buildRows(issue);
          const icon = iconMap[typeLabel?.toLowerCase()] || <MovieFilterIcon fontSize="small" />;

          const handleClick = () => {
            if (issue.start_time !== undefined && onIssueClick) {
              onIssueClick(issue.start_time);
            }
          };

          return (
            <Box
              key={`${issue.filter || issue.event || 'issue'}-${index}`}
              className={`issue-entry severity-${normalizedSeverity}`}
              role={issue.start_time !== undefined ? 'button' : undefined}
              tabIndex={issue.start_time !== undefined ? 0 : undefined}
              onClick={handleClick}
            >
              <Stack direction="row" alignItems="center" justifyContent="space-between" className="issue-entry-header">
                <Stack direction="row" spacing={1.2} alignItems="center" className="issue-entry-info">
                  <Box className="issue-entry-icon" sx={{ color: severityTheme.chipColor }}>
                    {icon}
                  </Box>
                  <Box>
                    <Typography className="issue-entry-title">{eventLabel}</Typography>
                    <Typography className="issue-entry-type">{typeLabel}</Typography>
                  </Box>
                </Stack>
                <Chip
                  size="small"
                  label={severityTheme.label}
                  className="issue-entry-chip"
                  sx={{ backgroundColor: severityTheme.chipBg, color: severityTheme.chipColor }}
                />
              </Stack>

              <table className="issue-table">
                <tbody>
                  {rows.map(({ label, value }) => (
                    <tr key={`${label}-${value}`}>
                      <td>{label}</td>
                      <td>{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Box>
          );
      })}
    </Stack>
  );
};

export default IssueList;
