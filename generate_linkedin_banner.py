#!/usr/bin/env python3
"""
Generate LinkedIn Company Cover Banner using DALL-E 3
Dimensions: 1128x191 (ultra-wide)
"""

import os
from openai import OpenAI

# Initialize OpenAI client
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

# The refined prompt from LINKEDIN_COMPANY_COVER_DALLE_PROMPT.md
PROMPT = """Create a hyper-minimalist, executive-tier LinkedIn Company Page cover banner (1128x191). Style: 'Silent Efficiency' and 'Dark Mode Engineering'. Background: Deepest matte charcoal (hex code #0d0d0d vibes) with a very faint, fine-grain noise texture to prevent banding.

Visual Narrative:
1. Structure: A barely-visible, precise technical grid (thin, translucent white lines at 5% opacity) representing engineered stability.
2. Flow: A single, elegant, horizontal abstract stream or 'current' moving from left to right—composed of faint data points and soft light trails (muted silver/platinum)—representing automated deployment and data pipelines.
3. Intelligence: Subtle, abstract nodes (tiny connected dots) clustered softly in the right-third, implying AI integration without being literal computer chips.

Composition:
- Left Side (35%): Deep negative space (empty/quiet) to allow the LinkedIn company logo to sit without clashing.
- Right Side: The visual weight (the flow/nodes) concentrates here.
- Atmosphere: Calm, trustworthy, expensive, precise.

Exclusions:
- NO text, NO words, NO logos, NO hands, NO laptops, NO neon/cyberpunk colors. Keep it monochrome with silver accents."""

print("🎨 Generating LinkedIn Company Cover Banner...")
print("📐 Dimensions: 1128x191 (ultra-wide)")
print("🎯 Style: Silent Efficiency + Dark Mode Engineering\n")

try:
    response = client.images.generate(
        model="dall-e-3",
        prompt=PROMPT,
        size="1792x1024",  # DALL-E 3's largest size (we'll crop/resize after)
        quality="hd",
        n=1,
    )

    image_url = response.data[0].url
    revised_prompt = response.data[0].revised_prompt

    print("✅ Image generated successfully!")
    print(f"\n📍 Image URL:\n{image_url}\n")
    print(f"🔄 DALL-E's interpretation:\n{revised_prompt}\n")
    print("💡 Next steps:")
    print("   1. Download the image from the URL above")
    print("   2. Crop/resize to exactly 1128x191 using Photoshop/Figma")
    print("   3. Ensure left 35% remains dark for logo overlay")
    print("   4. Upload to LinkedIn Company Page")

except Exception as e:
    print(f"❌ Error: {e}")
    print("\nTroubleshooting:")
    print("   - Verify API key is valid")
    print("   - Check OpenAI account has credits")
    print("   - Ensure internet connection is stable")
