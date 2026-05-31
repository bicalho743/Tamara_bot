#!/usr/bin/env python3
"""
LUCAS — Script de publicação no Twitter/X via Tweepy (API v2).
Chamado pelo Node.js via spawn de processo.
Saída: JSON em stdout.
"""

import sys
import os
import json
import tweepy


def get_client():
    return tweepy.Client(
        consumer_key=os.environ["TWITTER_API_KEY"],
        consumer_secret=os.environ["TWITTER_API_SECRET"],
        access_token=os.environ["TWITTER_ACCESS_TOKEN"],
        access_token_secret=os.environ["TWITTER_ACCESS_SECRET"],
    )


def get_api_v1():
    """API v1.1 necessária apenas para upload de mídia."""
    auth = tweepy.OAuth1UserHandler(
        os.environ["TWITTER_API_KEY"],
        os.environ["TWITTER_API_SECRET"],
        os.environ["TWITTER_ACCESS_TOKEN"],
        os.environ["TWITTER_ACCESS_SECRET"],
    )
    return tweepy.API(auth)


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Argumento 'text' obrigatório"}))
        sys.exit(1)

    text = sys.argv[1]
    image_path = sys.argv[2] if len(sys.argv) > 2 else None

    client = get_client()
    media_ids = None

    if image_path:
        api_v1 = get_api_v1()
        media = api_v1.media_upload(filename=image_path)
        media_ids = [media.media_id]

    kwargs = {"text": text}
    if media_ids:
        kwargs["media_ids"] = media_ids

    response = client.create_tweet(**kwargs)
    tweet_id = response.data["id"]

    print(json.dumps({"tweetId": tweet_id, "text": text}))


if __name__ == "__main__":
    try:
        main()
    except tweepy.TweepyException as e:
        print(json.dumps({"error": f"Tweepy error: {str(e)}"}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
