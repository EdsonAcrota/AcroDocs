@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ============================================
echo   AcroDocs - demo local
echo ============================================
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo Node.js no esta instalado o no esta en el PATH.
    echo Descargalo desde https://nodejs.org/ y vuelve a intentar.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo Instalando dependencias por primera vez...
    call npm.cmd install --no-audit --no-fund
    if errorlevel 1 (
        echo.
        echo Error al instalar dependencias.
        pause
        exit /b 1
    )
)

echo.
echo Abriendo http://localhost:5173 ...
start "" /b cmd /c "timeout /t 5 >nul & start http://localhost:5173"

echo Iniciando servidor de desarrollo (no cierres esta ventana)...
call npm.cmd run dev
pause
