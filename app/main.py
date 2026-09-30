import os, uuid, asyncio, subprocess, shutil
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

app = FastAPI(title="Pablo Voice Studio", version="1.0.0")
app.mount("/static", StaticFiles(directory=STATIC), name="static")

VOICES = [
    {"id":"es-MX-DaliaNeural","name":"Dalia — Español México","lang":"es-MX","gender":"F"},
    {"id":"es-MX-JorgeNeural","name":"Jorge — Español México","lang":"es-MX","gender":"M"},
    {"id":"es-ES-ElviraNeural","name":"Elvira — Español España","lang":"es-ES","gender":"F"},
    {"id":"es-ES-AlvaroNeural","name":"Álvaro — Español España","lang":"es-ES","gender":"M"},
    {"id":"en-US-GuyNeural","name":"Guy — English USA","lang":"en-US","gender":"M"},
    {"id":"en-US-JennyNeural","name":"Jenny — English USA","lang":"en-US","gender":"F"},
]

class TTSRequest(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    voice: str = "es-MX-JorgeNeural"
    rate: int = Field(default=0, ge=-50, le=50)
    pitch: int = Field(default=0, ge=-50, le=50)
    volume: int = Field(default=0, ge=-50, le=50)
    format: str = Field(default="mp3")

@app.get("/", response_class=HTMLResponse)
def index():
    return (STATIC / "index.html").read_text(encoding="utf-8")

@app.get("/api/voices")
def voices():
    return VOICES

@app.post("/api/synthesize")
async def synthesize(req: TTSRequest):
    if req.voice not in {v["id"] for v in VOICES}:
        raise HTTPException(400, "Voz no disponible")

    if not req.text.strip():
        raise HTTPException(400, "Escribe un texto")

    if req.format not in {"mp3", "wav"}:
        raise HTTPException(400, "Formato inválido")

    job = uuid.uuid4().hex
    mp3 = OUTPUTS / f"{job}.mp3"

    rate = f"{req.rate:+d}%"
    pitch = f"{req.pitch:+d}Hz"
    volume = f"{req.volume:+d}%"

    try:
        print(f"TTS START - voz={req.voice}")
        print(f"TTS RATE={rate} PITCH={pitch} VOLUME={volume}")
        print(f"TTS OUTPUT={mp3}")

        communicate = edge_tts.Communicate(
            text=req.text,
            voice=req.voice,
            rate=rate,
            pitch=pitch,
            volume=volume
        )

        await communicate.save(str(mp3))

        print(f"TTS FILE EXISTS={mp3.exists()}")
        print(f"TTS FILE SIZE={mp3.stat().st_size if mp3.exists() else 0}")

        if not mp3.exists() or mp3.stat().st_size == 0:
            raise Exception("Edge TTS no creó el archivo de audio")

    except Exception as e:
        print("========== EDGE TTS ERROR ==========")
        print(type(e).__name__)
        print(str(e))
        print("====================================")

        raise HTTPException(
            status_code=502,
            detail=f"Error generando voz: {type(e).__name__}: {str(e)}"
        )

    if req.format == "wav":
        wav = OUTPUTS / f"{job}.wav"

        if not shutil.which("ffmpeg"):
            raise HTTPException(
                500,
                "FFmpeg no está instalado para exportar WAV"
            )

        p = subprocess.run(
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

        if p.returncode != 0:
            print("========== FFMPEG ERROR ==========")
            print(p.stderr)
            print("==================================")

            raise HTTPException(
                500,
                "Error convirtiendo a WAV"
            )

        return FileResponse(
            wav,
            media_type="audio/wav",
            filename="pablo_voice.wav"
        )

    return FileResponse(
        mp3,
        media_type="audio/mpeg",
        filename="pablo_voice.mp3"
    )

@app.get("/health")
def health():
    return {"ok": True, "ffmpeg": bool(shutil.which("ffmpeg"))}
