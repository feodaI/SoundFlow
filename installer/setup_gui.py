import os
import sys
import zipfile
import threading
import subprocess
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
import winreg

class SoundFlowInstaller:
    def __init__(self, root):
        self.root = root
        self.root.title("SoundFlow Setup — Встановлення")
        self.root.geometry("560x420")
        self.root.resizable(False, False)
        self.root.configure(bg="#0e1117")

        # Center window on screen
        self.center_window(560, 420)

        # Base directories
        if getattr(sys, "frozen", False):
            self.bundle_dir = getattr(sys, "_MEIPASS", os.path.dirname(sys.executable))
        else:
            self.bundle_dir = os.path.dirname(os.path.abspath(__file__))

        # Path to payload zip
        self.payload_zip = os.path.join(self.bundle_dir, "soundflow_payload.zip")

        # Default install directory: %LocalAppData%\Programs\SoundFlow
        local_app_data = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~\\AppData\\Local")
        self.install_dir = os.path.join(local_app_data, "Programs", "SoundFlow")

        # Variables
        self.dir_var = tk.StringVar(value=self.install_dir)
        self.desktop_shortcut_var = tk.BooleanVar(value=True)
        self.start_menu_var = tk.BooleanVar(value=True)
        self.launch_after_var = tk.BooleanVar(value=True)
        self.is_installing = False

        # Try setting icon
        icon_path = os.path.join(self.bundle_dir, "assets", "icon.ico")
        if not os.path.exists(icon_path):
            icon_path = os.path.join(os.path.dirname(self.bundle_dir), "assets", "icon.ico")
        if os.path.exists(icon_path):
            try:
                self.root.iconbitmap(icon_path)
            except Exception:
                pass

        self.setup_ui()

    def center_window(self, width, height):
        self.root.update_idletasks()
        sw = self.root.winfo_screenwidth()
        sh = self.root.winfo_screenheight()
        x = (sw - width) // 2
        y = (sh - height) // 2
        self.root.geometry(f"{width}x{height}+{x}+{y}")

    def setup_ui(self):
        # Configure styles
        style = ttk.Style()
        style.theme_use("clam")
        style.configure("TProgressbar", thickness=6, troughcolor="#12151e", background="#ff2d75")

        # Header Frame
        header = tk.Frame(self.root, bg="#11141d", height=90, padx=24, pady=16)
        header.pack(fill=tk.X, side=tk.TOP)
        header.pack_propagate(False)

        title_lbl = tk.Label(header, text="✨ SoundFlow Music Player", font=("Segoe UI", 15, "bold"), fg="#ffffff", bg="#11141d")
        title_lbl.pack(anchor="w")

        sub_lbl = tk.Label(header, text="Встановлення легкого музичного плеєра у стилі Spotify & SoundCloud", font=("Segoe UI", 9), fg="#94a3b8", bg="#11141d")
        sub_lbl.pack(anchor="w", pady=(2, 0))

        # Main Body Frame
        self.body = tk.Frame(self.root, bg="#0e1117", padx=28, pady=20)
        self.body.pack(fill=tk.BOTH, expand=True)

        # Step 1: Options
        self.options_frame = tk.Frame(self.body, bg="#0e1117")
        self.options_frame.pack(fill=tk.BOTH, expand=True)

        lbl_dir = tk.Label(self.options_frame, text="Папка встановлення:", font=("Segoe UI", 9, "bold"), fg="#e2e8f0", bg="#0e1117")
        lbl_dir.pack(anchor="w", pady=(0, 6))

        dir_row = tk.Frame(self.options_frame, bg="#0e1117")
        dir_row.pack(fill=tk.X, pady=(0, 16))

        self.entry_dir = tk.Entry(dir_row, textvariable=self.dir_var, font=("Segoe UI", 9), bg="#1c2230", fg="#ffffff", insertbackground="#ffffff", relief="flat", highlightthickness=1, highlightbackground="#334155")
        self.entry_dir.pack(side=tk.LEFT, fill=tk.X, expand=True, ipady=6, padx=(0, 8))

        btn_browse = tk.Button(dir_row, text="Огляд...", font=("Segoe UI", 9), bg="#2d3748", fg="#ffffff", activebackground="#4a5568", activeforeground="#ffffff", relief="flat", padx=14, pady=3, cursor="hand2", command=self.browse_dir)
        btn_browse.pack(side=tk.RIGHT)

        # Checkboxes
        chk_opts = [
            ("Створити ярлик на Робочому столі", self.desktop_shortcut_var),
            ("Додати ярлик у меню «Пуск»", self.start_menu_var),
            ("Запустити SoundFlow після встановлення", self.launch_after_var),
        ]
        for text, var in chk_opts:
            cb = tk.Checkbutton(self.options_frame, text=text, variable=var, font=("Segoe UI", 9), fg="#cbd5e1", bg="#0e1117", selectcolor="#1c2230", activebackground="#0e1117", activeforeground="#ffffff", cursor="hand2")
            cb.pack(anchor="w", pady=4)

        # Step 2: Progress Frame (hidden initially)
        self.progress_frame = tk.Frame(self.body, bg="#0e1117")

        self.status_lbl = tk.Label(self.progress_frame, text="Підготовка до встановлення...", font=("Segoe UI", 9), fg="#94a3b8", bg="#0e1117")
        self.status_lbl.pack(anchor="w", pady=(20, 8))

        self.progress_bar = ttk.Progressbar(self.progress_frame, style="TProgressbar", mode="determinate")
        self.progress_bar.pack(fill=tk.X, pady=(0, 10))

        self.detail_lbl = tk.Label(self.progress_frame, text="", font=("Segoe UI", 8), fg="#64748b", bg="#0e1117")
        self.detail_lbl.pack(anchor="w")

        # Bottom Bar
        footer = tk.Frame(self.root, bg="#161b24", height=60, padx=24, pady=12)
        footer.pack(fill=tk.X, side=tk.BOTTOM)
        footer.pack_propagate(False)

        self.btn_cancel = tk.Button(footer, text="Скасувати", font=("Segoe UI", 9), bg="#2d3748", fg="#ffffff", activebackground="#4a5568", activeforeground="#ffffff", relief="flat", padx=16, pady=5, cursor="hand2", command=self.root.destroy)
        self.btn_cancel.pack(side=tk.RIGHT, padx=(8, 0))

        self.btn_install = tk.Button(footer, text="Встановити", font=("Segoe UI", 9, "bold"), bg="#ff2d75", fg="#ffffff", activebackground="#ff4f8b", activeforeground="#ffffff", relief="flat", padx=20, pady=5, cursor="hand2", command=self.start_install)
        self.btn_install.pack(side=tk.RIGHT)

    def browse_dir(self):
        chosen = filedialog.askdirectory(initialdir=self.dir_var.get())
        if chosen:
            self.dir_var.set(os.path.join(chosen, "SoundFlow"))

    def start_install(self):
        if self.is_installing:
            # Finish action
            if self.launch_after_var.get():
                target_exe = os.path.join(self.dir_var.get(), "SoundFlow.exe")
                if os.path.exists(target_exe):
                    subprocess.Popen([target_exe], cwd=self.dir_var.get())
            self.root.destroy()
            return

        target_dir = self.dir_var.get().strip()
        if not target_dir:
            messagebox.showerror("Помилка", "Будь ласка, вкажіть папку для встановлення.")
            return

        self.is_installing = True
        self.options_frame.pack_forget()
        self.progress_frame.pack(fill=tk.BOTH, expand=True)

        self.btn_cancel.config(state=tk.DISABLED)
        self.btn_install.config(state=tk.DISABLED)

        # Run extraction in background thread
        threading.Thread(target=self.run_extraction, args=(target_dir,), daemon=True).start()

    def run_extraction(self, target_dir):
        try:
            os.makedirs(target_dir, exist_ok=True)

            if not os.path.exists(self.payload_zip):
                raise FileNotFoundError(f"Файл інсталяційного пакету не знайдено: {self.payload_zip}")

            with zipfile.ZipFile(self.payload_zip, "r") as zf:
                file_list = zf.namelist()
                total = len(file_list)

                for idx, item in enumerate(file_list):
                    self.update_status(f"Розпакування файлів... ({idx + 1}/{total})", item, (idx + 1) / total * 85)
                    zf.extract(item, target_dir)

            target_exe = os.path.join(target_dir, "SoundFlow.exe")

            # Create uninstaller
            self.update_status("Створення системи видалення...", "uninstall.bat", 88)
            self.create_uninstaller(target_dir)

            # Register in Windows Programs & Features
            self.update_status("Реєстрація у системі Windows...", "Registry", 92)
            self.register_in_windows(target_dir, target_exe)

            # Create Shortcuts
            if self.desktop_shortcut_var.get():
                self.update_status("Створення ярлика на Робочому столі...", "Desktop Shortcut", 96)
                self.create_shortcut(target_exe, os.path.join(os.path.expanduser("~\\Desktop"), "SoundFlow.lnk"))

            if self.start_menu_var.get():
                self.update_status("Створення ярлика в меню «Пуск»...", "Start Menu Shortcut", 99)
                start_dir = os.environ.get("APPDATA") or os.path.expanduser("~\\AppData\\Roaming")
                sm_programs = os.path.join(start_dir, "Microsoft", "Windows", "Start Menu", "Programs")
                os.makedirs(sm_programs, exist_ok=True)
                self.create_shortcut(target_exe, os.path.join(sm_programs, "SoundFlow.lnk"))

            # Done
            self.root.after(0, self.on_install_completed)

        except Exception as e:
            self.root.after(0, lambda: messagebox.showerror("Помилка встановлення", str(e)))
            self.root.after(0, lambda: self.btn_cancel.config(state=tk.NORMAL))

    def update_status(self, status, detail, percent):
        self.root.after(0, lambda: self._apply_status(status, detail, percent))

    def _apply_status(self, status, detail, percent):
        self.status_lbl.config(text=status)
        self.detail_lbl.config(text=detail)
        self.progress_bar["value"] = percent

    def on_install_completed(self):
        self.progress_bar["value"] = 100
        self.status_lbl.config(text="✅ Встановлення успішно завершено!", fg="#ff2d75")
        self.detail_lbl.config(text="SoundFlow готовий до використання.")

        self.btn_install.config(state=tk.NORMAL, text="Завершити", bg="#ff2d75", fg="#ffffff")
        self.btn_cancel.pack_forget()

    def create_shortcut(self, target_path, shortcut_path):
        """Creates a Windows shortcut (.lnk) using PowerShell and WScript.Shell."""
        try:
            icon_file = os.path.join(os.path.dirname(target_path), "assets", "icon.ico")
            if not os.path.exists(icon_file):
                icon_file = target_path

            ps_script = f'''
            `$wsh = New-Object -ComObject WScript.Shell;
            `$s = `$wsh.CreateShortcut("{shortcut_path}");
            `$s.TargetPath = "{target_path}";
            `$s.WorkingDirectory = "{os.path.dirname(target_path)}";
            `$s.IconLocation = "{icon_file},0";
            `$s.Description = "SoundFlow Music Player";
            `$s.Save();
            '''
            subprocess.run(["powershell", "-NoProfile", "-Command", ps_script], creationflags=subprocess.CREATE_NO_WINDOW, check=False)
        except Exception as e:
            print("Failed to create shortcut:", e)

    def create_uninstaller(self, target_dir):
        """Creates a clean uninstaller script in the application folder."""
        uninst_path = os.path.join(target_dir, "uninstall.bat")
        script = f"""@echo off
title SoundFlow Uninstaller
echo Видалення SoundFlow...
timeout /t 1 /nobreak >nul

del /q "{os.path.expanduser('~\\\\Desktop\\\\SoundFlow.lnk')}" 2>nul
set "SM=%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\SoundFlow.lnk"
del /q "%SM%" 2>nul

reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\SoundFlow" /f 2>nul

echo Очищення файлів програми...
cd /d "%TEMP%"
rmdir /s /q "{target_dir}" 2>nul

echo SoundFlow успішно видалено.
pause
"""
        with open(uninst_path, "w", encoding="utf-8") as f:
            f.write(script)

    def register_in_windows(self, target_dir, target_exe):
        """Registers SoundFlow in Windows Add or Remove Programs."""
        try:
            key_path = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\SoundFlow"
            with winreg.CreateKey(winreg.HKEY_CURRENT_USER, key_path) as key:
                winreg.SetValueEx(key, "DisplayName", 0, winreg.REG_SZ, "SoundFlow — Music Player")
                winreg.SetValueEx(key, "DisplayVersion", 0, winreg.REG_SZ, "1.0.0")
                winreg.SetValueEx(key, "Publisher", 0, winreg.REG_SZ, "SoundFlow Project")
                winreg.SetValueEx(key, "DisplayIcon", 0, winreg.REG_SZ, target_exe)
                winreg.SetValueEx(key, "InstallLocation", 0, winreg.REG_SZ, target_dir)
                winreg.SetValueEx(key, "UninstallString", 0, winreg.REG_SZ, f'"{os.path.join(target_dir, "uninstall.bat")}"')
                winreg.SetValueEx(key, "NoModify", 0, winreg.REG_DWORD, 1)
                winreg.SetValueEx(key, "NoRepair", 0, winreg.REG_DWORD, 1)
        except Exception as e:
            print("Failed to register uninstaller in registry:", e)

if __name__ == "__main__":
    app_root = tk.Tk()
    installer = SoundFlowInstaller(app_root)
    app_root.mainloop()
