from __future__ import annotations

import argparse
import posixpath
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class SPARoutingHandler(SimpleHTTPRequestHandler):
    """Serve static files and fall back to index.html for SPA routes."""

    def send_head(self):
        path = self.translate_path(self.path)
        candidate = Path(path)

        if candidate.is_dir():
            for index_name in ("index.html", "index.htm"):
                index_path = candidate / index_name
                if index_path.exists():
                    self.path = posixpath.join(self.path.rstrip("/"), index_name)
                    return super().send_head()

        if candidate.exists():
            return super().send_head()

        request_path = self.path.split("?", 1)[0].split("#", 1)[0]
        # Keep normal 404 behavior for likely static assets (file extensions).
        if "." in Path(request_path).name:
            self.send_error(HTTPStatus.NOT_FOUND, "File not found")
            return None

        # For SPA routes, always return the entry document.
        self.path = "/index.html"
        return super().send_head()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run a local static server with SPA fallback to index.html"
    )
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind")
    parser.add_argument("--port", default=8000, type=int, help="Port to listen on")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    server = ThreadingHTTPServer((args.host, args.port), SPARoutingHandler)
    print(f"Serving SPA on http://{args.host}:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
