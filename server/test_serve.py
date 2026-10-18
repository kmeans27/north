"""Tests for the static server. Standard library only:

    uv run python -m unittest discover -s server

A tiny fixture tree stands in for ``build/`` so the tests stay hermetic and do
not depend on a build having been run. Each test starts the real server on an
ephemeral port and speaks HTTP to it over a socket.
"""

from __future__ import annotations

import gzip
import http.client
import importlib.util
import os
import tempfile
import threading
import unittest
from functools import partial
from http.server import ThreadingHTTPServer

_HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("serve", os.path.join(_HERE, "serve.py"))
assert _spec and _spec.loader
serve = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(serve)


class QuietHandler(serve.Handler):
    def log_message(self, fmt: str, *args: object) -> None:  # noqa: D102
        pass


class ServerCase(unittest.TestCase):
    """A fixture site: two pages, one hashed asset, one font, one plain asset."""

    @classmethod
    def setUpClass(cls) -> None:
        cls._tmp = tempfile.TemporaryDirectory()
        root = cls._tmp.name
        files = {
            "index.html": "<!doctype html><title>today</title>\n<!-- %s -->" % ("filler " * 120),
            "week.html": "<!doctype html><title>week</title>",
            "trends.html": "<!doctype html><title>trends</title>",
            "_app/immutable/entry/start.ABC123.js": "console.log('x'.repeat(1200))",
            "fonts/inter-var-latin.woff2": "wOF2" + "0" * 40,
            "robots.txt": "User-agent: *\n",
        }
        for name, body in files.items():
            path = os.path.join(root, name)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w", encoding="utf-8") as handle:
                handle.write(body)

        cls._server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=root))
        cls._thread = threading.Thread(target=cls._server.serve_forever, daemon=True)
        cls._thread.start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls._server.shutdown()
        cls._server.server_close()
        cls._tmp.cleanup()

    def request(self, path: str, headers: dict[str, str] | None = None):
        conn = http.client.HTTPConnection("127.0.0.1", self._server.server_address[1], timeout=5)
        try:
            conn.request("GET", path, headers=headers or {})
            response = conn.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            conn.close()

    # ─── routing ──────────────────────────────────────────────────────────────

    def test_root_serves_the_today_page(self) -> None:
        status, headers, body = self.request("/")
        self.assertEqual(status, 200)
        self.assertEqual(headers["Content-Type"], "text/html")
        self.assertIn(b"today", body)

    def test_a_route_resolves_without_the_html_extension(self) -> None:
        for path in ("/week", "/week/", "/trends"):
            with self.subTest(path=path):
                status, headers, body = self.request(path)
                self.assertEqual(status, 200)
                self.assertEqual(headers["Content-Type"], "text/html")
                self.assertIn(b"<title>", body)

    def test_an_unknown_path_is_a_404(self) -> None:
        status, _, _ = self.request("/nope")
        self.assertEqual(status, 404)

    def test_healthz_is_plain_and_uncached(self) -> None:
        status, headers, body = self.request("/healthz")
        self.assertEqual(status, 200)
        self.assertEqual(body, b"ok")
        self.assertEqual(headers["Cache-Control"], "no-store")

    def test_a_hashed_asset_is_served_as_javascript(self) -> None:
        status, headers, body = self.request("/_app/immutable/entry/start.ABC123.js")
        self.assertEqual(status, 200)
        self.assertEqual(headers["Content-Type"], "text/javascript")
        self.assertIn(b"console.log", body)

    def test_the_font_gets_the_woff2_type(self) -> None:
        status, headers, _ = self.request("/fonts/inter-var-latin.woff2")
        self.assertEqual(status, 200)
        self.assertEqual(headers["Content-Type"], "font/woff2")

    # ─── caching ──────────────────────────────────────────────────────────────

    def test_html_revalidates_and_hashed_assets_are_immutable(self) -> None:
        for path in ("/", "/week", "/trends"):
            with self.subTest(path=path):
                _, headers, _ = self.request(path)
                self.assertEqual(headers["Cache-Control"], "no-cache")
        _, headers, _ = self.request("/_app/immutable/entry/start.ABC123.js")
        self.assertEqual(headers["Cache-Control"], "public, max-age=31536000, immutable")

    def test_cache_control_takes_the_resolved_file_not_the_request(self) -> None:
        # `/week` has no extension in the URL but is an HTML file on disk.
        self.assertEqual(serve.cache_control("/week", "/srv/build/week.html"), "no-cache")
        self.assertEqual(serve.cache_control("/x.css", "/srv/build/x.css"), "public, max-age=86400")
        self.assertEqual(
            serve.cache_control("/_app/immutable/a.js", "/srv/build/_app/immutable/a.js"),
            "public, max-age=31536000, immutable",
        )

    # ─── compression ──────────────────────────────────────────────────────────

    def test_a_large_text_response_is_gzipped(self) -> None:
        status, headers, body = self.request("/", headers={"Accept-Encoding": "gzip"})
        self.assertEqual(status, 200)
        self.assertEqual(headers.get("Content-Encoding"), "gzip")
        self.assertEqual(headers.get("Vary"), "Accept-Encoding")
        self.assertLess(len(body), 200)
        self.assertEqual(int(headers["Content-Length"]), len(body))
        self.assertIn(b"today", gzip.decompress(body))

    def test_a_client_that_cannot_gzip_gets_plain_bytes(self) -> None:
        _, headers, body = self.request("/")
        self.assertNotIn("Content-Encoding", headers)
        self.assertIn(b"today", body)

    def test_an_already_compressed_font_is_never_gzipped(self) -> None:
        _, headers, _ = self.request("/fonts/inter-var-latin.woff2", headers={"Accept-Encoding": "gzip"})
        self.assertNotIn("Content-Encoding", headers)

    # ─── privacy headers ──────────────────────────────────────────────────────

    def test_responses_do_not_leak_a_referrer(self) -> None:
        _, headers, _ = self.request("/")
        self.assertEqual(headers["Referrer-Policy"], "no-referrer")
        self.assertEqual(headers["X-Content-Type-Options"], "nosniff")


if __name__ == "__main__":
    unittest.main()
