import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import mongoose from 'mongoose';
import { installTestDatabase } from './helpers/database.js';

process.env.MONGODB_URI = 'mongodb://unused-for-http-tests';
process.env.JWT_ACCESS_SECRET = 'test-access-secret';
const { createApp } = await import('../src/app.js');
const { Event } = await import('../src/models/event.model.js');
const { Venue } = await import('../src/models/venue.model.js');
installTestDatabase();
const app = createApp();

async function seed(title: string, overrides = {}) {
  return mongoose.connection.collection('external_events').insertOne({
    sourceKey: 'ticketwala:https://ticketwala.pk/event/' + title,
    title, category: 'Workshops', startAt: new Date('2035-01-01T13:00:00Z'), endAt: null,
    datePrecision: 'datetime', timezone: 'Asia/Karachi', city: 'Islamabad', venue: 'Test Hall',
    price: null, currency: null, posterUrl: null, status: 'published',
    sources: [{ name: 'Ticketwala', url: 'https://ticketwala.pk/event/' + title }], ...overrides,
  });
}

test('external catalogue supports sources, null prices, filtering and pagination', async () => {
  await seed('Alpha'); await seed('Beta'); await seed('Past', { startAt: new Date('2020-01-01') });
  await seed('Cancelled', { status: 'cancelled' });
  await seed('Unknown', { startAt: null, status: 'needs_review' });
  const result = await request(app).get('/api/v1/events').query({ kind: 'all', city: 'Islamabad', category: 'Workshops', page: 1, limit: 1 }).expect(200);
  assert.equal(result.body.data.events.length, 1);
  assert.equal(result.body.data.events[0].kind, 'external');
  assert.equal(result.body.data.events[0].priceFrom, null);
  assert.match(result.body.data.events[0].sources[0].url, /^https:\/\/ticketwala.pk\/event\//);
  assert.equal(result.body.data.pagination.total, 2);
  const next = await request(app).get('/api/v1/events?kind=external&page=2&limit=1').expect(200);
  assert.notEqual(next.body.data.events[0].id, result.body.data.events[0].id);
  const empty = await request(app).get('/api/v1/events?kind=external&city=Lahore').expect(200);
  assert.equal(empty.body.data.events.length, 0);
});

test('external records never become internal details or seat maps; unsafe links are excluded', async () => {
  const { insertedId } = await seed('Safe');
  await seed('Unsafe', { sources: [{ name: 'Ticketwala', url: 'javascript:alert(1)' }] });
  await request(app).get(`/api/v1/events/${insertedId}`).expect(404);
  await request(app).get(`/api/v1/events/${insertedId}/seats`).expect(404);
  const result = await request(app).get('/api/v1/events?kind=external').expect(200);
  assert.deepEqual(result.body.data.events.map((item: { title: string }) => item.title), ['Safe']);
  for (const query of ['page=0', 'limit=101', 'kind=unknown']) {
    await request(app).get('/api/v1/events?kind=all&' + query).expect(422);
  }
});

test('combined pagination orders internal and external events together', async () => {
  const organizerId = new mongoose.Types.ObjectId();
  const venue = await Venue.create({ organizerId, name: 'Hall', address: 'Islamabad', seats: [{ seatKey: 'A1', section: 'A', row: 'A', number: 1, label: 'A1', gridRow: 1, gridColumn: 1 }] });
  await Event.create({ organizerId, venueId: venue._id, title: 'SeatLock Workshop', slug: 'own-workshop', category: 'Workshops', startsAt: new Date('2035-01-02'), endsAt: new Date('2035-01-03'), timezone: 'Asia/Karachi', status: 'published', currency: 'PKR', sectionPrices: [{ section: 'A', amount: 100 }] });
  await seed('Earlier');
  await seed('Later', { startAt: new Date('2035-01-04') });
  const result = await request(app).get('/api/v1/events?kind=all&page=2&limit=1&city=Islamabad').expect(200);
  assert.equal(result.body.data.pagination.total, 3);
  assert.equal(result.body.data.events[0].kind, 'seatlock');
  assert.equal(result.body.data.events[0].slug, 'own-workshop');
  assert.equal(result.body.data.events[0].priceFrom, 100);
  await Event.collection.updateOne({ slug: 'own-workshop' }, { $set: { slug: '' } });
  const legacy = await request(app).get('/api/v1/events?kind=seatlock').expect(200);
  assert.equal(legacy.body.data.events[0].slug, legacy.body.data.events[0].id);
});

test('calendar filters include Pakistan date-only events and exclude following local day', async () => {
  await seed('DateOnly', { startAt: new Date('2035-01-01T19:00:00Z'), datePrecision: 'date' });
  await seed('NextDay', { startAt: new Date('2035-01-02T20:00:00Z') });
  const result = await request(app).get('/api/v1/events?kind=external&from=2035-01-02&to=2035-01-02').expect(200);
  assert.deepEqual(result.body.data.events.map((event: { title: string }) => event.title), ['DateOnly']);
});

test('category choices include all distinct upcoming event categories and filter multiple labels', async () => {
  await seed('Market', { category: 'Food', categories: ['Food', 'Festivals & Markets'] });
  await seed('Concert', { category: 'Concerts & Live Music', categories: ['Concerts & Live Music'] });
  await seed('Old', { category: 'Past Category', startAt: new Date('2020-01-01') });
  const categories = await request(app).get('/api/v1/events/categories').expect(200);
  assert.deepEqual(categories.body.data.categories, ['Concerts & Live Music', 'Festivals & Markets', 'Food']);
  const matches = await request(app).get('/api/v1/events').query({ kind: 'all', category: 'Festivals & Markets' }).expect(200);
  assert.deepEqual(matches.body.data.events.map((event: { title: string }) => event.title), ['Market']);
});
