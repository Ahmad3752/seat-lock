import json
import unittest
from unittest.mock import patch
from scrapers.providers import parse_allevents, parse_media, parse_shapargullay_listing, parse_shape_detail, parse_bookme_card
import main
from scrapers.ticketwala import ScrapeError


class ProviderTests(unittest.TestCase):
    def test_allevents_jsonld_is_deduplicated_and_has_safe_poster(self):
        raw = {'@type': 'Event', 'name': 'Music Night', 'url': 'https://allevents.in/islamabad/music/1234', 'startDate': '2035-10-22', 'image': 'https://cdn-ip.allevents.in/poster.jpg', 'location': {'name': 'Hall', 'address': {'addressLocality': 'Islamabad', 'addressCountry': 'PK'}}}
        html = '<script type="application/ld+json">' + json.dumps([raw, raw]) + '</script>'
        events = parse_allevents(html, 'Concerts')
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]['category'], 'Concerts')
        self.assertEqual(events[0]['posterUrl'], raw['image'])
        self.assertEqual(events[0]['sources'][0]['name'], 'AllEvents')

    def test_shapargullay_discovers_only_event_links_and_category(self):
        html = '<a class="sg-ld-row" href="/events/show"><strong>Show</strong><span>date</span><span>venue</span><span>Free <span> · Concerts</span></span></a><a class="sg-ld-row" href="https://evil.example/events/show">Bad</a>'
        self.assertEqual(parse_shapargullay_listing(html), [('https://shapargullay.com/events/show', 'Concerts')])

    def test_media_extracts_dated_islamabad_section_only(self):
        html = '<div data-widget_type="theme-post-content.default"><h2>1. Show A</h2><p><strong>Date:</strong> 28 November 2035</p><p><strong>City:</strong> Islamabad</p><h2>2. Show B</h2><p><strong>Date:</strong> TBA</p><p><strong>City:</strong> Islamabad</p><h2>3. Show C</h2><p><strong>Date:</strong> 1 December 2035</p><p><strong>City:</strong> Lahore</p></div>'
        events = parse_media(html)
        self.assertEqual([event['title'] for event in events], ['Show A'])
        self.assertEqual(events[0]['datePrecision'], 'date')
        self.assertEqual(events[0]['sources'][0]['name'], 'Media Sniffers')

    def test_shapargullay_multi_date_shows_have_distinct_ids(self):
        url = 'https://shapargullay.com/events/show'
        base = {'@type': 'Event', 'name': 'Show', 'url': url, 'location': {'address': {'addressLocality': 'Islamabad'}}}
        html = '<script type="application/ld+json">' + json.dumps([dict(base, startDate='2035-11-20T19:30:00+05:00'), dict(base, startDate='2035-11-21T19:30:00+05:00')]) + '</script>'
        events = parse_shape_detail(html, url, 'Theatre')
        self.assertEqual(len({event['sourceKey'] for event in events}), 2)

    def test_bookme_card_preserves_date_category_price_and_poster(self):
        html = '<div><div class="event-img"><span class="badge-primary">Entertainment</span><img src="https://cdn.bookmepk.com/events/market.jpg"></div><div class="event-name"><p>Farmers Market</p><p>Sat, 31 Oct 2035</p><p>Islamabad</p></div><div class="event-price">Starting from PKR <span>500</span></div></div>'
        event = parse_bookme_card(html, 'https://bookme.pk/events/farmers-market')
        self.assertEqual((event['category'], event['price'], event['city']), ('Entertainment', 500, 'Islamabad'))
        self.assertEqual(event['posterUrl'], 'https://cdn.bookmepk.com/events/market.jpg')
        self.assertEqual(event['datePrecision'], 'date')
        self.assertIsNone(parse_bookme_card(html, 'https://evil.example/events/farmers-market'))

    def test_all_continues_after_provider_failure_and_returns_failure(self):
        calls = []
        class FakeScraper:
            def __init__(self, provider, **kwargs):
                self.provider = provider
            def fetch_events(self):
                calls.append(self.provider)
                if self.provider == 'allevents':
                    raise ScrapeError('unavailable')
                return []
        with patch.object(main, 'TicketwalaScraper', lambda **kwargs: FakeScraper('ticketwala')), patch.object(main, 'PublicPageScraper', FakeScraper):
            self.assertEqual(main.main(['--all', '--dry-run']), 1)
        self.assertEqual(calls, ['ticketwala', 'allevents', 'shapargullay', 'bookme', 'mediasniffers'])

