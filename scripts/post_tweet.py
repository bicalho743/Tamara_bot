#!/usr/bin/env python3
"""
LUCAS — Publicação no Twitter/X via chamadas diretas à API v2.
Usa requests + requests-oauthlib. Sem Tweepy, sem imghdr.
Saída: JSON em stdout.
"""

import sys
import os
import json
import requests
from requests_oauthlib import OAuth1Session


def make_oauth() -> OAuth1Session:
    return OAuth1Session(
        client_key=os.environ["TWITTER_API_KEY"],
        client_secret=os.environ["TWITTER_API_SECRET"],
        resource_owner_key=os.environ["TWITTER_ACCESS_TOKEN"],
        resource_owner_secret=os.environ["TWITTER_ACCESS_SECRET"],
    )


def upload_media(oauth: OAuth1Session, image_path: str) -> str:
    """Upload de imagem via API v1.1 (único endpoint que aceita mídia)."""
    with open(image_path, "rb") as f:
        resp = oauth.post(
            "https://upload.twitter.com/1.1/media/upload.json",
            files={"media": f},
        )
    if resp.status_code not in (200, 201):
        raise RuntimeError(f"Falha no upload de mídia ({resp.status_code}): {resp.text}")
    return resp.json()["media_id_string"]


def post_tweet(oauth: OAuth1Session, text: str, media_id: str | None = None) -> str:
    """Posta tweet via API v2. Retorna o ID do tweet."""
    payload = {"text": text}
    if media_id:
        payload["media"] = {"media_ids": [media_id]}

    resp = oauth.post(
        "https://api.twitter.com/2/tweets",
        json=payload,
    )
    if resp.status_code not in (200, 201):
        raise RuntimeError(f"Falha ao postar tweet ({resp.status_code}): {resp.text}")

    return resp.json()["data"]["id"]


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Argumento 'text' obrigatório"}))
        sys.exit(1)

    text = sys.argv[1]
    image_path = sys.argv[2] if len(sys.argv) > 2 else None

    oauth = make_oauth()
    media_id = upload_media(oauth, image_path) if image_path else None
    tweet_id = post_tweet(oauth, text, media_id)

    print(json.dumps({"tweetId": tweet_id, "text": text}))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
