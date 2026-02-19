#!/usr/bin/env python3
"""Generate audio files from SSML takes.

Default engine: edge-tts (Microsoft Edge online neural voices).

Usage:
  python scripts/voice/generate_tts.py list-voices
  python scripts/voice/generate_tts.py render --voice "en-US-GuyNeural"

"""

from __future__ import annotations

import argparse
import asyncio
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


ASSETS_ROOT = Path(__file__).resolve().parents[2] / "assets" / "voice"
DEFAULT_INPUT_DIR = ASSETS_ROOT / "ssml"
DEFAULT_OUTPUT_DIR = ASSETS_ROOT / "out"


@dataclass(frozen=True)
class RenderJob:
    input_path: Path
    output_path: Path


def _iter_ssml_files(input_dir: Path) -> list[Path]:
    if not input_dir.exists():
        raise FileNotFoundError(f"Input directory not found: {input_dir}")

    files = sorted(p for p in input_dir.rglob("*.ssml") if p.is_file())
    if not files:
        raise FileNotFoundError(f"No .ssml files found under: {input_dir}")
    return files


def _make_jobs(
    input_files: Iterable[Path], output_dir: Path, ext: str
) -> list[RenderJob]:
    jobs: list[RenderJob] = []
    for input_path in input_files:
        rel = input_path.name
        out_name = f"{Path(rel).stem}{ext}"
        jobs.append(RenderJob(input_path=input_path, output_path=output_dir / out_name))
    return jobs


async def _list_voices() -> None:
    try:
        import edge_tts  # type: ignore
    except Exception as e:  # pragma: no cover
        raise SystemExit(
            "Missing dependency 'edge-tts'. Install with: python -m pip install edge-tts"
        ) from e

    voices = await edge_tts.list_voices()

    # Print a compact, grep-friendly list
    # Columns: ShortName | Locale | Gender | FriendlyName
    for v in sorted(
        voices, key=lambda x: (x.get("Locale", ""), x.get("ShortName", ""))
    ):
        short = v.get("ShortName", "")
        locale = v.get("Locale", "")
        gender = v.get("Gender", "")
        friendly = v.get("FriendlyName", "")
        print(f"{short}\t{locale}\t{gender}\t{friendly}")


async def _render_all(
    *,
    input_dir: Path,
    output_dir: Path,
    voice: str,
    ext: str,
    ffmpeg_cmd: str,
) -> None:
    try:
        import edge_tts  # type: ignore
    except Exception as e:  # pragma: no cover
        raise SystemExit(
            "Missing dependency 'edge-tts'. Install with: python -m pip install edge-tts"
        ) from e

    input_files = _iter_ssml_files(input_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    jobs = _make_jobs(input_files, output_dir, ext)

    # Render sequentially to keep output readable.
    for job in jobs:
        ssml = job.input_path.read_text(encoding="utf-8")

        # edge-tts accepts SSML when the payload is a <speak>...</speak> string.
        communicate = edge_tts.Communicate(text=ssml, voice=voice)

        if ext == ".wav":
            tmp_mp3 = job.output_path.with_suffix(".tmp.mp3")
            tmp_wav = job.output_path.with_suffix(".tmp.wav")

            if tmp_mp3.exists():
                tmp_mp3.unlink()
            if tmp_wav.exists():
                tmp_wav.unlink()

            await communicate.save(str(tmp_mp3))

            try:
                subprocess.run(
                    [
                        ffmpeg_cmd,
                        "-y",
                        "-i",
                        str(tmp_mp3),
                        "-acodec",
                        "pcm_s16le",
                        "-ac",
                        "1",
                        str(tmp_wav),
                    ],
                    check=True,
                    capture_output=True,
                    text=True,
                )
            except subprocess.CalledProcessError as e:
                raise SystemExit(
                    f"ffmpeg conversion failed for {job.input_path.name}:\n{e.stderr}"
                ) from e
            finally:
                if tmp_mp3.exists():
                    tmp_mp3.unlink()

            os.replace(tmp_wav, job.output_path)
        else:
            tmp_path = job.output_path.with_suffix(job.output_path.suffix + ".tmp")
            if tmp_path.exists():
                tmp_path.unlink()

            await communicate.save(str(tmp_path))
            os.replace(tmp_path, job.output_path)

        print(f"Wrote: {job.output_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Render SSML takes to audio.")
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("list-voices", help="List available edge-tts voices")

    p_render = sub.add_parser("render", help="Render all SSML files to audio")
    p_render.add_argument(
        "--input",
        type=Path,
        default=DEFAULT_INPUT_DIR,
        help=f"Directory containing .ssml files (default: {DEFAULT_INPUT_DIR})",
    )
    p_render.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help=f"Output directory for generated audio (default: {DEFAULT_OUTPUT_DIR})",
    )
    p_render.add_argument(
        "--voice",
        type=str,
        required=True,
        help='Voice short name (run "list-voices" to discover).',
    )
    p_render.add_argument(
        "--ext",
        type=str,
        default=".mp3",
        choices=[".mp3", ".wav"],
        help="Output extension (default: .mp3)",
    )
    p_render.add_argument(
        "--ffmpeg",
        type=str,
        default="ffmpeg",
        help="ffmpeg command (default: ffmpeg)",
    )

    args = parser.parse_args()

    if args.cmd == "list-voices":
        asyncio.run(_list_voices())
        return

    if args.cmd == "render":
        asyncio.run(
            _render_all(
                input_dir=args.input,
                output_dir=args.output,
                voice=args.voice,
                ext=args.ext,
                ffmpeg_cmd=args.ffmpeg,
            )
        )
        return


if __name__ == "__main__":
    main()
