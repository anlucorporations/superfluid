import os
import subprocess

from google.cloud import storage

# Verificación de integridad del backup nocturno (H11): descarga el objeto más
# reciente de GCS y ejecuta mongorestore --dryRun contra la Mongo real, sin
# escribir nada. Uso: Cloud Run Job temporal brltv2-mongo-backup-verify.

URI = os.environ["MONGODB_URI"]
GCS_BUCKET = os.environ["GCS_BUCKET"]


def main():
    client = storage.Client()
    blobs = list(client.list_blobs(GCS_BUCKET, prefix="brltv2-mongo/"))
    if not blobs:
        raise SystemExit("no hay backups en gs://%s/brltv2-mongo/" % GCS_BUCKET)
    blob = max(blobs, key=lambda b: b.name)
    local = "/tmp/verify.archive.gz"
    blob.download_to_filename(local)
    print("objeto:", f"gs://{GCS_BUCKET}/{blob.name}", f"({blob.size} bytes)")
    # --gzip obligatorio: mongodump escribió el archive comprimido.
    cmd = [
        "mongorestore", "--dryRun", "--gzip", "--archive=" + local,
        "--nsInclude=superfluid_anvil.*", "--uri=" + URI,
    ]
    try:
        subprocess.check_call(cmd)
    except subprocess.CalledProcessError:
        # No imprimir cmd: contiene la URI con credenciales.
        raise SystemExit("mongorestore --dryRun falló (ver logs del job)")
    print("verify OK: restore en seco completado")


if __name__ == "__main__":
    main()
