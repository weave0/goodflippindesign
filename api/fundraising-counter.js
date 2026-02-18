// Cloudflare Worker for Fundraising Counter API
// Deploy this to Cloudflare Workers and update the apiEndpoint in index.html

// Simple in-memory storage (for production, use Cloudflare KV or external database)
let fundraisingData = {
  totalRaised: 1247,
  totalSupporters: 23,
  goal: 10000,
  lastDonationTime: new Date().toISOString(),
  lastUpdate: new Date().toISOString()
};

export default {
  async fetch(request, env, ctx) {
    // CORS headers for all responses (allows ecosystem cross-site requests)
    const allowedOrigins = (env.ALLOWED_ORIGINS || 'https://goodflippindesign.com')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
    const requestOrigin = request.headers.get('Origin') || '';
    const allowOrigin = allowedOrigins.includes(requestOrigin)
      ? requestOrigin
      : 'https://goodflippindesign.com';

    const corsHeaders = {
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    try {
      // GET /api/fundraising - Return current totals
      if (request.method === 'GET' && url.pathname === '/api/fundraising') {

        // Calculate time since last donation for display
        const lastDonation = new Date(fundraisingData.lastDonationTime);
        const now = new Date();
        const diffMs = now - lastDonation;
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

        let timeAgo;
        if (diffHours < 1) {
          timeAgo = diffMins === 0 ? 'just now' : `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
        } else if (diffHours < 24) {
          timeAgo = `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
        } else {
          const diffDays = Math.floor(diffHours / 24);
          timeAgo = `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
        }

        return new Response(JSON.stringify({
          success: true,
          totalRaised: fundraisingData.totalRaised,
          totalSupporters: fundraisingData.totalSupporters,
          goal: fundraisingData.goal,
          lastDonationTime: timeAgo,
          lastUpdate: fundraisingData.lastUpdate
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

      // POST /api/webhook/stripe - Handle Stripe webhooks
      if (request.method === 'POST' && url.pathname === '/api/webhook/stripe') {
        const sig = request.headers.get('stripe-signature');
        const payload = await request.text();

        // Verify webhook signature (use your webhook signing secret)
        const webhookSecret = env.STRIPE_WEBHOOK_SECRET;

        if (!webhookSecret) {
          return new Response('Webhook secret not configured', { status: 500, headers: corsHeaders });
        }

        // In a real implementation, you'd validate the Stripe signature here
        // For now, we'll trust the payload for simplicity

        try {
          const event = JSON.parse(payload);

          // Handle successful payments
          if (event.type === 'payment_intent.succeeded' || event.type === 'invoice.payment_succeeded') {
            const paymentIntent = event.data.object;
            const amountReceived = paymentIntent.amount_received / 100; // Convert cents to dollars

            // Update fundraising data
            fundraisingData.totalRaised += amountReceived;
            fundraisingData.totalSupporters += 1;
            fundraisingData.lastDonationTime = new Date().toISOString();
            fundraisingData.lastUpdate = new Date().toISOString();

            console.log(`New Stripe donation received: $${amountReceived}`);
            console.log(`Total raised: $${fundraisingData.totalRaised}`);

            return new Response(JSON.stringify({
              received: true,
              newTotal: fundraisingData.totalRaised,
              source: 'stripe'
            }), {
              headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
          }

          return new Response(JSON.stringify({ received: true }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });

        } catch (error) {
          console.error('Stripe webhook processing error:', error);
          return new Response('Webhook error', { status: 400, headers: corsHeaders });
        }
      }

      // POST /api/webhook/paypal - Handle PayPal webhooks
      if (request.method === 'POST' && url.pathname === '/api/webhook/paypal') {
        const payload = await request.text();

        try {
          const event = JSON.parse(payload);

          // Handle successful PayPal payments
          // PayPal sends different event types: PAYMENT.SALE.COMPLETED, CHECKOUT.ORDER.APPROVED, etc.
          if (event.event_type === 'PAYMENT.SALE.COMPLETED' ||
              event.event_type === 'CHECKOUT.ORDER.APPROVED' ||
              event.event_type === 'PAYMENTS.PAYMENT.CREATED') {

            let amountReceived = 0;

            // Extract amount based on event type
            if (event.resource && event.resource.amount) {
              amountReceived = parseFloat(event.resource.amount.total || event.resource.amount.value || 0);
            } else if (event.resource && event.resource.purchase_units) {
              const amount = event.resource.purchase_units[0]?.amount?.value;
              amountReceived = parseFloat(amount || 0);
            }

            if (amountReceived > 0) {
              // Update fundraising data
              fundraisingData.totalRaised += amountReceived;
              fundraisingData.totalSupporters += 1;
              fundraisingData.lastDonationTime = new Date().toISOString();
              fundraisingData.lastUpdate = new Date().toISOString();

              console.log(`New PayPal donation received: $${amountReceived}`);
              console.log(`Total raised: $${fundraisingData.totalRaised}`);

              return new Response(JSON.stringify({
                received: true,
                newTotal: fundraisingData.totalRaised,
                source: 'paypal'
              }), {
                headers: { 'Content-Type': 'application/json' }
              });
            }
          }

          return new Response(JSON.stringify({ received: true }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });

        } catch (error) {
          console.error('PayPal webhook processing error:', error);
          return new Response('PayPal webhook error', { status: 400, headers: corsHeaders });
        }
      }

      // Default response
      return new Response('Fundraising Counter API', { status: 404, headers: corsHeaders });

    } catch (error) {
      console.error('API Error:', error);
      return new Response('Internal Server Error', {
        status: 500,
        headers: corsHeaders
      });
    }
  }
};

// Example usage for testing:
//
// 1. Deploy this to Cloudflare Workers
// 2. Set environment variables: STRIPE_WEBHOOK_SECRET, ADMIN_TOKEN
// 3. Update index.html: fundraisingCounter.config.apiEndpoint = 'https://your-worker.your-subdomain.workers.dev/api/fundraising'
// 4. Configure Stripe webhook: 'https://your-worker.your-subdomain.workers.dev/api/webhook/stripe'
//
// Manual update via curl:
// curl -X POST https://your-worker.your-subdomain.workers.dev/api/fundraising/update \
//   -H "Authorization: Bearer your-admin-token" \
//   -H "Content-Type: application/json" \
//   -d '{"totalRaised": 2500, "totalSupporters": 45}'
