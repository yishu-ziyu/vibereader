"""Link extractors: platform-specific content extraction from URLs."""
from __future__ import annotations
import re
import shutil
import subprocess
import tempfile
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
import httpx
import trafilatura


@dataclass
class LinkExtractionResult:
    """标准化链接提取输出。"""
    text: str
    title: str
    source_url: str
    platform: str = "web"
    content_type: str = "article"
    metadata: dict[str, Any] = field(default_factory=dict)


class LinkExtractionError(Exception):
    """链接提取失败。"""
    def __init__(self, platform: str, reason: str, hint: str):
        self.platform = platform
        self.reason = reason
        self.hint = hint
        super().__init__(f"[{platform}] {reason}: {hint}")


class LinkExtractor(ABC):
    """平台内容提取器接口。"""

    @abstractmethod
    def can_handle(self, url: str) -> bool:
        """判断是否能处理该 URL。"""

    @abstractmethod
    def extract(self, url: str) -> LinkExtractionResult:
        """提取内容。同步阻塞，可能耗时。Raises LinkExtractionError on failure."""


class SubprocessExtractorMixin:
    """提供 subprocess 调用的通用方法。"""

    @staticmethod
    def check_executable(name: str) -> bool:
        """检测可执行文件是否在 PATH 中。"""
        return shutil.which(name) is not None

    @staticmethod
    def run_subprocess(cmd: list[str], timeout: int = 120) -> str:
        """运行子进程，返回 stdout。失败时抛出 LinkExtractionError。"""
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout,
                check=True,
            )
            return result.stdout.strip()
        except FileNotFoundError:
            raise LinkExtractionError(
                "unknown", "blocked",
                f"未找到可执行文件: {cmd[0]}。请先安装: https://github.com/yt-dlp/yt-dlp#installation",
            )
        except subprocess.TimeoutExpired:
            raise LinkExtractionError("unknown", "timeout", f"命令执行超时（{timeout}s）: {' '.join(cmd)}")
        except subprocess.CalledProcessError as e:
            raise LinkExtractionError(
                "unknown", "network",
                f"命令执行失败 (exit {e.returncode}): {e.stderr[:200]}",
            ) from e


def parse_srt(text: str) -> str:
    """将 SRT 字幕解析为纯文本，去除时间戳和行号。"""
    lines = text.split("\n")
    cleaned = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        if re.match(r"^\d+$", line):
            continue
        if "-->" in line:
            continue
        cleaned.append(line)
    return " ".join(cleaned)


def transcribe_audio(audio_path: Path, language: str = "zh") -> str:
    """用 faster-whisper 转写音频为文本。可选依赖。"""
    try:
        from faster_whisper import WhisperModel
    except ImportError as e:
        raise LinkExtractionError(
            "unknown", "blocked",
            "未安装 faster-whisper，无法转写音频。请运行: pip install faster-whisper",
        ) from e

    model = WhisperModel("base", device="cpu", compute_type="int8")
    segments, info = model.transcribe(str(audio_path), language=language)
    return " ".join(seg.text for seg in segments)


class WebExtractor(LinkExtractor):
    """通用网页正文提取（Trafilatura）。兜底 extractor，接受所有 http/https URL。"""

    TIMEOUT = 15.0

    def can_handle(self, url: str) -> bool:
        return url.startswith(("http://", "https://"))

    def extract(self, url: str) -> LinkExtractionResult:
        try:
            downloaded = httpx.get(url, timeout=self.TIMEOUT)
        except Exception as e:
            raise LinkExtractionError("web", "network", f"网络请求失败: {e}") from e

        if not downloaded:
            raise LinkExtractionError("web", "network", "无法获取页面内容，请检查链接是否有效")

        try:
            text = trafilatura.extract(
                downloaded,
                include_links=False,
                include_images=False,
                target_language="zh",
                no_fallback=False,
            )
        except Exception as e:
            raise LinkExtractionError("web", "network", f"内容解析失败: {e}") from e

        if not text or len(text.strip()) < 20:
            raise LinkExtractionError("web", "no_content", "页面未提取到有效正文内容")

        return LinkExtractionResult(
            text=text,
            title=url,
            source_url=url,
            platform="web",
            content_type="article",
            metadata={},
        )


