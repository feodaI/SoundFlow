import os
import sys
import shutil
import subprocess

def build():
    print("=== Building SoundFlow with PyInstaller ===")
    base_dir = os.path.dirname(os.path.abspath(__file__))

    # Clean previous builds
    for folder in ["build", "dist"]:
        p = os.path.join(base_dir, folder)
        if os.path.exists(p):
            shutil.rmtree(p, ignore_errors=True)

    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--noconsole",
        "--name", "SoundFlow",
        f"--icon={os.path.join(base_dir, 'assets', 'icon.ico')}",
        "--add-data", f"frontend{os.pathsep}frontend",
        "--add-data", f"assets{os.pathsep}assets",
        "--collect-all", "pywebview",
        "--collect-all", "pythonnet",
        "--collect-all", "yt_dlp",
        "--clean",
        "-y",
        os.path.join(base_dir, "main.py")
    ]

    print("Running command:", " ".join(cmd))
    res = subprocess.run(cmd, cwd=base_dir)
    if res.returncode != 0:
        print("Build failed with code:", res.returncode)
        sys.exit(res.returncode)

    print("\n=== Build successful! Output in dist/SoundFlow ===")

if __name__ == "__main__":
    build()
