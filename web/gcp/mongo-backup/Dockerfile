# Imagen de respaldo nocturno de MongoDB (H7).
# mongodump + cliente de Google Cloud Storage sobre contexto mongo (Ubuntu).
FROM mongo:7.0.14
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      python3 python3-pip ca-certificates curl xz-utils \
 && rm -rf /var/lib/apt/lists/*

ARG TOOLS_VERSION=100.10.0
RUN curl -fsSL -o /tmp/ttgz \
      "https://fastdl.mongodb.org/tools/db/mongodb-database-tools-ubuntu2204-x86_64-${TOOLS_VERSION}.tgz" \
 && tar -xzf /tmp/ttgz -C /tmp \
 && install /tmp/mongodb-database-tools-*/bin/mongodump /usr/local/bin/mongodump \
 && install /tmp/mongodb-database-tools-*/bin/mongorestore /usr/local/bin/mongorestore \
 && rm -rf /tmp/mongodb-database-tools-* /tmp/ttgz

RUN pip3 install --no-cache-dir google-cloud-storage==2.17.0

COPY backup.py /app/backup.py
ENTRYPOINT ["python3", "/app/backup.py"]
