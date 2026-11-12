@echo off
rem Start the music-hub server without a console window and append logs to data\server.log.
rem Used by the agent to restart the service without taking over the user's terminal.
cd /d "%~dp0.."
".venv\Scripts\python.exe" -m uvicorn server.main:app --host 127.0.0.1 --port 8787 >> "data\server.log" 2>&1
