import gzip
import json
import math
import os
import subprocess
import xml.etree.ElementTree as ET
from copy import deepcopy
from datetime import datetime
from typing import Any, Dict, List

try:
    from reportlab.lib.pagesizes import letter
    from reportlab.pdfgen import canvas
    from reportlab.lib.utils import ImageReader
    REPORTLAB_AVAILABLE = True
except ImportError:  # pragma: no cover - optional dependency guard
    REPORTLAB_AVAILABLE = False

try:
    import cv2
except ImportError:  # pragma: no cover - optional dependency guard
    cv2 = None

try:
    import pytesseract
except ImportError:  # pragma: no cover - optional dependency guard
    pytesseract = None


# ---------------------------------------------------------------------------
# Command helpers
# ---------------------------------------------------------------------------

def run_command(command):
    """Execute a command and return stdout/stderr text."""
    shell = isinstance(command, str)
    result = subprocess.run(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        shell=shell,
        check=False,
    )
    cmd_display = command if isinstance(command, str) else " ".join(command)
    if result.returncode != 0:
        print(f"Error running command: {cmd_display}\n{result.stderr}")
    return result.stdout, result.stderr


def _coerce_float(value, fallback=None):
    if value is None or value == "":
        return fallback
    try:
        return float(value)
    except (ValueError, TypeError):
        return fallback


# ---------------------------------------------------------------------------
# QCTools metadata
# ---------------------------------------------------------------------------

AVAILABLE_QCTOOLS_TESTS: List[Dict[str, Any]] = [
    {
        "id": "signalstats",
        "name": "Signal Stats",
        "category": "Video",
        "description": "Broadcast compliance statistics. Enables black frame detection and luma excursions.",
        "default_enabled": True,
        "metrics": [
            {
                "key": "lavfi.signalstats.YMIN",
                "label": "Luma Minimum (Y)",
                "unit": "code value",
                "default": {"min": 5.0},
                "hint": "Set the minimum value to ~5 to flag pure black or near-black frames.",
            },
            {
                "key": "lavfi.signalstats.YMAX",
                "label": "Luma Maximum (Y)",
                "unit": "code value",
                "default": {"max": 235.0},
                "hint": "Keep max below 235 to catch illegal super-whites.",
            },
            {
                "key": "lavfi.signalstats.YAVG",
                "label": "Luma Average (Y)",
                "unit": "code value",
                "default": {"min": 16.0, "max": 235.0},
                "hint": "Average luma outside broadcast range can indicate lighting or grading issues.",
            },
        ],
    },
    {
        "id": "entropy",
        "name": "Entropy",
        "category": "Video",
        "description": "Detects low-information frames (slates, color bars, hold frames).",
        "default_enabled": True,
        "metrics": [
            {
                "key": "lavfi.entropy.Y",
                "label": "Entropy (Y)",
                "unit": "bits",
                "default": {"min": 0.20},
                "hint": "Values below ~0.20 highlight static frames, slates, or color bars.",
            },
        ],
    },
    {
        "id": "ssim",
        "name": "SSIM Similarity",
        "category": "Video",
        "description": "Flags high similarity between consecutive frames – useful for freeze detection.",
        "default_enabled": True,
        "metrics": [
            {
                "key": "lavfi.ssim.All",
                "label": "SSIM (All)",
                "unit": "ratio",
                "default": {"max": 0.999},
                "hint": "A max near 1.0 indicates identical frames for extended periods (freeze/long slate).",
            },
            {
                "key": "lavfi.ssim.Y",
                "label": "SSIM (Y)",
                "unit": "ratio",
                "default": {"max": 0.999},
                "hint": "Y-channel SSIM close to 1.0 corroborates freeze detection.",
            },
        ],
    },
    {
        "id": "blockdetect",
        "name": "Blockiness",
        "category": "Video",
        "description": "Highlights macro-block artifacts from encoding or processing defects.",
        "default_enabled": False,
        "metrics": [
            {
                "key": "lavfi.block",
                "label": "Blockiness Score",
                "unit": "score",
                "default": {"max": 0.35},
                "hint": "Lower thresholds catch subtle macro-blocking; raise if you only want severe cases.",
            },
        ],
    },
    {
        "id": "blurdetect",
        "name": "Blur Detection",
        "category": "Video",
        "description": "Detects unexpected loss of focus or soft frames.",
        "default_enabled": False,
        "metrics": [
            {
                "key": "lavfi.blur",
                "label": "Blur Score",
                "unit": "score",
                "default": {"max": 0.30},
                "hint": "Set closer to 0.2 for very sharp content; raise if you get false positives.",
            },
        ],
    },
    {
        "id": "astats",
        "name": "Audio Statistics",
        "category": "Audio",
        "description": "Per-channel level analysis to catch mutes, clipping, or imbalances.",
        "default_enabled": True,
        "metrics": [
            {
                "key": "lavfi.astats.Overall.Peak_level",
                "label": "Peak Level",
                "unit": "dBFS",
                "default": {"max": 0.0},
                "hint": "Peaks above 0 dBFS indicate clipping; tighten the ceiling for more headroom.",
            },
            {
                "key": "lavfi.astats.1.Min_level",
                "label": "Channel 1 Min",
                "unit": "dBFS",
                "default": {"min": -80.0},
                "hint": "Floor near -80 dBFS is typical for silence – adjust for noisier captures.",
            },
            {
                "key": "lavfi.astats.1.Max_level",
                "label": "Channel 1 Max",
                "unit": "dBFS",
                "default": {"max": 0.0},
                "hint": "Limit ensures each channel stays below clipping.",
            },
        ],
    },
    {
        "id": "ebur128",
        "name": "EBU R128 Loudness",
        "category": "Audio",
        "description": "Checks momentary loudness against broadcast specs.",
        "default_enabled": True,
        "metrics": [
            {
                "key": "lavfi.r128.M",
                "label": "Momentary Loudness",
                "unit": "LUFS",
                "default": {"min": -23.0, "max": -5.0},
                "hint": "Keep momentary loudness within typical R128 comfort range (−23 to −5 LUFS).",
            },
        ],
    },
]

