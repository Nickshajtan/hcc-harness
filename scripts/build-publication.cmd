@echo off
setlocal
if "%~3"=="default" (
  call "%~1" >nul
) else (
  call "%~1" %~3 >nul
)
if errorlevel 1 exit /b %errorlevel%
cl.exe /nologo /std:c++14 /EHsc /MT /W4 /WX /O2 /Brepro "%~dp0../native/publication/rename-no-replace.cpp" /Fo:"%~2\arch-publication-v1.obj" /Fe:"%~2\arch-publication-v1.exe" /link /SUBSYSTEM:CONSOLE /Brepro
