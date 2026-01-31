# 🚀 Deploy Stripe Donations to Other Sites

**Status:** Good Flippin Design ✅ Deployed
**Next:** Good Flippin Vibes, AI Aimate

---

## 📦 Ready-to-Deploy Packages

### Package Contents

Each package includes:

1. HTML section (copy to your site)
2. CSS styles (add to `<style>` tag)
3. JavaScript code (add to your `<script>`)
4. CSP headers (update `_headers` or nginx config)

---

## 🎯 Site 1: Good Flippin Vibes

### Step 1: Add HTML Section

**Location:** After your main content, before footer

```html
<section id="support">
  <div class="container">
    <div class="section-header">
      <p class="section-label">Support</p>
      <h2 class="section-title">Fuel the healing journey</h2>
      <p class="section-subtitle">
        Your contribution helps keep holistic wellness resources accessible to
        all who seek them.
      </p>
    </div>
    <div class="support-grid">
      <div class="support-copy">
        <p class="support-eyebrow">Good Flippin Vibes</p>
        <h3 class="support-title">Keep the healing accessible</h3>
        <div class="support-copy">
          <p>
            Every contribution goes directly toward maintaining free wellness
            resources, expanding our community programs, and supporting those on
            their healing journey.
          </p>
          <p>
            If you're supporting a specific wellness initiative, you can note it
            in the payment message.
          </p>
        </div>
      </div>
      <div class="support-card" aria-live="polite">
        <div
          class="support-toggle"
          role="group"
          aria-label="Donation frequency"
        >
          <button
            type="button"
            class="support-toggle-btn active"
            data-mode="one-time"
          >
            One-time
          </button>
          <button type="button" class="support-toggle-btn" data-mode="monthly">
            Monthly
          </button>
        </div>
        <div class="support-amounts" role="group" aria-label="Donation amount">
          <button type="button" class="donation-amount" data-amount="10">
            $10
          </button>
          <button type="button" class="donation-amount" data-amount="25">
            $25
          </button>
          <button type="button" class="donation-amount" data-amount="50">
            $50
          </button>
          <button type="button" class="donation-amount" data-amount="100">
            $100
          </button>
          <label class="support-custom" for="support-custom-amount">
            Custom amount
            <input
              id="support-custom-amount"
              type="number"
              min="1"
              step="1"
              placeholder="Enter amount in USD"
            />
          </label>
        </div>
        <button type="button" class="btn-primary support-continue">
          Continue to payment
        </button>
        <div class="support-success" id="support-success">
          Thank you! Your support keeps the healing accessible.
        </div>
        <div class="support-payment" id="support-payment">
          <div id="donation-payment-element"></div>
          <div class="support-payment-actions">
            <button type="button" class="btn-primary support-pay">
              Donate now
            </button>
            <p class="support-note">
              Secure payment via Stripe. You'll receive a receipt by email.
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>
```

### Step 2: Add to `<head>`

```html
<script src="https://js.stripe.com/v3/"></script>
```

### Step 3: Add CSS Styles

**Location:** Inside your `<style>` tag

