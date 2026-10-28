@echo off
rem Called by Task Scheduler. Example: run_job.bat hourly
rem Output is appended to logs\<job>.log
cd /d "%~dp0"
set PYTHONUTF8=1
if not exist logs mkdir logs
echo ===== %date% %time% %1 ===== >> "logs\%1.log"
".venv\Scripts\python.exe" run.py %1 >> "logs\%1.log" 2>&1
