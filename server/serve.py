# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""north — serve the built static site.

The app is a prerendered static bundle: ``build/index.html``, ``build/week.html``,
``build/trends.html`` plus ``build/_app`` and ``build/fonts``. A plain file server
is not enough, because a request for ``/week`` must resolve to ``week.html`` and
because the app has a performance budget that a stock handler misses (gzip, cache
headers, correct MIME types for ``.woff2`` and ``.webmanifest``).

Everything here is the standard library, so ``uv run`` needs no environment:

    uv run server/serve.py --port 8080

For a public site put a TLS reverse proxy (Caddy, nginx) in front of it; see the
README. Nothing in this server writes to disk, logs a request body, or sends a
request anywhere. It is a reader of ``build/`` and nothing else.
"""

from __future__ import annotations

import argparse
import gzip
import mimetypes
import os
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

# The registry of the app serves these; CPython's table does not always know them.
for _type, _ext in (
    ("text/javascript", ".js"),
    ("text/javascript", ".mjs"),
    ("text/css", ".css"),
    ("font/woff2", ".woff2"),
    ("font/woff", ".woff"),
    ("image/svg+xml", ".svg"),
    ("application/manifest+json", ".webmanifest"),
    ("application/json", ".json"),
):
    mimetypes.add_type(_type, _ext)

# Compressing these pays; compressing an image or a woff2 does not.
COMPRESSIBLE = (
    "text/",
    "application/javascript",
    "application/json",
    "application/manifest+json",
    "image/svg+xml",
)
# Below this, the gzip header costs more than the saving.
GZIP_FLOOR = 512

HTML_NAMES = ("index.html", "week.html", "trends.html")


def cache_control(request_path: str, file_path: str) -> str:
    """Hashed assets are immutable; HTML must revalidate; the rest is a day.

    The decision keys off the resolved file, because extension-less routes such
    as ``/week`` are served from ``week.html`` and must never be cached blind.
    """
    if request_path.startswith("/_app/immutable/"):
        return "public, max-age=31536000, immutable"
    if file_path.endswith(".html"):
        return "no-cache"
    return "public, max-age=86400"


class Handler(SimpleHTTPRequestHandler):
    server_version = "north"
    protocol_version = "HTTP/1.1"

    def translate_path(self, path: str) -> str:
        """Resolve ``/week`` to ``week.html``, and a directory to its index.

        CPython 3.11+ re-appends an explicit trailing slash (bpo-17324), so the
        result is stripped before ``.html`` is tried.
        """
        resolved = super().translate_path(path).rstrip(os.sep)
        if os.path.isdir(resolved):
            return os.path.join(resolved, "index.html")
        if not os.path.exists(resolved) and os.path.exists(resolved + ".html"):
            return resolved + ".html"
        return resolved

    def _compressible(self, ctype: str) -> bool:
        return any(ctype.startswith(prefix) for prefix in COMPRESSIBLE)

    def _decide_encoding(self, body: bytes, ctype: str) -> tuple[bytes, str]:
        accepted = self.headers.get("Accept-Encoding", "")
        if "gzip" not in accepted or len(body) < GZIP_FLOOR or not self._compressible(ctype):
            return body, ""
        packed = gzip.compress(body, compresslevel=6)
        return (packed, "gzip") if len(packed) < len(body) else (body, "")

    def _respond(self) -> None:
        request_path = self.path.split("?", 1)[0]
        if request_path == "/healthz":
            body = b"ok"
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)
            return

        file_path = self.translate_path(self.path)
        if not os.path.isfile(file_path):
            self.send_error(404, "Not found")
            return

        try:
            with open(file_path, "rb") as handle:
                body = handle.read()
        except OSError:
            self.send_error(404, "Not found")
            return

        ctype = self.guess_type(file_path)
        body, encoding = self._decide_encoding(body, ctype)

        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", cache_control(request_path, file_path))
        # The privacy model: no third-party requests, no referrer leaking out.
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Content-Type-Options", "nosniff")
        if encoding:
            self.send_header("Content-Encoding", encoding)
            self.send_header("Vary", "Accept-Encoding")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    do_GET = _respond
    do_HEAD = _respond

    def log_message(self, fmt: str, *args: object) -> None:
        sys.stderr.write("%s  %s\n" % (self.log_date_time_string(), fmt % args))


def main() -> int:
    parser = argparse.ArgumentParser(description="Serve the built north site.")
    parser.add_argument("--host", default="127.0.0.1", help="interface (0.0.0.0 for LAN)")
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument(
        "--root",
        default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "build"),
        help="the directory to serve (default: ../build)",
    )
    args = parser.parse_args()

    root = os.path.abspath(args.root)
    if not os.path.isdir(root):
        print(f"nothing to serve: {root} does not exist — run `npm run build`", file=sys.stderr)
        return 1
    missing = [name for name in HTML_NAMES if not os.path.exists(os.path.join(root, name))]
    if missing:
        print(f"warning: {root} has no {', '.join(missing)} — is the build complete?", file=sys.stderr)

    handler = partial(Handler, directory=root)
    with ThreadingHTTPServer((args.host, args.port), handler) as server:
        print(f"north on http://{args.host}:{args.port}  (root {root})")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nstopped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
