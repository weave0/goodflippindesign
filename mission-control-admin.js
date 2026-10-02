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

  function breakableId(value) {
    return esc(value).replaceAll(':', ':<wbr>').replaceAll('_', '_<wbr>');
  }

  function ageLabel(iso) {
    if (!iso) return 'unknown age';
    const ms = Date.now() - Date.parse(iso);
    if (!Number.isFinite(ms)) return 'unknown age';
    const mins = Math.max(0, Math.round(ms / 60000));
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 48) return `${hours}h ago`;
    return `${Math.round(hours / 24)}d ago`;
  }

  function setStatus(text, tone = '') {
    const el = $('mc-status-line');
    if (!el) return;
    el.textContent = text;
    el.dataset.tone = tone;
  }

  // Lifecycle facts come from the read-only operations projection (one source of truth), keyed by work item.
  let lifecycleById = new Map();

  function lifecycleLine(item) {
    const life = lifecycleById.get(item.workItemId);
    if (!life) return '';
    const parts = [];
    parts.push(`observed ${life.observationAgeMs == null ? 'unknown' : ageLabel(new Date(Date.now() - life.observationAgeMs).toISOString())} · ${esc(life.occurrenceCount ?? '?')}×`);
    if (life.investigationReady) parts.push('investigation ready');
    if (life.diagnosisAvailable) parts.push('diagnosis available');
    if (life.reverificationRequired) parts.push('reverification required');
    if (life.reverification) parts.push(`reverification ${esc(life.reverification.result)}${life.reverification.observedAt ? ` ${esc(ageLabel(life.reverification.observedAt))}` : ''}`);
    if (life.recurrenceCount) parts.push(`recurred ${esc(life.recurrenceCount)}×`);
    return `<p class="mc-meta">${parts.join(' · ')}</p>${life.blocker ? `<p class="mc-blocker">${esc(life.blocker)}</p>` : ''}`;
  }

  function workCard(item) {
    const state = item.state || item.lifecycle;
    const lease = item.activeLease
      ? `<p class="mc-meta">Lease: ${esc(item.activeLease.workerId)} · until ${esc(item.activeLease.expiresAt)}</p>`
      : '';
    const diagnosis = item.diagnosis?.summary
      ? `<p class="mc-diagnosis">${esc(item.diagnosis.summary)}</p>`
      : '';
    const gaps = Array.isArray(item.qualificationGaps) ? item.qualificationGaps : [];
    const blocker = item.blockerReason
      ? `<p class="mc-blocker">${esc(item.blockerReason)}</p>`
      : (gaps.length && (state === 'OBSERVED' || state === 'RECURRENT')
        ? `<p class="mc-blocker">Cannot qualify until the governed registry records ${esc(gaps.join(', '))}.</p>`
        : '');
    const contract = item.investigation?.requestId
      ? `<p class="mc-meta">Investigation ${esc(item.investigation.requestId)} · read only · repair authority not included</p>`
      : '';
    const repository = item.repository
      || (item.availableBinding?.repository ? `${item.availableBinding.repository} (not yet authorized on this item)` : 'not in governed registry');
    const actions = [];
    if ((state === 'OBSERVED' || state === 'RECURRENT') && gaps.length === 0) {
      actions.push(`<button class="btn btn-secondary" type="button" data-mc-action="qualify" data-mc-id="${esc(item.workItemId)}">Qualify</button>`);
    }
    if (state === 'QUALIFIED') {
      actions.push(`<label class="mc-sha">Commit<input data-mc-sha="${esc(item.workItemId)}" maxlength="40" spellcheck="false" placeholder="evidence commit"></label>`);
      actions.push(`<button class="btn btn-primary" type="button" data-mc-action="investigate" data-mc-id="${esc(item.workItemId)}">Issue investigation</button>`);
    }
    if (!['RESOLVED', 'DISMISSED', 'SUPERSEDED'].includes(state)) {
      actions.push(`<button class="btn btn-ghost" type="button" data-mc-action="needs-human" data-mc-id="${esc(item.workItemId)}">Needs me</button>`);
    }
    return `<article class="mc-work" data-state="${esc(state)}">
      <div class="mc-work__top">
        <span class="mc-state">${esc(state)}</span>
        <span class="mc-severity">${esc(item.severity)}</span>
      </div>
      <h4>${breakableId(item.findingKey || item.workItemId)}</h4>
      <dl class="mc-facts">
        <div><dt>Property</dt><dd>${esc(item.propertyId || 'unbound')}</dd></div>
        <div><dt>Repository</dt><dd>${esc(repository)}</dd></div>
        <div><dt>Source</dt><dd>${esc(item.producer)}</dd></div>
        <div><dt>Seen</dt><dd>${esc(item.occurrenceCount)} · first ${esc(ageLabel(item.firstSeen))} · last ${esc(ageLabel(item.lastSeen))}${item.recurrenceCount ? ` · recurred ${esc(item.recurrenceCount)}` : ''}</dd></div>
        <div><dt>Confidence</dt><dd>${esc(item.confidence ?? 'unknown')}</dd></div>
        <div><dt>Profile</dt><dd>${esc(item.investigationProfile || 'none registered')}</dd></div>
      </dl>
      ${item.verificationPredicate ? `<p class="mc-meta">Verify (${esc(item.verificationScope || 'scope unset')}): ${esc(item.verificationPredicate)}</p>` : ''}
      ${lease}${contract}${diagnosis}${lifecycleLine(item)}${blocker}
      ${item.resolvedAt ? `<p class="mc-meta">Production check ${esc(ageLabel(item.resolvedAt))}</p>` : ''}
      ${actions.length ? `<div class="mc-actions">${actions.join('')}</div>` : ''}
    </article>`;
  }

  function fillLane(id, items, empty) {
    const el = $(id);
    if (!el) return;
    el.innerHTML = items.length ? items.map(workCard).join('') : `<p class="mc-empty">${esc(empty)}</p>`;
  }

  function fillLaneUnavailable(id) {
    const el = $(id);
    if (!el) return;
    el.innerHTML = '<p class="mc-empty mc-unavailable">Work queue unavailable. No all-clear is implied.</p>';
  }

  function diagnosticCard(item) {
    return `<article class="mc-diagnostic">
      <div class="mc-work__top">
        <span class="mc-severity">${esc(item.severity || 'unknown')}</span>
        <span class="mc-state">${esc(item.ownerLane || 'Unassigned')}</span>
      </div>
      <h4>${esc(item.title || item.id || 'Diagnostic finding')}</h4>
      ${item.impact ? `<p><strong>Impact:</strong> ${esc(item.impact)}</p>` : ''}
      ${item.nextAction ? `<p><strong>Next action:</strong> ${esc(item.nextAction)}</p>` : ''}
    </article>`;
  }

  function renderDiagnostics(operator) {
    const el = $('mc-diagnostics');
    if (!el) return;
    if (!operator) {
      el.innerHTML = '<p class="mc-empty mc-unavailable">Governed diagnostic evidence is unavailable.</p>';
      return;
    }
    const diagnostics = Array.isArray(operator.diagnostics) ? operator.diagnostics : [];
    const counts = operator.counts || {};
    const summary = `<p class="mc-diagnostic-summary">${esc(counts.attention ?? diagnostics.length)} attention · ${esc(counts.available ?? 'unknown')} available · ${esc(counts.unknown ?? 'unknown')} unknown across ${esc(counts.properties ?? 'unknown')} properties</p>`;
    el.innerHTML = summary + (diagnostics.length
      ? `<div class="mc-diagnostics-grid">${diagnostics.map(diagnosticCard).join('')}</div>`
      : '<p class="mc-empty">No governed diagnostic finding is currently open.</p>');
  }

  function render(evidenceOutcome, workOutcome, operationsOutcome = { ok: false }) {
    lifecycleById = new Map((operationsOutcome.ok ? operationsOutcome.value?.operations?.items || [] : [])
      .filter((entry) => entry?.workItemId && entry.lifecycle)
      .map((entry) => [entry.workItemId, entry.lifecycle]));
    const evidence = evidenceOutcome.ok ? evidenceOutcome.value : null;
    const operator = evidence?.operator;
    const workItems = workOutcome.ok ? (workOutcome.value.workItems || []) : [];

    if (!evidenceOutcome.ok) {
      $('mc-headline').innerHTML = '';
      $('mc-evidence-note').textContent = evidenceOutcome.error?.message || 'Governed evidence was rejected. Nothing was invented in its place.';
      $('mc-estate').innerHTML = '<p class="mc-empty">Estate evidence is unavailable.</p>';
      $('mc-generated-at').textContent = '';
      renderDiagnostics(null);
    } else {
      $('mc-headline').innerHTML = operator.statements.length
        ? operator.statements.map((line) => `<p>${esc(line)}</p>`).join('')
        : '<p>No executive statement was supplied.</p>';
      const fresh = operator.freshness || { label: 'Unknown', tone: 'unknown' };
      $('mc-evidence-note').textContent = `Evidence ${fresh.label.toLowerCase()} · audience ${operator.audienceState} · business events ${operator.businessEventState}`;
      $('mc-generated-at').textContent = evidence.source?.generatedAt
        ? `Collected ${new Date(evidence.source.generatedAt).toLocaleString()}`
        : '';
      const head = '<div class="mc-property mc-property--head"><span>Property</span><span>Availability</span><span>Critical path</span><span>Seen</span></div>';
      const rows = (operator.properties || []).map((property) => `<div class="mc-property">
        <span><strong>${esc(property.name)}</strong></span>
        <span class="mc-state" data-state="${esc(property.availability)}">${esc(property.availability)}${property.availabilityEvidence ? ` · ${esc(property.availabilityEvidence)}` : ''}</span>
        <span>${esc(property.criticalPath)}</span>
        <span>${esc(ageLabel(property.observedAt))}</span>
      </div>`).join('');
      $('mc-estate').innerHTML = head + (rows || '<p class="mc-empty">No properties in the governed estate snapshot.</p>');
      renderDiagnostics(operator);
    }

    const stateOf = (item) => item.state || item.lifecycle;
    const needs = workItems.filter((item) => stateOf(item) === 'NEEDS_HUMAN' || stateOf(item) === 'BLOCKED');
    const investigating = workItems.filter((item) => stateOf(item) === 'INVESTIGATING' || stateOf(item) === 'INVESTIGATION_READY');
    const diagnosed = workItems.filter((item) => ['DIAGNOSED', 'REPAIR_READY', 'REPAIRING', 'CANDIDATE_READY', 'VERIFIED', 'CHANGE_PUBLISHED', 'DEPLOYED', 'REVERIFYING'].includes(stateOf(item)));
    const open = workItems.filter((item) => ['OBSERVED', 'QUALIFIED', 'RECURRENT'].includes(stateOf(item)));
    const resolved = workItems.filter((item) => stateOf(item) === 'RESOLVED' || stateOf(item) === 'DISMISSED' || stateOf(item) === 'SUPERSEDED');
    if (workOutcome.ok) {
      fillLane('mc-needs-you', needs, 'Nothing is waiting on you.');
      fillLane('mc-investigating', investigating, 'No active investigation.');
      fillLane('mc-diagnosed', diagnosed, 'No FWOMPS diagnosis yet.');
      fillLane('mc-open', open, 'No open conditions.');
      fillLane('mc-resolved', resolved, 'No condition has been reverified away yet.');
    } else {
      ['mc-needs-you', 'mc-investigating', 'mc-diagnosed', 'mc-open', 'mc-resolved'].forEach(fillLaneUnavailable);
    }

    const freshLabel = operator?.freshness?.label || 'unavailable';
    const worker = investigating.find((item) => item.activeLease)?.activeLease?.workerId;
    const workStatus = workOutcome.ok
      ? [
        needs.length ? `${needs.length} need you` : 'nothing needs you',
        investigating.length ? `${investigating.length} in investigation${worker ? ` · ${worker}` : ''}` : 'no active investigation',
        diagnosed.length ? `${diagnosed.length} diagnosed` : 'no diagnosis',
        resolved.length ? `${resolved.length} disappeared in production` : 'none reverified away',
      ]
      : ['work queue unavailable'];
    setStatus([
      ...workStatus,
      evidenceOutcome.ok ? `evidence ${freshLabel.toLowerCase()}` : 'evidence unavailable',
      operationsOutcome.ok ? 'lifecycle projection available' : 'lifecycle projection unavailable',
    ].filter(Boolean).join(' · '), (!evidenceOutcome.ok || !workOutcome.ok || !operationsOutcome.ok) ? 'bad' : '');
    loaded = true;
  }

  async function loadMissionControl(force = false) {
    if (loading || (loaded && !force)) return;
    loading = true;
    setStatus('Loading work and governed evidence…');
    try {
      if (typeof window.__adminApi !== 'function') {
        throw new Error('Admin session helper is unavailable');
      }
      const [evidenceOutcome, workOutcome, operationsOutcome] = await Promise.all([
        window.__adminApi('/api/mission-control').then((value) => ({ ok: true, value })).catch((error) => ({ ok: false, error })),
        window.__adminApi('/api/mission-control/work-items').then((value) => ({ ok: true, value })).catch((error) => ({ ok: false, error })),
        window.__adminApi('/api/mission-control/operations').then((value) => ({ ok: true, value })).catch((error) => ({ ok: false, error })),
      ]);
      render(evidenceOutcome, workOutcome, operationsOutcome);
    } catch (error) {
      setStatus(error?.message || 'Mission Control unavailable', 'bad');
    } finally {
      loading = false;
    }
  }

  async function act(action, id, button) {
    const api = window.__adminApi;
    if (typeof api !== 'function') return;
    button.disabled = true;
    try {
      if (action === 'qualify') {
        await api(`/api/mission-control/work-items/${encodeURIComponent(id)}/transition`, {
          method: 'POST',
          body: { to: 'QUALIFIED' },
        });
      } else if (action === 'investigate') {
        const revision = document.querySelector(`[data-mc-sha="${CSS.escape(id)}"]`)?.value?.trim();
        await api(`/api/mission-control/work-items/${encodeURIComponent(id)}/investigate`, {
          method: 'POST',
          body: { evidenceRevision: revision },
        });
      } else if (action === 'needs-human') {
        const reason = window.prompt('What do you need to decide?');
        if (!reason) return;
        await api(`/api/mission-control/work-items/${encodeURIComponent(id)}/transition`, {
          method: 'POST',
          body: { to: 'NEEDS_HUMAN', reason },
        });
      }
      loaded = false;
      await loadMissionControl(true);
    } catch (error) {
      setStatus(error?.message || 'Action failed', 'bad');
    } finally {
      button.disabled = false;
    }
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-mc-action]');
    if (!button) return;
    act(button.dataset.mcAction, button.dataset.mcId, button);
  });

  window.__adminPanels = window.__adminPanels || {};
  window.__adminPanels['mission-control'] = () => loadMissionControl(false);
  $('mc-refresh-btn')?.addEventListener('click', () => loadMissionControl(true));
  $('mc-readiness-btn')?.addEventListener('click', async () => {
    const button = $('mc-readiness-btn');
    const status = $('mc-readiness-status');
    const report = $('mc-readiness-report');
    button.disabled = true;
    status.textContent = 'Checking the running production runtime…';
    report.textContent = '';
    try {
      if (typeof window.__adminApi !== 'function') throw new Error('Admin session helper is unavailable');
      const value = await window.__adminApi('/api/mission-control/provenance');
      status.textContent = value.ready === true
        ? 'Runtime bindings are ready. The full production preflight is still required before investigation.'
        : 'Runtime readiness is blocked. See the reported blockers below.';
      report.textContent = JSON.stringify(value, null, 2);
    } catch (error) {
      status.textContent = `Readiness unavailable: ${error?.message || 'request failed'}. No all-clear is implied.`;
    } finally {
      button.disabled = false;
    }
  });
})();
