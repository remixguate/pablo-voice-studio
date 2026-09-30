# Pablo Voice Studio

Generador web de voces sin inicio de sesión, pensado para crear voces para DJ IDs, Reels, anuncios y contenido social.

## Incluye
- Interfaz web responsive y PWA.
- Voces en español México y España + inglés USA.
- Control de velocidad, tono y volumen.
- Exportación MP3 y WAV.
- FastAPI + Edge TTS, sin API key.
- Docker + FFmpeg.
- Configuración lista para Render.

## Ejecutar localmente
Requiere Python 3.11+ y conexión a Internet para el servicio de voz.

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload
```
Abre `http://127.0.0.1:8000`.

## GitHub + Render
1. Sube todo el contenido del ZIP a un repositorio.
2. En Render crea un Web Service desde el repositorio.
3. Usa Docker (el Dockerfile ya está incluido).
4. Render detectará el puerto mediante `$PORT`.

## Nota
Edge TTS requiere conexión a Internet para generar el audio. No se necesita cuenta ni API key en esta aplicación.
