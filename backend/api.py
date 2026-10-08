import threading
from backend.music_engine import MusicEngine
from backend.library import LibraryManager
from backend.system_stats import SystemStats

class AppApi:
    """API bridge exposed to JavaScript in pywebview."""
    def __init__(self):
        self.engine = MusicEngine()
        self.library = LibraryManager()
        self.stats = SystemStats()

        # Popular genres for instant discovery
        self.genres_map = {
            "lofi": "lofi hip hop chill beats study relax",
            "synthwave": "synthwave retrowave electronic 80s",
            "phonk": "drift phonk aggressive bass workout",
            "deephouse": "deep house vocal chill summer mix",
            "rock": "classic rock modern rock hits",
            "gaming": "gaming music nocopyrightsounds edm",
            "ambient": "ambient relaxation meditation peaceful",
            "ua": "українська музика тренди хіти indie"
        }

    def search(self, query, source="all", limit=16):
        return self.engine.search(query, source=source, limit=limit)

    def get_discover_tracks(self, genre_key="lofi"):
        query = self.genres_map.get(genre_key, self.genres_map["lofi"])
        return self.engine.search(query, source="all", limit=16)

    def get_stream(self, track):
        return self.engine.get_stream_url(track)

    def get_library(self):
        return self.library.get_all()

    def set_user(self, user_id=None):
        return self.library.set_user(user_id)

    def toggle_like(self, track):
        is_liked, liked_list = self.library.toggle_like(track)
        return {"is_liked": is_liked, "liked_count": len(liked_list)}

    def is_liked(self, track_id):
        return self.library.is_liked(track_id)

    def create_playlist(self, name):
        return self.library.create_playlist(name)

    def delete_playlist(self, playlist_id):
        return self.library.delete_playlist(playlist_id)

    def rename_playlist(self, playlist_id, new_name):
        return self.library.rename_playlist(playlist_id, new_name)

    def add_to_playlist(self, playlist_id, track):
        return self.library.add_to_playlist(playlist_id, track)

    def remove_from_playlist(self, playlist_id, track_id):
        return self.library.remove_from_playlist(playlist_id, track_id)

    def record_history(self, track):
        self.library.add_history(track)
        return True

    def clear_history(self):
        return self.library.clear_history()

    def update_settings(self, settings):
        return self.library.update_settings(settings)

    def get_profile(self):
        return self.library.get_profile()

    def update_profile(self, profile_data):
        return self.library.update_profile(profile_data)

    def clear_cache(self):
        return self.library.clear_cache()

    def export_library(self):
        return self.library.export_library()

    def import_library(self, json_str):
        return self.library.import_library(json_str)

    def get_system_stats(self):
        return self.stats.get_stats()
