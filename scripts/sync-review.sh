#!/bin/bash
# sync-review.sh - Sync index.html to temp_review.html
# Usage: ./scripts/sync-review.sh

set -e

echo "📋 Syncing index.html → temp_review.html..."

if [ ! -f "index.html" ]; then
    echo "❌ Error: index.html not found!"
    exit 1
fi

cp index.html temp_review.html

echo "✅ Sync complete!"
echo "📊 Files are now identical:"
echo "   index.html:       $(wc -l < index.html) lines"
echo "   temp_review.html: $(wc -l < temp_review.html) lines"

# Verify they're identical
if diff -q index.html temp_review.html > /dev/null; then
    echo "✅ Verification passed: Files are identical"
else
    echo "⚠️  WARNING: Files differ after sync! This should not happen."
    exit 1
fi
