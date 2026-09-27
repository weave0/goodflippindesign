(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  let loaded = false;
  let loading = false;

  const esc = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  function setStatus(text, tone = '') {
    const el = $('mc-load-status');
    if (!el) return;
    el.textContent = text;
    el.dataset.tone = tone;
  }

  function ageLabel(iso) {
    if (!iso) return 'Unknown';
    const ms = Date.now() - Date.parse(iso);
    if (!Number.isFinite(ms)) return 'Unknown';
    const mins = Math.max(0, Math.round(ms / 60000));
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 48) return `${hours}h ago`;
    return `${Math.round(hours / 24)}d ago`;
  }

  function collectionState(payload) {
    const generatedAt = payload?.source?.generatedAt;
    if (!generatedAt) return { label: 'Unknown', tone: 'unknown' };
    const hours = (Date.now() - Date.parse(generatedAt)) / 3600000;
    if (!Number.isFinite(hours)) return { label: 'Unknown', tone: 'unknown' };
    if (hours <= 8) return { label: 'Fresh', tone: 'ok' };
    if (hours <= 24) return { label: 'Stale', tone: 'warn' };
    return { label: 'Expired', tone: 'bad' };
  }

  function propertyRows(estate) {
    const rows = estate?.properties || estate?.estate || [];
    return Array.isArray(rows) ? rows : [];
  }

  function findingRows(diagnostics) {
    const rows = diagnostics?.items || diagnostics?.findings || [];
    return Array.isArray(rows) ? rows : [];
  }

  function severityRank(sev) {
    return ({ critical: 0, high: 1, medium: 2, warning: 2, low: 3, info: 4 })[String(sev || '').toLowerCase()] ?? 5;
  }

  function render(payload) {
    const evidence = payload.evidence || {};
    const estate = evidence.estateHealth || {};
    const diagnostics = evidence.diagnostics || {};
    const executive = evidence.executive || {};
    const audience = evidence.audience || {};
    const events = evidence.businessEvents || {};

    const properties = propertyRows(estate);
    const findings = findingRows(diagnostics)
      .filter((item) => item?.status !== 'closed')
      .sort((a, b) => severityRank(a?.severity) - severityRank(b?.severity));

    const availability = properties.map((p) => p?.availability?.state || p?.state || 'unknown');
    const healthy = availability.filter((s) => s === 'available' || s === 'healthy').length;
    const degraded = availability.filter((s) => s === 'degraded').length;
    const unavailable = availability.filter((s) => s === 'unavailable').length;
    const unknown = Math.max(0, properties.length - healthy - degraded - unavailable);
    const critical = findings.filter((f) => String(f?.severity).toLowerCase() === 'critical').length;
    const stale = collectionState(payload);

    $('mc-kpi-properties').textContent = properties.length || '—';
    $('mc-kpi-healthy').textContent = healthy;
    $('mc-kpi-attention').textContent = degraded + unavailable + critical;
    $('mc-kpi-unknown').textContent = unknown;
    $('mc-kpi-freshness').textContent = stale.label;
    $('mc-kpi-freshness').dataset.tone = stale.tone;
    $('mc-generated-at').textContent = payload.source?.generatedAt
      ? `${new Date(payload.source.generatedAt).toLocaleString()} · ${ageLabel(payload.source.generatedAt)}`
      : 'No generated timestamp';

    const queue = $('mc-diagnostics-list');
    queue.innerHTML = findings.length
      ? findings.slice(0, 30).map((item) => {
          const owner = item?.ownerLane || item?.owner || item?.escalation?.targetLane || 'Unassigned';
          const action = item?.nextAction || item?.action || 'Inspect evidence and determine next action.';
          const title = item?.title || item?.message || item?.id || 'Diagnostic finding';
          const impact = item?.impact || item?.why || '';
          return `<article class="mc-finding" data-severity="${esc(item?.severity || 'unknown')}">
            <div class="mc-finding__top">
              <span class="mc-severity">${esc(item?.severity || 'unknown')}</span>
              <span class="mc-owner">${esc(owner)}</span>
            </div>
            <h4>${esc(title)}</h4>
            ${impact ? `<p>${esc(impact)}</p>` : ''}
            <div class="mc-next"><strong>Next:</strong> ${esc(action)}</div>
          </article>`;
        }).join('')
      : '<div class="mc-empty">No open diagnostics in the current evidence plane.</div>';

    const table = $('mc-estate-body');
    table.innerHTML = properties.length
      ? properties.map((p) => {
          const domain = p?.domain || p?.hostname || p?.propertyId || p?.id || 'Unknown';
          const state = p?.availability?.state || p?.state || 'unknown';
          const criticalPath = p?.criticalPath?.state || p?.criticalPathState || p?.facets?.criticalPath?.status || 'unknown';
          const evidenceAge = p?.availability?.observedAt || p?.observedAt || estate?.generatedAt || payload.source?.generatedAt;
          return `<tr>
            <td><strong>${esc(domain)}</strong></td>
            <td><span class="mc-state" data-state="${esc(state)}">${esc(state)}</span></td>
            <td>${esc(criticalPath)}</td>
            <td>${esc(ageLabel(evidenceAge))}</td>
          </tr>`;
        }).join('')
      : '<tr><td colspan="4">No estate rows supplied by the current evidence plane.</td></tr>';

    const execItems = executive?.priorities || executive?.items || executive?.briefs || [];
    $('mc-executive-list').innerHTML = Array.isArray(execItems) && execItems.length
      ? execItems.slice(0, 8).map((item) => `<li><strong>${esc(item?.title || item?.label || 'Priority')}</strong><span>${esc(item?.why || item?.statement || item?.action || '')}</span></li>`).join('')
      : '<li><strong>Evidence loaded</strong><span>No executive priority array was supplied in this snapshot.</span></li>';

    const audienceState = audience?.state || audience?.status || audience?.measurementState || 'unknown';
    const eventState = events?.state || events?.status || events?.measurementState || 'unknown';
    $('mc-audience-state').textContent = audienceState;
    $('mc-events-state').textContent = eventState;

    setStatus('Live governed evidence', 'ok');
    loaded = true;
  }

  async function loadMissionControl(force = false) {
    if (loading || (loaded && !force)) return;
    loading = true;
    setStatus('Loading governed evidence…');

    try {
      const clerk = window.Clerk;
      if (!clerk?.session) throw new Error('Admin session unavailable');
      const token = await clerk.session.getToken();
      if (!token) throw new Error('Admin session token unavailable');

      const response = await fetch('/api/mission-control', {
        method: 'GET',
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const message = response.status === 403 ? 'Admin authorization required'
          : response.status === 503 ? 'Evidence source not configured'
          : response.status === 502 ? 'Evidence source temporarily unavailable'
          : `Mission Control request failed (HTTP ${response.status})`;
        throw new Error(message);
      }

      render(await response.json());
    } catch (error) {
      console.error('[mission-control]', error);
      setStatus(error?.message || 'Mission Control unavailable', 'bad');
      $('mc-diagnostics-list').innerHTML = '<div class="mc-empty">Mission Control could not load. No stale or fabricated evidence is shown.</div>';
    } finally {
      loading = false;
    }
  }

  function wire() {
    document.querySelector('[data-view="mission-control"]')?.addEventListener('click', () => loadMissionControl());
    $('mc-refresh-btn')?.addEventListener('click', () => loadMissionControl(true));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();

  window.__loadMissionControl = loadMissionControl;
})();
