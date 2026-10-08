@echo off
title SoundFlow Music Player
cd /d "%~dp0"

echo Starting SoundFlow...
py main.py
if %ERRORLEVEL% NEQ 0 (
    python main.py
)

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo An error occurred while starting SoundFlow.
    pause
)
