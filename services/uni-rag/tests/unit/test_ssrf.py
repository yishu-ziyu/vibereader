"""SSRF 防护行为验证。"""
import pytest
from unittest.mock import patch
from uni_rag.api.routes import _is_safe_url


class TestSSRFProtection:
    def test_blocks_loopback_127(self):
        """127.0.0.1 是 loopback，必须被拦截。"""
        assert _is_safe_url("http://127.0.0.1/admin") is False

    def test_blocks_localhost(self):
        """localhost 解析到 loopback，必须被拦截。"""
        assert _is_safe_url("http://localhost/admin") is False

    def test_blocks_private_10(self):
        """10.0.0.0/8 是 RFC1918 私有地址，必须被拦截。"""
        with patch("socket.getaddrinfo", return_value=[(2, 1, 6, '', ('10.0.0.1', 0))]):
            assert _is_safe_url("http://internal.corp/admin") is False

    def test_blocks_private_192(self):
        """192.168.0.0/16 是 RFC1918 私有地址，必须被拦截。"""
        with patch("socket.getaddrinfo", return_value=[(2, 1, 6, '', ('192.168.1.1', 0))]):
            assert _is_safe_url("http://router.local/admin") is False

    def test_blocks_link_local(self):
        """169.254.0.0/16 是 link-local，必须被拦截。"""
        with patch("socket.getaddrinfo", return_value=[(2, 1, 6, '', ('169.254.169.254', 0))]):
            assert _is_safe_url("http://metadata.google/") is False

    def test_blocks_ipv6_loopback(self):
        """::1 是 IPv6 loopback，必须被拦截。"""
        assert _is_safe_url("http://[::1]/admin") is False

    def test_allows_public_domain(self):
        """公网域名应该放行。用 mock 避免 DNS 依赖。"""
        with patch("socket.getaddrinfo", return_value=[(2, 1, 6, '', ('93.184.216.34', 0))]):
            assert _is_safe_url("https://example.com/page") is True

    def test_allows_fakeip_range(self):
        """198.18.0.0/15 是 fake-ip 代理段，应该放行。"""
        with patch("socket.getaddrinfo", return_value=[(2, 1, 6, '', ('198.18.0.215', 0))]):
            assert _is_safe_url("https://example.com/page") is True

    def test_blocks_empty_hostname(self):
        """无 hostname 的 URL 应该被拦截。"""
        assert _is_safe_url("http:///path") is False

    def test_blocks_dns_failure(self):
        """DNS 解析失败应该被拦截（fail-closed）。"""
        import socket
        with patch("socket.getaddrinfo", side_effect=socket.gaierror("fail")):
            assert _is_safe_url("https://nonexistent.example/") is False
