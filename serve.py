# 极简静态服务器（不缓存，改了代码刷新就能看到）：python3 serve.py [port]
import http.server, sys, os

class H(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.mjs': 'text/javascript'}
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()
    def log_message(self, *a):
        pass

os.chdir(os.path.dirname(os.path.abspath(__file__)))
port = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get('PORT', 5180))
print(f'宿舍 → http://localhost:{port}', flush=True)
http.server.ThreadingHTTPServer(('127.0.0.1', port), H).serve_forever()
