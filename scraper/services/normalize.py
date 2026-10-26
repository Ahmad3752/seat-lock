"""Standard schema.org Event normalization; no guessed site-specific selectors."""
import json
import math
import re
from datetime import datetime, timezone
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode, urljoin
from zoneinfo import ZoneInfo

from bs4 import BeautifulSoup

HOSTS = {'ticketwala.pk', 'www.ticketwala.pk', 'ticketwala.events', 'www.ticketwala.events', 'allevents.in', 'www.allevents.in', 'shapargullay.com', 'www.shapargullay.com', 'bookme.pk', 'www.bookme.pk', 'mediasniffers.pk', 'www.mediasniffers.pk'}
CATEGORIES = {'MusicEvent': 'Concerts', 'EducationEvent': 'Workshops', 'BusinessEvent': 'Conferences',
              'TheaterEvent': 'Theatre', 'SportsEvent': 'Sports', 'FoodEvent': 'Food & Markets',
              'ComedyEvent': 'Comedy', 'ExhibitionEvent': 'Exhibitions', 'Festival': 'Festivals'}

def canonical_url(value):
    if not isinstance(value, str):
        raise ValueError('Missing source URL')
    parts = urlsplit(value.strip())
    if parts.scheme not in ('http', 'https') or parts.hostname not in HOSTS or parts.username or parts.password or parts.port not in (None, 80, 443):
        raise ValueError('Invalid event source URL')
    query = [(k, v) for k, v in parse_qsl(parts.query) if not k.lower().startswith('utm_') and k not in ('fbclid', 'gclid')]
    return urlunsplit(('https', parts.hostname, parts.path.rstrip('/') or '/', urlencode(sorted(query)), ''))

def text(value, limit=2000):
    if not isinstance(value, str):
        return None
    return BeautifulSoup(value, 'lxml').get_text(' ', strip=True)[:limit] or None

def date(value, zone):
    if value is None or value == '':
        return None, None
    if not isinstance(value, str):
        raise ValueError('Invalid event date')
    precision = 'date' if re.fullmatch(r'\d{4}-\d{2}-\d{2}', value) else 'datetime'
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None:
        if not zone:
            raise ValueError('Local event date requires a known timezone')
        parsed = parsed.replace(tzinfo=ZoneInfo(zone))
    return parsed.astimezone(timezone.utc), precision

def nodes(value):
    if isinstance(value, list):
        for item in value:
            yield from nodes(item)
    elif isinstance(value, dict):
        yield value
        for child in value.values():
            if isinstance(child, (dict, list)):
                yield from nodes(child)

def normalize(raw, page_url, source_name='Ticketwala', source_key='ticketwala'):
    title = text(raw.get('name'), 150)
    if not title:
        raise ValueError('Event requires a title')
    url = canonical_url(urljoin(page_url, raw.get('url') or page_url))
    location = raw.get('location') or {}
    if not isinstance(location, dict):
        location = {'name': location}
    address = location.get('address') or {}
    city = text(address.get('addressLocality'), 100) if isinstance(address, dict) else None
    country = address.get('addressCountry') if isinstance(address, dict) else None
    if isinstance(country, dict):
        country = country.get('name')
    pakistan = str(country).lower() in ('pk', 'pakistan') or (city or '').lower() in ('islamabad', 'rawalpindi', 'karachi', 'lahore', 'multan', 'faisalabad', 'peshawar')
    zone = 'Asia/Karachi' if pakistan else None
    start, precision = date(raw.get('startDate'), zone)
    end, _ = date(raw.get('endDate'), zone)
    if start and end and end < start:
        raise ValueError('End date precedes start date')
    offers = raw.get('offers') or []
    offers = offers if isinstance(offers, list) else [offers]
    prices = []
    for offer in offers:
        if not isinstance(offer, dict):
            continue
        amount = offer.get('price', offer.get('lowPrice'))
        if amount is None:
            continue
        number = float(amount)
        if not math.isfinite(number) or number < 0:
            raise ValueError('Invalid price')
        currency = offer.get('priceCurrency')
        if not isinstance(currency, str) or not re.fullmatch(r'[A-Za-z]{3}', currency):
            raise ValueError('Price requires currency')
        prices.append((number, currency.upper()))
    if len({currency for _, currency in prices}) > 1:
        raise ValueError('Mixed currencies need manual review')
    price, currency = min(prices) if prices else (None, None)
    if raw.get('isAccessibleForFree') is True:
        price = 0
    types = raw.get('@type', [])
    types = types if isinstance(types, list) else [types]
    category = next((CATEGORIES[t] for t in types if t in CATEGORIES), None)
    organizer = raw.get('organizer')
    organizer = text(organizer.get('name') if isinstance(organizer, dict) else organizer, 200)
    status = 'needs_review' if start is None else 'published'
    if str(raw.get('eventStatus', '')).endswith(('EventCancelled', 'EventPostponed')):
        status = 'cancelled'
    return {'sourceKey': source_key + ':' + url, 'title': title, 'category': category,
            'startAt': start, 'endAt': end, 'datePrecision': precision, 'timezone': zone,
            'city': city, 'venue': text(location.get('name'), 250),
            'description': text(raw.get('description')), 'posterUrl': None,
            'price': price, 'currency': currency, 'organizer': organizer,
            'sources': [{'name': source_name, 'url': url}], 'status': status}

def parse_events(html, page_url):
    events = {}
    soup = BeautifulSoup(html, 'lxml')
    for script in soup.find_all('script', type='application/ld+json'):
        try:
            data = json.loads(script.string or script.get_text())
        except (ValueError, TypeError):
            continue
        for node in nodes(data):
            types = node.get('@type', [])
            types = types if isinstance(types, list) else [types]
            if any(t == 'Event' or t in CATEGORIES for t in types):
                event = normalize(node, page_url)
                events[event['sourceKey']] = event
    return list(events.values())
