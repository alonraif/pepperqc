from utils import run_qc_analysis as perform_qc_analysis


def run_qc_analysis(file_path, preset):
    """Execute the full QC pipeline (QCTools + FFmpeg detectors)."""
    result = perform_qc_analysis(file_path, preset)
    qctools_report = result.get("qctools", {})

    return {
        "file_info": result.get("file_info", {}),
        "issues": result.get("issues", []),
        "filters": qctools_report.get("filters", []),
        "statistics": qctools_report.get("statistics", {}),
        "preset": result.get("preset"),
        "qctools_report": qctools_report,
        "ffmpeg_reports": result.get("ffmpeg_reports", []),
    }
