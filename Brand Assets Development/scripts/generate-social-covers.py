"""
GOOD FLIPPIN DESIGN - Social Media Covers & OG Images Generator
Generates platform-specific cover images and social meta images using DALL-E 3
"""

import os
import sys
from pathlib import Path
from datetime import datetime
from openai import OpenAI
from dotenv import load_dotenv
import requests

# Load environment variables
load_dotenv()

# Configuration
MASTER_LOGO_PATH = (
    Path(__file__).parent.parent
    / "Final Assets"
    / "06-Source-Files"
    / "GFD-Logo-Master-APPROVED.png"
)
OUTPUT_DIR = (
    Path(__file__).parent.parent / "Final Assets" / "02-Social-Media" / "Covers"
)
META_OUTPUT_DIR = (
    Path(__file__).parent.parent / "Final Assets" / "03-Web-Assets" / "Meta-Images"
)

# Create output directories
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
META_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Brand colors for reference
BRAND_COLORS = {
    "dark_bg": "#0d0d0d",
    "purple": "#8b5cf6",
    "teal": "#10b981",
    "amber": "#fbbf24",
}

# Social media cover specifications
COVER_SPECS = {
    "linkedin": {
        "size": "1128x191",
        "name": "LinkedIn Company Cover",
        "prompt": """Professional LinkedIn company cover banner for Good Flippin Design (web development consultancy).

EXACT LAYOUT:
- Dimensions: 1128x191 pixels (wide banner format)
- Left side: Circular glowing geometric logo symbol (from Good Flippin Design brand)
- Center-right: Text "GOOD FLIPPIN DESIGN" in modern sans-serif (Inter font style)
- Subtitle: "Strategic Web Development" in smaller text below
- Right side: Subtle data visualization or node network graphic

AESTHETIC:
- Dark charcoal background (#0d0d0d to #1a1a1a gradient)
- Logo glows with purple (#8b5cf6) and teal (#10b981) luminescence
- Professional, technical, premium feel
- Horizontal layout optimized for LinkedIn banner
- Clean, modern, minimal design
- Text in crisp white (#f5f5f5)

CRITICAL:
- Must be horizontal banner format (wide, not tall)
- Logo on left third
- Company name center
- Tagline below name
- Avoid cluttered design
- Professional corporate aesthetic
- Ensure text is readable at small sizes

Style: Photorealistic 3D render, professional brand banner, clean layout""",
    },
    "twitter": {
        "size": "1500x500",
        "name": "Twitter/X Header",
        "prompt": """Twitter/X profile header for Good Flippin Design (web development consultancy).

EXACT LAYOUT:
- Dimensions: 1500x500 pixels (3:1 ratio)
- Left portion: Circular glowing geometric logo symbol
- Right side: Flowing abstract gradient from purple to teal
- Text overlay: "Good Flippin Design" in modern typography
- Subtle technical pattern background (faint circuit/node network)

AESTHETIC:
- Dark background (#0d0d0d) with luminous gradient overlay
- Purple (#8b5cf6) flowing into teal (#10b981) waves
- Logo placement: left 1/3 of banner
- Gradient flows left-to-right
- Modern, digital, tech-forward aesthetic
- Twitter-optimized horizontal composition
- Vibrant yet professional

CRITICAL:
- Wide horizontal format (3:1 aspect ratio)
- Safe zone awareness (profile picture won't cover logo)
- Logo positioned left of center
- Gradient background with movement
- Clean, bold design
- Readable at desktop and mobile sizes

Style: Digital art, smooth gradient, modern tech brand header""",
    },
    "facebook": {
        "size": "820x312",
        "name": "Facebook Page Cover",
        "prompt": """Facebook business page cover for Good Flippin Design (web development consultancy).

EXACT LAYOUT:
- Dimensions: 820x312 pixels (Facebook cover ratio)
- Center-focused: Large circular glowing logo
- Background: Dark with subtle geometric pattern
- Text below logo: "Strategic Web Development" tagline
- Warm, inviting composition

AESTHETIC:
- Deep charcoal background (#0d0d0d)
- Centered glowing logo (purple #8b5cf6 and teal #10b981 glow)
- Symmetrical, balanced composition
- Ambient warm lighting (subtle amber #fbbf24 accents)
- Professional yet approachable feel
- Facebook-optimized dimensions
- Clear hierarchy: logo first, text second

CRITICAL:
- Horizontal banner (roughly 8:3 ratio)
- Centered composition
- Logo prominence
- Tagline readable
- Avoid corners (may be cropped on mobile)
- Professional business aesthetic
- Warm, inviting glow

Style: 3D render, centered composition, warm professional lighting""",
    },
    "youtube": {
        "size": "2560x1440",
        "name": "YouTube Channel Banner",
        "prompt": """YouTube channel banner for Good Flippin Design (web development consultancy).

EXACT LAYOUT:
- Dimensions: 2560x1440 pixels (16:9 ratio, TV-safe zones)
- Center: Circular glowing logo (TV-safe zone)
- Left and right wings: Abstract tech patterns (visible on desktop)
- Text: "Good Flippin Design | Strategic Web Development" centered
- Background: Dark with flowing purple-teal gradient

AESTHETIC:
- Dark charcoal base (#0d0d0d)
- Logo in center (TV-safe: 1546x423px area)
- Wide gradient wings for desktop viewing
- Purple (#8b5cf6) and teal (#10b981) flowing waves
- Technical abstract elements on sides (data nodes, circuits)
- Professional YouTube channel aesthetic
- Cinematic, wide-screen composition

CRITICAL:
- Must work at multiple viewport sizes (TV, desktop, mobile, tablet)
- Center 1546x423px is TV-safe zone - keep logo and text here
- Outer areas visible on desktop (2560x1440 full)
- Mobile crops to 1546x423px center
- Logo must be clear and centered
- Text must be readable across all devices
- Professional tech channel aesthetic

Style: Cinematic tech visualization, wide-screen format, multi-device optimized""",
    },
}

