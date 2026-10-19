"""Ticketwala's public listing request plus BeautifulSoup ticket-price extraction.

Observed on 2026-10-19 in the city page's public 6033 bundle and Event detail HTML.
The initial city HTML is an empty JS shell, not an empty event catalogue.
"""
import json
import logging
import re
import time
from urllib.parse import urlsplit, urlencode
from urllib.robotparser import RobotFileParser

import requests
from bs4 import BeautifulSoup
from services.normalize import canonical_url, normalize

def ticket_price(html):
    prices = []
    for ticket in BeautifulSoup(html, 'lxml').select('[data-sentry-component="TicketItem"]'):
        for heading in ticket.select('h4'):
            label = heading.get_text(' ', strip=True)
            if label.lower() == 'free':
                prices.append(0)
            elif re.fullmatch(r'Rs\s*[\d,]+(?:\.\d{1,2})?', label):
                prices.append(float(re.sub(r'[^\d.]', '', label)))
    return min(prices) if prices else None

def normalize_listing(item, html, categories=None):
    if not isinstance(item, dict) or not re.fullmatch(r'\d+', str(item.get('id', ''))):
        raise ValueError('Missing Ticketwala event ID')
    slug = item.get('slug')
    if not isinstance(slug, str) or not re.fullmatch(r'[A-Za-z0-9_-]+', slug):
        raise ValueError('Invalid Ticketwala event slug')
    price = ticket_price(html)
    raw = {'name': item.get('title'), 'url': 'https://ticketwala.pk/event/' + slug,
           'startDate': item.get('startDate'), 'endDate': item.get('endDate'),
           'location': {'name': item.get('location'), 'address': {'addressLocality': item.get('cityName'), 'addressCountry': item.get('countryName')}},
           'organizer': {'name': item.get('brandName')},
           'isAccessibleForFree': item.get('isFree') == 'yes'}
    if price is not None:
        raw['offers'] = {'price': price, 'priceCurrency': 'PKR'}
    event = normalize(raw, raw['url'])
    event['sourceKey'] = 'ticketwala:' + str(item['id'])
    event['sourceId'] = str(item['id'])
    event['categories'] = list(categories or (['Workshops'] if item.get('type') == 'workshops' else ['Other']))
    event['category'] = event['categories'][0]
    banner = item.get('bannerPath')
    if isinstance(banner, str):
        parts = urlsplit(banner)
        if parts.scheme == 'https' and parts.netloc == 'v5.ticketwala.pk' and parts.path.startswith('/uploads/events/banner/'):
            event['posterUrl'] = banner
    return event

class ScrapeError(RuntimeError):
    pass

