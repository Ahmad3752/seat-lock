"""Manual runner: no server or browser process is required."""
import argparse
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv, dotenv_values
from pymongo.errors import PyMongoError
from database.mongo import connect, save_event
from scrapers.ticketwala import TicketwalaScraper, ScrapeError
from scrapers.providers import PublicPageScraper

def main(argv=None):
    parser = argparse.ArgumentParser(description='SeatLock external events')
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--source', choices=['ticketwala', 'allevents', 'shapargullay', 'bookme', 'mediasniffers'])
    group.add_argument('--all', action='store_true', help='Run every supported provider')
    parser.add_argument('--dry-run', action='store_true', help='Inspect public pages; never connect to MongoDB')
    parser.add_argument('--output', type=Path, help='Save normalized JSON for inspection')
    args = parser.parse_args(argv)
    load_dotenv(Path(__file__).with_name('.env'))
    logging.basicConfig(level=logging.INFO, format='%(levelname)s %(message)s')
    counts = dict(found=0, created=0, updated=0, skipped=0, failed=0)
    started = datetime.now(timezone.utc)
    client = db = None
    success = False
    try:
        if not args.dry_run:
            if os.getenv('NODE_ENV', 'development') == 'production':
                raise ValueError('Production ingestion is not enabled for this development subsystem')
            uri = os.getenv('MONGODB_URI') or dotenv_values(Path(__file__).resolve().parent.parent / 'server' / '.env').get('MONGODB_URI')
            if not uri:
                raise ValueError('Set MONGODB_URI in scraper/.env to the same local database as the server')
            client, db = connect(uri)
        delay = float(os.getenv('SCRAPER_DELAY_SECONDS', '3'))
        timeout = float(os.getenv('SCRAPER_TIMEOUT_SECONDS', '20'))
        max_pages = int(os.getenv('SCRAPER_MAX_PAGES', '25'))
        if delay < 1 or timeout <= 0 or not 1 <= max_pages <= 100:
            raise ValueError('Delay must be >=1 second, timeout >0, and max pages between 1 and 100')
        providers = [args.source] if args.source else ['ticketwala', 'allevents', 'shapargullay', 'bookme', 'mediasniffers']
        all_events = []
        for provider in providers:
            provider_started = datetime.now(timezone.utc)
            provider_counts = dict(found=0, created=0, updated=0, skipped=0, failed=0)
            try:
                options = dict(delay=delay, timeout=timeout, max_pages=max_pages, user_agent=os.getenv('SCRAPER_USER_AGENT', 'SeatLockEventResearch/0.1'))
                scraper = TicketwalaScraper(**options) if provider == 'ticketwala' else PublicPageScraper(provider, **options)
                events = scraper.fetch_events()
                provider_counts['found'] = len(events)
                all_events.extend(events)
                for event in events:
                    if args.dry_run:
                        print(json.dumps(event, default=lambda value: value.isoformat(), ensure_ascii=True))
                    else:
                        try:
                            provider_counts[save_event(db.external_events, event)] += 1
                        except PyMongoError:
                            provider_counts['failed'] += 1
                            logging.error('%s: database write failed', provider)
            except (ScrapeError, ValueError) as error:
                provider_counts['failed'] += 1
                logging.error('%s: %s', provider, error)
            for key, value in provider_counts.items():
                counts[key] += value
            provider_success = provider_counts['failed'] == 0
            if db is not None:
                fields = {'startedAt': provider_started, 'finishedAt': datetime.now(timezone.utc), 'success': provider_success, 'counts': provider_counts}
                if provider_success:
                    fields['lastSuccessfulAt'] = datetime.now(timezone.utc)
                db.scraper_runs.update_one({'_id': provider}, {'$set': fields}, upsert=True)
            logging.info('%s dry_run=%s success=%s %s', provider, args.dry_run, provider_success, json.dumps(provider_counts))
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(json.dumps(all_events, default=lambda value: value.isoformat(), indent=2, ensure_ascii=False), encoding='utf-8')
        success = counts['failed'] == 0
    except (ScrapeError, ValueError) as error:
        counts['failed'] += 1
        logging.error('%s', error)
    except PyMongoError:
        counts['failed'] += 1
        logging.error('MongoDB connection/write failed; check your local database and configuration')
    finally:
        if client is not None:
            client.close()
        logging.info('total dry_run=%s success=%s %s', args.dry_run, success, json.dumps(counts))
    return 0 if success else 1

if __name__ == '__main__':
    raise SystemExit(main())
