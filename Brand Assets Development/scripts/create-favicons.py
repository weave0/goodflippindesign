"""
Favicon Generator for Good Flippin Design
Creates all required favicon sizes from master logo
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
    / "03-Web-Assets"
    / "Favicons"
)

# Favicon sizes (square only)
FAVICON_SIZES = [16, 32, 48, 64, 128, 180, 192, 512]

# Create output directory
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def create_square_crop(img):
    """Crop image to square (center crop)"""
    width, height = img.size

    if width == height:
        return img

    # Determine crop box
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


def generate_favicons():
    """Generate all favicon sizes from master logo"""
    print("\n" + "=" * 60)
    print("GOOD FLIPPIN DESIGN - Favicon Generation")
    print("=" * 60)
    print(f"\nMaster Logo: {MASTER_LOGO}")
    print(f"Output: {OUTPUT_DIR}\n")

    if not MASTER_LOGO.exists():
        print(f"✗ ERROR: Master logo not found at {MASTER_LOGO}")
        return 1

    # Load and prepare master image
    try:
        master_img = Image.open(MASTER_LOGO)
        print(f"✓ Loaded master logo: {master_img.size[0]}x{master_img.size[1]}")

        # Convert to RGBA if needed
        if master_img.mode != "RGBA":
            master_img = master_img.convert("RGBA")

        # Crop to square
        square_img = create_square_crop(master_img)
        print(f"✓ Cropped to square: {square_img.size[0]}x{square_img.size[1]}")

    except Exception as e:
        print(f"✗ ERROR loading master logo: {e}")
        return 1

    # Generate each size
    print(f"\nGenerating {len(FAVICON_SIZES)} favicon sizes...")
    successful = 0

    for size in FAVICON_SIZES:
        try:
            # Resize with high-quality downsampling
            resized = square_img.resize((size, size), Image.Resampling.LANCZOS)

            # Save as PNG
            output_file = OUTPUT_DIR / f"favicon-{size}x{size}.png"
            resized.save(output_file, "PNG", optimize=True)

            # Get file size
            file_size = output_file.stat().st_size / 1024  # KB

            print(f"  ✓ {size}x{size}px ({file_size:.1f} KB)")
            successful += 1

        except Exception as e:
            print(f"  ✗ {size}x{size}px - Error: {e}")

    # Create ICO file (multi-resolution)
    print("\nCreating favicon.ico (multi-resolution)...")
    try:
        ico_sizes = [(16, 16), (32, 32), (48, 48), (64, 64)]
        ico_images = [
            square_img.resize(size, Image.Resampling.LANCZOS) for size in ico_sizes
        ]

        ico_file = OUTPUT_DIR / "favicon.ico"
        ico_images[0].save(
            ico_file, format="ICO", sizes=ico_sizes, append_images=ico_images[1:]
        )

        file_size = ico_file.stat().st_size / 1024
        print(f"  ✓ favicon.ico ({file_size:.1f} KB) - contains 16, 32, 48, 64px")
        successful += 1

    except Exception as e:
        print(f"  ✗ favicon.ico - Error: {e}")

    # Create Apple Touch Icon (180x180 with padding)
    print("\nCreating apple-touch-icon.png (180x180)...")
    try:
        # Apple recommends adding padding
        apple_size = 180
        padding = 18  # 10% padding

        # Create canvas
        apple_canvas = Image.new("RGBA", (apple_size, apple_size), (0, 0, 0, 0))

        # Resize logo to fit with padding
        logo_size = apple_size - (padding * 2)
        apple_logo = square_img.resize((logo_size, logo_size), Image.Resampling.LANCZOS)

        # Paste centered with padding
        apple_canvas.paste(apple_logo, (padding, padding), apple_logo)

        apple_file = OUTPUT_DIR / "apple-touch-icon.png"
        apple_canvas.save(apple_file, "PNG", optimize=True)

        file_size = apple_file.stat().st_size / 1024
        print(f"  ✓ apple-touch-icon.png ({file_size:.1f} KB)")
        successful += 1

    except Exception as e:
        print(f"  ✗ apple-touch-icon.png - Error: {e}")

    print("\n" + "=" * 60)
    print(f"Favicon Generation Complete! {successful} files created")
    print("=" * 60)
    print(f"\nOutput directory: {OUTPUT_DIR}")
    print("\nNext steps:")
    print("1. Copy favicons to website root")
    print("2. Add to index.html <head>:")
    print(
        '   <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">'
    )
    print(
        '   <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">'
    )
    print(
        '   <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">'
    )
    print('   <link rel="icon" href="/favicon.ico">')

    print("\n✓ SUCCESS! All favicons ready for deployment.")
    return 0


if __name__ == "__main__":
    exit(generate_favicons())
