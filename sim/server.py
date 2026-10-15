#!/usr/bin/env python3
"""Serve app.html for every path (single-page app, like instagram.com). Port 8765."""
import http.server, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
PAGE = open(os.path.join(HERE, "app.html"), "rb").read()

class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(PAGE)
    def log_message(self, *a): pass

http.server.ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1]) if len(sys.argv) > 1 else 8765), H).serve_forever()