class YouTubeExtractor(LinkExtractor, SubprocessExtractorMixin):
    """YouTube 字幕提取器。yt-dlp CLI + faster-whisper ASR 兜底。"""

    def can_handle(self, url: str) -> bool:
        return "youtube.com" in url or "youtu.be" in url

    def extract(self, url: str) -> LinkExtractionResult:
        if not self.check_executable("yt-dlp"):
            raise LinkExtractionError(
                "youtube", "blocked",
                "请先安装 yt-dlp: brew install yt-dlp 或 pip install yt-dlp",
            )

        # 获取视频标题
        try:
            title = self.run_subprocess(["yt-dlp", "--print", "%(title)s", url])
        except LinkExtractionError:
            title = url

        # 尝试提取字幕
        with tempfile.TemporaryDirectory() as tmpdir:
            try:
                self.run_subprocess([
                    "yt-dlp",
                    "--write-subs", "--write-auto-subs",
                    "--sub-format", "srt",
                    "--skip-download",
                    "-o", f"{tmpdir}/%(title)s.%(ext)s",
                    url,
                ])
            except LinkExtractionError:
                pass  # 无字幕，继续尝试 ASR

            # 查找生成的 SRT 文件
            srt_files = list(Path(tmpdir).glob("*.srt"))
            subtitle_source = "manual"

            if srt_files:
                srt_text = srt_files[0].read_text(encoding="utf-8", errors="ignore")
                text = parse_srt(srt_text)
            else:
                # 无字幕 → 下载音频 → ASR
                subtitle_source = "asr"
                try:
                    self.run_subprocess([
                        "yt-dlp",
                        "-x", "--audio-format", "mp3",
                        "--audio-quality", "0",
                        "-o", f"{tmpdir}/audio.%(ext)s",
                        url,
                    ])
                except LinkExtractionError as e:
                    raise LinkExtractionError(
                        "youtube", "no_content",
                        "该视频没有字幕，且无法提取音频，请尝试其他视频",
                    ) from e

                audio_files = list(Path(tmpdir).glob("audio.*"))
                if not audio_files:
                    raise LinkExtractionError(
                        "youtube", "no_content",
                        "该视频没有字幕，且无法提取音频，请尝试其他视频",
                    )

                try:
                    text = transcribe_audio(audio_files[0], language="zh")
                except LinkExtractionError:
                    raise
                except Exception as e:
                    raise LinkExtractionError(
                        "youtube", "network",
                        f"音频转写失败: {e}",
                    ) from e

        if not text or len(text.strip()) < 10:
            raise LinkExtractionError("youtube", "no_content", "视频未提取到有效字幕内容")

        return LinkExtractionResult(
            text=text,
            title=title,
            source_url=url,
            platform="youtube",
            content_type="video_subtitle",
            metadata={
                "subtitle_source": subtitle_source,
                "duration_seconds": 0,  # yt-dlp 可获取，MVP 简化
            },
        )


class BilibiliExtractor(LinkExtractor, SubprocessExtractorMixin):
    """B站视频提取器（三层降级：BBDown → yt-dlp → ASR）。"""

    def can_handle(self, url: str) -> bool:
        return "bilibili.com" in url or "b23.tv" in url

    def extract(self, url: str) -> LinkExtractionResult:
        with tempfile.TemporaryDirectory() as tmpdir:
            title = url
            text = ""
            subtitle_source = "manual"

            # 第一层：BBDown
            if self.check_executable("BBDown"):
                try:
                    title = self.run_subprocess(
                        ["BBDown", "--sub-only", url],
                        timeout=180,
                    )
                    # BBDown 输出字幕到当前目录，查找 .srt 文件
                    srt_files = list(Path(tmpdir).glob("**/*.srt"))
                    if srt_files:
                        srt_text = srt_files[0].read_text(encoding="utf-8", errors="ignore")
                        text = parse_srt(srt_text)
                except LinkExtractionError:
                    pass  # 继续下一层

            # 第二层：yt-dlp
            if not text and self.check_executable("yt-dlp"):
                try:
                    self.run_subprocess([
                        "yt-dlp",
                        "--write-subs", "--sub-format", "srt",
                        "--skip-download",
                        "-o", f"{tmpdir}/%(title)s.%(ext)s",
                        url,
                    ])
                    srt_files = list(Path(tmpdir).glob("*.srt"))
                    if srt_files:
                        srt_text = srt_files[0].read_text(encoding="utf-8", errors="ignore")
                        text = parse_srt(srt_text)
                        subtitle_source = "auto"
                        if not title or title == url:
                            title = self.run_subprocess(["yt-dlp", "--print", "%(title)s", url])
                except LinkExtractionError:
                    pass

            # 第三层：ASR
            if not text:
                subtitle_source = "asr"
                try:
                    self.run_subprocess([
                        "yt-dlp",
                        "-x", "--audio-format", "mp3",
                        "-o", f"{tmpdir}/audio.%(ext)s",
                        url,
                    ])
                except LinkExtractionError as e:
                    raise LinkExtractionError(
                        "bilibili", "no_content",
                        "该视频没有字幕，且无法提取音频，请尝试其他视频",
                    ) from e

                audio_files = list(Path(tmpdir).glob("audio.*"))
                if not audio_files:
                    raise LinkExtractionError(
                        "bilibili", "no_content",
                        "该视频没有字幕，且无法提取音频，请尝试其他视频",
                    )

                try:
                    text = transcribe_audio(audio_files[0], language="zh")
                except LinkExtractionError:
                    raise
                except Exception as e:
                    raise LinkExtractionError(
                        "bilibili", "network",
                        f"音频转写失败: {e}",
                    ) from e

        if not text or len(text.strip()) < 10:
            raise LinkExtractionError("bilibili", "no_content", "视频未提取到有效字幕内容")

        return LinkExtractionResult(
            text=text,
            title=title,
            source_url=url,
            platform="bilibili",
            content_type="video_subtitle",
            metadata={
                "subtitle_source": subtitle_source,
                "duration_seconds": 0,
            },
        )


# 全局注册表，按优先级排列
EXTRACTORS: list[LinkExtractor] = [
    YouTubeExtractor(),     # P8
    BilibiliExtractor(),    # P9
    WebExtractor(),         # 兜底
]


def extract(url: str) -> LinkExtractionResult:
    """遍历注册表，找到第一个能处理该 URL 的 extractor 并执行。"""
    for extractor in EXTRACTORS:
        if extractor.can_handle(url):
            return extractor.extract(url)
    raise LinkExtractionError("unknown", "unsupported", "暂不支持该链接类型，请尝试上传文件或使用其他链接")