# OG/Meta image specifications
META_SPECS = {
    "og": {
        "size": "1200x630",
        "name": "Open Graph Meta Image",
        "prompt": """Open Graph meta image for Good Flippin Design website (1200x630px).

EXACT LAYOUT:
- Dimensions: 1200x630 pixels (1.91:1 ratio)
- Center: Large circular glowing logo
- Top: "Good Flippin Design" company name
- Bottom: "Strategic Web Development" tagline
- Background: Dark with subtle gradient

AESTHETIC:
- Dark charcoal background (#0d0d0d to #1a1a1a)
- Centered glowing logo (purple #8b5cf6 and teal #10b981)
- Text in clean white (#f5f5f5)
- Balanced, symmetrical composition
- Professional social media share image
- Recognizable when small (Facebook, LinkedIn thumbnails)

CRITICAL:
- Must be readable at thumbnail size (200px wide)
- Logo prominence
- Clear brand name
- Tagline visible
- No text in extreme edges (may be cropped)
- Professional, polished aesthetic
- Works on both light and dark social feeds

Style: Professional brand social card, clean layout, optimized for small previews""",
    },
    "twitter_card": {
        "size": "1200x675",
        "name": "Twitter Card Meta Image",
        "prompt": """Twitter Card meta image for Good Flippin Design website (1200x675px).

EXACT LAYOUT:
- Dimensions: 1200x675 pixels (16:9 ratio)
- Center-left: Circular glowing logo
- Right side: Flowing gradient background
- Text overlay: "Good Flippin Design" + "Strategic Web Development"
- Modern, horizontal composition

AESTHETIC:
- Dark background (#0d0d0d)
- Logo positioned left of center
- Purple-to-teal gradient flowing right
- White text with subtle glow
- Twitter-optimized 16:9 ratio
- Modern, digital aesthetic
- Readable at Twitter card size (~440px wide)

CRITICAL:
- 16:9 aspect ratio (standard Twitter card)
- Logo visible and recognizable
- Text readable when small
- Gradient provides visual interest
- Professional tech brand aesthetic
- Works in Twitter timeline preview

Style: Modern digital card, gradient background, Twitter-optimized layout""",
    },
}


def download_image(url, output_path):
    """Download image from URL to local path"""
    response = requests.get(url)
    response.raise_for_status()
    with open(output_path, "wb") as f:
        f.write(response.content)
    return output_path


def get_file_size(path):
    """Get human-readable file size"""
    size_bytes = os.path.getsize(path)
    for unit in ["B", "KB", "MB"]:
        if size_bytes < 1024.0:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.1f} GB"


