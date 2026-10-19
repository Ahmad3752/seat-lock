import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { it, expect, vi, beforeEach } from 'vitest';
import { EventCataloguePage } from './PublicEventPages';
import { api } from '../lib/api';
vi.mock('../lib/api', () => ({ api: vi.fn(), ApiError: class extends Error {} }));
vi.mock('../auth/useAuth', () => ({ useAuth: () => ({}) }));
beforeEach(() => vi.mocked(api).mockReset());

it('shows original Ticketwala links and distinguishes unknown from free prices', async () => {
  vi.mocked(api).mockResolvedValue({ events: [
    { id: 'ext', kind: 'external', title: 'Python Workshop', category: 'Workshops', startsAt: '2035-01-01T19:00:00Z', datePrecision: 'date', timezone: 'Asia/Karachi', venue: { name: 'Hall', address: 'Islamabad' }, priceFrom: null, sources: [{ name: 'Ticketwala', url: 'https://ticketwala.pk/event/workshop' }] },
    { id: 'own', slug: 'free-talk', title: 'Free Talk', category: 'Talk', startsAt: '2035-02-01T13:00:00Z', venue: { name: 'Hall', address: 'Islamabad' }, priceFrom: 0 },
  ], pagination: { page: 1, limit: 12, total: 13, pages: 2 } });
  const navigate = vi.fn();
  render(<EventCataloguePage navigate={navigate} />);
  const link = await screen.findByRole('link', { name: /View on Ticketwala/ });
  expect(link.getAttribute('href')).toBe('https://ticketwala.pk/event/workshop');
  expect(screen.getByText('Price not listed')).toBeTruthy();
  expect(screen.getByText('Free')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Free Talk' }).getAttribute('href')).toBe('/events/free-talk');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() => expect(vi.mocked(api).mock.calls.at(-1)?.[0]).toContain('page=2'));
  expect(navigate).not.toHaveBeenCalled();
});

it('keeps the catalogue usable for older events with invalid timezones', async () => {
  vi.mocked(api).mockResolvedValue({ events: [{ id: 'old', slug: 'old-event', title: 'Older Event', category: 'Talk', startsAt: '2035-02-01T13:00:00Z', timezone: 'Pakistan', venue: { name: 'Hall', address: 'Islamabad' }, priceFrom: 100 }], pagination: { page: 1, pages: 1, total: 1 } });
  render(<EventCataloguePage navigate={vi.fn()} />);
  expect(await screen.findByRole('link', { name: 'Older Event' })).toBeTruthy();
});
