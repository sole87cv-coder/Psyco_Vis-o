@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>&1
if not errorlevel 1 goto use_py
where python >nul 2>&1
if not errorlevel 1 goto use_python
echo Python 3 nao foi encontrado.
echo Abra esta pasta no VS Code e use a extensao Live Server, ou instale Python 3.
pause
exit /b 1
:use_py
py -3 "%~dp0scripts\testar_local.py"
goto finished
:use_python
python "%~dp0scripts\testar_local.py"
:finished
if errorlevel 1 pause
