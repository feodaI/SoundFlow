import os
import sys
import json
import threading
import bottle
import webview
import webview.http
from webview.util import abspath, is_app, is_local_url
from backend.api import AppApi

# Chromium & WebView2 memory and CPU optimization flags
os.environ["WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS"] = (
    "--disable-features=Translate,OptimizationHints,MediaRouter "
    "--renderer-process-limit=1 "
    "--js-flags=--max-old-space-size=64 "
    "--disable-gpu-shader-disk-cache "
    "--disable-domain-reliability "
    "--disable-component-update "
    "--disable-background-networking"
)

def _patch_pywebview_http():
    """
    Fixes pywebview internal bottle server bug where requesting '/'
    (e.g. Clerk OAuth callback /?__clerk_db_jwt=...) throws 500 Internal Server Error
    due to asset() handler missing the default 'file' parameter.
    """
    orig_cls = webview.http.BottleServer

    @classmethod
    def patched_start_server(cls, urls, http_port, keyfile=None, certfile=None):
        from webview import _state
        apps = [u for u in urls if is_app(u)]
        server = cls()

        if len(apps) > 0:
            app = apps[0]
            common_path = '.'
        else:
            local_urls = [u.split('#')[0] for u in urls if is_local_url(u)]
            common_path = os.path.commonpath(local_urls) if len(local_urls) > 0 else None
            if common_path is not None and not os.path.isdir(abspath(common_path)):
                common_path = os.path.dirname(common_path)
            server.root_path = abspath(common_path) if common_path is not None else None
            app = bottle.Bottle()

            @app.post(f'/js_api/{server.uid}')
            def js_api():
                bottle.response.headers['Access-Control-Allow-Origin'] = '*'
                bottle.response.headers['Access-Control-Allow-Methods'] = 'PUT, GET, POST, DELETE, OPTIONS'
                bottle.response.headers['Access-Control-Allow-Headers'] = 'Origin, Accept, Content-Type, X-Requested-With, X-CSRF-Token'
                body = json.loads(bottle.request.body.read().decode('utf-8'))
                if body['uid'] in server.js_callback:
                    return json.dumps(server.js_callback[body['uid']](body))

            @app.route('/')
            @app.route('/<file:path>')
            def asset(file='index.html'):
                if not server.root_path:
                    return ''
                if not file:
                    file = 'index.html'
                bottle.response.set_header('Cache-Control', 'no-cache, no-store, must-revalidate')
                bottle.response.set_header('Pragma', 'no-cache')
                bottle.response.set_header('Expires', 0)
                return bottle.static_file(file, root=server.root_path)

        server.root_path = abspath(common_path) if common_path is not None else None
        server.port = http_port or webview.http._get_random_port()
        server_adapter = webview.http.ThreadedAdapter
        server.thread = threading.Thread(
            target=lambda: bottle.run(app=app, server=server_adapter, port=server.port, quiet=not _state['debug']),
            daemon=True
        )
        server.thread.start()

        server.running = True
        server.address = f'http://127.0.0.1:{server.port}/'
        cls.common_path = common_path
        server.js_api_endpoint = f'{server.address}js_api/{server.uid}'
        return server.address, common_path, server

    orig_cls.start_server = patched_start_server

_patch_pywebview_http()

def run_app():
    # Base directory (supports both script and frozen exe)
    if getattr(sys, "frozen", False):
        base_dir = getattr(sys, "_MEIPASS", os.path.dirname(sys.executable))
    else:
        base_dir = os.path.dirname(os.path.abspath(__file__))
    html_file = os.path.join(base_dir, "frontend", "index.html")

    # Persistent storage directory for WebView2 (preserves Clerk auth session & cookies)
    appdata = os.environ.get("APPDATA") or os.path.expanduser("~")
    storage_dir = os.path.join(appdata, "SoundFlow", "WebView2Profile")
    os.makedirs(storage_dir, exist_ok=True)

    api = AppApi()

    # Window creation
    window = webview.create_window(
        title="SoundFlow",
        url=html_file,
        js_api=api,
        width=1240,
        height=820,
        min_size=(940, 640),
        background_color="#0e1117",
        text_select=False,
    )

    # Start pywebview with internal lightweight HTTP server & persistent profile
    webview.start(
        private_mode=False,
        storage_path=storage_dir,
        http_server=True,
        debug=False
    )

if __name__ == "__main__":
    run_app()