FFMPEG_DETECTORS: List[Dict[str, Any]] = [
    {
        "id": "blackdetect",
        "name": "Black Frame Detector",
        "description": "FFmpeg's blackdetect filter excels at catching true black frames and lead-ins.",
        "default_enabled": True,
        "params": [
            {
                "key": "duration",
                "label": "Minimum duration (s)",
                "type": "number",
                "default": 0.5,
                "hint": "Ignore flashes shorter than this duration.",
            },
            {
                "key": "picture_threshold",
                "label": "Picture threshold",
                "type": "number",
                "default": 0.98,
                "hint": "Higher values demand darker frames to be considered black.",
            },
            {
                "key": "pixel_threshold",
                "label": "Pixel threshold",
                "type": "number",
                "default": 0.10,
                "hint": "Fraction of pixels allowed to diverge from pure black.",
            },
        ],
    },
    {
        "id": "freezedetect",
        "name": "Freeze Frame Detector",
        "description": "Detects frozen video using FFmpeg's freezedetect filter (good for static slates).",
        "default_enabled": True,
        "params": [
            {
                "key": "noise",
                "label": "Noise tolerance",
                "type": "number",
                "default": 0.003,
                "hint": "Lower values treat subtle motion as a freeze; raise to avoid false positives.",
            },
            {
                "key": "duration",
                "label": "Minimum duration (s)",
                "type": "number",
                "default": 2.0,
                "hint": "Hold duration before a freeze event is reported.",
            },
        ],
    },
    {
        "id": "silencedetect",
        "name": "Silence Detector",
        "description": "Audio silence detector for mutes and dropouts (FFmpeg silencedetect).",
        "default_enabled": True,
        "params": [
            {
                "key": "noise",
                "label": "Noise floor (dB)",
                "type": "number",
                "default": -30.0,
                "hint": "Everything below this level is considered silence.",
            },
            {
                "key": "duration",
                "label": "Minimum duration (s)",
                "type": "number",
                "default": 2.0,
                "hint": "Ignore short gaps shorter than this duration.",
            },
        ],
    },
    {
        "id": "overlaytext",
        "name": "Overlay Text OCR",
        "description": "Samples frames and flags persistent on-screen text (burned-in captions, UI overlays).",
        "default_enabled": True,
        "params": [
            {
                "key": "sample_interval",
                "label": "Sample interval (s)",
                "type": "number",
                "default": 1.0,
                "hint": "How often to OCR frames. Lower values increase accuracy at the cost of speed.",
            },
            {
                "key": "min_confidence",
                "label": "Minimum OCR confidence",
                "type": "number",
                "default": 70.0,
                "hint": "Discard detections below this confidence score (0-100).",
            },
            {
                "key": "min_chars",
                "label": "Minimum characters",
                "type": "number",
                "default": 5.0,
                "hint": "Ignore very short strings to reduce false positives.",
            },
            {
                "key": "min_duration",
                "label": "Minimum duration (s)",
                "type": "number",
                "default": 1.5,
                "hint": "Require text to persist at least this long before flagging.",
            },
            {
                "key": "min_box_height",
                "label": "Minimum box height (px)",
                "type": "number",
                "default": 24.0,
                "hint": "Ignore overlays smaller than this height to reduce noise.",
            },
            {
                "key": "allowlist_phrases",
                "label": "Allowed phrases (comma separated)",
                "type": "text",
                "default": "",
                "hint": "Known text (e.g., permanent bugs) to ignore.",
            },
            {
                "key": "flag_keywords",
                "label": "Critical keywords (comma separated)",
                "type": "text",
                "default": "click,press,error,warning,analyze",
                "hint": "Keywords that escalate severity to critical when present.",
            },
        ],
    },
]

_QCTOOLS_TEST_LOOKUP = {test["id"]: test for test in AVAILABLE_QCTOOLS_TESTS}
_FFMPEG_DETECTOR_LOOKUP = {det["id"]: det for det in FFMPEG_DETECTORS}

_SEVERITY_LEVELS = ("critical", "non_critical")
_DEFAULT_SEVERITY = "non_critical"


def _sanitize_bound_value(value):
    coerced = _coerce_float(value)
    return coerced if coerced is not None else None


def _normalize_bounds(source, fallback=None):
    result = {}
    fallback = fallback or {}
    if isinstance(source, dict):
        candidates = {**fallback, **source}
    else:
        candidates = fallback.copy()
    for key in ("min", "max"):
        bounded = _sanitize_bound_value(candidates.get(key))
        if bounded is not None:
            result[key] = bounded
    return result


def _resolve_detection_bounds(base_bounds, severity_bounds, defaults):
    defaults = defaults or {}
    min_candidates = []
    max_candidates = []

    if isinstance(base_bounds, dict):
        if base_bounds.get("min") is not None:
            min_candidates.append(base_bounds["min"])
        if base_bounds.get("max") is not None:
            max_candidates.append(base_bounds["max"])

    for level_key in _SEVERITY_LEVELS:
        level = severity_bounds.get(level_key, {}) if isinstance(severity_bounds, dict) else {}
        if level.get("min") is not None:
            min_candidates.append(level["min"])
        if level.get("max") is not None:
            max_candidates.append(level["max"])

    if defaults.get("min") is not None:
        min_candidates.append(_sanitize_bound_value(defaults.get("min")))
    if defaults.get("max") is not None:
        max_candidates.append(_sanitize_bound_value(defaults.get("max")))

    detection = {}
    if min_candidates:
        detection["min"] = max(min_candidates)
    if max_candidates:
        detection["max"] = min(max_candidates)
    return detection


def _classify_severity(value, reason, severity_rules, default_severity):
    if default_severity not in _SEVERITY_LEVELS:
        default_severity = _DEFAULT_SEVERITY
    if value is None:
        return default_severity

    severity_rules = severity_rules if isinstance(severity_rules, dict) else {}
    comparisons = ["critical", "non_critical"]

    if reason == "above_max":
        for level in comparisons:
            bounds = severity_rules.get(level, {}) if isinstance(severity_rules.get(level), dict) else {}
            boundary = bounds.get("max")
            if boundary is not None and value > boundary:
                return level
    elif reason == "below_min":
        for level in comparisons:
            bounds = severity_rules.get(level, {}) if isinstance(severity_rules.get(level), dict) else {}
            boundary = bounds.get("min")
            if boundary is not None and value < boundary:
                return level

    return default_severity


# ---------------------------------------------------------------------------
# Preset helpers
# ---------------------------------------------------------------------------

def get_default_qctools_preset():
    return {
        "video_tracks": "first",
        "audio_tracks": "first",
        "panels": ["Tiled Center Column"],
        "filters": [
            {
                "id": test["id"],
                "enabled": test.get("default_enabled", False),
                "metrics": {
                    metric["key"]: {
                        "threshold": deepcopy(metric.get("default", {})) or {},
                        "severity": {
                            "non_critical": deepcopy(metric.get("default", {})) or {},
                            "critical": {},
                        },
                        "default_severity": _DEFAULT_SEVERITY,
                    }
                    for metric in test.get("metrics", [])
                },
            }
            for test in AVAILABLE_QCTOOLS_TESTS
        ],
        "ffmpeg": [
            {
                "id": det["id"],
                "enabled": det.get("default_enabled", False),
                "params": {
                    param["key"]: param.get("default") for param in det.get("params", [])
                },
            }
            for det in FFMPEG_DETECTORS
        ],
    }


