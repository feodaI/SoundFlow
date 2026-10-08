import json
import os
import time
import uuid

class LibraryManager:
    """Manages favorites, custom playlists, and playback history saved in data/library.json."""
    def __init__(self, data_path=None):
        if data_path:
            self.data_path = data_path
            self.base_dir = os.path.dirname(data_path)
        else:
            appdata = os.environ.get("APPDATA")
            if appdata:
                self.base_dir = os.path.join(appdata, "SoundFlow")
            else:
                self.base_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
            os.makedirs(self.base_dir, exist_ok=True)
            self.data_path = os.path.join(self.base_dir, "library.json")
        self.current_user_id = None
        self._ensure_dir()
        self.data = self._load()

    def set_user(self, user_id=None):
        """Switches library to a specific user's file or back to guest."""
        self.current_user_id = user_id
        if user_id:
            safe_id = "".join(c for c in str(user_id) if c.isalnum() or c in ("-", "_"))
            self.data_path = os.path.join(self.base_dir, f"library_{safe_id}.json")
        else:
            self.data_path = os.path.join(self.base_dir, "library.json")
        self._ensure_dir()
        self.data = self._load()
        return self.data

    def _ensure_dir(self):
        folder = os.path.dirname(self.data_path)
        if folder and not os.path.exists(folder):
            os.makedirs(folder, exist_ok=True)

    def _load(self):
        if os.path.exists(self.data_path):
            try:
                with open(self.data_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return {
            "liked_tracks": [],
            "playlists": {
                "favorites": {
                    "id": "favorites",
                    "name": "Улюблені треки",
                    "created_at": time.time(),
                    "tracks": []
                }
            },
            "history": [],
            "settings": {
                "volume": 0.8,
                "repeat": "off", # off, all, one
                "shuffle": False,
                "preferred_source": "all"
            }
        }

    def _save(self):
        try:
            self._ensure_dir()
            tmp_path = self.data_path + ".tmp"
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(self.data, f, ensure_ascii=False, indent=2)
            os.replace(tmp_path, self.data_path)
            return True
        except Exception as e:
            print("Error saving library:", e)
            return False

    def get_all(self):
        return self.data

    def toggle_like(self, track):
        if not track or not track.get("id"):
            return False, self.data["liked_tracks"]
        
        track_id = track["id"]
        liked = self.data.setdefault("liked_tracks", [])
        existing_idx = next((i for i, t in enumerate(liked) if t.get("id") == track_id), -1)

        is_liked = False
        if existing_idx >= 0:
            liked.pop(existing_idx)
            is_liked = False
        else:
            liked.insert(0, track)
            is_liked = True

        self._save()
        return is_liked, liked

    def is_liked(self, track_id):
        liked = self.data.get("liked_tracks", [])
        return any(t.get("id") == track_id for t in liked)

    def create_playlist(self, name):
        if not name or not name.strip():
            name = "Новий плейлист"
        name = name.strip()
        pl_id = "pl_" + str(uuid.uuid4())[:8]
        self.data.setdefault("playlists", {})[pl_id] = {
            "id": pl_id,
            "name": name,
            "created_at": time.time(),
            "tracks": []
        }
        self._save()
        return self.data["playlists"][pl_id]

    def delete_playlist(self, pl_id):
        if pl_id in self.data.get("playlists", {}):
            del self.data["playlists"][pl_id]
            self._save()
            return True
        return False

    def rename_playlist(self, pl_id, new_name):
        if pl_id in self.data.get("playlists", {}) and new_name.strip():
            self.data["playlists"][pl_id]["name"] = new_name.strip()
            self._save()
            return True
        return False

    def add_to_playlist(self, pl_id, track):
        playlists = self.data.setdefault("playlists", {})
        if pl_id in playlists and track and track.get("id"):
            tracks = playlists[pl_id].setdefault("tracks", [])
            # avoid immediate duplicate
            if not any(t.get("id") == track["id"] for t in tracks):
                tracks.append(track)
                self._save()
                return True
        return False

    def remove_from_playlist(self, pl_id, track_id):
        playlists = self.data.setdefault("playlists", {})
        if pl_id in playlists:
            tracks = playlists[pl_id].get("tracks", [])
            initial_len = len(tracks)
            playlists[pl_id]["tracks"] = [t for t in tracks if t.get("id") != track_id]
            if len(playlists[pl_id]["tracks"]) != initial_len:
                self._save()
                return True
        return False

    def add_history(self, track):
        if not track or not track.get("id"):
            return
        history = self.data.setdefault("history", [])
        # Remove previous occurrence to bring to top
        history = [t for t in history if t.get("id") != track["id"]]
        track_with_time = dict(track)
        track_with_time["played_at"] = time.time()
        history.insert(0, track_with_time)
        # Keep last 100
        self.data["history"] = history[:100]
        self._save()

    def clear_history(self):
        self.data["history"] = []
        self._save()
        return True

    def update_settings(self, new_settings):
        if isinstance(new_settings, dict):
            self.data.setdefault("settings", {}).update(new_settings)
            self._save()
            return True
        return False

    def get_profile(self):
        default_profile = {
            "name": "FEODAL",
            "role": "admin",
            "banner_preset": "beige",
            "banner_url": "",
            "avatar_url": "",
            "followers": 1420,
            "following": 2,
            "hq_audio": True,
            "bass_boost": True,
            "bass_level": 6
        }
        profile = self.data.setdefault("profile", default_profile)
        for k, v in default_profile.items():
            profile.setdefault(k, v)
        return profile

    def update_profile(self, profile_data):
        if isinstance(profile_data, dict):
            prof = self.get_profile()
            prof.update(profile_data)
            self._save()
            return prof
        return self.get_profile()

    def clear_cache(self):
        import shutil
        cache_dir = os.path.join(self.base_dir, "cache")
        if os.path.exists(cache_dir):
            shutil.rmtree(cache_dir, ignore_errors=True)
        return True

    def export_library(self):
        return json.dumps(self.data, ensure_ascii=False, indent=2)

    def import_library(self, json_str):
        try:
            new_data = json.loads(json_str)
            if isinstance(new_data, dict) and "liked_tracks" in new_data:
                self.data = new_data
                self._save()
                return True
        except Exception:
            pass
        return False
