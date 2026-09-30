import os
import uuid
import asyncio
import subprocess
import shutil
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import edge_tts


ROOT = Path(__file__).resolve().parent.parent
STATIC = ROOT / "static"
OUTPUTS = ROOT / "outputs"
UPLOADS = ROOT / "uploads"

OUTPUTS.mkdir(exist_ok=True)
UPLOADS.mkdir(exist_ok=True)

app = FastAPI(
    title="Pablo Voice Studio",
    version="2.0.0"
)

app.mount(
    "/static",
    StaticFiles(directory=STATIC),
    name="static"
)


# ============================================================
# VOCES
# ============================================================

VOICES = []


async def load_voices():
    """
    Carga automáticamente todas las voces disponibles
    de Microsoft Edge TTS.
    """

    global VOICES

    try:
        voices = await edge_tts.list_voices()

        result = []

        for voice in voices:
            short_name = voice.get("ShortName")

            if not short_name:
                continue

            locale = voice.get("Locale", "")
            gender = voice.get("Gender", "")

            result.append({
                "id": short_name,
                "name": short_name,
                "lang": locale,
                "gender": gender
            })

        result.sort(
            key=lambda x: (
                x["lang"],
                x["gender"],
                x["name"]
            )
        )

        VOICES = result

        print(f"VOCES CARGADAS: {len(VOICES)}")

    except Exception as e:
        print("ERROR CARGANDO VOCES:")
        print(type(e).__name__)
        print(str(e))

        # Voces de respaldo
        VOICES = [
            {
                "id": "es-MX-DaliaNeural",
                "name": "Dalia — Español México",
                "lang": "es-MX",
                "gender": "Female"
            },
            {
                "id": "es-MX-JorgeNeural",
                "name": "Jorge — Español México",
                "lang": "es-MX",
                "gender": "Male"
            },
            {
                "id": "es-ES-ElviraNeural",
                "name": "Elvira — Español España",
                "lang": "es-ES",
                "gender": "Female"
            },
            {
                "id": "es-ES-AlvaroNeural",
                "name": "Álvaro — Español España",
                "lang": "es-ES",
                "gender": "Male"
            },
            {
                "id": "en-US-GuyNeural",
                "name": "Guy — English USA",
                "lang": "en-US",
                "gender": "Male"
            },
            {
                "id": "en-US-JennyNeural",
                "name": "Jenny — English USA",
                "lang": "en-US",
                "gender": "Female"
            }
        ]


@app.on_event("startup")
async def startup_event():
    await load_voices()


# ============================================================
# MODELO
# ============================================================

class TTSRequest(BaseModel):
    text: str = Field(
        min_length=1,
        max_length=5000
    )

    voice: str = "es-MX-JorgeNeural"

    rate: int = Field(
        default=0,
        ge=-50,
        le=50
    )

    pitch: int = Field(
        default=0,
        ge=-50,
        le=50
    )

    volume: int = Field(
        default=0,
        ge=-50,
        le=50
    )

    format: str = Field(
        default="mp3"
    )


# ============================================================
# PAGINA PRINCIPAL
# ============================================================

@app.get("/", response_class=HTMLResponse)
def index():

    return (
        STATIC / "index.html"
    ).read_text(
        encoding="utf-8"
    )


# ============================================================
# LISTA DE VOCES
# ============================================================

@app.get("/api/voices")
async def voices():

    # Si por alguna razón todavía no se cargaron
    if not VOICES:
        await load_voices()

    return VOICES


# ============================================================
# GENERADOR DE VOZ
# ============================================================

@app.post("/api/synthesize")
async def synthesize(req: TTSRequest):

    if not req.text.strip():
        raise HTTPException(
            400,
            "Escribe un texto"
        )

    if req.format not in {"mp3", "wav"}:
        raise HTTPException(
            400,
            "Formato inválido"
        )

    # Si todavía no tenemos voces
    if not VOICES:
        await load_voices()

    available_voice_ids = {
        voice["id"]
        for voice in VOICES
    }

    if req.voice not in available_voice_ids:
        raise HTTPException(
            400,
            f"Voz no disponible: {req.voice}"
        )

    job = uuid.uuid4().hex

    mp3 = OUTPUTS / f"{job}.mp3"

    rate = f"{req.rate:+d}%"
    pitch = f"{req.pitch:+d}Hz"
    volume = f"{req.volume:+d}%"

    try:

        print("===================================")
        print("GENERANDO VOZ")
        print(f"VOICE: {req.voice}")
        print(f"RATE: {rate}")
        print(f"PITCH: {pitch}")
        print(f"VOLUME: {volume}")
        print(f"OUTPUT: {mp3}")
        print("===================================")

        communicate = edge_tts.Communicate(
            text=req.text,
            voice=req.voice,
            rate=rate,
            pitch=pitch,
            volume=volume
        )

        await communicate.save(
            str(mp3)
        )

        if not mp3.exists():

            raise Exception(
                "Edge TTS no creó el archivo"
            )

        if mp3.stat().st_size == 0:

            raise Exception(
                "El archivo generado está vacío"
            )

        print(
            f"AUDIO GENERADO: {mp3.stat().st_size} bytes"
        )

    except Exception as e:

        print("===================================")
        print("ERROR EDGE TTS")
        print(type(e).__name__)
        print(str(e))
        print("===================================")

        raise HTTPException(
            status_code=502,
            detail=(
                f"Error generando voz: "
                f"{type(e).__name__}: {str(e)}"
            )
        )

    # ========================================================
    # WAV
    # ========================================================

    if req.format == "wav":

        wav = OUTPUTS / f"{job}.wav"

        if not shutil.which("ffmpeg"):

            raise HTTPException(
                500,
                "FFmpeg no está instalado"
            )

        process = subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(mp3),
                "-ar",
                "44100",
                "-ac",
                "2",
                str(wav)
            ],
            capture_output=True,
            text=True
        )

        if process.returncode != 0:

            print("FFMPEG ERROR:")
            print(process.stderr)

            raise HTTPException(
                500,
                "Error convirtiendo a WAV"
            )

        return FileResponse(
            wav,
            media_type="audio/wav",
            filename="pablo_voice.wav"
        )

    # ========================================================
    # MP3
    # ========================================================

    return FileResponse(
        mp3,
        media_type="audio/mpeg",
        filename="pablo_voice.mp3"
    )


# ============================================================
# HEALTH CHECK
# ============================================================

@app.get("/health")
def health():

    return {
        "ok": True,
        "ffmpeg": bool(
            shutil.which("ffmpeg")
        ),
        "voices": len(VOICES)
    }
