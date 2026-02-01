"""
Social Media Image Resizer for Good Flippin Design
Creates properly sized profile images for all platforms
"""

from pathlib import Path
from PIL import Image

# Paths
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
MASTER_LOGO = (
    PROJECT_ROOT
    / "Brand Assets Development"
    / "Final Assets"
    / "06-Source-Files"
    / "GFD-Logo-Master-APPROVED.png"
)
OUTPUT_DIR = (
    PROJECT_ROOT
    / "Brand Assets Development"
    / "Final Assets"
    / "02-Social-Media"
    / "Profiles"
)

# Social media profile specs (all square, circular safe)
SOCIAL_SPECS = {
    "instagram": {"size": 1080, "name": "Instagram Profile (1080x1080)"},
    "twitter": {"size": 400, "name": "Twitter/X Profile (400x400)"},
    "linkedin": {"size": 400, "name": "LinkedIn Profile (400x400)"},
    "facebook": {"size": 180, "name": "Facebook Profile (180x180)"},
    "youtube": {"size": 800, "name": "YouTube Channel (800x800)"},
    "github": {"size": 460, "name": "GitHub Profile (460x460)"},
    "discord": {"size": 128, "name": "Discord Server/User (128x128)"},
}

# Create output directory
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def create_square_crop(img):
    """Crop image to square (center crop)"""
    width, height = img.size

    if width == height:
        return img

    if width > height:
        left = (width - height) // 2
        top = 0
        right = left + height
        bottom = height
    else:
        left = 0
        top = (height - width) // 2
        right = width
        bottom = top + width

    return img.crop((left, top, right, bottom))


def add_circular_safe_padding(img, padding_percent=5):
    """Add padding to ensure circular crop doesn't cut important elements"""
    size = img.size[0]  # Square, so width = height
    padding = int(size * padding_percent / 100)

    # Create larger canvas
    new_size = size + (padding * 2)
    padded = Image.new("RGBA", (new_size, new_size), (0, 0, 0, 0))

    # Paste original centered
    padded.paste(img, (padding, padding), img)

    # Resize back to original size
    return padded.resize((size, size), Image.Resampling.LANCZOS)


def generate_social_profiles():
    """Generate all social media profile images"""
    print("\n" + "=" * 60)
    print("GOOD FLIPPIN DESIGN - Social Media Profile Generation")
    print("=" * 60)
    print(f"\nMaster Logo: {MASTER_LOGO}")
    print(f"Output: {OUTPUT_DIR}\n")

    if not MASTER_LOGO.exists():
        print(f"✗ ERROR: Master logo not found at {MASTER_LOGO}")
        return 1

    # Load master image
    try:
        master_img = Image.open(MASTER_LOGO)
        print(f"✓ Loaded master logo: {master_img.size[0]}x{master_img.size[1]}")

        if master_img.mode != "RGBA":
            master_img = master_img.convert("RGBA")

        # Crop to square
        square_img = create_square_crop(master_img)
        print(f"✓ Cropped to square: {square_img.size[0]}x{square_img.size[1]}")

        # Add circular safe padding
        safe_img = add_circular_safe_padding(square_img, padding_percent=5)
        print("✓ Added circular-safe padding (5%)")

    except Exception as e:
        print(f"✗ ERROR loading master logo: {e}")
        return 1

    # Generate each platform size
    print(f"\nGenerating {len(SOCIAL_SPECS)} social media profiles...")
    successful = 0

    for platform, specs in SOCIAL_SPECS.items():
        try:
            size = specs["size"]
            name = specs["name"]

            # Resize
            resized = safe_img.resize((size, size), Image.Resampling.LANCZOS)

            # Save
            output_file = OUTPUT_DIR / f"GFD-Profile-{platform}-{size}x{size}.png"
            resized.save(output_file, "PNG", optimize=True)

            file_size = output_file.stat().st_size / 1024
            print(f"  ✓ {name}: {file_size:.1f} KB")
            successful += 1

        except Exception as e:
            print(f"  ✗ {platform} - Error: {e}")

    # Also create generic sizes for flexibility
    print("\nGenerating generic square sizes...")
    generic_sizes = [64, 128, 256, 512, 1024, 2048]

    for size in generic_sizes:
        try:
            resized = safe_img.resize((size, size), Image.Resampling.LANCZOS)
            output_file = OUTPUT_DIR / f"GFD-Profile-Generic-{size}x{size}.png"
            resized.save(output_file, "PNG", optimize=True)

            file_size = output_file.stat().st_size / 1024
            print(f"  ✓ Generic {size}x{size}: {file_size:.1f} KB")
            successful += 1

        except Exception as e:
            print(f"  ✗ Generic {size}x{size} - Error: {e}")

    print("\n" + "=" * 60)
    print(f"Social Profile Generation Complete! {successful} images created")
    print("=" * 60)
    print(f"\nOutput directory: {OUTPUT_DIR}")
    print("\n📱 Platform-specific profiles ready:")
    print("  • Instagram (1080x1080) - upload as profile picture")
    print("  • Twitter/X (400x400) - circular crop safe")
    print("  • LinkedIn (400x400) - professional profile")
    print("  • Facebook (180x180) - page/profile picture")
    print("  • YouTube (800x800) - channel icon")
    print("  • GitHub (460x460) - repository/org icon")
    print("  • Discord (128x128) - server/user avatar")
    print("\n🎨 Generic sizes (64-2048px) available for other uses")

    print("\n✓ SUCCESS! All social profile images ready.")
    return 0


if __name__ == "__main__":
    exit(generate_social_profiles())
