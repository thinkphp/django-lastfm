# Last.fm Listening Journal

A Django application for browsing a Last.fm user's recent listening history. The page shows 10 tracks at a time, with additional tracks loaded from a local server cache.

## Requirements

- Python 3.10 or later
- A Last.fm API key

## Setup

Create a virtual environment and install dependencies:

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Set your Last.fm API key in the environment:

```bash
export LASTFM_API_KEY="your-lastfm-api-key"
```

Apply Django migrations and start the development server:

```bash
python manage.py migrate
python manage.py runserver
```

Open http://127.0.0.1:8000.

## Track loading and cache

Django checks `instance/recent_tracks_cache.json` before contacting Last.fm. On a cache miss, it fetches up to 200 tracks and stores them. The browser reveals tracks 10 at a time from that batch; Django fetches the next Last.fm page only when the cached batch is exhausted. Cache entries expire after 15 minutes for new searches.

## API

```text
GET /api/recent-tracks?user=<username>&offset=0
```

The JSON response contains `user`, `tracks`, and `has_more`.
