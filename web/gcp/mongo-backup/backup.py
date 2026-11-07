import datetime
import os
import subprocess

from google.cloud import storage

# Cloud Run Job: dump compactado de Mongo (uri en secretMONGODB_URI) y subida
# al bucket GCS en `GCS_BUCKET`. Corre diario vía Cloud Scheduler (04:00 UTC).

URI = os.environ["MONGODB_URI"]
GCS_BUCKET = os.environ["GCS_BUCKET"]
DUMP_PATH = "/tmp/brltv2-mongo.archive.gz"


def main():
    subprocess.check_call(["mongodump", f"--uri={URI}", "--archive=" + DUMP_PATH, "--gzip"])
    now = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H%M%SZ")
    client = storage.Client()
    bucket = client.bucket(GCS_BUCKET)
    blob = bucket.blob(f"brltv2-mongo/{now}.archive.gz")
    blob.upload_from_filename(DUMP_PATH, content_type="application/gzip")
    print("backup listo:", f"gs://{GCS_BUCKET}/{blob.name}")


if __name__ == "__main__":
    main()
