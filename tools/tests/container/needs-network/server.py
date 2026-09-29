from http.server import HTTPServer, BaseHTTPRequestHandler
class H(BaseHTTPRequestHandler):
    def do_GET(self):
        ok = self.path == "/health"
        self.send_response(200 if ok else 404); self.end_headers()
        self.wfile.write(b"ok" if ok else b"not found")
HTTPServer(("0.0.0.0", 8080), H).serve_forever()
