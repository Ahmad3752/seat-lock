"""Synthetic schema.org fixtures, NOT a captured Ticketwala page."""
import json
import unittest
from datetime import datetime, timezone
from unittest.mock import Mock
from pathlib import Path

from services.normalize import parse_events, canonical_url
from database.mongo import save_event
from scrapers.ticketwala import TicketwalaScraper, ScrapeError
import scrapers.ticketwala as ticketwala

URL = 'https://ticketwala.pk/event/test-fixture'

def html(**changes):
    event = {'@type': 'Event', 'name': 'Test Workshop', 'url': URL,
             'startDate': '2030-10-25T18:00:00',
             'location': {'name': 'Test Hall', 'address': {'addressLocality': 'Islamabad', 'addressCountry': 'PK'}}}
    event.update(changes)
    return '<script type="application/ld+json">' + json.dumps({'@graph': [event]}) + '</script>'

class NormalizeTests(unittest.TestCase):
    def test_local_datetime_becomes_utc_and_unknown_is_not_free(self):
        event = parse_events(html(), URL)[0]
        self.assertEqual(event['startAt'], datetime(2030, 10, 25, 13, tzinfo=timezone.utc))
        self.assertEqual(event['timezone'], 'Asia/Karachi')
        self.assertIsNone(event['price'])
        self.assertEqual(event['sources'][0]['url'], URL)

    def test_date_only_retains_precision_and_free_is_explicit(self):
        event = parse_events(html(startDate='2030-10-25', isAccessibleForFree=True), URL)[0]
        self.assertEqual(event['datePrecision'], 'date')
        self.assertEqual(event['price'], 0)

    def test_invalid_date_price_and_url_are_rejected(self):
        for changes in [{'startDate': '2030-02-30'}, {'url': 'javascript:alert(1)'},
                        {'offers': {'price': '-5', 'priceCurrency': 'PKR'}},
                        {'offers': {'price': 'NaN', 'priceCurrency': 'PKR'}}]:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                parse_events(html(**changes), URL)

    def test_missing_date_and_image_are_not_invented(self):
        event = parse_events(html(startDate=None), URL)[0]
        self.assertIsNone(event['startAt'])
        self.assertEqual(event['status'], 'needs_review')
        self.assertIsNone(event['posterUrl'])

    def test_unknown_structure_fails_and_tracking_is_removed(self):
        self.assertEqual(parse_events('<html>Not an event</html>', URL), [])
        self.assertEqual(canonical_url(URL + '?utm_source=test#tickets'), URL)

    def test_offset_and_event_type_array(self):
        event = parse_events(html(**{'@type': ['Thing', 'MusicEvent'], 'startDate': '2030-10-25T18:00:00+05:00'}), URL)[0]
        self.assertEqual(event['startAt'].hour, 13)
        self.assertEqual(event['category'], 'Concerts')

class StorageTests(unittest.TestCase):
    def test_source_identity_upsert_and_timestamps(self):
        collection = Mock()
        collection.update_one.return_value.upserted_id = 'new-id'
        event = parse_events(html(), URL)[0]
        now = datetime.now(timezone.utc)
        self.assertEqual(save_event(collection, event, now), 'created')
        query, update = collection.update_one.call_args.args
        self.assertEqual(query, {'sourceKey': 'ticketwala:' + URL})
        self.assertTrue(collection.update_one.call_args.kwargs['upsert'])
        self.assertEqual(update['$set']['lastSeenAt'], now)
        self.assertEqual(update['$setOnInsert']['createdAt'], now)
        collection.update_one.return_value.upserted_id = None
        self.assertEqual(save_event(collection, event, now), 'updated')

class AccessTests(unittest.TestCase):
    def test_real_listing_fields_use_local_timezone_and_html_price(self):
        fixture = json.loads(Path('tests/fixtures/ticketwala-list.json').read_text(encoding='utf-8'))
        source = next(item for item in fixture['items'] if item['title'] == 'SOT Events')
        detail = Path('tests/fixtures/ticketwala-free-ticket.html').read_text(encoding='utf-8')
        event = ticketwala.normalize_listing(source, detail)
        self.assertEqual(event['startAt'], datetime(2026, 10, 24, 6, tzinfo=timezone.utc))
        self.assertEqual(event['price'], 0)
        self.assertEqual(event['venue'], source['location'])
        self.assertEqual(event['sourceKey'], 'ticketwala:7849')

    def test_public_list_pagination_and_no_fake_empty_success(self):
        fixture = json.loads(Path('tests/fixtures/ticketwala-list.json').read_text(encoding='utf-8'))
        scraper = TicketwalaScraper(delay=0)
        scraper.get = Mock(side_effect=['User-agent: *\nAllow: /', json.dumps({'items': fixture['items'][:1], 'totalPages': 2}), '<html></html>', json.dumps({'items': fixture['items'][1:2], 'totalPages': 2}), '<html></html>'])
        events = scraper.fetch_events()
        self.assertEqual(len(events), 2)
        self.assertTrue(any('page=2' in call.args[0] for call in scraper.get.call_args_list))
        scraper.get = Mock(side_effect=['User-agent: *\nAllow: /', '{}'])
        with self.assertRaisesRegex(ScrapeError, 'structure'):
            scraper.fetch_events()

    def test_ticket_prices_from_observed_ticket_component(self):
        detail = '<div data-sentry-component="TicketItem"><h4>VIP</h4><h4>Rs 2,500</h4></div><div data-sentry-component="TicketItem"><h4>Standard</h4><h4>Rs 1,000</h4></div>'
        self.assertEqual(ticketwala.ticket_price(detail), 1000)
        self.assertIsNone(ticketwala.ticket_price('<h4>Unknown</h4>'))

    def test_403_is_reported_without_retrying_or_fetching_events(self):
        session = Mock()
        session.get.return_value.status_code = 403
        scraper = TicketwalaScraper(session=session, delay=0)
        with self.assertRaisesRegex(ScrapeError, '403'):
            scraper.fetch_events()
        self.assertEqual(session.get.call_count, 1)

    def test_robots_disallow_stops_fetch(self):
        session = Mock()
        response = Mock(status_code=200, text='User-agent: *\nDisallow: /')
        session.get.return_value = response
        with self.assertRaisesRegex(ScrapeError, 'robots'):
            TicketwalaScraper(session=session, delay=0).fetch_events()
        self.assertEqual(session.get.call_count, 1)

if __name__ == '__main__':
    unittest.main()
