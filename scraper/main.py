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

def main(argv=None):
    parser = argparse.ArgumentParser(description='SeatLock external events — Ticketwala first')
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--source', choices=['ticketwala'])
    group.add_argument('--all', action='store_true', help='Currently Ticketwala only')
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
        events = TicketwalaScraper(delay=delay, timeout=timeout, max_pages=max_pages,
                                  user_agent=os.getenv('SCRAPER_USER_AGENT', 'SeatLockEventResearch/0.1')).fetch_events()
        counts['found'] = len(events)
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(json.dumps(events, default=lambda value: value.isoformat(), indent=2, ensure_ascii=False), encoding='utf-8')
        for event in events:
            if args.dry_run:
                print(json.dumps(event, default=lambda value: value.isoformat(), ensure_ascii=True))
                continue
            try:
                counts[save_event(db.external_events, event)] += 1
            except PyMongoError:
                counts['failed'] += 1
                logging.error('An external-event database write failed (connection details omitted)')
        success = counts['failed'] == 0
    except (ScrapeError, ValueError) as error:
        counts['failed'] += 1
        logging.error('%s', error)
    except PyMongoError:
        counts['failed'] += 1
        logging.error('MongoDB connection/write failed; check your local database and configuration')
    finally:
        finished = datetime.now(timezone.utc)
        if db is not None:
            try:
                fields = {'startedAt': started, 'finishedAt': finished, 'success': success, 'counts': counts}
                if success:
                    fields['lastSuccessfulAt'] = finished
                db.scraper_runs.update_one({'_id': 'ticketwala'}, {'$set': fields}, upsert=True)
            except PyMongoError:
                success = False
                logging.error('Could not record scraping run status')
        if client is not None:
            client.close()
        logging.info('ticketwala dry_run=%s success=%s %s', args.dry_run, success, json.dumps(counts))
    return 0 if success else 1

if __name__ == '__main__':
    raise SystemExit(main())
