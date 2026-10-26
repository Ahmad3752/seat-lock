"""Public provider pages; do not rely on login or internal APIs."""
import hashlib
import json
import re
import time
from datetime import datetime
from urllib.parse import urljoin, urlsplit
from urllib.robotparser import RobotFileParser

import requests
from bs4 import BeautifulSoup
from services.normalize import canonical_url, nodes, normalize
from scrapers.ticketwala import ScrapeError

MEDIA_URL = 'https://mediasniffers.pk/upcoming-music-events-in-pakistan-2026-organized-by-media-sniffers/'

def image_url(value, allowed):
    if isinstance(value, list):
        value = next((v for v in value if isinstance(v, str)), None)
    if not isinstance(value, str):
        return None
    parts = urlsplit(value)
    return value if parts.scheme == 'https' and parts.netloc in allowed else None

def event_nodes(html):
    soup = BeautifulSoup(html, 'lxml')
    for script in soup.select('script[type="application/ld+json"]'):
        try:
            data = json.loads(script.string or script.get_text())
        except (ValueError, TypeError):
            continue
        for node in nodes(data):
            types = node.get('@type', [])
            types = types if isinstance(types, list) else [types]
            if any(t in ('Event', 'MusicEvent', 'SportsEvent', 'TheaterEvent', 'EducationEvent', 'BusinessEvent', 'FoodEvent', 'ComedyEvent', 'ExhibitionEvent', 'Festival') for t in types):
                yield node

def make_event(raw, source, key, category, images):
    event = normalize(raw, raw['url'], source, key)
    event['description'] = None
    event['category'] = category or event['category'] or 'Other'
    event['categories'] = [event['category']]
    event['posterUrl'] = image_url(raw.get('image'), images)
    return event

def parse_allevents(html, category=None):
    events = {}
    for raw in event_nodes(html):
        try:
            url = canonical_url(raw.get('url'))
            if urlsplit(url).hostname not in ('allevents.in', 'www.allevents.in') or not re.fullmatch(r'/(?:islamabad/[^/]+/|event/)\d+/?', urlsplit(url).path):
                continue
            location = raw.get('location') or {}
            address = location.get('address') or {} if isinstance(location, dict) else {}
            if not isinstance(address, dict) or str(address.get('addressLocality', '')).lower() != 'islamabad':
                continue
            raw = dict(raw, url=url)
            event = make_event(raw, 'AllEvents', 'allevents', category, {'cdn-ip.allevents.in', 'cdn-az.allevents.in', 'cdn2.allevents.in', 'allevents.in'})
            if event['startAt']:
                events[event['sourceKey']] = event
        except (ValueError, TypeError, KeyError):
            continue
    return list(events.values())

def parse_shapargullay_listing(html):
    found = []
    for card in BeautifulSoup(html, 'lxml').select('a.sg-ld-row[href]'):
        try:
            url = canonical_url(urljoin('https://shapargullay.com', card['href']))
            if urlsplit(url).hostname != 'shapargullay.com' or not urlsplit(url).path.startswith('/events/'):
                continue
            spans = card.select('span span')
            category = spans[-1].get_text(' ', strip=True).lstrip('· ').strip() if spans else 'Other'
            found.append((url, category or 'Other'))
        except ValueError:
            continue
    return found

def parse_shape_detail(html, url, category):
    events = {}
    for raw in event_nodes(html):
        try:
            if canonical_url(raw.get('url')) != url:
                continue
            event = make_event(raw, 'Shapargullay', 'shapargullay', category, {'images.unsplash.com', 'shapargullay.com', 'www.shapargullay.com'})
            if event['startAt']:
                event['sourceKey'] += ':' + event['startAt'].isoformat()
                events[event['sourceKey']] = event
        except (ValueError, TypeError, KeyError):
            continue
    return list(events.values())

