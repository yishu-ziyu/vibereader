"""BDD end-to-end tests for video platform extractors (P8-P9)."""
from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from uni_rag.ingest.link_extractors import (
    LinkExtractionResult,
    LinkExtractionError,
    YouTubeExtractor,
    BilibiliExtractor,
    WebExtractor,
    EXTRACTORS,
)


# ── AC-1: YouTube 字幕提取 ───────────────────────────────────────

class TestAC1_YouTubeSubtitles:
    def test_youtube_url_matches_extractor(self):
        url = "https://www.youtube.com/watch?v=abc123"
        first = next(e for e in EXTRACTORS if e.can_handle(url))
        assert isinstance(first, YouTubeExtractor)

    def test_youtube_extracts_with_subtitles(self):
        extractor = YouTubeExtractor()
        fake_srt = "1\n00:00:01,000 --> 00:00:04,000\nHello YouTube world\n\n2\n00:00:05,000 --> 00:00:08,000\nThis is a test"
        with patch.object(extractor, "check_executable", return_value=True), \
             patch.object(extractor, "run_subprocess", side_effect=["Video Title", None]), \
             patch("builtins.open", MagicMock()), \
             patch("pathlib.Path.glob", return_value=[Path("/tmp/test.srt")]), \
             patch("pathlib.Path.read_text", return_value=fake_srt):
            result = extractor.extract("https://www.youtube.com/watch?v=abc123")
        assert result.platform == "youtube"
        assert result.content_type == "video_subtitle"
        assert "Hello YouTube world" in result.text


# ── AC-2: YouTube 无字幕回退 ASR ─────────────────────────────────

class TestAC2_YouTubeASR:
    def test_fallback_to_asr_when_no_subtitles(self):
        extractor = YouTubeExtractor()
        fake_whisper = MagicMock()
        fake_model = MagicMock()
        fake_segment = MagicMock()
        fake_segment.text = "This is ASR transcribed text from the video"
        fake_model.transcribe.return_value = ([fake_segment], MagicMock())
        fake_whisper.WhisperModel.return_value = fake_model

        with patch.object(extractor, "check_executable", return_value=True), \
             patch.object(extractor, "run_subprocess", side_effect=["Title", None, None, None]), \
             patch("builtins.open", MagicMock()), \
             patch("pathlib.Path.glob", side_effect=[[], [Path("/tmp/audio.mp3")]]), \
             patch.dict("sys.modules", {"faster_whisper": fake_whisper}):
            result = extractor.extract("https://www.youtube.com/watch?v=abc123")
        assert result.metadata["subtitle_source"] == "asr"
        assert "ASR" in result.text


# ── AC-3: B站 字幕提取 ──────────────────────────────────────────

class TestAC3_BilibiliSubtitles:
    def test_bilibili_url_matches_extractor(self):
        url = "https://www.bilibili.com/video/BV1xxx"
        first = next(e for e in EXTRACTORS if e.can_handle(url))
        assert isinstance(first, BilibiliExtractor)

    def test_bilibili_extracts_with_bbdown(self):
        extractor = BilibiliExtractor()
        fake_srt = "1\n00:00:01,000 --> 00:00:04,000\nB站字幕内容非常丰富\n\n2\n00:00:05,000 --> 00:00:08,000\n这是一个测试"
        with patch.object(extractor, "check_executable", return_value=True), \
             patch.object(extractor, "run_subprocess", return_value=None), \
             patch("builtins.open", MagicMock()), \
             patch("pathlib.Path.glob", return_value=[Path("/tmp/test.srt")]), \
             patch("pathlib.Path.read_text", return_value=fake_srt):
            result = extractor.extract("https://www.bilibili.com/video/BV1xxx")
        assert result.platform == "bilibili"
        assert "B站字幕内容" in result.text


# ── AC-4: B站 三层降级 ──────────────────────────────────────────