def normalize_qctools_preset(preset: Dict[str, Any]) -> Dict[str, Any]:
    base = get_default_qctools_preset()
    if not isinstance(preset, dict):
        return base

    normalized = {
        "video_tracks": "all" if str(preset.get("video_tracks", base["video_tracks"]) or "").lower() == "all" else "first",
        "audio_tracks": "all" if str(preset.get("audio_tracks", base["audio_tracks"]) or "").lower() == "all" else "first",
        "panels": preset.get("panels") or base.get("panels", []),
        "filters": [],
        "ffmpeg": [],
    }

    preset_filters = {entry.get("id"): entry for entry in preset.get("filters", []) if isinstance(entry, dict)}
    for test in AVAILABLE_QCTOOLS_TESTS:
        config = preset_filters.get(test["id"], {})
        metrics_cfg = config.get("metrics", {}) if isinstance(config.get("metrics"), dict) else {}
        metrics = {}
        for metric in test.get("metrics", []):
            metric_defaults = metric.get("default", {}) or {}
            raw_entry = metrics_cfg.get(metric["key"], {})

            if isinstance(raw_entry, dict) and (
                "threshold" in raw_entry or "severity" in raw_entry or "default_severity" in raw_entry
            ):
                threshold_source = raw_entry.get("threshold", {})
                severity_source = raw_entry.get("severity", {})
                default_severity = raw_entry.get("default_severity")
            else:
                threshold_source = raw_entry if isinstance(raw_entry, dict) else {}
                severity_source = {}
                default_severity = None

            base_threshold = _normalize_bounds(threshold_source, metric_defaults)

            severity_levels = {}
            severity_source = severity_source if isinstance(severity_source, dict) else {}
            for level in _SEVERITY_LEVELS:
                raw_level = severity_source.get(level, {})
                fallback = base_threshold if level == "non_critical" else {}
                severity_levels[level] = _normalize_bounds(raw_level, fallback)

            detection_bounds = _resolve_detection_bounds(base_threshold, severity_levels, metric_defaults)

            if default_severity not in _SEVERITY_LEVELS:
                default_severity = _DEFAULT_SEVERITY

            metrics[metric["key"]] = {
                "threshold": detection_bounds,
                "severity": severity_levels,
                "default_severity": default_severity,
            }
        normalized["filters"].append({
            "id": test["id"],
            "enabled": bool(config.get("enabled", test.get("default_enabled", False))),
            "metrics": metrics,
        })

    preset_detectors = {entry.get("id"): entry for entry in preset.get("ffmpeg", []) if isinstance(entry, dict)}
    for detector in FFMPEG_DETECTORS:
        config = preset_detectors.get(detector["id"], {})
        params_cfg = config.get("params", {}) if isinstance(config.get("params"), dict) else {}
        params = {}
        meta_lookup = {param.get("key"): param for param in detector.get("params", []) if param.get("key")}
        for key, meta in meta_lookup.items():
            raw_value = params_cfg.get(key)
            if raw_value is None:
                raw_value = meta.get("default")

            param_type = (meta.get("type") or "number").lower()
            if param_type in {"number", "float", "decimal"}:
                params[key] = _coerce_float(raw_value, meta.get("default"))
            elif param_type in {"integer", "int"}:
                coerced = _coerce_float(raw_value, meta.get("default"))
                params[key] = int(round(coerced)) if coerced is not None else None
            else:
                params[key] = ("" if raw_value is None else str(raw_value))
        normalized["ffmpeg"].append({
            "id": detector["id"],
            "enabled": bool(config.get("enabled", detector.get("default_enabled", False))),
            "params": params,
            "default_severity": config.get("default_severity", "non_critical"),
        })

    return normalized


# ---------------------------------------------------------------------------
# File analysis helpers
# ---------------------------------------------------------------------------

def get_file_analysis(file_path):
    print(f"Analyzing general info for: {file_path}")
    command = [
        "ffprobe",
        "-hide_banner",
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        file_path,
    ]
    stdout, _ = run_command(command)
    return json.loads(stdout) if stdout else {}


# ---------------------------------------------------------------------------
# QCTools analysis
# ---------------------------------------------------------------------------

def run_qctools_analysis(file_path, preset):
    xml_output_path = f"{file_path}.qctools.xml.gz"

    filters_to_run = [f for f in preset.get("filters", []) if f.get("enabled")]
    filter_names = [f["id"] for f in filters_to_run]

    base_command = [
        "qcli",
        "-i",
        file_path,
        "-o",
        xml_output_path,
        "-y",
    ]

    if filter_names:
        base_command.extend(["-f", "+".join(filter_names)])

    preferred_video = "all" if preset.get("video_tracks") == "all" else "1"
    preferred_audio = "all" if preset.get("audio_tracks") == "all" else "1"

    attempts = [(preferred_video, preferred_audio)]
    if preferred_video == "all" or preferred_audio == "all":
        attempts.append(("1", "1"))

    last_error = None
    for video_opt, audio_opt in attempts:
        if os.path.exists(xml_output_path):
            try:
                os.remove(xml_output_path)
            except OSError:
                pass

        command = list(base_command)
        command.extend(["-video", video_opt])
        command.extend(["-audio", audio_opt])

        stdout, stderr = run_command(command)
        if stdout:
            print(f"QCTools stdout (video={video_opt} audio={audio_opt}): {stdout[:400]}" + ('...' if len(stdout) > 400 else ''))
        if os.path.exists(xml_output_path):
            break

        last_error = stderr or stdout or "<no output>"
        print(
            "QCTools run failed to produce XML (video=%s audio=%s). stderr=%s"
            % (video_opt, audio_opt, (stderr or "<empty>"))
        )
    else:
        raise RuntimeError(
            f"QCTools failed for {file_path} after attempts {attempts}. Last diagnostics: {last_error}"
        )

    try:
        return _parse_qctools_output(xml_output_path, filters_to_run)
    finally:
        if os.path.exists(xml_output_path):
            os.remove(xml_output_path)


