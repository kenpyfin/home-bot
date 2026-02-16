import os
import sys
from pathlib import Path
from dotenv import load_dotenv

SCRIPT_DIR = Path(__file__).parent.resolve()
load_dotenv(SCRIPT_DIR / ".env")

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

def query(text, n=3):
    try:
        results = collection.query(query_texts=[text], n_results=n)
        if not results['documents'] or not results['documents'][0]:
            print("No relevant results found.")
            return
        for i, doc in enumerate(results['documents'][0]):
            path = results['metadatas'][0][i]['path']
            print(f"--- Result {i+1} (Source: {path}) ---")
            print(doc[:500] + "...")
            print("\n")
    except Exception as e:
        print(f"Query error: {e}")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        query(sys.argv[1])
    else:
        print("Usage: python3 query_vault.py \"search terms\"")
