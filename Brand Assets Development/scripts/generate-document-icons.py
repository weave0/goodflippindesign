"""
Generate Custom Legal Document Icons
Creates branded icons for NDA, Service Agreement, and Statement of Work
"""

import os
from openai import OpenAI

# Initialize OpenAI client (load from environment variable)
api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    raise ValueError("OPENAI_API_KEY environment variable not set")
client = OpenAI(api_key=api_key)

OUTPUT_DIR = "../Final Assets/03-Web-Assets/Document-Icons"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Brand colors from the logo
BRAND_COLORS = {
    "purple": "#8b5cf6",
    "teal": "#10b981",
    "amber": "#fbbf24",
    "dark": "#0d0d0d",
}


def generate_document_icon(doc_type, color_accent, symbol_hint):
    """Generate a single document icon using DALL-E"""

    prompt = f"""
Create a minimalist legal document icon for "{doc_type}" with Good Flippin Design branding.

STYLE:
- Clean, professional icon design
- Dark charcoal background ({BRAND_COLORS["dark"]})
- Single accent color: {color_accent} (soft glow effect)
- Geometric and modern
- 1024x1024 square format

COMPOSITION:
- Stylized document/paper symbol as base
- {symbol_hint}
- Subtle glow effect on accent elements
- 15% margin around edges
- Centered, balanced composition

VISUAL LANGUAGE:
- Professional but approachable
- Premium quality
- Matches tech/legal industry standards
- Simple enough to scale down to 64px

EXCLUDE:
- No text or letters
- No realistic textures
- No complex gradients
- No harsh neon effects
- No 3D effects

OUTPUT: Flat icon design, perfect for web use, professional legal document aesthetic with warm modern branding.
"""

    print(f"\nGenerating icon for {doc_type}...")
    print(f"Accent color: {color_accent}")

    try:
        response = client.images.generate(
            model="dall-e-3",
            prompt=prompt,
            size="1024x1024",
            quality="standard",  # Standard quality is fine for icons
            n=1,
        )

        image_url = response.data[0].url

        # Download the image
        import requests

        img_data = requests.get(image_url).content

        # Save with descriptive filename
        timestamp = __import__("datetime").datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"GFD-Icon-{doc_type.replace(' ', '_')}-{timestamp}.png"
        filepath = os.path.join(OUTPUT_DIR, filename)

        with open(filepath, "wb") as f:
            f.write(img_data)

        print(f"✓ Saved: {filename}")
        return filepath

    except Exception as e:
        print(f"✗ Error generating {doc_type}: {e}")
        return None


def generate_all_icons():
    """Generate all three document icons"""

    print("=" * 60)
    print("Generating Custom Legal Document Icons")
    print("=" * 60)

    icons = [
        {
            "type": "NDA",
            "color": BRAND_COLORS["purple"],
            "hint": "Shield or lock symbol integrated with document outline",
        },
        {
            "type": "Service_Agreement",
            "color": BRAND_COLORS["teal"],
            "hint": "Handshake or connection nodes integrated with document outline",
        },
        {
            "type": "Statement_of_Work",
            "color": BRAND_COLORS["amber"],
            "hint": "Checklist or task symbols integrated with document outline",
        },
    ]

    results = []
    for icon in icons:
        filepath = generate_document_icon(icon["type"], icon["color"], icon["hint"])
        if filepath:
            results.append(filepath)

    print("\n" + "=" * 60)
    print(f"✓ Generated {len(results)}/3 icons")
    print(f"Output directory: {OUTPUT_DIR}")
    print("=" * 60)

    return results


if __name__ == "__main__":
    generate_all_icons()
