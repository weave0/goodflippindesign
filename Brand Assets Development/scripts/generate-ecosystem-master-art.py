"""
Generate the flagship ecosystem master artwork from the canonical production prompt.
"""

import argparse
import json
import os
from datetime import datetime
from pathlib import Path

from openai import AuthenticationError, OpenAI


SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
PROMPT_FILE = (
    PROJECT_ROOT
    / "Brand Assets Development"
    / "ECOSYSTEM_MASTER_ARTWORK_FINAL_PROMPT.txt"
)
OUTPUT_DIR = (
    PROJECT_ROOT
    / "Brand Assets Development"
    / "Final Assets"
    / "06-Source-Files"
    / "Ecosystem-Master-Art"
)


def load_api_key():
    env_key = os.getenv("OPENAI_API_KEY")
    if env_key:
        return env_key

    env_file = PROJECT_ROOT / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            if line.startswith("OPENAI_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")

    return None


def load_prompt():
    if not PROMPT_FILE.exists():
        raise FileNotFoundError(f"Prompt file not found: {PROMPT_FILE}")

    prompt = PROMPT_FILE.read_text(encoding="utf-8").strip()
    if not prompt:
        raise ValueError("Prompt file is empty")

    return prompt


def ensure_output_dir():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def generate_image(prompt, api_key, size, quality, style):
    client = OpenAI(api_key=api_key)
    return client.images.generate(
        model="gpt-image-1",
        prompt=prompt,
        size=size,
        quality=quality,
    )


def validate_auth(api_key):
    client = OpenAI(api_key=api_key)
    client.models.list()


def save_result(image_response, prompt, variant_index, size, quality):
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    base_name = f"ecosystem-master-art-v{variant_index:02d}-{timestamp}"
    image_path = OUTPUT_DIR / f"{base_name}.png"
    metadata_path = OUTPUT_DIR / f"{base_name}.json"
    prompt_path = OUTPUT_DIR / f"{base_name}.txt"

    image_base64 = image_response.data[0].b64_json
    image_path.write_bytes(__import__("base64").b64decode(image_base64))

    metadata = {
        "variant": variant_index,
        "timestamp": timestamp,
        "model": "gpt-image-1",
        "size": size,
        "quality": quality,
        "prompt_file": str(PROMPT_FILE),
        "output_file": image_path.name,
    }
    metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    prompt_path.write_text(prompt, encoding="utf-8")

    return image_path


def parse_args():
    parser = argparse.ArgumentParser(
        description="Generate the ecosystem master artwork"
    )
    parser.add_argument(
        "--variants", type=int, default=1, help="Number of variants to generate"
    )
    parser.add_argument(
        "--size", default="1536x1024", help="Image size supported by the model"
    )
    parser.add_argument("--quality", default="high", help="Image quality setting")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate prompt, output path, and API key without generating",
    )
    parser.add_argument(
        "--check-auth",
        action="store_true",
        help="Validate the API key with a lightweight OpenAI request",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    ensure_output_dir()
    prompt = load_prompt()
    api_key = load_api_key()

    print("=" * 72)
    print("GOOD FLIPPIN DESIGN - ECOSYSTEM MASTER ART GENERATOR")
    print("=" * 72)
    print(f"Prompt file: {PROMPT_FILE}")
    print(f"Output directory: {OUTPUT_DIR}")
    print(f"Prompt length: {len(prompt)} characters")
    print(f"Variants: {args.variants}")
    print(f"Size: {args.size}")
    print(f"Quality: {args.quality}")

    if not api_key:
        raise ValueError(
            "OpenAI API key not found. Set OPENAI_API_KEY in the environment or in .env before running."
        )

    if args.check_auth:
        try:
            validate_auth(api_key)
            print("\nAuthentication check succeeded.")
        except AuthenticationError:
            print(
                "\nAuthentication check failed: the configured OpenAI API key is invalid."
            )
            print(
                "Update OPENAI_API_KEY in your environment or .env, then rerun the script."
            )
            return 1

    if args.dry_run:
        print("\nDry run succeeded. Environment and prompt are ready.")
        return 0

    successful = 0
    for variant_index in range(1, args.variants + 1):
        print(f"\nGenerating variant {variant_index}/{args.variants}...")
        try:
            response = generate_image(
                prompt=prompt,
                api_key=api_key,
                size=args.size,
                quality=args.quality,
                style="vivid",
            )
        except AuthenticationError:
            print("Authentication failed: the configured OpenAI API key is invalid.")
            print(
                "Update OPENAI_API_KEY in your environment or .env, then rerun the script."
            )
            return 1
        image_path = save_result(
            image_response=response,
            prompt=prompt,
            variant_index=variant_index,
            size=args.size,
            quality=args.quality,
        )
        print(f"Saved: {image_path}")
        successful += 1

    print(f"\nGeneration complete: {successful}/{args.variants} variants saved.")
    return 0 if successful == args.variants else 1


if __name__ == "__main__":
    raise SystemExit(main())
