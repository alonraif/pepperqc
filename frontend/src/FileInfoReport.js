import React from 'react';
import { Chip, Stack, Typography } from '@mui/material';
import InsightsIcon from '@mui/icons-material/Insights';

const formatDuration = (seconds) => {
  if (seconds === undefined || seconds === null) return 'N/A';
  const value = Number(seconds);
  if (Number.isNaN(value) || value < 0) return 'N/A';
  return new Date(value * 1000).toISOString().substr(11, 12);
};

const formatSize = (bytes) => {
  if (!bytes) return 'N/A';
  const value = Number(bytes);
  if (Number.isNaN(value)) return 'N/A';
  const mb = value / (1024 * 1024);
  return `${mb.toFixed(2)} MB`;
};

const formatBitrate = (bits) => {
  if (!bits) return 'N/A';
  const value = Number(bits);
  if (Number.isNaN(value)) return 'N/A';
  const mbps = value / 1_000_000;
  return `${mbps.toFixed(2)} Mbps`;
};

const formatFrameRate = (rate) => {
  if (!rate) return 'N/A';
  if (typeof rate === 'number') return `${rate.toFixed(2)} fps`;
  if (!rate.includes('/')) return rate;
  const [num, den] = rate.split('/').map(Number);
  if (!den) return rate;
  return `${(num / den).toFixed(2)} fps`;
};

const MetricRow = ({ label, value }) => (
  <tr>
    <td>{label}</td>
    <td>{value ?? 'N/A'}</td>
  </tr>
);

const FileInfoReport = ({ fileInfo, qctoolsReport }) => {
  if (!fileInfo || !fileInfo.format) {
    return (
      <Typography variant="body2" sx={{ color: 'var(--text-muted)' }}>
        File information is not available.
      </Typography>
    );
  }

  const { format, streams } = fileInfo;
  const videoStream = streams?.find((s) => s.codec_type === 'video') || {};
  const audioStreams = streams?.filter((s) => s.codec_type === 'audio') || [];

  return (
    <div className="file-info-report">
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Chip
          icon={<InsightsIcon fontSize="small" />}
          label="Source Metrics"
          size="small"
          sx={{ background: 'var(--chip-bg)', color: 'var(--chip-text)' }}
        />
        <Typography variant="body2" sx={{ color: 'var(--text-muted)' }}>
          {format.filename?.split('/').pop() || 'Unnamed source'}
        </Typography>
      </Stack>

      <table>
        <tbody>
          <MetricRow label="Format" value={format.format_long_name} />
          <MetricRow label="Duration" value={formatDuration(format.duration)} />
          <MetricRow label="Size" value={formatSize(format.size)} />
          <MetricRow label="Bitrate" value={formatBitrate(format.bit_rate)} />
        </tbody>
      </table>

      <Typography variant="subtitle2" sx={{ mt: 3, mb: 1, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.12 }}>
        Video Stream
      </Typography>
      <table>
        <tbody>
          <MetricRow label="Codec" value={videoStream.codec_long_name} />
          <MetricRow label="Resolution" value={videoStream.width ? `${videoStream.width}×${videoStream.height}` : undefined} />
          <MetricRow label="Aspect" value={videoStream.display_aspect_ratio} />
          <MetricRow label="Frame Rate" value={formatFrameRate(videoStream.r_frame_rate)} />
          <MetricRow label="Pixel Format" value={videoStream.pix_fmt} />
        </tbody>
      </table>

      {audioStreams.map((stream, index) => (
        <React.Fragment key={stream.index ?? index}>
          <Typography variant="subtitle2" sx={{ mt: 3, mb: 1, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.12 }}>
            Audio Stream #{index + 1}
          </Typography>
          <table>
            <tbody>
              <MetricRow label="Codec" value={stream.codec_long_name} />
              <MetricRow label="Sample Rate" value={stream.sample_rate ? `${stream.sample_rate} Hz` : undefined} />
              <MetricRow label="Channels" value={stream.channels ? `${stream.channels} (${stream.channel_layout})` : undefined} />
            </tbody>
          </table>
        </React.Fragment>
      ))}

      {qctoolsReport && Object.keys(qctoolsReport).length > 0 && (
        <React.Fragment>
          <Typography variant="subtitle2" sx={{ mt: 3, mb: 1, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.12 }}>
            QCTools Analysis
          </Typography>
          <table>
            <tbody>
              <MetricRow label="Avg Luma (Y)" value={qctoolsReport.yuv_y_avg} />
              <MetricRow label="Min Luma (Y)" value={qctoolsReport.yuv_y_min} />
              <MetricRow label="Max Luma (Y)" value={qctoolsReport.yuv_y_max} />
              <MetricRow label="Temporal Outliers" value={qctoolsReport.temporal_outliers} />
              <MetricRow label="Audio Peak L" value={qctoolsReport.audio_peak_l ? `${qctoolsReport.audio_peak_l} dB` : undefined} />
              <MetricRow label="Audio Peak R" value={qctoolsReport.audio_peak_r ? `${qctoolsReport.audio_peak_r} dB` : undefined} />
            </tbody>
          </table>
        </React.Fragment>
      )}
    </div>
  );
};

export default FileInfoReport;