class TestAC4_BilibiliThreeTier:
    def test_three_tier_fallback_bbdown_ytdlp_asr(self):
        extractor = BilibiliExtractor()
        fake_whisper = MagicMock()
        fake_model = MagicMock()
        fake_segment = MagicMock()
        fake_segment.text = "This is ASR transcribed text from the video"
        fake_model.transcribe.return_value = ([fake_segment], MagicMock())
        fake_whisper.WhisperModel.return_value = fake_model

        fake_srt = "1\n00:00:01,000 --> 00:00:04,000\nB站字幕"
        with patch.object(extractor, "check_executable", return_value=True), \
             patch.object(extractor, "run_subprocess", side_effect=[
                None,  # BBDown fails
                None,  # yt-dlp --write-subs fails
                None,  # yt-dlp -x fails
                "B站视频",  # yt-dlp --print title
             ]), \
             patch("builtins.open", MagicMock()), \
             patch("pathlib.Path.glob", side_effect=[
                [],  # No SRT from BBDown
                [],  # No SRT from yt-dlp
                [Path("/tmp/audio.mp3")],  # Audio from yt-dlp -x
             ]), \
             patch("pathlib.Path.read_text", return_value=fake_srt), \
             patch.dict("sys.modules", {"faster_whisper": fake_whisper}):
            result = extractor.extract("https://www.bilibili.com/video/BV1xxx")
        assert result.platform == "bilibili"
        assert "ASR" in result.text
        assert result.metadata["subtitle_source"] == "asr"


# ── AC-5: 工具缺失时明确提示 ────────────────────────────────────

class TestAC5_ToolMissing:
    def test_ytdlp_not_installed(self):
        extractor = YouTubeExtractor()
        with patch.object(extractor, "check_executable", return_value=False):
            with pytest.raises(LinkExtractionError) as exc_info:
                extractor.extract("https://www.youtube.com/watch?v=abc123")
            assert exc_info.value.reason == "blocked"
            assert "yt-dlp" in exc_info.value.hint

    def test_bbdown_not_installed_falls_back_to_ytdlp(self):
        """BBDown 未安装时，yt-dlp 仍可工作。"""
        extractor = BilibiliExtractor()
        fake_srt = "1\n00:00:01,000 --> 00:00:04,000\nB站字幕内容非常丰富\n\n2\n00:00:05,000 --> 00:00:08,000\n这是一个测试"

        # BBDown not installed → skip to yt-dlp → find SRT → success
        # check_executable: BBDown(False), yt-dlp(True), yt-dlp again(True)
        # run_subprocess: yt-dlp --write-subs(None), yt-dlp --print title(None)
        with patch.object(extractor, "check_executable", side_effect=[False, True, True]), \
             patch.object(extractor, "run_subprocess", side_effect=[None, None]), \
             patch("builtins.open", MagicMock()), \
             patch("pathlib.Path.glob", return_value=[Path("/tmp/test.srt")]), \
             patch("pathlib.Path.read_text", return_value=fake_srt):
            result = extractor.extract("https://www.bilibili.com/video/BV1xxx")
        assert result.platform == "bilibili"
        assert "B站字幕内容" in result.text


# ── AC-6: 注册表优先级 ──────────────────────────────────────────

class TestAC6_RegistryPriority:
    def test_youtube_url_hits_youtube_first(self):
        url = "https://www.youtube.com/watch?v=abc123"
        first = next(e for e in EXTRACTORS if e.can_handle(url))
        assert isinstance(first, YouTubeExtractor)

    def test_bilibili_url_hits_bilibili_first(self):
        url = "https://www.bilibili.com/video/BV1xxx"
        first = next(e for e in EXTRACTORS if e.can_handle(url))
        assert isinstance(first, BilibiliExtractor)

    def test_web_url_hits_web_fallback(self):
        url = "https://example.com/article"
        first = next(e for e in EXTRACTORS if e.can_handle(url))
        assert isinstance(first, WebExtractor)
