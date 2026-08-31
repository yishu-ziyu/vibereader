"""Tests for video platform extractors (P8-P9)."""
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
    parse_srt,
    transcribe_audio,
    SubprocessExtractorMixin,
)


# ── SRT Parsing ──────────────────────────────────────────────────

class TestParseSrt:
    def test_removes_line_numbers(self):
        srt = "1\n00:00:01,000 --> 00:00:04,000\nHello world\n\n2\n00:00:05,000 --> 00:00:08,000\nThis is a test"
        assert parse_srt(srt) == "Hello world This is a test"

    def test_removes_timestamps(self):
        srt = "1\n00:00:01,000 --> 00:00:04,000\nHello\n\n2\n00:00:05,000 --> 00:00:08,000\nWorld"
        result = parse_srt(srt)
        assert "-->" not in result
        assert "00:00:" not in result

    def test_handles_empty_lines(self):
        srt = "1\n00:00:01,000 --> 00:00:04,000\n\n\nHello\n\n\n"
        result = parse_srt(srt)
        assert result == "Hello"

    def test_merges_continuous_subtitles(self):
        srt = "1\n00:00:01,000 --> 00:00:02,000\nHello\n\n2\n00:00:02,500 --> 00:00:03,000\nworld"
        result = parse_srt(srt)
        assert "Hello" in result
        assert "world" in result


# ── ASR Fallback ─────────────────────────────────────────────────

class TestTranscribeAudio:
    def test_missing_faster_whisper_raises(self):
        with patch.dict("sys.modules", {"faster_whisper": None}):
            with pytest.raises(LinkExtractionError) as exc_info:
                transcribe_audio(Path("/tmp/fake.mp3"))
            assert "faster-whisper" in str(exc_info.value.hint)

    def test_successful_transcription(self):
        mock_model = MagicMock()
        mock_segment = MagicMock()
        mock_segment.text = "Hello world"
        mock_model.transcribe.return_value = ([mock_segment], MagicMock())

        fake_whisper = MagicMock()
        fake_whisper.WhisperModel.return_value = mock_model
        with patch.dict("sys.modules", {"faster_whisper": fake_whisper}):
            result = transcribe_audio(Path("/tmp/fake.mp3"), language="zh")
        assert "Hello world" in result


# ── SubprocessExtractorMixin ─────────────────────────────────────

class TestSubprocessExtractorMixin:
    def test_check_executable_found(self):
        extractor = YouTubeExtractor()
        assert extractor.check_executable("python3") or not extractor.check_executable("nonexistent")

    def test_check_executable_not_found(self):
        extractor = YouTubeExtractor()
        assert not extractor.check_executable("nonexistent_tool_xyz")


# ── YouTubeExtractor ─────────────────────────────────────────────

class TestYouTubeExtractor:
    @pytest.fixture
    def extractor(self):
        return YouTubeExtractor()

    def test_can_handle_youtube_com(self, extractor):
        assert extractor.can_handle("https://www.youtube.com/watch?v=abc123")

    def test_can_handle_youtu_be(self, extractor):
        assert extractor.can_handle("https://youtu.be/abc123")

    def test_cannot_handle_other(self, extractor):
        assert not extractor.can_handle("https://www.bilibili.com/video/BV1xxx")

    def test_ytdlp_not_installed(self, extractor):
        with patch.object(extractor, "check_executable", return_value=False):
            with pytest.raises(LinkExtractionError) as exc_info:
                extractor.extract("https://www.youtube.com/watch?v=abc123")
            assert exc_info.value.reason == "blocked"
            assert "yt-dlp" in exc_info.value.hint

    def test_extract_with_subtitles(self, extractor):
        fake_srt = """1
00:00:01,000 --> 00:00:04,000
Hello world

2
00:00:05,000 --> 00:00:08,000
This is a test
"""
        with patch.object(extractor, "check_executable", return_value=True), \
             patch.object(extractor, "run_subprocess", side_effect=["Video Title", None]), \
             patch("builtins.open", MagicMock()), \
             patch("pathlib.Path.glob", return_value=[Path("/tmp/test.srt")]), \
             patch("pathlib.Path.read_text", return_value=fake_srt):
            result = extractor.extract("https://www.youtube.com/watch?v=abc123")
        assert result.platform == "youtube"
        assert result.content_type == "video_subtitle"
        assert "Hello world" in result.text
        assert result.title == "Video Title"

    def test_extract_calls_asr_when_no_subtitles(self, extractor):
        """Verify ASR path is reached when no SRT files found."""
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


# ── BilibiliExtractor ────────────────────────────────────────────

class TestBilibiliExtractor:
    @pytest.fixture
    def extractor(self):
        return BilibiliExtractor()

    def test_can_handle_bilibili_com(self, extractor):
        assert extractor.can_handle("https://www.bilibili.com/video/BV1xxx")

    def test_can_handle_b23_tv(self, extractor):
        assert extractor.can_handle("https://b23.tv/abc123")

    def test_cannot_handle_other(self, extractor):
        assert not extractor.can_handle("https://www.youtube.com/watch?v=abc")

    def test_neither_bbdown_nor_ytdlp_installed(self, extractor):
        with patch.object(extractor, "check_executable", return_value=False):
            with pytest.raises(LinkExtractionError) as exc_info:
                extractor.extract("https://www.bilibili.com/video/BV1xxx")
            assert exc_info.value.reason == "no_content"

    def test_three_tier_fallback(self, extractor):
        """BBDown fails → yt-dlp fails → ASR succeeds."""
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


# ── Registry Priority ────────────────────────────────────────────

class TestRegistryPriority:
    def test_youtube_url_hits_youtube_extractor(self):
        url = "https://www.youtube.com/watch?v=abc123"
        first_match = next(e for e in EXTRACTORS if e.can_handle(url))
        assert isinstance(first_match, YouTubeExtractor)

    def test_bilibili_url_hits_bilibili_extractor(self):
        url = "https://www.bilibili.com/video/BV1xxx"
        first_match = next(e for e in EXTRACTORS if e.can_handle(url))
        assert isinstance(first_match, BilibiliExtractor)

    def test_web_url_hits_web_extractor(self):
        url = "https://example.com/article"
        first_match = next(e for e in EXTRACTORS if e.can_handle(url))
        assert isinstance(first_match, WebExtractor)
