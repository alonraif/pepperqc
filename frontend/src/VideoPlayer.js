import React, { useEffect, useRef } from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';

const issueColorMap = {
  black: '#2c3e50',
  mute: '#f39c12',
  freeze: '#3498db',
  informational: '#0ea5e9',
  critical: '#ef4444',
  default: '#f97316',
};

const parseTimestamp = (input) => {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number' && Number.isFinite(input)) return input;
  if (typeof input !== 'string') return null;

  const segments = input.trim().split(':');
  if (!segments.length) return null;

  let seconds = parseFloat(segments.pop());
  if (!Number.isFinite(seconds)) return null;

  let multiplier = 60;
  while (segments.length) {
    const value = parseInt(segments.pop(), 10);
    if (!Number.isFinite(value)) return null;
    seconds += value * multiplier;
    multiplier *= 60;
  }
  return seconds;
};

const VideoPlayer = ({ videoUrl, issues = [], width, height, seekTime, onMarkerClick }) => {
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const markersContainerRef = useRef(null);

  useEffect(() => {
    if (playerRef.current) {
      return;
    }

    const videoElement = videoRef.current;
    if (!videoElement) {
      return;
    }

    const player = (playerRef.current = videojs(videoElement, {
      controls: true,
      autoplay: false,
      preload: 'auto',
      fluid: true,
      aspectRatio: `${width}:${height}`,
    }));

    const progressEl = player?.controlBar?.progressControl?.seekBar?.el();
    if (progressEl) {
      const container = document.createElement('div');
      container.className = 'vjs-custom-markers';
      progressEl.appendChild(container);
      markersContainerRef.current = container;
    }
  }, [width, height]);

  useEffect(() => {
    const player = playerRef.current;
    const container = markersContainerRef.current;
    if (!player || !container) {
      return;
    }

    container.innerHTML = '';

    const duration = player.duration();
    if (!Number.isFinite(duration) || duration <= 0) {
      return;
    }

    issues.forEach((issue) => {
      const parsedTime = parseTimestamp(issue.start_time);
      if (!Number.isFinite(parsedTime)) {
        return;
      }

      const percent = Math.min(Math.max((parsedTime / duration) * 100, 0), 100);
      const issueType = typeof issue.event === 'string' ? issue.event.split('_')[0] : 'default';
      const marker = document.createElement('div');
      marker.className = 'vjs-custom-marker';
      marker.style.left = `${percent}%`;
      marker.style.backgroundColor = issueColorMap[issueType] || issueColorMap.default;
      marker.title = typeof issue.event === 'string' ? issue.event.replace(/_/g, ' ') : 'Issue';
      marker.addEventListener('click', (event) => {
        event.stopPropagation();
        player.currentTime(parsedTime);
        player.play();
        if (onMarkerClick) {
          onMarkerClick(parsedTime);
        }
      });
      container.appendChild(marker);
    });
  }, [issues, onMarkerClick]);

  useEffect(() => {
    const player = playerRef.current;
    if (player && seekTime !== null && seekTime !== undefined) {
      const parsedTime = parseTimestamp(seekTime);
      if (Number.isFinite(parsedTime)) {
        player.currentTime(parsedTime);
        player.play();
      }
    }
  }, [seekTime]);

  useEffect(() => {
    const player = playerRef.current;
    return () => {
      if (player && !player.isDisposed()) {
        const container = markersContainerRef.current;
        if (container?.parentNode) {
          container.parentNode.removeChild(container);
        }
        player.dispose();
        playerRef.current = null;
      }
    };
  }, []);

  return (
    <div data-vjs-player>
      <video ref={videoRef} className="video-js vjs-big-play-centered" src={videoUrl} />
    </div>
  );
};

export default VideoPlayer;
