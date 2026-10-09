@echo off
setlocal
set "ASCII_PROJECT=C:\gp\mobile"

if not exist "%ASCII_PROJECT%\package.json" (
  echo No existe la copia segura en %ASCII_PROJECT%
  exit /b 1
)

pushd "%ASCII_PROJECT%"
set "JAVA_HOME=%ASCII_PROJECT%\.jdk17\jdk-17.0.20.1+1"
if not exist "%JAVA_HOME%\bin\java.exe" (
  echo No se encontro Java 17 en "%JAVA_HOME%".
  exit /b 1
)
set "PATH=%JAVA_HOME%\bin;%PATH%"
set "ANDROID_HOME=C:\Users\MarceloPC\AppData\Local\Android\Sdk"
set "ANDROID_SDK_ROOT=%ANDROID_HOME%"
if not exist "%ANDROID_HOME%\platform-tools\adb.exe" (
  echo No se encontro el SDK de Android en "%ANDROID_HOME%".
  exit /b 1
)
call npx expo prebuild --platform android --no-install
if errorlevel 1 (
  set "BUILD_EXIT=%ERRORLEVEL%"
  popd
  exit /b %BUILD_EXIT%
)
> android\local.properties echo sdk.dir=C:/Users/MarceloPC/AppData/Local/Android/Sdk
call npx expo run:android --device
set "BUILD_EXIT=%ERRORLEVEL%"
popd
exit /b %BUILD_EXIT%