def generate_cover(platform, specs, api_key=None):
    """Generate social media cover image using DALL-E 3"""
    print(f"\nGenerating: {specs['name']}")

    if api_key is None:
        api_key = os.getenv("OPENAI_API_KEY")

    if not api_key:
        raise ValueError("OpenAI API key not found in environment variables")

    client = OpenAI(api_key=api_key)

    # Determine DALL-E 3 size (maps to closest available size)
    size_mapping = {
        "1128x191": "1792x1024",  # Landscape HD (closest to wide banner)
        "1500x500": "1792x1024",  # Landscape HD
        "820x312": "1792x1024",  # Landscape HD
        "2560x1440": "1792x1024",  # Landscape HD (will need resizing)
        "1200x630": "1792x1024",  # Landscape HD
        "1200x675": "1792x1024",  # Landscape HD
    }

    dalle_size = size_mapping.get(specs["size"], "1792x1024")

    try:
        response = client.images.generate(
            model="dall-e-3",
            prompt=specs["prompt"],
            size=dalle_size,
            quality="hd",
            style="vivid",
            n=1,
        )

        image_url = response.data[0].url
        revised_prompt = response.data[0].revised_prompt

        # Generate timestamped filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        is_meta = platform in ["og", "twitter_card"]
        output_dir = META_OUTPUT_DIR if is_meta else OUTPUT_DIR

        filename_base = f"GFD-{'Meta' if is_meta else 'Cover'}-{platform}-{timestamp}"
        image_path = output_dir / f"{filename_base}.png"
        metadata_path = output_dir / f"{filename_base}.json"
        prompt_path = output_dir / f"{filename_base}.txt"

        # Download image
        download_image(image_url, image_path)
        file_size = get_file_size(image_path)

        # Save metadata
        import json

        metadata = {
            "platform": platform,
            "target_size": specs["size"],
            "generated_size": dalle_size,
            "generated_at": timestamp,
            "model": "dall-e-3",
            "quality": "hd",
            "style": "vivid",
            "original_url": image_url,
            "file_size": file_size,
            "revised_prompt": revised_prompt,
        }

        with open(metadata_path, "w") as f:
            json.dump(metadata, f, indent=2)

        # Save prompts
        with open(prompt_path, "w") as f:
            f.write(f"PLATFORM: {specs['name']}\n")
            f.write(f"TARGET SIZE: {specs['size']}\n")
            f.write(f"GENERATED: {timestamp}\n\n")
            f.write("ORIGINAL PROMPT:\n")
            f.write("=" * 80 + "\n")
            f.write(specs["prompt"])
            f.write("\n\n")
            f.write("DALL-E REVISED PROMPT:\n")
            f.write("=" * 80 + "\n")
            f.write(revised_prompt)

        print(f"  ✓ Saved: {image_path.name}")
        print(f"  ✓ Size: {file_size}")
        print(f"  ✓ Target dimensions: {specs['size']} (generated at {dalle_size})")
        print(f"  ✓ Metadata: {metadata_path.name}")
        print(f"  ✓ Prompts: {prompt_path.name}")

        return {
            "platform": platform,
            "image_path": str(image_path),
            "file_size": file_size,
            "success": True,
        }

    except Exception as e:
        print(f"  ✗ Error: {str(e)}")
        return {"platform": platform, "error": str(e), "success": False}


def main():
    print("=" * 80)
    print("GOOD FLIPPIN DESIGN - Social Media Covers & OG Images Generation")
    print("=" * 80)

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("\n✗ ERROR: OPENAI_API_KEY not found in environment variables")
        print("Please ensure .env file contains your API key")
        sys.exit(1)

    print(
        f"\nGenerating {len(COVER_SPECS)} social media covers + {len(META_SPECS)} meta images..."
    )
    print(f"Estimated cost: ~${(len(COVER_SPECS) + len(META_SPECS)) * 0.04:.2f}")

    results = []

    # Generate social media covers
    print("\n" + "=" * 80)
    print("SOCIAL MEDIA COVERS")
    print("=" * 80)

    for platform, specs in COVER_SPECS.items():
        result = generate_cover(platform, specs, api_key)
        results.append(result)

    # Generate meta/OG images
    print("\n" + "=" * 80)
    print("META/OG IMAGES (for social sharing)")
    print("=" * 80)

    for platform, specs in META_SPECS.items():
        result = generate_cover(platform, specs, api_key)
        results.append(result)

    # Summary
    print("\n" + "=" * 80)
    print("GENERATION COMPLETE")
    print("=" * 80)

    successful = [r for r in results if r.get("success", False)]
    failed = [r for r in results if not r.get("success", False)]

    print(f"\n✓ Successfully generated: {len(successful)}/{len(results)} images")

    if successful:
        print("\nSOCIAL MEDIA COVERS:")
        print(f"  Location: {OUTPUT_DIR}")
        for result in successful:
            if result["platform"] in COVER_SPECS:
                print(
                    f"    • {COVER_SPECS[result['platform']]['name']} ({result['file_size']})"
                )

        print("\nMETA/OG IMAGES:")
        print(f"  Location: {META_OUTPUT_DIR}")
        for result in successful:
            if result["platform"] in META_SPECS:
                print(
                    f"    • {META_SPECS[result['platform']]['name']} ({result['file_size']})"
                )

    if failed:
        print(f"\n✗ Failed: {len(failed)} images")
        for result in failed:
            print(f"    • {result['platform']}: {result.get('error', 'Unknown error')}")

    print("\n" + "=" * 80)
    print("NEXT STEPS")
    print("=" * 80)
    print("\n1. Review generated covers in the output folders")
    print("2. Resize if needed (DALL-E generates 1792x1024, may need cropping)")
    print("3. Upload to respective platforms:")
    print("   • LinkedIn: Company page settings → Cover image")
    print("   • Twitter/X: Profile → Edit profile → Header photo")
    print("   • Facebook: Business page → Edit cover photo")
    print("   • YouTube: Channel customization → Branding → Banner image")
    print("4. Add OG/meta images to website:")
    print('   <meta property="og:image" content="/og-image.png">')
    print('   <meta name="twitter:card" content="summary_large_image">')
    print('   <meta name="twitter:image" content="/twitter-card.png">')

    print("\n✓ SUCCESS! All images generated.")
    print("=" * 80)

    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
