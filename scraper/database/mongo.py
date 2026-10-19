from datetime import datetime, timezone
from pymongo import MongoClient, ASCENDING

def save_event(collection, event, now=None):
    now = now or datetime.now(timezone.utc)
    result = collection.update_one({'sourceKey': event['sourceKey']}, {
        '$set': {**event, 'updatedAt': now, 'lastCheckedAt': now, 'lastSeenAt': now},
        '$setOnInsert': {'createdAt': now},
    }, upsert=True)
    return 'created' if result.upserted_id is not None else 'updated'

def connect(uri):
    client = MongoClient(uri, serverSelectionTimeoutMS=5000, tz_aware=True)
    try:
        db = client.get_default_database()
        client.admin.command('ping')
        db.external_events.create_index('sourceKey', unique=True)
        db.external_events.create_index([('status', ASCENDING), ('startAt', ASCENDING)])
        return client, db
    except Exception:
        client.close()
        raise
