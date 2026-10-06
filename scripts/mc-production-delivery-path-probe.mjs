#!/usr/bin/env node
/**
 * Credential-less delivery-path probe: runs the FWOMPS host's REAL transport against the production origin with a
 * deliberately invalid bearer and requires the Worker's own JSON 401 (not a Cloudflare edge block). Works with the canary
 * OFF; writes and changes nothing. See scripts/lib/mc-delivery-path-probe.mjs.
 *
 *   FWOMPS_REPO=<fwomps checkout> PYTHON=<python> node --no-warnings scripts/mc-production-delivery-path-probe.mjs [--origin https://goodflippindesign.com]
 *
 * Exit 0 only when the delivery path reaches the Worker.
 */

import { runDeliveryPathProbe } from './lib/mc-delivery-path-probe.mjs';

const args = process.argv.slice(2);
const origin = (args[args.indexOf('--origin') + 1] && args.includes('--origin') ? args[args.indexOf('--origin') + 1] : 'https://goodflippindesign.com').replace(/\/$/, '');
const result = runDeliveryPathProbe({ origin, python: process.env.PYTHON, fwompsRepo: process.env.FWOMPS_REPO });
console.log(`delivery path ${result.ok ? 'OK' : 'BLOCKED'}: ${result.verdict} (HTTP ${result.status ?? 'none'}) ${result.detail}`);
process.exit(result.ok ? 0 : 1);
