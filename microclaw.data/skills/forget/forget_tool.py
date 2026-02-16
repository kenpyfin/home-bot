import os
import sys
import json
import glob
from pathlib import Path
from dotenv import load_dotenv

SCRIPT_DIR = Path(__file__).parent.resolve()
load_dotenv(SCRIPT_DIR / ".env")

# Base path for runtime groups (e.g. microclaw.data/runtime/groups). Override in this skill's .env as RUNTIME_GROUPS_BASE.
DEFAULT_GROUPS_BASE = "/Users/kenli/home-bot/microclaw.data/runtime/groups"

def sanitize_history(chat_id, keywords):
    if chat_id.startswith("/") or chat_id.startswith("./"):
        history_path = chat_id
    else:
        base = os.environ.get("RUNTIME_GROUPS_BASE", DEFAULT_GROUPS_BASE)
        history_path = os.path.join(base, str(chat_id), "conversations")

    if not os.path.exists(history_path):
        return {"error": f"History directory {history_path} not found."}

    try:
        results = []
        files = glob.glob(os.path.join(history_path, "*.md"))
        keywords = [k.lower() for k in keywords]

        for file_path in files:
            with open(file_path, 'r') as f:
                lines = f.readlines()

            new_lines = []
            removed_in_file = 0
            for line in lines:
                if not any(k in line.lower() for k in keywords):
                    new_lines.append(line)
                else:
                    removed_in_file += 1

            if removed_in_file > 0:
                with open(file_path, 'w') as f:
                    f.writelines(new_lines)
                results.append({"file": os.path.basename(file_path), "removed": removed_in_file})

        return {
            "status": "success",
            "files_affected": len(results),
            "details": results,
            "message": f"Sanitized {len(results)} history files for keywords: {', '.join(keywords)}"
        }

    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: python3 forget_tool.py <chat_id> <keyword1> <keyword2> ..."}))
        sys.exit(1)

    chat_id = sys.argv[1]
    keywords = sys.argv[2:]

    if "DELETE_ALL_PERMANENTLY" in keywords:
        pass

    outcome = sanitize_history(chat_id, keywords)
    print(json.dumps(outcome))
