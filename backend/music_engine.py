import os
import shutil
import time
from concurrent.futures import ThreadPoolExecutor
import yt_dlp

class MusicEngine:
    """High-performance music search and direct audio stream extractor using yt-dlp."""
    def __init__(self):
        self.node_path = self._find_node()
        self.stream_cache = {}  # {track_id: {"url": str, "expires_at": float}}
        self.search_cache = {}  # {cache_key: {"results": list, "time": float}}

        # Base YDL options for ultra-fast flat search
        self.base_search_opts = {
            "quiet": True,
            "no_warnings": True,
            "extract_flat": True,
            "skip_download": True,
            "ignoreerrors": True,
        }

        # Playback extraction options
        self.playback_opts = {
            "quiet": True,
            "no_warnings": True,
            "format": "bestaudio[ext=m4a]/bestaudio/best",
            "noplaylist": True,
            "skip_download": True,
            "ignoreerrors": True,
        }
        if self.node_path:
            self.playback_opts["js_runtimes"] = {"node": {"path": self.node_path}}

    def _find_node(self):
        w = shutil.which("node")
        if w:
            return w
        candidates = [
            os.path.expanduser(r"~/.gemini/antigravity/bin/nodejs/node.exe"),
            r"C:\Program Files\nodejs\node.exe",
            r"C:\Program Files (x86)\nodejs\node.exe",
        ]
        for c in candidates:
            if os.path.exists(c):
                return c
        return None

    def _format_duration(self, seconds):
        if not seconds or seconds <= 0:
            return "--:--"
        try:
            sec = int(seconds)
            m, s = divmod(sec, 60)
            h, m = divmod(m, 60)
            if h > 0:
                return f"{h}:{m:02d}:{s:02d}"
            return f"{m}:{s:02d}"
        except Exception:
            return "--:--"

    def _extract_best_thumbnail(self, entry):
        thumbs = entry.get("thumbnails")
        if thumbs and isinstance(thumbs, list):
            for t in reversed(thumbs):
                url = t.get("url")
                if url:
                    return url
        return entry.get("thumbnail") or "assets/default_art.png"

    def search_soundcloud(self, query, limit=10):
        try:
            with yt_dlp.YoutubeDL(self.base_search_opts) as ydl:
                res = ydl.extract_info(f"scsearch{limit}:{query}", download=False)
                raw_entries = res.get("entries", []) if res else []
                clean = []
                for e in raw_entries:
                    if not e or not e.get("title"):
                        continue
                    track_id = f"sc_{e.get('id') or abs(hash(e.get('url', '')))}"
                    clean.append({
                        "id": track_id,
                        "title": e.get("title", "Unknown Title"),
                        "artist": e.get("uploader") or e.get("channel") or "SoundCloud Artist",
                        "duration": e.get("duration") or 0,
                        "duration_formatted": self._format_duration(e.get("duration")),
                        "thumbnail": self._extract_best_thumbnail(e),
                        "url": e.get("url") or e.get("webpage_url"),
                        "source": "soundcloud",
                    })
                return clean
        except Exception as e:
            print("SoundCloud search error:", e)
            return []

    def search_youtube(self, query, limit=10):
        try:
            opts = dict(self.base_search_opts)
            if self.node_path:
                opts["js_runtimes"] = {"node": {"path": self.node_path}}

            with yt_dlp.YoutubeDL(opts) as ydl:
                res = ydl.extract_info(f"ytsearch{limit}:{query}", download=False)
                raw_entries = res.get("entries", []) if res else []
                clean = []
                for e in raw_entries:
                    if not e or not e.get("title"):
                        continue
                    vid_id = e.get("id") or str(abs(hash(e.get("url", ""))))
                    track_url = e.get("url")
                    if not track_url or not track_url.startswith("http"):
                        track_url = f"https://www.youtube.com/watch?v={vid_id}"

                    clean.append({
                        "id": f"yt_{vid_id}",
                        "title": e.get("title", "Unknown Title"),
                        "artist": e.get("uploader") or e.get("channel") or "YouTube Creator",
                        "duration": e.get("duration") or 0,
                        "duration_formatted": self._format_duration(e.get("duration")),
                        "thumbnail": self._extract_best_thumbnail(e),
                        "url": track_url,
                        "source": "youtube",
                    })
                return clean
        except Exception as e:
            print("YouTube search error:", e)
            return []

    def search(self, query, source="all", limit=12):
        query = query.strip()
        if not query:
            return []

        cache_key = f"{source}:{query}:{limit}"
        now = time.time()
        if cache_key in self.search_cache:
            entry = self.search_cache[cache_key]
            if now - entry["time"] < 600:  # 10 min cache
                return entry["results"]

        results = []
        if source == "soundcloud":
            results = self.search_soundcloud(query, limit=limit)
        elif source == "youtube":
            results = self.search_youtube(query, limit=limit)
        else:
            # Parallel search across both SoundCloud and YouTube
            half = max(4, limit // 2)
            with ThreadPoolExecutor(max_workers=2) as ex:
                f_sc = ex.submit(self.search_soundcloud, query, half)
                f_yt = ex.submit(self.search_youtube, query, half)
                sc_res = f_sc.result()
                yt_res = f_yt.result()

            # Interleave results: 1 SC, 1 YT, 1 SC, 1 YT...
            max_len = max(len(sc_res), len(yt_res))
            for i in range(max_len):
                if i < len(sc_res):
                    results.append(sc_res[i])
                if i < len(yt_res):
                    results.append(yt_res[i])

        self.search_cache[cache_key] = {"results": results, "time": now}
        return results

    def get_stream_url(self, track_info):
        """Resolves direct streamable audio URL for the given track info."""
        if not track_info:
            return None

        track_id = track_info.get("id")
        target_url = track_info.get("url")

        # Check memory cache
        now = time.time()
        if track_id and track_id in self.stream_cache:
            cached = self.stream_cache[track_id]
            if cached["expires_at"] > now:
                return cached["stream_url"]

        if not target_url:
            return None

        try:
            with yt_dlp.YoutubeDL(self.playback_opts) as ydl:
                info = ydl.extract_info(target_url, download=False)
                if not info:
                    return None

                stream_url = info.get("url")

                # If url not directly at top level, check formats
                if not stream_url and "formats" in info:
                    # Prefer audio-only formats (m4a, webm/opus)
                    audio_formats = [
                        f for f in info["formats"]
                        if f.get("vcodec") == "none" and f.get("url")
                    ]
                    if audio_formats:
                        # Sort by audio bitrate
                        audio_formats.sort(key=lambda x: x.get("abr") or 0, reverse=True)
                        stream_url = audio_formats[0]["url"]
                    elif info["formats"]:
                        stream_url = info["formats"][-1].get("url")

                if stream_url:
                    # Cache stream URL for 2 hours
                    if track_id:
                        self.stream_cache[track_id] = {
                            "stream_url": stream_url,
                            "expires_at": now + 7200
                        }
                    return stream_url

        except Exception as e:
            print("Error resolving stream URL for", target_url, e)

        return None
