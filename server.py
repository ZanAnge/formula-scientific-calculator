"""Loopback-only static app and isolated, time-limited SymPy endpoint."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, unquote
import json
import os
import subprocess
import sys
import threading

ROOT = Path(__file__).resolve().parent
PORT = int(os.environ.get('PORT', '4173'))
JOBS = threading.BoundedSemaphore(2)
STATIC = {'index.html', 'style.css', 'engine.js', 'app.js', 'solver.html', 'solver.css', 'solver.js', 'browser-solver.js', 'symbolic-worker.mjs'}


class Handler(SimpleHTTPRequestHandler):
    extensions_map = dict(SimpleHTTPRequestHandler.extensions_map, **{'.mjs': 'text/javascript', '.wasm': 'application/wasm'})
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def json_response(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = unquote(urlsplit(self.path).path).lstrip('/') or 'index.html'
        if path == 'api/health':
            self.json_response(200, {'ok': True, 'engine': 'SymPy', 'local': True})
            return
        target = (ROOT / path).resolve()
        vendor = path.startswith(('vendor/katex/', 'vendor/pyodide/')) and target.suffix in {'.js', '.mjs', '.wasm', '.zip', '.json', '.css', '.woff2', '.woff', '.ttf'}
        vendor = vendor or path == 'vendor/symbolic-python.zip'
        if not target.is_relative_to(ROOT) or not target.is_file() or not (path in STATIC or vendor):
            self.send_error(404)
            return
        super().do_GET()

    def do_POST(self):
        if urlsplit(self.path).path != '/api/solve':
            self.json_response(404, {'ok': False, 'error': '接口不存在。'})
            return
        expected_hosts = {f'127.0.0.1:{PORT}', f'localhost:{PORT}'}
        origin = self.headers.get('Origin')
        if self.headers.get('Host') not in expected_hosts or (origin and origin not in {'http://' + host for host in expected_hosts}):
            self.json_response(403, {'ok': False, 'error': '仅允许本机页面调用求解服务。'})
            return
        if not self.headers.get('Content-Type', '').startswith('application/json'):
            self.json_response(415, {'ok': False, 'error': '请求必须为JSON。'})
            return
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 4096:
                raise ValueError()
            self.connection.settimeout(5)
            request = json.loads(self.rfile.read(size))
            if not isinstance(request, dict) or not isinstance(request.get('expression'), str):
                raise ValueError()
        except (ValueError, OSError):
            self.json_response(400, {'ok': False, 'error': '请求格式有误或输入过长。'})
            return
        if not JOBS.acquire(blocking=False):
            self.json_response(429, {'ok': False, 'error': '当前已有求解任务，请稍后重试。'})
            return
        try:
            env = dict(os.environ, PYTHONIOENCODING='utf-8', PYTHONUTF8='1')
            worker = subprocess.run([sys.executable, str(ROOT / 'symbolic_solver.py')], input=json.dumps(request), capture_output=True, encoding='utf-8', cwd=ROOT, env=env, timeout=20)
            if worker.returncode != 0:
                raise ValueError('worker failed')
            result = json.loads(worker.stdout)
            self.json_response(200 if result.get('ok') else 422, result)
        except subprocess.TimeoutExpired:
            self.json_response(408, {'ok': False, 'error': '求解超过20秒，任务已终止。该表达式超出当前可用计算范围，请简化。'})
        except (ValueError, OSError):
            self.json_response(500, {'ok': False, 'error': '符号服务未能完成任务，请检查Python及SymPy安装。'})
        finally:
            JOBS.release()


if __name__ == '__main__':
    try:
        import sympy
    except ImportError:
        sys.exit('Missing SymPy. Run: python -m pip install -r requirements.txt')
    server = ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    print(f'FORMULA + SymPy {sympy.__version__}: http://127.0.0.1:{PORT}/solver.html', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