def _parse_qctools_output(xml_path, filters_to_run):
    if not os.path.exists(xml_path):
        print("QCTools XML report not found.")
        return {"filters": [], "issues": [], "statistics": {"frames": 0}}

    with gzip.open(xml_path, "rt", encoding="utf-8", errors="ignore") as xml_file:
        tree = ET.parse(xml_file)

    root = tree.getroot()
    frames_node = root.find(".//frames")
    if frames_node is None:
        print("QCTools XML did not contain <frames> data.")
        return {"filters": [], "issues": [], "statistics": {"frames": 0}}

    filter_lookup = {f["id"]: f for f in filters_to_run}
    active_tests = {fid: _QCTOOLS_TEST_LOOKUP.get(fid) for fid in filter_lookup}

    aggregations: Dict[str, Dict[str, Dict[str, float]]] = {}
    violations: Dict[str, Dict[str, Dict[str, Any]]] = {}
    for filter_id, config in filter_lookup.items():
        test_meta = active_tests.get(filter_id)
        if not test_meta:
            continue
        aggregations[filter_id] = {}
        violations[filter_id] = {}
        for metric in test_meta.get("metrics", []):
            aggregations[filter_id][metric["key"]] = {
                "min": math.inf,
                "max": -math.inf,
                "sum": 0.0,
                "count": 0,
            }
            violations[filter_id][metric["key"]] = None

    issues = []
    frame_count = 0

    for frame in frames_node.findall("frame"):
        try:
            timestamp = float(frame.attrib.get("pkt_pts_time", "0") or 0)
        except ValueError:
            timestamp = 0.0
        try:
            frame_duration = float(frame.attrib.get("pkt_duration_time", "0") or 0)
        except ValueError:
            frame_duration = 0.0

        tags = {
            tag.attrib.get("key"): tag.attrib.get("value")
            for tag in frame.findall("tag")
            if "key" in tag.attrib
        }

        for filter_id, config in filter_lookup.items():
            test_meta = active_tests.get(filter_id)
            if not test_meta:
                continue
            for metric in test_meta.get("metrics", []):
                key = metric["key"]
                if key not in aggregations[filter_id]:
                    continue

                value_str = tags.get(key)
                if value_str is None:
                    continue
                try:
                    value = float(value_str)
                except ValueError:
                    continue
                if not math.isfinite(value):
                    continue

                agg = aggregations[filter_id][key]
                agg["min"] = min(agg["min"], value)
                agg["max"] = max(agg["max"], value)
                agg["sum"] += value
                agg["count"] += 1

                metric_defaults = metric.get("default", {}) or {}
                metric_settings = config.get("metrics", {}).get(key, {})

                if isinstance(metric_settings, dict) and (
                    "threshold" in metric_settings or "severity" in metric_settings or "default_severity" in metric_settings
                ):
                    base_threshold = _normalize_bounds(metric_settings.get("threshold", {}), metric_defaults)
                    raw_severity = metric_settings.get("severity", {})
                    default_severity = metric_settings.get("default_severity")
                else:
                    base_threshold = _normalize_bounds(
                        metric_settings if isinstance(metric_settings, dict) else {},
                        metric_defaults,
                    )
                    raw_severity = {}
                    default_severity = None

                raw_severity = raw_severity if isinstance(raw_severity, dict) else {}
                severity_levels = {}
                for level in _SEVERITY_LEVELS:
                    fallback = base_threshold if level == "non_critical" else {}
                    severity_levels[level] = _normalize_bounds(raw_severity.get(level, {}), fallback)

                detection_threshold = _resolve_detection_bounds(base_threshold, severity_levels, metric_defaults)

                if default_severity not in _SEVERITY_LEVELS:
                    default_severity = _DEFAULT_SEVERITY

                violation_reason = _evaluate_threshold(value, detection_threshold)

                current_violation = violations[filter_id][key]
                if violation_reason:
                    if current_violation is None:
                        violations[filter_id][key] = {
                            "start": timestamp,
                            "end": timestamp,
                            "duration": frame_duration,
                            "peak": value,
                            "reason": violation_reason,
                            "threshold": detection_threshold,
                            "severity_rules": severity_levels,
                            "default_severity": default_severity,
                            "metric": metric,
                            "filter_id": filter_id,
                        }
                    else:
                        current_violation["end"] = timestamp
                        current_violation["duration"] += frame_duration
                        if (violation_reason == "above_max" and value > current_violation["peak"]) or (
                            violation_reason == "below_min" and value < current_violation["peak"]
                        ):
                            current_violation["peak"] = value
                else:
                    if current_violation is not None:
                        issues.append(_finalize_violation(current_violation))
                        violations[filter_id][key] = None

        frame_count += 1

    for filter_map in violations.values():
        for violation_state in filter_map.values():
            if violation_state is not None:
                issues.append(_finalize_violation(violation_state))

    filter_results = []
    for filter_id, config in filter_lookup.items():
        test_meta = active_tests.get(filter_id)
        if not test_meta:
            continue
        metrics_summary = []
        for metric in test_meta.get("metrics", []):
            agg = aggregations.get(filter_id, {}).get(metric["key"], {})
            count = agg.get("count", 0)
            metric_settings = config.get("metrics", {}).get(metric["key"], {})
            if isinstance(metric_settings, dict) and (
                "threshold" in metric_settings or "severity" in metric_settings or "default_severity" in metric_settings
            ):
                base_threshold = _normalize_bounds(metric_settings.get("threshold", {}), metric.get("default", {}) or {})
                severity_levels = {}
                raw_severity = metric_settings.get("severity", {}) if isinstance(metric_settings.get("severity", {}), dict) else {}
                for level in _SEVERITY_LEVELS:
                    fallback = base_threshold if level == "non_critical" else {}
                    severity_levels[level] = _normalize_bounds(raw_severity.get(level, {}), fallback)
                default_severity = metric_settings.get("default_severity")
            else:
                base_threshold = _normalize_bounds(metric_settings if isinstance(metric_settings, dict) else {}, metric.get("default", {}) or {})
                severity_levels = {
                    "non_critical": base_threshold.copy(),
                    "critical": {},
                }
                default_severity = metric_settings.get("default_severity") if isinstance(metric_settings, dict) else None

            if default_severity not in _SEVERITY_LEVELS:
                default_severity = _DEFAULT_SEVERITY

            metrics_summary.append(
                {
                    "key": metric["key"],
                    "label": metric["label"],
                    "unit": metric.get("unit"),
                    "hint": metric.get("hint"),
                    "min": None if count == 0 else agg["min"],
                    "max": None if count == 0 else agg["max"],
                    "average": None if count == 0 else agg["sum"] / count,
                    "threshold": _resolve_detection_bounds(base_threshold, severity_levels, metric.get("default", {}) or {}),
                    "severity": severity_levels,
                    "default_severity": default_severity,
                }
            )
        filter_results.append(
            {
                "id": filter_id,
                "name": test_meta["name"],
                "category": test_meta.get("category"),
                "description": test_meta.get("description"),
                "metrics": metrics_summary,
            }
        )

    issues.sort(key=lambda issue: issue.get("start_time", 0))

    return {
        "filters": filter_results,
        "issues": issues,
        "statistics": {
            "frames": frame_count,
            "filters_run": list(filter_lookup.keys()),
        },
    }


def _evaluate_threshold(value, threshold):
    if not isinstance(threshold, dict):
        return None
    if "min" in threshold and value < threshold["min"]:
        return "below_min"
    if "max" in threshold and value > threshold["max"]:
        return "above_max"
    return None


