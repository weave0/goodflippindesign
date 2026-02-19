# Voice lines (SSML)

This folder contains SSML + performance notes for generating a few vocal takes of:

> "X is the set… of all things."

## Structure

- `assets/voice/performance-scripts.md` — human performance/cadence notes
- `assets/voice/ssml/` — SSML takes (input)
- `assets/voice/out/` — generated audio files (output)

## Generate audio locally (recommended quick path)

1. Activate your venv (optional if already active):

```powershell
& .\.venv\Scripts\Activate.ps1
```

1. Install the generator dependency:

```powershell
python -m pip install --upgrade edge-tts
```

1. List available voices (pick a deep male voice you like):

```powershell
python .\scripts\voice\generate_tts.py list-voices
```

1. Generate MP3s from all SSML files:

```powershell
python .\scripts\voice\generate_tts.py render --voice "en-US-GuyNeural"
```

Outputs land in `assets/voice/out/`.

## Notes

- SSML already controls rate/pitch/volume; the `--voice` choice is the biggest variable.
- If you want a more region-specific English accent, run `list-voices` and choose an `en-*` voice that matches the tone you want.