class TicketwalaScraper:
    def __init__(self, session=None, delay=3, timeout=20, user_agent='SeatLockEventResearch/0.1', max_pages=25):
        self.session = session or requests.Session()
        self.delay, self.timeout, self.user_agent, self.max_pages = max(0, delay), timeout, user_agent, max_pages
        self.robots = None
        self.origin = 'https://ticketwala.pk'

    def get(self, url, check_robots=True):
        url = canonical_url(url)
        if urlsplit(url).netloc != urlsplit(self.origin).netloc:
            raise ScrapeError('Cross-domain navigation requires a separate access review')
        if check_robots and (not self.robots or not self.robots.can_fetch(self.user_agent, url)):
            raise ScrapeError('robots.txt does not permit this request')
        for attempt in range(3):
            time.sleep(self.delay)
            try:
                response = self.session.get(url, timeout=self.timeout, headers={'User-Agent': self.user_agent}, allow_redirects=False)
            except requests.RequestException:
                if attempt == 2:
                    raise ScrapeError('Ticketwala network request failed after 3 attempts') from None
                time.sleep(2 ** attempt)
                continue
            if response.status_code == 200:
                return response.text
            if response.status_code in (401, 403, 429):
                raise ScrapeError(f'Ticketwala HTTP {response.status_code}: access restricted; no bypass attempted')
            if 500 <= response.status_code <= 599 and attempt < 2:
                time.sleep(2 ** attempt)
                continue
            raise ScrapeError(f'Ticketwala HTTP {response.status_code}; page or access rules unavailable')
        raise ScrapeError('Ticketwala request failed')

    def fetch_events(self):
        robots_text = self.get(self.origin + '/robots.txt', check_robots=False)
        if '<html' in robots_text.lower() or not any(line.strip().lower().startswith('user-agent:') for line in robots_text.splitlines()):
            raise ScrapeError('Unrecognized robots.txt; access rules require review')
        self.robots = RobotFileParser()
        self.robots.parse(robots_text.splitlines())
        self.delay = max(self.delay, self.robots.crawl_delay(self.user_agent) or 0)
        records = {}
        seen_pages = set()
        page = 1
        while True:
            params = urlencode({'city': 'islamabad', 'present': 'true', 'page': page, 'perPage': 6})
            response = self.get(self.origin + '/api/public/events/public?' + params)
            try:
                data = json.loads(response)
            except ValueError:
                raise ScrapeError('Public listing returned an unrecognized structure') from None
            if not isinstance(data, dict) or not isinstance(data.get('items'), list) or type(data.get('totalPages')) is not int or data['totalPages'] < 0:
                raise ScrapeError('Public listing structure changed; expected items and totalPages')
            if data['totalPages'] > self.max_pages:
                raise ScrapeError('Listing exceeds configured maximum pages; no partial import performed')
            fingerprint = tuple(str(item.get('id')) for item in data['items'] if isinstance(item, dict))
            if fingerprint and fingerprint in seen_pages:
                raise ScrapeError('Pagination repeated a page; no partial import performed')
            seen_pages.add(fingerprint)
            logging.info('Ticketwala page %s/%s: %s listings', page, data['totalPages'], len(data['items']))
            for item in data['items']:
                if not isinstance(item, dict):
                    raise ScrapeError('Malformed listing item')
                if item.get('accessType') != 'public' or item.get('isPrivate') == 'yes' or item.get('isPassword') == 'yes' or item.get('status') != 'publish':
                    continue
                try:
                    # Validate ID, slug and dates before making a detail request.
                    event = normalize_listing(item, '')
                    detail = self.get(event['sources'][0]['url'])
                    event = normalize_listing(item, detail)
                except ValueError:
                    raise ScrapeError('Invalid event fields; inspect source data before import') from None
                records[event['sourceKey']] = event
            if page >= data['totalPages']:
                break
            if not data['items']:
                raise ScrapeError('Unexpected empty page before end of pagination')
            page += 1
        if records:
            try:
                categories = json.loads(self.get(self.origin + '/api/public/categories/public'))
            except ValueError:
                raise ScrapeError('Category listing returned invalid JSON') from None
            if not isinstance(categories, list) or any(not isinstance(c, dict) or not re.fullmatch(r'\d+', str(c.get('id', ''))) or not isinstance(c.get('name'), str) or not c['name'].strip() for c in categories):
                raise ScrapeError('Category listing structure changed')
            memberships = {key: [] for key in records}
            for category in categories:
                logging.info('Checking Ticketwala category: %s', category['name'].strip())
                page = 1
                seen_pages = set()
                while True:
                    params = urlencode({'city': 'islamabad', 'present': 'true', 'page': page, 'perPage': 6, 'category': category['id']})
                    try:
                        data = json.loads(self.get(self.origin + '/api/public/events/public?' + params))
                    except ValueError:
                        raise ScrapeError('Category events returned invalid JSON') from None
                    if not isinstance(data, dict) or not isinstance(data.get('items'), list) or type(data.get('totalPages')) is not int or data['totalPages'] < 0 or data['totalPages'] > self.max_pages:
                        raise ScrapeError('Category events structure or pagination changed')
                    fingerprint = tuple(str(item.get('id')) for item in data['items'] if isinstance(item, dict))
                    if fingerprint and fingerprint in seen_pages:
                        raise ScrapeError('Category pagination repeated a page')
                    seen_pages.add(fingerprint)
                    for item in data['items']:
                        if not isinstance(item, dict) or not re.fullmatch(r'\d+', str(item.get('id', ''))):
                            raise ScrapeError('Malformed category event')
                        key = 'ticketwala:' + str(item['id'])
                        if key in memberships and category['name'].strip() not in memberships[key]:
                            memberships[key].append(category['name'].strip())
                    if page >= data['totalPages']:
                        break
                    if not data['items']:
                        raise ScrapeError('Unexpected empty category page')
                    page += 1
            for key, labels in memberships.items():
                if labels:
                    records[key]['categories'] = labels
                    records[key]['category'] = labels[0]
        return list(records.values())