def _finalize_violation(state):
    start = state.get("start", 0.0)
    end = state.get("end", start)
    duration = max(0.0, state.get("duration", max(0.0, end - start)))
    metric = state.get("metric", {})
    threshold = state.get("threshold", {}) if isinstance(state.get("threshold"), dict) else {}
    severity_rules = state.get("severity_rules", {}) if isinstance(state.get("severity_rules"), dict) else {}
    default_severity = state.get("default_severity", _DEFAULT_SEVERITY)
    reason = state.get("reason")
    peak_value = state.get("peak")

    condition_parts = []
    if "min" in threshold:
        condition_parts.append(f">= {threshold['min']}")
    if "max" in threshold:
        condition_parts.append(f"<= {threshold['max']}")
    condition = " and ".join(condition_parts)

    reason_label = {
        "below_min": "below minimum",
        "above_max": "above maximum",
    }.get(reason, "out of range")

    severity = _classify_severity(peak_value, reason, severity_rules, default_severity)

    severity_rule = None
    if reason == "above_max":
        comparison = severity_rules.get(severity, {}) if isinstance(severity_rules.get(severity), dict) else {}
        boundary = comparison.get("max")
        if boundary is not None:
            severity_rule = {"type": "above_max", "boundary": boundary}
    elif reason == "below_min":
        comparison = severity_rules.get(severity, {}) if isinstance(severity_rules.get(severity), dict) else {}
        boundary = comparison.get("min")
        if boundary is not None:
            severity_rule = {"type": "below_min", "boundary": boundary}

    return {
        "event": f"{metric.get('label', metric.get('key'))} {reason_label}",
        "filter": state.get("filter_id"),
        "metric_key": metric.get("key"),
        "start_time": start,
        "end_time": end,
        "duration": duration,
        "details": {
            "peak": state.get("peak"),
            "condition": condition,
            "severity_bounds": severity_rules,
            **({"severity_rule": severity_rule} if severity_rule else {}),
        },
        "source": "qctools",
        "severity": severity,
    }


# ---------------------------------------------------------------------------
# FFmpeg-based detectors
# ---------------------------------------------------------------------------

def run_ffmpeg_detectors(file_path, preset):
    issues = []
    reports = []
    preset_detectors = {item.get("id"): item for item in preset.get("ffmpeg", []) if isinstance(item, dict)}

    for detector in FFMPEG_DETECTORS:
        config = preset_detectors.get(detector["id"])
        if not config or not config.get("enabled"):
            continue
        params = config.get("params", {}) if isinstance(config.get("params"), dict) else {}
        default_severity = config.get("default_severity", "non_critical")

        if detector["id"] == "blackdetect":
            detector_issues = detect_black_frames_ffmpeg(file_path, params, default_severity)
        elif detector["id"] == "freezedetect":
            detector_issues = detect_freeze_frames_ffmpeg(file_path, params, default_severity)
        elif detector["id"] == "silencedetect":
            detector_issues = detect_silence_ffmpeg(file_path, params, default_severity)
        elif detector["id"] == "overlaytext":
            detector_issues = detect_overlay_text(file_path, params, default_severity)
        else:
            detector_issues = []

        issues.extend(detector_issues)
        reports.append({
            "id": detector["id"],
            "name": detector["name"],
            "issues_found": len(detector_issues),
        })

    return {"issues": issues, "reports": reports}


def detect_black_frames_ffmpeg(file_path, params, default_severity="non_critical"):
    duration = _coerce_float(params.get("duration"), 0.5) or 0.5
    picture_threshold = _coerce_float(params.get("picture_threshold"), 0.98) or 0.98
    pixel_threshold = _coerce_float(params.get("pixel_threshold"), 0.10) or 0.10

    command = [
        "ffmpeg",
        "-hide_banner",
        "-nostats",
        "-i",
        file_path,
        "-vf",
        f"blackdetect=d={duration}:pic_th={picture_threshold}:pix_th={pixel_threshold}",
        "-an",
        "-f",
        "null",
        "-",
    ]
    _, stderr = run_command(command)

    issues = []
    current = {}
    for line in stderr.splitlines():
        if "black_start" in line:
            try:
                start = float(line.split("black_start:")[1].split()[0])
                current = {"start": start}
            except (IndexError, ValueError):
                continue
        elif "black_end" in line and current:
            try:
                end = float(line.split("black_end:")[1].split()[0])
                current["end"] = end
            except (IndexError, ValueError):
                continue
        elif "black_duration" in line and current:
            try:
                dur = float(line.split("black_duration:")[1].split()[0])
                current["duration"] = dur
                issues.append(
                    {
                        "event": "Black frame segment",
                        "start_time": current.get("start", 0.0),
                        "end_time": current.get("end", current.get("start", 0.0) + dur),
                        "duration": dur,
                        "details": {
                            "picture_threshold": picture_threshold,
                            "pixel_threshold": pixel_threshold,
                        },
                        "source": "ffmpeg-blackdetect",
                        "severity": default_severity,
                    }
                )
                current = {}
            except (IndexError, ValueError):
                continue
    return issues


def detect_freeze_frames_ffmpeg(file_path, params, default_severity="non_critical"):
    noise = _coerce_float(params.get("noise"), 0.003)
    if noise is None or noise <= 0:
        noise = 0.003

    duration = _coerce_float(params.get("duration"), 2.0)
    if duration is None or duration < 0:
        duration = 2.0

    command = [
        "ffmpeg",
        "-hide_banner",
        "-nostats",
        "-i",
        file_path,
        "-vf",
        f"freezedetect=n={noise}:d={duration}",
        "-map",
        "0:v:0",
        "-an",
        "-f",
        "null",
        "-",
    ]
    _, stderr = run_command(command)

    issues = []
    current = {}
    for line in stderr.splitlines():
        if "freezedetect" not in line:
            continue
        if "freeze_start" in line:
            try:
                start = float(line.split(":")[-1].strip())
                current = {"start": start}
            except ValueError:
                continue
        elif "freeze_end" in line and current:
            try:
                end = float(line.split(":")[-1].strip())
                current["end"] = end
            except ValueError:
                continue
        elif "freeze_duration" in line and current:
            try:
                dur = float(line.split(":")[-1].strip())
                current["duration"] = dur
                issues.append(
                    {
                        "event": "Frozen video segment",
                        "start_time": current.get("start", 0.0),
                        "end_time": current.get("end", current.get("start", 0.0) + dur),
                        "duration": dur,
                        "details": {
                            "noise": noise,
                            "duration_threshold": duration,
                        },
                        "source": "ffmpeg-freezedetect",
                        "severity": default_severity,
                    }
                )
                current = {}
            except ValueError:
                continue
    return issues


def detect_silence_ffmpeg(file_path, params, default_severity="non_critical"):
    noise_db = _coerce_float(params.get("noise"), -30.0) or -30.0
    duration = _coerce_float(params.get("duration"), 2.0) or 2.0

    command = [
        "ffmpeg",
        "-hide_banner",
        "-nostats",
        "-i",
        file_path,
        "-af",
        f"silencedetect=noise={noise_db}dB:d={duration}",
        "-vn",
        "-f",
        "null",
        "-",
    ]
    _, stderr = run_command(command)

    issues = []
    current = {}
    for line in stderr.splitlines():
        line = line.strip()
        if "silence_start" in line:
            try:
                start = float(line.split("silence_start:")[1].strip())
                current = {"start": start}
            except (IndexError, ValueError):
                continue
        elif "silence_end" in line and current:
            try:
                parts = line.split("silence_end:")[1].strip().split()
                end = float(parts[0])
                current["end"] = end
                if "silence_duration:" in line:
                    dur = float(line.split("silence_duration:")[1].strip())
                    current["duration"] = dur
                issues.append(
                    {
                        "event": "Audio silence segment",
                        "start_time": current.get("start", 0.0),
                        "end_time": current.get("end", current.get("start", 0.0)),
                        "duration": current.get("duration", 0.0),
                        "details": {
                            "noise_threshold": noise_db,
                            "duration_threshold": duration,
                        },
                        "source": "ffmpeg-silencedetect",
                        "severity": default_severity,
                    }
                )
                current = {}
            except (IndexError, ValueError):
                continue
    return issues