def parse_media(html):
    soup = BeautifulSoup(html, 'lxml')
    container = soup.select_one('[data-widget_type="theme-post-content.default"]')
    if not container:
        raise ScrapeError('Media Sniffers article structure changed')
    events = []
    for heading in container.find_all('h2', recursive=False):
        title = heading.get_text(' ', strip=True)
        if not re.match(r'^\d+\.\s+', title):
            continue
        fields = {}
        for sibling in heading.next_siblings:
            if getattr(sibling, 'name', None) == 'h2':
                break
            if getattr(sibling, 'name', None) == 'p' and sibling.strong:
                label = sibling.strong.get_text(' ', strip=True).rstrip(':').lower()
                fields[label] = sibling.get_text(' ', strip=True).split(':', 1)[-1].strip()
        if not re.search(r'\bislamabad\b', fields.get('city', '') + ' ' + fields.get('venue', ''), re.I):
            continue
        try:
            day = datetime.strptime(fields.get('date', ''), '%d %B %Y').date().isoformat()
            title = re.sub(r'^\d+\.\s+', '', title)
            raw = {'name': title, 'url': MEDIA_URL, 'startDate': day, 'location': {'name': fields.get('venue'), 'address': {'addressLocality': 'Islamabad', 'addressCountry': 'PK'}}, 'organizer': {'name': 'Media Sniffers'}}
            event = make_event(raw, 'Media Sniffers', 'mediasniffers', 'Concerts & Live Music', set())
            event['sourceKey'] += ':' + hashlib.sha256(title.encode('utf-8')).hexdigest()[:16]
            events.append(event)
        except ValueError:
            continue
    return events

def parse_bookme_card(html, url):
    try:
        url = canonical_url(url)
        parts = urlsplit(url)
        if parts.hostname not in ('bookme.pk', 'www.bookme.pk') or not re.fullmatch(r'/events/[a-zA-Z0-9_-]+/?', parts.path):
            return None
        soup = BeautifulSoup(html, 'lxml')
        labels = [p.get_text(' ', strip=True) for p in soup.select('.event-name p')]
        if len(labels) < 3 or labels[2].lower() != 'islamabad':
            return None
        date_text = labels[1].split(' - ')[0]
        start = datetime.strptime(date_text, '%a, %d %b %Y').date().isoformat()
        raw = {'name': labels[0], 'url': url, 'startDate': start, 'location': {'address': {'addressLocality': 'Islamabad', 'addressCountry': 'PK'}}}
        price = soup.select_one('.event-price')
        price_text = price.get_text(' ', strip=True) if price else ''
        match = re.search(r'\bPKR\s*([\d,]+)', price_text, re.I)
        if match:
            raw['offers'] = {'price': match.group(1).replace(',', ''), 'priceCurrency': 'PKR'}
        elif re.search(r'\bfree\b', price_text, re.I):
            raw['isAccessibleForFree'] = True
        badge = soup.select_one('.event-img .badge-primary')
        image = soup.select_one('.event-img img[src]')
        raw['image'] = image.get('src') if image else None
        return make_event(raw, 'Bookme', 'bookme', badge.get_text(' ', strip=True) if badge else None, {'cdn.bookmepk.com'})
    except (ValueError, TypeError):
        return None

