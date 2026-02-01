"""
DALL-E 3 Website Art Generator for Good Flippin Design
Generates complementary abstract art assets for website sections
"""

import os
import json
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv
from openai import OpenAI
import requests

# Load environment variables
load_dotenv()

# Paths
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
OUTPUT_DIR = (
    PROJECT_ROOT
    / "Brand Assets Development"
    / "Final Assets"
    / "03-Web-Assets"
    / "Hero-Backgrounds"
)

# Create output directory
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Art prompts for different website sections
ART_CONCEPTS = {
    "hero_gradient": """
    Abstract flowing gradient background for a modern tech website hero section.

    Style: Smooth flowing waves of luminous purple (#8b5cf6) blending into deep charcoal (#0d0d0d).
    Mood: Premium, intelligent, warm, inviting.
    Technical: Soft organic gradients, subtle glow effects, no harsh edges.
    Use: Full-width hero background (1920x1080 landscape).
    Aesthetic: Like Stripe or Linear hero sections - premium but approachable.

    EXCLUDE: No text, no logos, no realistic imagery, no complex patterns.
    """,
    "data_nodes": """
    Abstract geometric pattern of glowing interconnected nodes on dark background.

    Style: Minimalist network visualization with 5-7 glowing nodes connected by subtle lines.
    Colors: Teal (#10b981) nodes with soft glow on deep charcoal (#0d0d0d).
    Mood: Intelligent, connected, global reach.
    Technical: Clean geometry, soft glows, spacious composition.
    Use: Background for "Services" or "Process" section.

    EXCLUDE: No realistic imagery, no text, no clichés.
    """,
    "warm_ambient": """
    Abstract warm ambient background for contact/closing section.

    Style: Soft golden-amber (#fbbf24) glow dispersing across dark surface.
    Mood: Welcoming, warm, inviting, human-centered.
    Technical: Organic soft glow, no harsh edges, gradient blur effect.
    Use: Background for contact form or testimonial section.
    Aesthetic: Warm conclusion to the user journey.

    EXCLUDE: No text, no logos, no realistic elements.
    """,
    "portfolio_texture": """
    Subtle textured pattern for portfolio section background.

    Style: Very subtle geometric grid or circuit-like pattern in low contrast.
    Colors: Slightly lighter charcoal (#1a1a1a) pattern on deep charcoal (#0d0d0d).
    Mood: Technical precision, organized, professional.
    Technical: High subtlety, barely visible pattern, adds depth without distraction.
    Use: Repeating background texture for portfolio grid.

    EXCLUDE: No bright colors, no text, no obvious patterns.
    """,
}


def generate_art_asset(concept_name, prompt, api_key=None):
    """Generate a single art asset with DALL-E 3"""
    if api_key is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY not found in environment")

    client = OpenAI(api_key=api_key)

    print(f"\n{'=' * 60}")
    print(f"Generating: {concept_name}")
    print(f"{'=' * 60}\n")

    try:
        response = client.images.generate(
            model="dall-e-3",
            prompt=prompt,
            size="1792x1024",  # Landscape for web backgrounds
            quality="hd",
            style="vivid",
            n=1,
        )

        image_url = response.data[0].url
        revised_prompt = response.data[0].revised_prompt

        # Download image
        img_response = requests.get(image_url)
        img_response.raise_for_status()

        # Save with descriptive name
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"GFD-WebArt-{concept_name}-{timestamp}.png"
        filepath = OUTPUT_DIR / filename

        with open(filepath, "wb") as f:
            f.write(img_response.content)

        # Save metadata
        metadata = {
            "concept": concept_name,
            "timestamp": timestamp,
            "original_prompt": prompt,
            "revised_prompt": revised_prompt,
            "image_url": image_url,
            "specs": {
                "size": "1792x1024",
                "quality": "hd",
                "model": "dall-e-3",
                "style": "vivid",
            },
        }

        metadata_file = filepath.with_suffix(".json")
        with open(metadata_file, "w") as f:
            json.dump(metadata, f, indent=2)

        # Save prompts
        prompts_file = filepath.with_suffix(".txt")
        with open(prompts_file, "w") as f:
            f.write(f"CONCEPT: {concept_name}\n\n")
            f.write(f"ORIGINAL PROMPT:\n{prompt}\n\n")
            f.write(f"DALL-E REVISED PROMPT:\n{revised_prompt}\n")

        print(f"✓ Saved: {filename}")
        print(f"✓ Metadata: {metadata_file.name}")
        print(f"✓ Prompts: {prompts_file.name}")

        return filepath

    except Exception as e:
        print(f"✗ Error generating {concept_name}: {e}")
        return None


def main():
    """Generate all website art assets"""
    print("\n" + "=" * 60)
    print("GOOD FLIPPIN DESIGN - Website Art Generation")
    print("=" * 60)
    print(f"\nGenerating {len(ART_CONCEPTS)} art assets...")
    print(f"Output: {OUTPUT_DIR}\n")

    successful = 0
    failed = 0

    for concept_name, prompt in ART_CONCEPTS.items():
        result = generate_art_asset(concept_name, prompt)
        if result:
            successful += 1
        else:
            failed += 1

    print("\n" + "=" * 60)
    print(f"Generation Complete! {successful}/{len(ART_CONCEPTS)} successful")
    print("=" * 60)
    print(f"\nOutput directory: {OUTPUT_DIR}")
    print("\nNext steps:")
    print("1. Review generated backgrounds")
    print("2. Test on actual website sections")
    print("3. Adjust opacity/blend modes in CSS as needed")
    print("4. Generate additional variations if needed")

    if successful == len(ART_CONCEPTS):
        print("\n✓ SUCCESS! All website art generated.")
        return 0
    else:
        print(f"\n⚠ PARTIAL: {failed} assets failed to generate.")
        return 1


if __name__ == "__main__":
    exit(main())