def _load_ocr_cache(cache_path):
    try:
        with open(cache_path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return None


def _save_ocr_cache(cache_path, payload):
    try:
        with open(cache_path, "w", encoding="utf-8") as handle:
            json.dump(payload, handle)
    except OSError:
        pass


def _parse_csv_list(text):
    if not text:
        return []
    if isinstance(text, (list, tuple)):
        return [item.strip().lower() for item in text if isinstance(item, str) and item.strip()]
    return [item.strip().lower() for item in str(text).split(",") if item.strip()]


def detect_overlay_text(file_path, params, default_severity="non_critical"):
    if cv2 is None or pytesseract is None:
        print("Skipping overlay text detection because OCR dependencies are unavailable.")
        return []

    cache_path = f"{file_path}.ocr.json"
    cache = _load_ocr_cache(cache_path)
    if cache:
        return cache.get("issues", [])

    sample_interval = max(0.2, _coerce_float(params.get("sample_interval"), 1.0) or 1.0)
    min_confidence = min(100.0, max(0.0, _coerce_float(params.get("min_confidence"), 70.0) or 70.0))
    min_chars = int(max(1, _coerce_float(params.get("min_chars"), 5.0) or 5))
    min_duration = max(0.2, _coerce_float(params.get("min_duration"), 1.5) or 1.5)
    min_box_height = int(max(1, _coerce_float(params.get("min_box_height"), 24.0) or 24))

    allowlist_phrases = _parse_csv_list(params.get("allowlist_phrases"))
    flag_keywords = _parse_csv_list(params.get("flag_keywords")) or ["click", "press", "error", "warning", "analyze"]

    cap = cv2.VideoCapture(file_path)
    if not cap.isOpened():
        print(f"Unable to open video for overlay text detection: {file_path}")
        return []

    fps = cap.get(cv2.CAP_PROP_FPS)
    if not fps or fps <= 0:
        fps = 25.0

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    step = max(1, int(round(sample_interval * fps)))
    sample_duration = step / fps

    tracks: Dict[str, Dict[str, Any]] = {}
    issues: List[Dict[str, Any]] = []

    frame_index = 0
    while total_frames == 0 or frame_index < total_frames:
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
        success, frame = cap.read()
        if not success:
            break

        timestamp = frame_index / fps if fps else 0.0
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        data = pytesseract.image_to_data(gray, output_type=pytesseract.Output.DICT)

        seen_this_frame = set()
        n_items = len(data.get("text", []))
        for idx in range(n_items):
            text = data["text"][idx]
            if not text:
                continue
            try:
                confidence = float(data.get("conf", ["0"])[idx])
            except (ValueError, TypeError):
                confidence = 0.0
            if confidence < min_confidence:
                continue

            cleaned = " ".join(text.split())
            if len(cleaned) < min_chars:
                continue

            height = int(data.get("height", [0])[idx] or 0)
            if height < min_box_height:
                continue

            normalized = cleaned.lower()
            if allowlist_phrases and any(normalized.find(phrase) != -1 for phrase in allowlist_phrases):
                continue

            left = int(data.get("left", [0])[idx] or 0)
            top = int(data.get("top", [0])[idx] or 0)
            width = int(data.get("width", [0])[idx] or 0)

            seen_this_frame.add(normalized)
            track = tracks.get(normalized)
            keyword_hits = sum(1 for keyword in flag_keywords if keyword in normalized)
            if not track:
                track = {
                    "text": cleaned,
                    "start": timestamp,
                    "last_seen": timestamp,
                    "samples": 1,
                    "confidence_sum": confidence,
                    "boxes": [
                        {
                            "left": left,
                            "top": top,
                            "width": width,
                            "height": height,
                        }
                    ],
                    "keyword_hits": keyword_hits,
                }
                tracks[normalized] = track
            else:
                track["last_seen"] = timestamp
                track["samples"] += 1
                track["confidence_sum"] += confidence
                track.setdefault("boxes", []).append(
                    {
                        "left": left,
                        "top": top,
                        "width": width,
                        "height": height,
                    }
                )
                track["keyword_hits"] += keyword_hits

        to_remove = []
        for key, track in tracks.items():
            if key in seen_this_frame:
                continue
            if timestamp - track["last_seen"] < sample_duration:
                continue

            end_time = track["last_seen"] + sample_duration
            duration = max(end_time - track["start"], sample_duration)
            if duration >= min_duration:
                avg_conf = track["confidence_sum"] / track["samples"]
                severity = "critical" if track.get("keyword_hits", 0) > 0 else default_severity
                issues.append(
                    {
                        "event": "Overlay text detected",
                        "start_time": track["start"],
                        "end_time": end_time,
                        "duration": duration,
                        "details": {
                            "text": track["text"],
                            "average_confidence": round(avg_conf, 2),
                            "samples": track["samples"],
                            "bounding_boxes": track.get("boxes", []),
                        },
                        "source": "ocr-overlay",
                        "severity": severity,
                    }
                )
            to_remove.append(key)
        for key in to_remove:
            tracks.pop(key, None)

        frame_index += step

    cap.release()

    for track in list(tracks.values()):
        end_time = track["last_seen"] + sample_duration
        duration = max(end_time - track["start"], sample_duration)
        if duration >= min_duration:
            avg_conf = track["confidence_sum"] / track["samples"]
            severity = "critical" if track.get("keyword_hits", 0) > 0 else default_severity
            issues.append(
                {
                    "event": "Overlay text detected",
                    "start_time": track["start"],
                    "end_time": end_time,
                    "duration": duration,
                    "details": {
                        "text": track["text"],
                        "average_confidence": round(avg_conf, 2),
                        "samples": track["samples"],
                        "bounding_boxes": track.get("boxes", []),
                    },
                    "source": "ocr-overlay",
                    "severity": severity,
                }
            )

    issues.sort(key=lambda issue: issue.get("start_time", 0))
    _save_ocr_cache(cache_path, {"issues": issues, "sample_interval": sample_interval})
    return issues


def _ensure_directory(path):
    os.makedirs(path, exist_ok=True)


def _capture_issue_screenshot(video_path, output_dir, job_id, index, timestamp):
    if timestamp is None:
        timestamp = 0
    safe_timestamp = max(0, float(timestamp))
    filename = f"{job_id}_issue_{index:03d}.jpg"
    output_path = os.path.join(output_dir, filename)

    command = [
        "ffmpeg",
        "-y",
        "-ss",
        str(safe_timestamp),
        "-i",
        video_path,
        "-vframes",
        "1",
        "-vf",
        "scale=640:-1",
        output_path,
    ]
    stdout, stderr = run_command(command)
    if not os.path.exists(output_path):
        print(f"Failed to capture screenshot for issue {index} at {safe_timestamp}s. stderr={stderr}")
        return None
    return output_path


def build_report_filename(job):
    timestamp_label = job.created_at.strftime('%Y%m%d-%H%M%S') if getattr(job, 'created_at', None) else 'report'
    safe_filename = (getattr(job, 'filename', '') or job.id or '').replace('/', '_').replace('\\', '_')
    safe_filename = safe_filename or job.id
    return f"PepperQC-{safe_filename}-{timestamp_label}.pdf"


def generate_job_report(job, analysis_result, upload_folder):
    if not REPORTLAB_AVAILABLE:
        raise RuntimeError('PDF generation requires reportlab package.')

    report_root = os.path.join(upload_folder, 'reports')
    screenshot_root = os.path.join(report_root, 'screenshots')
    _ensure_directory(report_root)
    _ensure_directory(screenshot_root)

    report_path = os.path.join(report_root, build_report_filename(job))
    video_path = job.stored_filepath if hasattr(job, 'stored_filepath') else None
    issues = analysis_result.get('issues', []) if isinstance(analysis_result, dict) else []

    c = canvas.Canvas(report_path, pagesize=letter)
    width, height = letter

    # Modern color palette
    colors = {
        'primary': '#2563eb',     # Blue
        'secondary': '#64748b',   # Slate gray
        'success': '#059669',     # Green
        'warning': '#d97706',     # Orange
        'danger': '#dc2626',      # Red
        'light_bg': '#f8fafc',    # Light blue-gray
        'border': '#e2e8f0',      # Light border
        'text_primary': '#1e293b', # Dark slate
        'text_secondary': '#64748b' # Medium slate
    }

    def hex_to_rgb(hex_color):
        """Convert hex color to RGB tuple (0-1 scale)"""
        hex_color = hex_color.lstrip('#')
        return tuple(int(hex_color[i:i+2], 16)/255.0 for i in (0, 2, 4))

    def draw_header():
        # Header background
        c.setFillColor(hex_to_rgb(colors['primary']))
        c.rect(0, height - 100, width, 100, fill=1, stroke=0)

        # White text for header
        c.setFillColor((1, 1, 1))  # White
        c.setFont('Helvetica-Bold', 24)
        c.drawString(40, height - 45, 'PepperQC')

        c.setFont('Helvetica', 14)
        c.drawString(40, height - 65, 'Quality Control Analysis Report')

        # Timestamp in top right
        c.setFont('Helvetica', 10)
        timestamp = datetime.utcnow().strftime('%B %d, %Y at %H:%M UTC')
        c.drawRightString(width - 40, height - 35, f"Generated: {timestamp}")

    def draw_info_card(x, y, width_card, title, content_items, bg_color='#ffffff'):
        """Draw a modern info card with title and content"""
        card_height = 20 + len(content_items) * 16 + 20  # padding + content + padding

        # Card background
        c.setFillColor(hex_to_rgb(bg_color))
        c.setStrokeColor(hex_to_rgb(colors['border']))
        c.rect(x, y - card_height, width_card, card_height, fill=1, stroke=1)

        # Title
        c.setFillColor(hex_to_rgb(colors['text_primary']))
        c.setFont('Helvetica-Bold', 12)
        c.drawString(x + 12, y - 25, title)

        # Content
        c.setFillColor(hex_to_rgb(colors['text_secondary']))
        c.setFont('Helvetica', 10)
        content_y = y - 45
        for item in content_items:
            c.drawString(x + 12, content_y, item)
            content_y -= 16

        return card_height

    def draw_summary_stats(x, y, width_card, severity_counts, total_issues):
        """Draw modern stats cards for summary"""
        card_width = (width_card - 20) / 3  # 3 cards with gaps
        card_height = 80

        stats = [
            ('Total Issues', str(total_issues), colors['secondary']),
            ('Critical', str(severity_counts.get('critical', 0)), colors['danger']),
            ('Non-Critical', str(severity_counts.get('non_critical', 0)), colors['warning'])
        ]

        for i, (label, value, color) in enumerate(stats):
            card_x = x + i * (card_width + 10)

            # Card background
            c.setFillColor((1, 1, 1))  # White
            c.setStrokeColor(hex_to_rgb(colors['border']))
            c.rect(card_x, y - card_height, card_width, card_height, fill=1, stroke=1)

            # Colored top bar
            c.setFillColor(hex_to_rgb(color))
            c.rect(card_x, y - 8, card_width, 8, fill=1, stroke=0)

            # Large number
            c.setFillColor(hex_to_rgb(colors['text_primary']))
            c.setFont('Helvetica-Bold', 20)
            text_width = c.stringWidth(value, 'Helvetica-Bold', 20)
            c.drawString(card_x + (card_width - text_width) / 2, y - 40, value)

            # Label
            c.setFont('Helvetica', 10)
            c.setFillColor(hex_to_rgb(colors['text_secondary']))
            label_width = c.stringWidth(label, 'Helvetica', 10)
            c.drawString(card_x + (card_width - label_width) / 2, y - 60, label)

        return card_height + 20

    from datetime import datetime
    draw_header()

    # Reset fill color for content
    c.setFillColor(hex_to_rgb(colors['text_primary']))

    current_y = height - 120

    # Job Information Card
    job_info = [
        f"File: {job.filename}",
        f"Job ID: {job.id}",
        f"Status: {job.status}",
        f"Created: {job.created_at.strftime('%B %d, %Y at %H:%M UTC')}",
    ]
    if hasattr(job, 'preset') and job.preset:
        job_info.append(f"Preset: {job.preset.name}")

    card_height = draw_info_card(40, current_y, width - 80, "Job Information", job_info, colors['light_bg'])
    current_y -= card_height + 30

    # Summary Statistics
    severity_summary = analysis_result.get('severity_summary') if isinstance(analysis_result, dict) else {}
    severity_counts = severity_summary.get('counts', {}) if isinstance(severity_summary, dict) else {}

    c.setFillColor(hex_to_rgb(colors['text_primary']))
    c.setFont('Helvetica-Bold', 16)
    c.drawString(40, current_y, 'Analysis Summary')
    current_y -= 30

    stats_height = draw_summary_stats(40, current_y, width - 80, severity_counts, len(issues))
    current_y -= stats_height

    def draw_issue_card(x, y, width_card, issue, index, image_path=None, display_width=0, display_height=0):
        """Draw a modern issue card with colored severity indicator"""
        event_label = issue.get('event', 'Issue')
        start_time = issue.get('start_time', 0)
        duration = issue.get('duration')
        severity = (issue.get('severity') or 'non_critical').replace('-', '_')
        severity_label = severity.replace('_', ' ').title()

        # Choose severity color
        severity_color = colors['warning']  # default
        if severity == 'critical':
            severity_color = colors['danger']
        elif severity == 'non_critical':
            severity_color = colors['warning']
        elif severity == 'informational':
            severity_color = colors['secondary']

        details = issue.get('details')
        detail_items = []
        if isinstance(details, dict):
            for key, value in details.items():
                if value not in (None, ''):
                    detail_items.append((key.replace('_', ' ').title(), str(value)))
        elif details:
            detail_items.append(('Details', str(details)))

        # Calculate card height - more compact
        base_height = 60  # Header + basic info (reduced from 100)
        details_height = len(detail_items) * 12  # Reduced from 16
        image_height = display_height + 8 if image_path else 0  # Reduced spacing
        card_height = base_height + details_height + image_height + 12  # Reduced padding

        # Card background
        c.setFillColor((1, 1, 1))  # White
        c.setStrokeColor(hex_to_rgb(colors['border']))
        c.rect(x, y - card_height, width_card, card_height, fill=1, stroke=1)

        # Severity indicator (left border)
        c.setFillColor(hex_to_rgb(severity_color))
        c.rect(x, y - card_height, 4, card_height, fill=1, stroke=0)

        # Issue title and number - more compact
        c.setFillColor(hex_to_rgb(colors['text_primary']))
        c.setFont('Helvetica-Bold', 12)  # Reduced from 14
        c.drawString(x + 12, y - 20, f"#{index}")  # Reduced spacing

        c.setFont('Helvetica-Bold', 11)  # Reduced from 12
        c.drawString(x + 40, y - 20, event_label)  # Reduced spacing

        # Severity badge - smaller
        badge_x = x + width_card - 75
        badge_width = 65  # Reduced from 70
        badge_height = 16  # Reduced from 18
        c.setFillColor(hex_to_rgb(severity_color))
        c.rect(badge_x, y - 19, badge_width, badge_height, fill=1, stroke=0)

        c.setFillColor((1, 1, 1))  # White text
        c.setFont('Helvetica-Bold', 7)  # Reduced from 8
        text_width = c.stringWidth(severity_label.upper(), 'Helvetica-Bold', 7)
        c.drawString(badge_x + (badge_width - text_width) / 2, y - 16, severity_label.upper())

        # Timing information - more compact
        c.setFillColor(hex_to_rgb(colors['text_secondary']))
        c.setFont('Helvetica', 9)  # Reduced from 10
        timing_text = f"Start: {start_time:.2f}s"
        if duration:
            timing_text += f" • Duration: {duration:.2f}s"
        c.drawString(x + 12, y - 35, timing_text)  # Reduced spacing

        # Details section - more compact
        current_y = y - 48  # Reduced from 65
        if detail_items:
            c.setFont('Helvetica-Bold', 9)  # Reduced from 10
            c.setFillColor(hex_to_rgb(colors['text_primary']))
            c.drawString(x + 12, current_y, "Details:")  # Reduced margin
            current_y -= 14  # Reduced from 18

            c.setFont('Helvetica', 8)  # Reduced from 9
            c.setFillColor(hex_to_rgb(colors['text_secondary']))
            for label, value in detail_items:
                detail_text = f"• {label}: {value}"
                # Wrap long text if needed
                if len(detail_text) > 85:
                    detail_text = detail_text[:82] + "..."
                c.drawString(x + 20, current_y, detail_text)  # Reduced margin
                current_y -= 12  # Reduced from 16

        # Screenshot if available
        if image_path and display_width and display_height:
            # Add some spacing - reduced
            current_y -= 6  # Reduced from 10
            # Center the image
            img_x = x + (width_card - display_width) / 2
            c.drawImage(image_path, img_x, current_y - display_height, width=display_width, height=display_height)
            current_y -= display_height

        return card_height

    # Issues section
    if issues:
        # Check if we need a new page
        if current_y < 200:  # Not enough space for issues section
            c.showPage()
            draw_header()
            current_y = height - 120

        c.setFillColor(hex_to_rgb(colors['text_primary']))
        c.setFont('Helvetica-Bold', 16)
        c.drawString(40, current_y, f'Issues Detected ({len(issues)})')
        current_y -= 40

        for index, issue in enumerate(issues, start=1):
            # Prepare screenshot if available
            image_path = None
            display_width = display_height = 0
            if video_path and os.path.exists(video_path):
                issue_screenshot_dir = os.path.join(screenshot_root, job.id)
                _ensure_directory(issue_screenshot_dir)
                image_path = _capture_issue_screenshot(video_path, issue_screenshot_dir, job.id, index, issue.get('start_time', 0))
                if image_path and os.path.exists(image_path):
                    try:
                        img = ImageReader(image_path)
                        img_width, img_height = img.getSize()
                        scale = min(1, 160 / img_width)  # Smaller images for more compact layout
                        display_width = img_width * scale
                        display_height = img_height * scale
                    except Exception as exc:  # pragma: no cover - best effort
                        print(f"Failed to prepare screenshot {image_path}: {exc}")
                        image_path = None
                        display_width = display_height = 0

            # Pre-calculate card height to check if it fits
            details = issue.get('details')
            detail_items = []
            if isinstance(details, dict):
                for key, value in details.items():
                    if value not in (None, ''):
                        detail_items.append((key.replace('_', ' ').title(), str(value)))
            elif details:
                detail_items.append(('Details', str(details)))

            base_height = 60
            details_height = len(detail_items) * 12
            image_height = display_height + 8 if image_path else 0
            estimated_card_height = base_height + details_height + image_height + 12

            # Check if we need a new page BEFORE drawing
            if current_y - estimated_card_height < 80:  # Need more margin to prevent breaking
                c.showPage()
                draw_header()
                current_y = height - 120

            # Now draw the issue card (guaranteed to fit on current page)
            actual_card_height = draw_issue_card(40, current_y, width - 80, issue, index, image_path, display_width, display_height)
            current_y -= actual_card_height + 15  # Reduced spacing between cards from 20 to 15
    else:
        # No issues message
        if current_y < 100:
            c.showPage()
            draw_header()
            current_y = height - 120

        c.setFillColor(hex_to_rgb(colors['text_primary']))
        c.setFont('Helvetica-Bold', 16)
        c.drawString(40, current_y, 'Issues Detected')
        current_y -= 40

        # Success message card
        success_height = draw_info_card(40, current_y, width - 80, "✓ All Clear", ["No issues detected in this media file."], colors['light_bg'])
        current_y -= success_height

    c.showPage()
    c.save()
    return report_path


# ---------------------------------------------------------------------------
# High-level analysis orchestrator
# ---------------------------------------------------------------------------

def run_qc_analysis(file_path, preset):
    normalized_preset = normalize_qctools_preset(preset)

    qctools_result = run_qctools_analysis(file_path, normalized_preset)
    ffmpeg_result = run_ffmpeg_detectors(file_path, normalized_preset)
    file_info = get_file_analysis(file_path)

    combined_issues = qctools_result.get("issues", []) + ffmpeg_result.get("issues", [])

    return {
        "file_info": file_info,
        "issues": combined_issues,
        "qctools": qctools_result,
        "ffmpeg_reports": ffmpeg_result.get("reports", []),
        "preset": normalized_preset,
    }
