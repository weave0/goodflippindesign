"""
AI Aimate Logo Processing Pipeline
Automates favicon cascade and social media variant generation
Requires: Pillow (pip install Pillow)
"""

from PIL import Image
import os

# Paths
INPUT_DIR = r"Z:\GFD\Brand Assets Development\AI Aimate\Generated Raw"
OUTPUT_WEB = r"Z:\GFD\Brand Assets Development\AI Aimate\Web Assets"
OUTPUT_SOCIAL = r"Z:\GFD\Brand Assets Development\AI Aimate\Social Media"
DEPLOY_DIR = r"Z:\GFD\GFD Dev Projects\AI\portal\public"

# Sizes needed
WEB_SIZES = {
    "favicon-16x16.png": 16,
    "favicon-32x32.png": 32,
    "favicon-192x192.png": 192,
    "favicon-512x512.png": 512,
    "apple-touch-icon.png": 180,  # Standard iOS name (180x180)
}

SOCIAL_SIZES = {
    "instagram-profile-1080x1080.png": 1080,
    "twitter-profile-400x400.png": 400,
    "linkedin-profile-400x400.png": 400,
}


def make_square(img):
    """
    Center-crop image to square aspect ratio.
    Handles rectangular DALL-E outputs (1792x1024) safely.
    """
    width, height = img.size

    if width == height:
        return img  # Already square

    # Determine crop size (smaller dimension)
    crop_size = min(width, height)

    # Calculate crop box to center the subject
    left = (width - crop_size) // 2
    top = (height - crop_size) // 2
    right = left + crop_size
    bottom = top + crop_size

    return img.crop((left, top, right, bottom))