```css
/* Support (Donations) */
#support {
  background: var(--bg, #0d0d0d);
  padding: 6rem 2rem;
}

.support-grid {
  display: grid;
  grid-template-columns: 1.1fr 0.9fr;
  gap: 3rem;
  align-items: start;
  max-width: 1200px;
  margin: 0 auto;
}

.support-card {
  background: var(--bg-card, #1a1a1a);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  padding: 2rem;
}

.support-eyebrow {
  font-size: 0.875rem;
  font-weight: 600;
  color: #8a8a8a;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  margin-bottom: 1rem;
}

.support-title {
  font-size: 2rem;
  font-weight: 600;
  margin-bottom: 1rem;
  letter-spacing: -0.02em;
}

.support-copy p {
  color: #999;
  line-height: 1.8;
  margin-bottom: 1rem;
}

.support-toggle {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.support-toggle button {
  background: transparent;
  color: #999;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  padding: 0.75rem 1rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease;
}

.support-toggle button.active {
  background: #151515;
  border-color: rgba(255, 255, 255, 0.12);
  color: #f5f5f5;
}

.support-amounts {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.donation-amount {
  background: #0d0d0d;
  color: #f5f5f5;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  padding: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    transform 0.2s ease;
}

.donation-amount.active {
  border-color: rgba(255, 255, 255, 0.12);
  transform: translateY(-1px);
}

.support-custom {
  grid-column: span 3;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  color: #999;
  font-size: 0.875rem;
}

.support-custom input {
  width: 100%;
  padding: 0.75rem 1rem;
  background: #0d0d0d;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  color: #f5f5f5;
  font-size: 0.9375rem;
}

.support-payment {
  margin-top: 1.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  padding-top: 1.5rem;
  display: none;
}

.support-payment.active {
  display: block;
}

.support-payment-actions {
  margin-top: 1rem;
  display: grid;
  gap: 0.75rem;
}

.support-note {
  color: #8a8a8a;
  font-size: 0.8125rem;
  line-height: 1.6;
}

.support-success {
  margin-top: 1rem;
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.4);
  color: #10b981;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  font-size: 0.875rem;
  display: none;
}

.support-success.active {
  display: block;
}

.btn-primary {
  background: #f5f5f5;
  color: #0d0d0d;
  padding: 0.875rem 1.75rem;
  border-radius: 6px;
  text-decoration: none;
  font-weight: 550;
  font-size: 0.9375rem;
  transition: opacity 0.2s;
  border: none;
  cursor: pointer;
  width: 100%;
}

.btn-primary:hover {
  opacity: 0.9;
}

@media (max-width: 900px) {
  .support-grid {
    grid-template-columns: 1fr;
  }
}
```

### Step 4: Add JavaScript

**Location:** Before closing `</body>` tag

```javascript
<script>
(function() {
    'use strict';

    const donationConfig = {
        publishableKey: 'pk_live_51So70wBL2ppdbQKqOR38V1sZW6oFrVYkKmsxYxHTIOQ7yXYU1oT2qQtXHdKo9eBx2vxvotcYt5L6ZQXoXfYrx5Wg00X1VibSRz',
        apiBaseUrl: 'https://sd7ug3ha16.execute-api.us-east-1.amazonaws.com/prod',
        projectLabel: 'Good Flippin Vibes'
    };

    const supportSection = document.getElementById('support');
    if (!supportSection) return;

    const toggleButtons = supportSection.querySelectorAll('.support-toggle-btn');
    const amountButtons = supportSection.querySelectorAll('.donation-amount');
    const customAmountInput = document.getElementById('support-custom-amount');
    const continueButton = supportSection.querySelector('.support-continue');
    const paymentContainer = document.getElementById('support-payment');
    const payButton = supportSection.querySelector('.support-pay');
    const successMessage = document.getElementById('support-success');
    const paymentElementContainer = document.getElementById('donation-payment-element');

    let donationMode = 'one-time';
    let selectedAmount = 0;
    let stripe;
    let elements;

    const queryParams = new URLSearchParams(window.location.search);
    if (queryParams.get('support') === 'success') {
        successMessage.classList.add('active');
    }

    const setActiveButton = (buttons, activeButton) => {
        buttons.forEach(button => button.classList.remove('active'));
        if (activeButton) activeButton.classList.add('active');
    };

    const setAmount = (amount, activeButton) => {
        selectedAmount = amount;
        setActiveButton(amountButtons, activeButton);
        if (customAmountInput && activeButton) customAmountInput.value = '';
    };

    toggleButtons.forEach(button => {
        button.addEventListener('click', () => {
            donationMode = button.dataset.mode || 'one-time';
            setActiveButton(toggleButtons, button);
        });
    });

    amountButtons.forEach(button => {
        button.addEventListener('click', () => {
            setAmount(parseFloat(button.dataset.amount || '0'), button);
        });
    });

    if (customAmountInput) {
        customAmountInput.addEventListener('input', () => {
            const customValue = parseFloat(customAmountInput.value || '0');
            if (!isNaN(customValue)) {
                selectedAmount = customValue;
                setActiveButton(amountButtons, null);
            }
        });
    }

    const initializeStripe = async () => {
        if (!donationConfig.publishableKey.startsWith('pk_')) {
            console.warn('Stripe key missing');
            return null;
        }
        if (!window.Stripe) {
            console.warn('Stripe.js not loaded');
            return null;
        }
        if (!stripe) {
            stripe = window.Stripe(donationConfig.publishableKey);
        }
        return stripe;
    };

    const createPaymentIntent = async (amount) => {
        const response = await fetch(`${donationConfig.apiBaseUrl}/api/create-payment-intent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                amount: Math.round(amount * 100),
                recurring: donationMode === 'monthly',
                project: donationConfig.projectLabel
            })
        });
        if (!response.ok) throw new Error('Unable to create payment intent');
        return response.json();
    };

    const mountPaymentElement = async (clientSecret) => {
        if (!stripe) return;
        if (elements) {
            elements.update({ clientSecret });
        } else {
            elements = stripe.elements({ clientSecret });
        }
        paymentElementContainer.innerHTML = '';
        const paymentElement = elements.create('payment');
        paymentElement.mount(paymentElementContainer);
    };

    if (continueButton) {
        continueButton.addEventListener('click', async () => {
            if (selectedAmount < 1) {
                alert('Please select a donation amount.');
                return;
            }
            const stripeInstance = await initializeStripe();
            if (!stripeInstance) {
                alert('Stripe not configured.');
                return;
            }
            try {
                const { clientSecret } = await createPaymentIntent(selectedAmount);
                await mountPaymentElement(clientSecret);
                paymentContainer.classList.add('active');
            } catch (error) {
                console.error(error);
                alert('Unable to start donation. Please try again.');
            }
        });
    }

    if (payButton) {
        payButton.addEventListener('click', async () => {
            if (!stripe || !elements) return;
            const { error } = await stripe.confirmPayment({
                elements,
                confirmParams: {
                    return_url: `${window.location.origin}${window.location.pathname}?support=success`
                }
            });
            if (error) {
                alert(error.message || 'Payment failed. Please try again.');
            }
        });
    }
})();
</script>
```

### Step 5: Update CSP Headers

**Location:** `_headers` file or nginx config

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://js.stripe.com; connect-src 'self' https://api.stripe.com https://*.execute-api.us-east-1.amazonaws.com; frame-src https://js.stripe.com https://hooks.stripe.com;
```

