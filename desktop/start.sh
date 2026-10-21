#!/usr/bin/env bash
# NEXUS GAME — abre o app com o Chromium embutido (Electron).
# GPU LIGADA (o --disable-gpu antigo jogava WebGL para o SwiftShader e derrubava
# o FPS de jogos/three.js). Flags abaixo mantêm rasterização e vídeo na GPU.
set -u

DIR="$(cd "$(dirname "$0")" && pwd)"
ELECTRON="$DIR/node_modules/.bin/electron"

if [ ! -x "$ELECTRON" ]; then
  echo "Electron não encontrado em $DIR/node_modules." >&2
  echo "Instale com: npm --prefix \"$DIR\" install" >&2
  exit 1
fi

export ELECTRON_OZONE_PLATFORM_HINT="${ELECTRON_OZONE_PLATFORM_HINT:-auto}"

# NUNCA adicionar --disable-gpu aqui: sem GPU o WebGL cai para software.
# Este PC tem iGPU Ivy Bridge: Vulkan é incompleto ("MESA-INTEL: Ivy Bridge
# Vulkan support is incomplete" e "--ozone-platform=wayland is not compatible
# with Vulkan"), então forçamos ANGLE sobre OpenGL e desligamos Vulkan.
# VAAPI/iHD também falha neste hardware (libva iHD_drv_video.so init failed).
exec "$ELECTRON" \
  --enable-gpu-rasterization \
  --enable-zero-copy \
  --ignore-gpu-blocklist \
  --use-angle=gl \
  --disable-vulkan \
  --disable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan \
  --disable-renderer-backgrounding \
  --disable-background-timer-throttling \
  "$DIR" "$@"
