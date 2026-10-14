import json
import os
import tempfile
import threading
import time
from pathlib import Path

import requests
from django.conf import settings
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.http import require_GET

LASTFM_API_URL = "https://ws.audioscrobbler.com/2.0/"
LASTFM_PAGE_SIZE = 200
CACHE_BATCH_SIZE = 200
CACHE_TTL_SECONDS = 15 * 60
CACHE_FILE = Path(settings.BASE_DIR) / "instance" / "recent_tracks_cache.json"
_cache_write_lock = threading.Lock()


def _read_cache():
    try:
        with CACHE_FILE.open("r", encoding="utf-8") as cache_file:
            cache = json.load(cache_file)
            return cache if isinstance(cache, dict) else {}
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _write_cache_entry(username, entry):
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with _cache_write_lock:
        cache = _read_cache()
        cache[username] = entry
        temporary_path = None
        try:
            with tempfile.NamedTemporaryFile(
                mode="w",
                encoding="utf-8",
                dir=CACHE_FILE.parent,
                prefix="recent_tracks_",
                suffix=".tmp",
                delete=False,
            ) as temporary_file:
                json.dump(cache, temporary_file)
                temporary_path = temporary_file.name
            os.replace(temporary_path, CACHE_FILE)
        finally:
            if temporary_path and os.path.exists(temporary_path):
                os.unlink(temporary_path)


def _fetch_recent_tracks(username, page):
    api_key = getattr(settings, "LASTFM_API_KEY", "")
    if not api_key:
        return None, False, "Set the LASTFM_API_KEY environment variable to use Last.fm search."

    params = {
        "method": "user.getrecenttracks",
        "user": username,
        "api_key": api_key,
        "format": "json",
        "page": page,
        "limit": LASTFM_PAGE_SIZE,
    }
    try:
        response = requests.get(LASTFM_API_URL, params=params, timeout=15)
        response.raise_for_status()
        payload = response.json()
    except requests.RequestException as error:
        return None, False, f"Could not reach Last.fm: {error}"
    except ValueError:
        return None, False, "Last.fm returned an invalid response."

    if "error" in payload:
        return None, False, payload.get("message", "Last.fm API error.")

    recent = payload.get("recenttracks", {})
    raw_tracks = recent.get("track", [])
    if isinstance(raw_tracks, dict):
        raw_tracks = [raw_tracks]

    tracks = []
    for track in raw_tracks:
        images = track.get("image", [])
        image_url = next(
            (image.get("#text") for image in reversed(images) if image.get("#text")),
            "",
        )
        artist = track.get("artist", {})
        tracks.append(
            {
                "name": track.get("name", "Unknown track"),
                "artist": artist.get("#text", "Unknown artist")
                if isinstance(artist, dict)
                else str(artist),
                "url": track.get("url", "#"),
                "image_url": image_url,
            }
        )

    attrs = recent.get("@attr", {})
    try:
        has_more = int(attrs.get("page", page)) < int(attrs.get("totalPages", page))
    except (TypeError, ValueError):
        has_more = False
    return tracks, has_more, None


def home(request):
    return render(request, "lastfm/index.html")


@require_GET
def recent_tracks(request):
    username = request.GET.get("user", "").strip()
    if not username:
        return JsonResponse({"error": "Enter a Last.fm username."}, status=400)

    try:
        offset = int(request.GET.get("offset", "0"))
        if offset < 0:
            raise ValueError
    except ValueError:
        return JsonResponse({"error": "Offset must be a non-negative integer."}, status=400)

    cache = _read_cache()
    cache_key = username.casefold()
    entry = cache.get(cache_key)
    cache_expired = entry and time.time() - entry.get("fetched_at", 0) > CACHE_TTL_SECONDS
    # Refresh stale data for a new search, while preserving an active browse session.
    if cache_expired and offset == 0:
        entry = None
    if entry is None:
        entry = {"tracks": [], "next_page": 1, "has_more": True}

    while len(entry["tracks"]) <= offset and entry["has_more"]:
        tracks, has_more, error = _fetch_recent_tracks(username, entry["next_page"])
        if error:
            return JsonResponse({"error": error}, status=502)
        entry["tracks"].extend(tracks)
        entry["next_page"] += 1
        entry["has_more"] = has_more

    batch = entry["tracks"][offset : offset + CACHE_BATCH_SIZE]
    entry["fetched_at"] = time.time()
    _write_cache_entry(cache_key, entry)

    return JsonResponse(
        {
            "user": username,
            "tracks": batch,
            "has_more": offset + len(batch) < len(entry["tracks"]) or entry["has_more"],
        }
    )
