@echo off
setlocal
if "%~3"=="default" (
  call "%~1" >nul
) else (
  call "%~1" %~3 >nul
)
if errorlevel 1 exit /b %errorlevel%
cl /nologo /std:c++14 /EHsc /MT /W4 /WX /O2 "%~dp0rename.cpp" /Fo:"%~2\rename.obj" /Fe:"%~2\rename.exe" /link /SUBSYSTEM:CONSOLE