class PublicPageScraper:
    def __init__(self, provider, delay=3, timeout=20, user_agent='SeatLockEventResearch/0.1', max_pages=25, session=None):
        self.provider, self.delay, self.timeout, self.user_agent = provider, delay, timeout, user_agent
        self.session = session or requests.Session()
        self.origin = {'allevents': 'https://allevents.in', 'shapargullay': 'https://shapargullay.com', 'mediasniffers': 'https://mediasniffers.pk', 'bookme': 'https://bookme.pk'}[provider]
        self.robots = None

    def get(self, url, check=True):
        if urlsplit(url).netloc != urlsplit(self.origin).netloc:
            raise ScrapeError('Unexpected provider host')
        if check and (not self.robots or not self.robots.can_fetch(self.user_agent, url)):
            raise ScrapeError('robots.txt does not permit this request')
        time.sleep(self.delay)
        try:
            response = self.session.get(url, timeout=self.timeout, headers={'User-Agent': self.user_agent}, allow_redirects=False)
        except requests.RequestException:
            raise ScrapeError(self.provider + ' request failed') from None
        if response.status_code != 200:
            raise ScrapeError(f'{self.provider} HTTP {response.status_code}; no bypass attempted')
        return response.text

    def fetch_events(self):
        robot_text = self.get(self.origin + '/robots.txt', check=False)
        if not re.search(r'^user-agent\s*:', robot_text, re.I | re.M):
            raise ScrapeError('Unrecognized robots.txt')
        self.robots = RobotFileParser()
        self.robots.parse(robot_text.splitlines())
        self.delay = max(self.delay, self.robots.crawl_delay(self.user_agent) or 0)
        if self.provider == 'bookme':
            return self.fetch_bookme()
        if self.provider == 'allevents':
            events = {event['sourceKey']: event for event in parse_allevents(self.get(self.origin + '/islamabad'))}
            for event in parse_allevents(self.get(self.origin + '/islamabad/concerts'), 'Concerts'):
                if event['sourceKey'] in events:
                    events[event['sourceKey']]['category'] = 'Concerts'
                    events[event['sourceKey']]['categories'] = ['Concerts']
                else:
                    events[event['sourceKey']] = event
            if not events:
                raise ScrapeError('No recognizable AllEvents structured listings found')
            return list(events.values())
        if self.provider == 'shapargullay':
            listing = parse_shapargullay_listing(self.get(self.origin + '/cities/islamabad'))
            if not listing:
                raise ScrapeError('No recognizable Shapargullay event cards found')
            events = []
            for url, category in listing:
                detail = parse_shape_detail(self.get(url), url, category)
                if not detail:
                    raise ScrapeError('Shapargullay event details changed')
                events.extend(detail)
            return events
        return parse_media(self.get(MEDIA_URL))

    def fetch_bookme(self):
        from playwright.sync_api import sync_playwright, Error as PlaywrightError
        listing_url = self.origin + '/events/category/all'
        if not self.robots.can_fetch(self.user_agent, listing_url):
            raise ScrapeError('robots.txt does not permit Bookme listings')
        try:
            with sync_playwright() as playwright:
                try:
                    browser = playwright.chromium.launch(channel='chrome', headless=True)
                except PlaywrightError:
                    browser = playwright.chromium.launch(headless=True)
                try:
                    page = browser.new_page(user_agent=self.user_agent)
                    page.goto(listing_url, wait_until='domcontentloaded', timeout=60000)
                    page.locator('.event-name').first.wait_for(timeout=60000)
                    cards = page.locator('.event-name')
                    targets = [index for index in range(cards.count()) if re.search(r'\bislamabad\b', cards.nth(index).inner_text(), re.I)]
                    events = []
                    for index in targets:
                        cards = page.locator('.event-name')
                        html = cards.nth(index).evaluate('(node) => node.parentElement.outerHTML')
                        time.sleep(self.delay)
                        cards.nth(index).click()
                        page.wait_for_url(re.compile(r'^https://(?:www\.)?bookme\.pk/events/[^/?#]+/?(?:\?[^#]*)?$'), timeout=20000)
                        event = parse_bookme_card(html, page.url)
                        if not event or not self.robots.can_fetch(self.user_agent, page.url):
                            raise ScrapeError('Bookme event card or destination changed')
                        events.append(event)
                        time.sleep(self.delay)
                        page.go_back(wait_until='domcontentloaded', timeout=60000)
                        page.locator('.event-name').first.wait_for(timeout=60000)
                    return events
                finally:
                    browser.close()
        except PlaywrightError as error:
            raise ScrapeError('Bookme browser scrape failed; install Playwright and Chromium or check site access') from error
