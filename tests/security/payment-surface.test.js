#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const getSession = read('functions/get-session.js');
const createCheckout = read('functions/create-checkout.js');
const successPage = read('donate/success.html');

for (const [name, source] of [
    ['get-session', getSession],
    ['create-checkout', createCheckout]
]) {
    assert.ok(source.includes("'Cache-Control': 'no-store'"), `${name} must disable caching`);
    assert.ok(source.includes("Vary: 'Origin'"), `${name} must vary responses by Origin`);
    assert.ok(source.includes('ALLOWED_ORIGINS'), `${name} must use an explicit origin allowlist`);
    assert.ok(source.includes("{ error: 'Origin not allowed' }, 403"), `${name} must reject unapproved browser origins`);
    assert.ok(!source.includes("'Access-Control-Allow-Origin': '*'"), `${name} must not use wildcard CORS`);
    assert.ok(!source.includes('"Access-Control-Allow-Origin": "*"'), `${name} must not use wildcard CORS`);
    assert.ok(!/sk_(?:live|test)_[A-Za-z0-9]+/.test(source), `${name} must not contain a Stripe secret`);
    assert.ok(!source.includes('details: error.message'), `${name} must not return raw internal errors`);
}

assert.ok(getSession.includes('env?.STRIPE_SECRET_KEY'), 'get-session must require its Cloudflare Stripe secret binding');
assert.ok(createCheckout.includes('env?.STRIPE'), 'create-checkout must require its Cloudflare Stripe secret binding');
assert.ok(getSession.includes("{ error: 'Payment system configuration error' }, 500"), 'get-session must fail closed without credentials');
assert.ok(createCheckout.includes("{ error: 'Payment system configuration error' }, 500"), 'create-checkout must fail closed without credentials');

for (const forbidden of ['customerEmail', 'customerName', 'customer_details']) {
    assert.ok(!getSession.includes(forbidden), `get-session must not expose donor PII via ${forbidden}`);
}

assert.ok(
    !successPage.includes('data.customerEmail'),
    'success page must not consume donor email from the session API'
);

console.log('Payment surface security regressions passed.');