def process_logo(input_file):
    """
    Process the selected DALL-E output into all required variants

    Args:
        input_file: Path to the best DALL-E variant (e.g., 'dalle-variant-1-teal.png')
    """
    print(f"\n🎨 Processing AI Aimate Logo from: {input_file}\n")

    # Load the image
    img_path = os.path.join(INPUT_DIR, input_file)
    if not os.path.exists(img_path):
        print(f"❌ File not found: {img_path}")
        print("\n📁 Available files in Generated Raw/:")
        for f in os.listdir(INPUT_DIR):
            if f.endswith(".png"):
                print(f"   • {f}")
        return

    img = Image.open(img_path)
    print(f"✓ Loaded image: {img.size[0]}x{img.size[1]}px")

    # Convert to RGBA if needed (for transparency)
    if img.mode != "RGBA":
        print("  Converting to RGBA for transparency...")
        img = img.convert("RGBA")

    # Ensure square aspect ratio (crop if needed)
    if img.width != img.height:
        print(f"  Cropping to square ({img.width}x{img.height} → square)...")
        img = make_square(img)
        print(f"  ✓ Cropped to {img.width}x{img.height}px")

    # Create high-res master (4096x4096) centered on transparent background
    master_size = 4096
    master = Image.new("RGBA", (master_size, master_size), (0, 0, 0, 0))

    # Center the logo (preserve aspect ratio, max 90% of canvas)
    max_size = int(master_size * 0.9)
    img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)

    offset = ((master_size - img.width) // 2, (master_size - img.height) // 2)
    master.paste(img, offset, img)

    # Save master
    master_path = os.path.join(OUTPUT_WEB, "AI-Aimate-Logo-Master-4096x4096.png")
    master.save(master_path, "PNG", optimize=True)
    print("✓ Created master: AI-Aimate-Logo-Master-4096x4096.png")

    # Generate web assets (favicons)
    print("\n📱 Generating web assets...")
    for filename, size in WEB_SIZES.items():
        favicon = master.copy()
        favicon.thumbnail((size, size), Image.Resampling.LANCZOS)

        # Center on exact size canvas
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        offset = ((size - favicon.width) // 2, (size - favicon.height) // 2)
        canvas.paste(favicon, offset, favicon)

        output_path = os.path.join(OUTPUT_WEB, filename)
        canvas.save(output_path, "PNG", optimize=True)
        print(f"  ✓ {filename} ({size}x{size}px)")
    # Generate favicon.ico (multi-size: 16+32)
    print("\n🔷 Generating favicon.ico (multi-size)...")
    favicon_16 = master.copy()
    favicon_16.thumbnail((16, 16), Image.Resampling.LANCZOS)
    canvas_16 = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    offset_16 = ((16 - favicon_16.width) // 2, (16 - favicon_16.height) // 2)
    canvas_16.paste(favicon_16, offset_16, favicon_16)

    favicon_32 = master.copy()
    favicon_32.thumbnail((32, 32), Image.Resampling.LANCZOS)
    canvas_32 = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    offset_32 = ((32 - favicon_32.width) // 2, (32 - favicon_32.height) // 2)
    canvas_32.paste(favicon_32, offset_32, favicon_32)

    favicon_ico_path = os.path.join(OUTPUT_WEB, "favicon.ico")
    canvas_16.save(
        favicon_ico_path,
        format="ICO",
        sizes=[(16, 16), (32, 32)],
        append_images=[canvas_32],
    )
    print("  ✓ favicon.ico (16+32 multi-size)")
    # Generate social media variants
    print("\n📣 Generating social media variants...")
    for filename, size in SOCIAL_SIZES.items():
        social = master.copy()
        social.thumbnail((size, size), Image.Resampling.LANCZOS)

        # Center on exact size canvas
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        offset = ((size - social.width) // 2, (size - social.height) // 2)
        canvas.paste(social, offset, social)

        output_path = os.path.join(OUTPUT_SOCIAL, filename)
        canvas.save(output_path, "PNG", optimize=True)
        print(f"  ✓ {filename} ({size}x{size}px)")

    # Generate OG image (1200x630 with dark background)
    print("\n🌐 Generating Open Graph image...")
    og_width, og_height = 1200, 630
    og_canvas = Image.new("RGBA", (og_width, og_height), (13, 13, 13, 255))  # #0d0d0d

    # Center logo (max 50% of height to leave space)
    og_logo = master.copy()
    max_logo_size = int(og_height * 0.5)
    og_logo.thumbnail((max_logo_size, max_logo_size), Image.Resampling.LANCZOS)

    offset = ((og_width - og_logo.width) // 2, (og_height - og_logo.height) // 2)
    og_canvas.paste(og_logo, offset, og_logo)

    # Convert to RGB for JPEG (OG images don't need transparency)
    og_rgb = Image.new("RGB", og_canvas.size, (13, 13, 13))
    og_rgb.paste(og_canvas, mask=og_canvas.split()[3])

    og_path = os.path.join(OUTPUT_WEB, "og-image.png")
    og_rgb.save(og_path, "PNG", optimize=True, quality=95)
    print("  ✓ og-image.png (1200x630px)")

    # Copy to deployment directory
    print("\n🚀 Copying to deployment directory...")
    os.makedirs(DEPLOY_DIR, exist_ok=True)

    for filename in list(WEB_SIZES.keys()) + ["og-image.png"]:
        src = os.path.join(OUTPUT_WEB, filename)
        dst = os.path.join(DEPLOY_DIR, filename)

        if os.path.exists(src):
            import shutil

            shutil.copy2(src, dst)
            print(f"  ✓ Copied {filename} to AI/portal/public/")

    print("\n✅ Logo processing complete!")
    print("\n📊 Summary:")
    print("  • Master file: 4096x4096px")
    print(f"  • Web assets: {len(WEB_SIZES)} files (16px-512px)")
    print(f"  • Social media: {len(SOCIAL_SIZES)} files")
    print("  • OG image: 1200x630px")
    print("\n📁 Files saved to:")
    print(f"  • {OUTPUT_WEB}")
    print(f"  • {OUTPUT_SOCIAL}")
    print(f"  • {DEPLOY_DIR} (deployment ready)")
    print("\n🎯 Next: Update layout.tsx metadata and deploy!")


if __name__ == "__main__":
    print("=" * 60)
    print("AI Aimate Logo Processing Pipeline")
    print("=" * 60)

    # List available files
    print("\n📁 Files in Generated Raw/:")
    raw_files = [f for f in os.listdir(INPUT_DIR) if f.endswith(".png")]

    if not raw_files:
        print("  ⚠️  No PNG files found!")
        print("\n  Please save your DALL-E outputs to:")
        print(f"  {INPUT_DIR}")
        print("\n  Recommended naming:")
        print("    • dalle-variant-1-teal.png")
        print("    • dalle-variant-2-purple.png")
        print("    • dalle-variant-3-amber.png")
    else:
        for i, f in enumerate(raw_files, 1):
            print(f"  {i}. {f}")

        # Prompt for selection
        print(f"\nWhich variant should we process? (1-{len(raw_files)})")
        choice = input("Enter number (or 'q' to quit): ").strip()

        if choice.lower() == "q":
            print("Cancelled.")
        else:
            try:
                idx = int(choice) - 1
                if 0 <= idx < len(raw_files):
                    process_logo(raw_files[idx])
                else:
                    print(f"❌ Invalid selection. Please choose 1-{len(raw_files)}")
            except ValueError:
                print("❌ Invalid input. Please enter a number.")

    print("\n" + "=" * 60)
