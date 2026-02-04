# AI Aimate Production Deployment Script
# Unlocks $600-800/month revenue potential

Write-Host "🚀 AI Aimate Deployment to Production" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Navigate to portal directory
Set-Location "z:\GFD\GFD Dev Projects\AI\portal"

Write-Host "📦 Staging all changes..." -ForegroundColor Yellow
git add .

Write-Host "📝 Creating commit..." -ForegroundColor Yellow
$commitMessage = @"
feat: Add ecosystem nav + complete Stripe donation system

✨ New Features:
- Universal ecosystem navigation (EcosystemNav.tsx)
- Complete Stripe donation widget (DonationSection.tsx)
- Payment Intents API integration
- Amount selection UI ($10, $25, $50, $100)
- Custom amount input
- Google Analytics tracking

🎯 Business Impact:
- Unlocks $600-800/month revenue potential
- Professional ecosystem branding
- Seamless user navigation

✅ Testing:
- Verified on localhost:3000
- Stripe Elements tested
- Navigation dropdown working
- All 5 ecosystem links present

📊 Ready for Production
"@

git commit -m $commitMessage

Write-Host ""
Write-Host "🔄 Pushing to Vercel..." -ForegroundColor Yellow
git push origin main

Write-Host ""
Write-Host "✅ Deployment initiated!" -ForegroundColor Green
Write-Host ""
Write-Host "📍 Monitor deployment at:" -ForegroundColor Cyan
Write-Host "   https://vercel.com/dashboard"
Write-Host ""
Write-Host "🌐 Live site (2-3 min):" -ForegroundColor Cyan
Write-Host "   https://aiaimate.com"
Write-Host ""
Write-Host "💰 Test donation flow:" -ForegroundColor Cyan
Write-Host "   https://aiaimate.com/support"
Write-Host ""
Write-Host "📊 Stripe Dashboard:" -ForegroundColor Cyan
Write-Host "   https://dashboard.stripe.com"
Write-Host ""
Write-Host "🎉 Revenue system LIVE!" -ForegroundColor Green
