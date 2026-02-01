"""
Create Web-Optimized Logo Variations
Generates properly sized logo files for web use from the master logo
"""

from PIL import Image
import os

# Paths
SOURCE = "../Final Assets/06-Source-Files/GFD-Logo-Master-APPROVED.png"
OUTPUT_DIR = "../../assets"


def create_logo_variations():
    """Create web-optimized logo variations"""

    print("Creating web-optimized logo variations...")

    # Load master logo
    master = Image.open(SOURCE)
    print(f"Loaded master logo: {master.size}")

    # Define variations needed for web
    variations = {
        "logo-nav.png": (120, 120),  # Navigation bar (small)
        "logo-hero.png": (400, 400),  # Hero section (medium)
        "logo-footer.png": (80, 80),  # Footer (tiny)
        "logo-master.png": (800, 800),  # General use (large, web-optimized)
    }

    for filename, size in variations.items():
        output_path = os.path.join(OUTPUT_DIR, filename)

        # Create thumbnail with high quality
        logo_copy = master.copy()
        logo_copy.thumbnail(size, Image.Resampling.LANCZOS)

        # Create new image with exact size (centered)
        final = Image.new("RGBA", size, (0, 0, 0, 0))
        paste_x = (size[0] - logo_copy.width) // 2
        paste_y = (size[1] - logo_copy.height) // 2
        final.paste(
            logo_copy,
            (paste_x, paste_y),
            logo_copy if logo_copy.mode == "RGBA" else None,
        )

        # Save with optimization
        final.save(output_path, "PNG", optimize=True)
        file_size = os.path.getsize(output_path) / 1024
        print(f"✓ Created {filename}: {size[0]}x{size[1]} ({file_size:.1f} KB)")

    print(f"\n✓ All logo variations created in {OUTPUT_DIR}")


if __name__ == "__main__":
    create_logo_variations()
