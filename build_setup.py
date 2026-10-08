import os
import sys
import shutil
import zipfile
import subprocess

def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    dist_dir = os.path.join(base_dir, "dist", "SoundFlow")
    payload_zip = os.path.join(base_dir, "installer", "soundflow_payload.zip")
    icon_path = os.path.join(base_dir, "assets", "icon.ico")

    print("=== Step 1: Checking dist/SoundFlow ===")
    if not os.path.exists(os.path.join(dist_dir, "SoundFlow.exe")):
        print("dist/SoundFlow/SoundFlow.exe not found! Running build.py first...")
        subprocess.run([sys.executable, "build.py"], cwd=base_dir, check=True)

    print("=== Step 2: Creating soundflow_payload.zip ===")
    os.makedirs(os.path.dirname(payload_zip), exist_ok=True)
    with zipfile.ZipFile(payload_zip, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for root, dirs, files in os.walk(dist_dir):
            for file in files:
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, dist_dir)
                zf.write(full_path, rel_path)

    size_mb = os.path.getsize(payload_zip) / 1024 / 1024
    print(f"Payload zip size: {size_mb:.2f} MB")

    print("=== Step 3: Compiling SoundFlow_Setup.exe with PyInstaller ===")
    setup_script = os.path.join(base_dir, "installer", "setup_gui.py")

    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--onefile",
        "--noconsole",
        "--name", "SoundFlow_Setup",
        f"--icon={icon_path}",
        f"--add-data={payload_zip}{os.pathsep}.",
        f"--add-data={icon_path}{os.pathsep}assets",
        "--distpath", base_dir,  # Output SoundFlow_Setup.exe directly in root of project!
        "--clean",
        "-y",
        setup_script
    ]

    print("Running:", " ".join(cmd))
    res = subprocess.run(cmd, cwd=base_dir)
    if res.returncode != 0:
        print("Setup build failed with code:", res.returncode)
        sys.exit(res.returncode)

    output_exe = os.path.join(base_dir, "SoundFlow_Setup.exe")
    if os.path.exists(output_exe):
        final_size = os.path.getsize(output_exe) / 1024 / 1024
        print(f"\n[SUCCESS] Installer created: {output_exe} ({final_size:.2f} MB)")
    else:
        print("Setup exe was not created.")

if __name__ == "__main__":
    main()
