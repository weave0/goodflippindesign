"""
Good Flippin Design - DALL-E 3 Logo Generation Script
Executes the perfect prompt and saves outputs with proper metadata
"""

import os
import json
from datetime import datetime
from pathlib import Path

# Try importing OpenAI - will install if missing
try:
    from openai import OpenAI
except ImportError:
    print("OpenAI SDK not found. Installing...")
    import subprocess

    subprocess.check_call(["pip", "install", "openai", "pillow", "requests"])
    from openai import OpenAI

# Configuration
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
ASSETS_DIR = (
    PROJECT_ROOT / "Brand Assets Development" / "Final Assets" / "06-Source-Files"
)
PROMPT_FILE = SCRIPT_DIR.parent / "THE_PERFECT_DALLE_PROMPT.md"

# Ensure output directory exists
ASSETS_DIR.mkdir(parents=True, exist_ok=True)


def extract_prompt_from_markdown():
    """Extract the actual DALL-E prompt from THE_PERFECT_DALLE_PROMPT.md"""
    with open(PROMPT_FILE, "r", encoding="utf-8") as f:
        content = f.read()

    # Extract text between the code fence markers
    start_marker = "```\nCRITICAL: Create ONLY"
    end_marker = "ready to extract as raw asset"

    start_idx = content.find(start_marker)
    end_idx = content.find(end_marker)

    if start_idx == -1 or end_idx == -1:
        raise ValueError("Could not find prompt markers in markdown file")

    prompt = content[start_idx + 4 : end_idx + len(end_marker) + 1].strip()
    return prompt


def generate_logo(api_key=None, num_variants=1):
    """
    Generate logo using DALL-E 3

    Args:
        api_key: OpenAI API key (if None, will try to read from .env)
        num_variants: Number of variants to generate (1-3 recommended)
    """
    # Get API key
    if api_key is None:
        # Try to read from .env file
        env_file = PROJECT_ROOT / ".env"
        if env_file.exists():
            with open(env_file, "r") as f:
                for line in f:
                    if line.startswith("OPENAI_API_KEY="):
                        api_key = line.split("=")[1].strip().strip('"').strip("'")
                        break

        if api_key is None:
            api_key = os.getenv("OPENAI_API_KEY")

        if api_key is None:
            raise ValueError(
                "OpenAI API key not found. Please either:\n"
                "1. Set OPENAI_API_KEY environment variable, OR\n"
                "2. Create .env file with OPENAI_API_KEY=your-key-here, OR\n"
                "3. Pass api_key parameter to this function"
            )

    # Initialize OpenAI client
    client = OpenAI(api_key=api_key)

    # Extract prompt
    prompt = extract_prompt_from_markdown()

    print("=" * 80)
    print("GOOD FLIPPIN DESIGN - DALL-E 3 Logo Generation")
    print("=" * 80)
    print(f"\nPrompt Length: {len(prompt)} characters")
    print(f"Generating {num_variants} variant(s)...")
    print("\nUsing DALL-E 3 with:")
    print("  - Size: 1792x1024 (HD quality)")
    print("  - Quality: hd")
    print("  - Style: vivid (for vibrant colors)")
    print("\n" + "=" * 80 + "\n")

    results = []

    for i in range(num_variants):
        print(f"\n[Variant {i + 1}/{num_variants}] Generating...")

        try:
            response = client.images.generate(
                model="dall-e-3",
                prompt=prompt,
                size="1792x1024",  # Largest available HD size
                quality="hd",
                style="vivid",  # More vibrant colors vs. "natural"
                n=1,  # DALL-E 3 only supports n=1
            )

            image_url = response.data[0].url
            revised_prompt = response.data[0].revised_prompt

            # Download image
            import requests
            from PIL import Image
            from io import BytesIO

            img_response = requests.get(image_url)
            img = Image.open(BytesIO(img_response.content))

            # Save with timestamp
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"DALLE-Output-Variant-{i + 1:02d}_{timestamp}.png"
            filepath = ASSETS_DIR / filename

            img.save(filepath, "PNG", optimize=True)

            # Save metadata
            metadata = {
                "variant": i + 1,
                "timestamp": timestamp,
                "filename": filename,
                "original_prompt_length": len(prompt),
                "revised_prompt": revised_prompt,
                "image_url": image_url,
                "size": "1792x1024",
                "quality": "hd",
                "model": "dall-e-3",
            }

            metadata_file = filepath.with_suffix(".json")
            with open(metadata_file, "w", encoding="utf-8") as f:
                json.dump(metadata, f, indent=2)

            # Also save the actual prompt used
            prompt_file = filepath.with_suffix(".txt")
            with open(prompt_file, "w", encoding="utf-8") as f:
                f.write("=== ORIGINAL PROMPT ===\n\n")
                f.write(prompt)
                f.write("\n\n=== DALL-E 3 REVISED PROMPT ===\n\n")
                f.write(revised_prompt)

            print(f"✓ Saved: {filename}")
            print(f"✓ Metadata: {metadata_file.name}")
            print(f"✓ Prompt: {prompt_file.name}")

            results.append({"filepath": str(filepath), "metadata": metadata})

        except Exception as e:
            print(f"✗ Error generating variant {i + 1}: {e}")
            continue

    print("\n" + "=" * 80)
    print(f"Generation Complete! {len(results)}/{num_variants} successful")
    print("=" * 80)
    print(f"\nOutput directory: {ASSETS_DIR}")
    print("\nNext steps:")
    print("1. Review images at multiple sizes (1024px, 512px, 128px, 32px, 16px)")
    print("2. Test circular crop behavior")
    print("3. Check color extraction (is the glow clean?)")
    print("4. Rate against success criteria in THE_PERFECT_DALLE_PROMPT.md")
    print("5. If approved, proceed to vectorization in Illustrator/Figma")
    print("\n")

    return results


def main():
    """Main execution"""
    import sys

    # Parse arguments
    num_variants = 1
    if len(sys.argv) > 1:
        try:
            num_variants = int(sys.argv[1])
            if num_variants < 1 or num_variants > 5:
                print("Warning: num_variants should be 1-5, defaulting to 1")
                num_variants = 1
        except ValueError:
            print("Invalid argument, using default num_variants=1")

    # Generate
    try:
        results = generate_logo(num_variants=num_variants)

        if results:
            print("\n✓ SUCCESS! Logo generation complete.")
            sys.exit(0)
        else:
            print("\n✗ FAILED: No images generated successfully.")
            sys.exit(1)

    except Exception as e:
        print(f"\n✗ ERROR: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
