@echo off
cd /d "%~dp0"
set "PI_CODING_AGENT_DIR=%~dp0.pi\agent"
call ".\node_modules\.bin\pi.cmd" %*
