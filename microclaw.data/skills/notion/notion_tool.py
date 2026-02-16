#!/usr/bin/env python3
"""
Notion Tool - Skill for Notion API access.
Uses NOTION_TOKEN from this skill folder's .env.
Invoke from skill dir: python3 notion_tool.py <cmd> [args]
"""
import os
import sys
import json
import requests
from pathlib import Path
from dotenv import load_dotenv

SCRIPT_DIR = Path(__file__).parent.resolve()
load_dotenv(SCRIPT_DIR / ".env")

NOTION_TOKEN = os.environ.get("NOTION_TOKEN")
if not NOTION_TOKEN:
    print(json.dumps({"error": "NOTION_TOKEN not set. Add NOTION_TOKEN=... to this skill folder's .env"}))
    sys.exit(1)

NOTION_VERSION = "2022-06-28"
HEADERS = {
    "Authorization": f"Bearer {NOTION_TOKEN}",
    "Content-Type": "application/json",
    "Notion-Version": NOTION_VERSION,
}
BASE_URL = "https://api.notion.com/v1"


def search(query=""):
    url = f"{BASE_URL}/search"
    payload = {"query": query, "sort": {"direction": "descending", "timestamp": "last_edited_time"}}
    response = requests.post(url, headers=HEADERS, json=payload, timeout=30)
    return response.json()


def get_page(page_id):
    url = f"{BASE_URL}/pages/{page_id}"
    response = requests.get(url, headers=HEADERS, timeout=30)
    return response.json()


def get_blocks(block_id):
    url = f"{BASE_URL}/blocks/{block_id}/children"
    response = requests.get(url, headers=HEADERS, timeout=30)
    return response.json()


def append_block(block_id, text):
    url = f"{BASE_URL}/blocks/{block_id}/children"
    payload = {
        "children": [
            {
                "object": "block",
                "type": "paragraph",
                "paragraph": {
                    "rich_text": [{"type": "text", "text": {"content": text}}]
                }
            }
        ]
    }
    response = requests.patch(url, headers=HEADERS, json=payload, timeout=30)
    return response.json()


def query_database(database_id):
    url = f"{BASE_URL}/databases/{database_id}/query"
    response = requests.post(url, headers=HEADERS, json={}, timeout=30)
    return response.json()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python3 notion_tool.py <command> [args]",
                         "commands": ["search", "get_page", "get_blocks", "append", "query_db"]}))
        sys.exit(1)

    cmd = sys.argv[1].lower()
    try:
        if cmd == "search":
            q = sys.argv[2] if len(sys.argv) > 2 else ""
            print(json.dumps(search(q), indent=2))
        elif cmd == "get_page":
            print(json.dumps(get_page(sys.argv[2]), indent=2))
        elif cmd == "get_blocks":
            print(json.dumps(get_blocks(sys.argv[2]), indent=2))
        elif cmd == "append":
            print(json.dumps(append_block(sys.argv[2], sys.argv[3]), indent=2))
        elif cmd == "query_db":
            print(json.dumps(query_database(sys.argv[2]), indent=2))
        else:
            print(json.dumps({"error": f"Unknown command: {cmd}"}))
            sys.exit(1)
    except IndexError as e:
        print(json.dumps({"error": f"Missing argument for {cmd}", "detail": str(e)}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