### Step 6: Add Navigation Link (Optional)

```html
<a href="#support">Support</a>
```

---

## 🎯 Site 2: AI Aimate

### Step 1: Add HTML Section

**Location:** After your main content, before footer

```html
<section id="support">
  <div class="container">
    <div class="section-header">
      <p class="section-label">Support</p>
      <h2 class="section-title">Fuel AI education for all</h2>
      <p class="section-subtitle">
        Help keep AI learning accessible to everyone through free educational
        resources and community-driven content.
      </p>
    </div>
    <div class="support-grid">
      <div class="support-copy">
        <p class="support-eyebrow">AI Aimate</p>
        <h3 class="support-title">Democratizing AI knowledge</h3>
        <div class="support-copy">
          <p>
            Every contribution helps us create more free AI tutorials, expand
            our knowledge base, and keep our platform accessible to learners
            worldwide.
          </p>
          <p>
            If you're supporting a specific AI topic area, you can note it in
            the payment message.
          </p>
        </div>
      </div>
      <div class="support-card" aria-live="polite">
        <div
          class="support-toggle"
          role="group"
          aria-label="Donation frequency"
        >
          <button
            type="button"
            class="support-toggle-btn active"
            data-mode="one-time"
          >
            One-time
          </button>
          <button type="button" class="support-toggle-btn" data-mode="monthly">
            Monthly
          </button>
        </div>
        <div class="support-amounts" role="group" aria-label="Donation amount">
          <button type="button" class="donation-amount" data-amount="10">
            $10
          </button>
          <button type="button" class="donation-amount" data-amount="25">
            $25
          </button>
          <button type="button" class="donation-amount" data-amount="50">
            $50
          </button>
          <button type="button" class="donation-amount" data-amount="100">
            $100
          </button>
          <label class="support-custom" for="support-custom-amount">
            Custom amount
            <input
              id="support-custom-amount"
              type="number"
              min="1"
              step="1"
              placeholder="Enter amount in USD"
            />
          </label>
        </div>
        <button type="button" class="btn-primary support-continue">
          Continue to payment
        </button>
        <div class="support-success" id="support-success">
          Thank you! Your support advances AI education.
        </div>
        <div class="support-payment" id="support-payment">
          <div id="donation-payment-element"></div>
          <div class="support-payment-actions">
            <button type="button" class="btn-primary support-pay">
              Donate now
            </button>
            <p class="support-note">
              Secure payment via Stripe. You'll receive a receipt by email.
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>
```

