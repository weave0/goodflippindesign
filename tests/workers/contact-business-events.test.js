import { describe, it, expect, vi, afterEach } from 'vitest';
import handler, { emitLead } from '../../functions/api/contact.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Good Flippin Design contact business outcomes', () => {
  it('emits a count-only lead to the governed HTTPS endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const accepted = await emitLead({
      EVENTS_INGEST_URL: 'https://gfd-mission-control-events.weave0.workers.dev',
      EVENTS_INGEST_TOKEN: 'tok-gfd',
    });
    expect(accepted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://gfd-mission-control-events.weave0.workers.dev/v1/event');
    expect(JSON.parse(init.body)).toEqual({
      propertyId: 'goodflippindesign.com',
      eventType: 'lead',
    });
    expect(init.body).not.toContain('email');
    expect(init.headers.Authorization).toBe('Bearer tok-gfd');
  });

  it('fails closed for missing or non-HTTPS event configuration', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await emitLead({})).toBe(false);
    expect(await emitLead({ EVENTS_INGEST_URL: 'http://example.test', EVENTS_INGEST_TOKEN: 'tok' })).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns contact success even when Mission Control is unavailable', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('feed down'));
    vi.stubGlobal('fetch', fetchMock);
    const emailSend = vi.fn().mockResolvedValue(undefined);
    const form = new FormData();
    form.set('name', 'Test');
    form.set('email', 'person@example.org');
    form.set('project_type', 'Web');
    form.set('budget', '1000');
    form.set('timeline', 'Soon');
    form.set('description', 'A real inquiry');
    const request = new Request('https://goodflippindesign.com/api/contact', { method: 'POST', body: form });
    const response = await handler.fetch(request, {
      EMAIL: { send: emailSend },
      EVENTS_INGEST_URL: 'https://gfd-mission-control-events.weave0.workers.dev',
      EVENTS_INGEST_TOKEN: 'tok-gfd',
    });
    expect(response.status).toBe(200);
    expect(emailSend).toHaveBeenCalledTimes(1);
    // The emitter is intentionally detached from the visitor response.
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not count a lead when inquiry email delivery fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const form = new FormData();
    form.set('name', 'Test');
    form.set('email', 'person@example.org');
    form.set('project_type', 'Web');
    const response = await handler.fetch(
      new Request('https://goodflippindesign.com/api/contact', { method: 'POST', body: form }),
      {
        EMAIL: { send: vi.fn().mockRejectedValue(new Error('mail down')) },
        EVENTS_INGEST_URL: 'https://gfd-mission-control-events.weave0.workers.dev',
        EVENTS_INGEST_TOKEN: 'tok-gfd',
      }
    );
    expect(response.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
