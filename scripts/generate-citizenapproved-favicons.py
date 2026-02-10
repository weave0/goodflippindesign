"""Generate favicon suite for CitizenApproved logo"""

from PIL import Image
import os

# Source logo
source_logo = r"E:\art\CA Logo.png"

# Output directories
outputs = {
    "brand_assets": r"Z:\GFD\Brand Assets Development\Final Assets\CitizenApproved\01-Logo-Variations",
    "gfd_assets": r"Z:\GFD\assets\logos\citizenapproved",
    "public": r"Z:\GFD\GFD Dev Projects\CitizenApproved\public",
}

# Favicon sizes needed
favicon_sizes = [16, 32, 48, 64, 128, 180, 192, 512]


def generate_favicons():
    """Generate all favicon sizes from source logo"""
    print(f"📸 Loading source logo: {source_logo}")

    # Open source image
    img = Image.open(source_logo)

    # Convert to RGBA if not already
    if img.mode != "RGBA":
        img = img.convert("RGBA")

    print(f"✅ Source image: {img.size[0]}x{img.size[1]} pixels, mode: {img.mode}")

    # Generate each size
    for size in favicon_sizes:
        print(f"\n🔄 Generating {size}x{size} favicon...")

        # Resize with high-quality resampling
        resized = img.resize((size, size), Image.Resampling.LANCZOS)

        # Save to all output directories
        for location, path in outputs.items():
            output_file = os.path.join(path, f"citizenapproved-icon-{size}x{size}.png")
            resized.save(output_file, "PNG", optimize=True)
            print(f"  ✅ Saved to {location}: {output_file}")

    # Also create apple-touch-icon.png (180x180) in public folder
    apple_touch = img.resize((180, 180), Image.Resampling.LANCZOS)
    apple_touch_path = os.path.join(outputs["public"], "apple-touch-icon.png")
    apple_touch.save(apple_touch_path, "PNG", optimize=True)
    print(f"\n✅ Created apple-touch-icon.png: {apple_touch_path}")

    # Create favicon.ico with multiple sizes (16, 32, 48, 64)
    ico_sizes = [(16, 16), (32, 32), (48, 48), (64, 64)]
    ico_images = [img.resize(s, Image.Resampling.LANCZOS) for s in ico_sizes]
    ico_path = os.path.join(outputs["public"], "favicon.ico")
    ico_images[0].save(ico_path, format="ICO", sizes=ico_sizes)
    print(f"✅ Created favicon.ico: {ico_path}")

    print(f"\n🎉 Successfully generated {len(favicon_sizes)} favicon sizes + ICO file!")
    print("📂 Assets saved to:")
    for location, path in outputs.items():
        print(f"   • {location}: {path}")


if __name__ == "__main__":
    generate_favicons()
