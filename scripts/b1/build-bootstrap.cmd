@echo off
setlocal
call "%~1" %~3 >nul
if errorlevel 1 exit /b %errorlevel%
cl.exe /nologo /std:c++14 /EHsc /MT /W4 /WX /O2 "%~dp0arch-bootstrap.cpp" /Fo:"%~2\arch-bootstrap.obj" /Fe:"%~2\arch-bootstrap.exe" /link /SUBSYSTEM:CONSOLE
