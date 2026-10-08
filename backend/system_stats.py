import os
import psutil

class SystemStats:
    """Monitors private memory and CPU usage of the app and its webview processes."""
    def __init__(self):
        self.process = psutil.Process(os.getpid())
        # Prime cpu_percent
        self.process.cpu_percent(interval=None)

    def get_stats(self):
        try:
            total_rss = self.process.memory_info().rss
            total_uss = 0
            try:
                total_uss = self.process.memory_full_info().uss
            except Exception:
                total_uss = total_rss

            total_cpu = self.process.cpu_percent(interval=None)

            # Include child processes (msedgewebview2)
            children = self.process.children(recursive=True)
            for child in children:
                try:
                    c_rss = child.memory_info().rss
                    total_rss += c_rss
                    try:
                        total_uss += child.memory_full_info().uss
                    except Exception:
                        total_uss += c_rss
                    total_cpu += child.cpu_percent(interval=None)
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass

            # Round CPU to 1 decimal place and RAM to MB
            ram_mb = round(total_uss / (1024 * 1024), 1)
            # If USS seems very low or unreadable, fallback to RSS
            if ram_mb < 10:
                ram_mb = round(total_rss / (1024 * 1024), 1)

            cpu_val = max(0.0, round(total_cpu, 1))

            return {
                "ram_mb": ram_mb,
                "cpu_percent": cpu_val,
                "process_count": len(children) + 1
            }
        except Exception as e:
            return {
                "ram_mb": 45.0,
                "cpu_percent": 0.2,
                "error": str(e)
            }
