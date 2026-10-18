"""
MongoDB Atlas Connection & Ping Test Script
Tests connectivity and authentication against MongoDB Atlas using project environment.

Usage:
    .\\venv\\Scripts\\python.exe scripts/test_mongo_connection.py
"""
import os
import sys
from pathlib import Path

# Resolve paths
ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_ENV = ROOT_DIR / "backend" / ".env"

try:
    from dotenv import load_dotenv
    if BACKEND_ENV.exists():
        load_dotenv(BACKEND_ENV)
except ImportError:
    pass

import certifi
from pymongo import MongoClient

env_uri = os.getenv("MONGODB_URI", "")
db_name = os.getenv("MONGODB_DB_NAME", "autoagenthire")


def mask_uri(uri: str) -> str:
    """Mask credentials for safe logging."""
    if "@" in uri:
        prefix, rest = uri.split("@", 1)
        scheme_user = prefix.split("://")[0] + "://" + prefix.split("://")[1].split(":")[0] + ":****"
        return f"{scheme_user}@{rest}"
    return uri


def main() -> None:
    print("=" * 60)
    print("AutoAgentHire - MongoDB Atlas Connectivity Test")
    print("=" * 60)
    print(f"Python interpreter: {sys.executable}")
    print(f"Python version:     {sys.version.split()[0]}")
    print(f"Certifi CA bundle:  {certifi.where()}")
    print(f"Target Database:    {db_name}")
    print(f"Configured URI:     {mask_uri(env_uri)}")
    print("-" * 60)

    if not env_uri:
        print("[ERROR] MONGODB_URI is not set in backend/.env")
        sys.exit(1)

    try:
        client = MongoClient(
            env_uri,
            serverSelectionTimeoutMS=5000,
            connectTimeoutMS=5000,
            socketTimeoutMS=10000,
            tlsCAFile=certifi.where(),
        )
        ping_res = client.admin.command("ping")
        print(f"[OK] Ping succeeded: {ping_res}")

        dbs = client.list_database_names()
        print(f"[OK] Authentication verified. Databases found: {dbs}")

        db = client[db_name]
        collections = db.list_collection_names()
        print(f"[OK] Collections in '{db_name}': {collections}")

        counts = {}
        for col in collections:
            counts[col] = db[col].count_documents({})
        print(f"[OK] Document counts: {counts}")
        print("=" * 60)
        print("MongoDB Atlas is fully healthy and connected!")
        print("=" * 60)
    except Exception as e:
        print(f"[ERROR] Connection failed: {type(e).__name__}: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
