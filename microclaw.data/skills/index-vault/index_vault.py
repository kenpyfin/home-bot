import os
import glob
from pathlib import Path
from dotenv import load_dotenv

SCRIPT_DIR = Path(__file__).parent.resolve()
load_dotenv(SCRIPT_DIR / ".env")

VAULT_PATH = os.environ.get("VAULT_PATH", "/Users/kenli/Documents/ORIGIN")
DB_PATH = os.environ.get("VAULT_DB_PATH", "/Users/kenli/home-bot/shared/vault_db")
EMBED_URL = os.environ.get("VAULT_EMBED_URL", "http://10.0.1.211:8080/v1")

import chromadb
from chromadb.utils import embedding_functions

llama_ef = embedding_functions.OpenAIEmbeddingFunction(
    api_key="sk-no-key-required",
    api_base=EMBED_URL,
    model_name="ignored"
)

client = chromadb.PersistentClient(path=DB_PATH)
collection = client.get_or_create_collection(name="origin_vault", embedding_function=llama_ef)

def index():
    files = glob.glob(f"{VAULT_PATH}/**/*.md", recursive=True)
    indexed_count = 0
    for file_path in files:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                if not content.strip():
                    continue
                doc_id = os.path.relpath(file_path, VAULT_PATH)
                collection.upsert(
                    documents=[content],
                    metadatas=[{"path": file_path}],
                    ids=[doc_id]
                )
                indexed_count += 1
        except Exception as e:
            print(f"Error indexing {file_path}: {e}")
    print(f"Successfully indexed {indexed_count} files from {VAULT_PATH}")

if __name__ == "__main__":
    index()