### Step 2: Add to `<head>`

```html
<script src="https://js.stripe.com/v3/"></script>
```

### Step 3: Add CSS Styles

**Use the same CSS from Good Flippin Vibes above**

### Step 4: Add JavaScript

**Location:** Before closing `</body>` tag

**IMPORTANT:** Change only this line:

```javascript
projectLabel: "AI Aimate"; // <-- Changed from 'Good Flippin Vibes'
```

Use the same JavaScript code from Good Flippin Vibes, just update the `projectLabel`.

### Step 5: Update CSP Headers

**Same as Good Flippin Vibes**

---

## 🧪 Testing Checklist (For Each Site)

After deploying to each site:

### Pre-Deploy Test (Local)

```bash
# 1. Start local server
npx live-server --port=3000

# 2. Open http://localhost:3000/#support

# 3. Test donation flow:
- [ ] Click $25 button
- [ ] "Continue to payment" shows Stripe form
- [ ] Enter test card: 4242 4242 4242 4242
- [ ] Submit payment
- [ ] Redirects to /?support=success
- [ ] Success message displays
```

### Post-Deploy Test (Production)

```bash
# 1. Visit https://yoursite.com/#support
# 2. Complete $1 real donation (refundable)
# 3. Verify in Stripe Dashboard:
#    - Payment appears
#    - Metadata shows correct project label
#    - Amount is correct
```

---

## 📊 Stripe Dashboard Filtering

Once all sites are deployed, filter donations by project:

**Dashboard URL:** https://dashboard.stripe.com/payments

**Filters:**

- `metadata.project = "Good Flippin Design"`
- `metadata.project = "Good Flippin Vibes"`
- `metadata.project = "AI Aimate"`
- `metadata.project = "CultureSherpa"`

---

## 🎯 Deployment Commands

### Good Flippin Vibes

```bash
cd /path/to/goodflippinvibes
# Add files following steps above
git add .
git commit -m "feat: Add Stripe donation integration"
git push origin main
```

### AI Aimate

```bash
cd /path/to/aiaimate
# Add files following steps above
git add .
git commit -m "feat: Add Stripe donation integration"
git push origin main
```

---

## ✅ Deployment Status Tracker

| Site                | HTML | CSS | JS  | CSP | Deployed | Tested |
| ------------------- | ---- | --- | --- | --- | -------- | ------ |
| Good Flippin Design | ✅   | ✅  | ✅  | ✅  | ✅       | ⏳     |
| Good Flippin Vibes  | ⏳   | ⏳  | ⏳  | ⏳  | ⏳       | ⏳     |
| AI Aimate           | ⏳   | ⏳  | ⏳  | ⏳  | ⏳       | ⏳     |
| CultureSherpa       | ✅   | ✅  | ✅  | ✅  | ✅       | ✅     |

**Legend:**

- ✅ Complete
- ⏳ Pending
- ❌ Issue

---

## 🚀 Quick Deploy Script

Save as `deploy-donations.sh`:

```bash
#!/bin/bash

# Deploy to Good Flippin Vibes
echo "Deploying to Good Flippin Vibes..."
cd /path/to/goodflippinvibes
# Copy files from this guide
git add .
git commit -m "feat: Add Stripe donations"
git push origin main

# Deploy to AI Aimate
echo "Deploying to AI Aimate..."
cd /path/to/aiaimate
# Copy files from this guide
git add .
git commit -m "feat: Add Stripe donations"
git push origin main

echo "✅ All sites deployed!"
echo "🧪 Test each site at /#support"
```

---

## 📞 Support

**Issues?** Check:

1. Stripe Dashboard logs
2. Browser console for errors
3. CSP violations (Network tab)
4. API Gateway CloudWatch logs

**Contact:** getsome@goodflippinvibes.com

---

**Last Updated:** January 29, 2026
**Shared Backend:** AWS Lambda (us-east-1)
**Stripe Account:** Production (live mode)
