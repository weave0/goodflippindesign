#!/usr/bin/env node
/**
 * Simple contact form handler using Cloudflare Workers (FREE)
 * Alternative to Formspree - no external service needed
 *
 * Deploy this as a Cloudflare Worker to handle form submissions
 * Route: /api/contact
 */

export default {
  async fetch(request, env) {
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle OPTIONS for CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Only allow POST
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const formData = await request.formData();
      const data = {
        name: formData.get('name'),
        email: formData.get('email'),
        company: formData.get('company'),
        projectType: formData.get('project_type'),
        budget: formData.get('budget'),
        timeline: formData.get('timeline'),
        description: formData.get('description'),
        referral: formData.get('referral'),
        timestamp: new Date().toISOString(),
      };

      // Send email via Cloudflare Email Workers
      // Note: Set up Email Routing in Cloudflare first
      await env.EMAIL.send({
        from: 'forms@goodflippindesign.com',
        to: 'brett.l.weaver@gmail.com',
        subject: `New Project Inquiry: ${data.projectType}`,
        html: `
          <h2>New Project Inquiry</h2>
          <p><strong>Name:</strong> ${data.name}</p>
          <p><strong>Email:</strong> ${data.email}</p>
          <p><strong>Company:</strong> ${data.company || 'N/A'}</p>
          <p><strong>Project Type:</strong> ${data.projectType}</p>
          <p><strong>Budget:</strong> ${data.budget}</p>
          <p><strong>Timeline:</strong> ${data.timeline}</p>
          <p><strong>Description:</strong></p>
          <p>${data.description}</p>
          <p><strong>Referral Source:</strong> ${data.referral || 'N/A'}</p>
          <p><strong>Submitted:</strong> ${data.timestamp}</p>
        `,
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
  },
};
