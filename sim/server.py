#!/usr/bin/env python3
"""Serve app.html for every path (single-page app, like instagram.com). Port 8765."""
import http.server, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
PAGE = open(os.path.join(HERE, "app.html"), "rb").read()
CALL = open(os.path.join(HERE, "call.html"), "rb").read()  # the call page, under Instagram-style nonce-only scripts

class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        call = self.path.startswith(("/call/", "/groupcall/"))
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        # tt=1: the page also enforces Trusted Types (assigning script text throws without a policy)
        if call: self.send_header("Content-Security-Policy", "script-src 'nonce-t3st' 'self'" + ("; require-trusted-types-for 'script'" if "tt=1" in self.path else ""))
        self.end_headers()
        self.wfile.write(CALL if call else PAGE)
    def log_message(self, *a): pass

http.server.ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1]) if len(sys.argv) > 1 else 8765), H).serve_forever()
