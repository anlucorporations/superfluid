#!/bin/bash
P=opencode-txbarlovento
echo "=== PROYECTO ==="
gcloud config get-value project; gcloud billing projects describe $P --format="value(billingAccountName,billingEnabled)" 2>&1
echo; echo "=== SERVICIOS HABILITADOS (relacionados) ==="
gcloud services list --enabled --project $P --format="value(name)" 2>&1 | grep -E "run|cloudbuild|artifact|secret|vpcaccess|scheduler|compute|storage|logging"
echo; echo "=== CLOUD RUN SERVICIOS ==="
gcloud run services list --project $P --format="table(metadata.name,status.url,metadata.labels['run.googleapis.com/startup-cpu-boost'].item())" 2>&1
echo; echo "=== CLOUD RUN SERVICIO brltv2 (detalle) ==="
gcloud run services describe brltv2 --project $P --region europe-west1 --format="text(status.url,spec.template.spec.containers[0].image,spec.template.spec.containers[0].resources,spec.template.metadata.annotations[run.googleapis.com/vpc-access-connector],spec.template.metadata.annotations[run.googleapis.com/vpc-access-egress],status.traffic[0].percent)" 2>&1
echo; echo "=== CLOUD RUN JOBS ==="
gcloud run jobs list --project $P --region europe-west1 --format="table(metadata.name,status.conditions[0].status,spec.template.spec.template.spec.containers[0].image)" 2>&1
echo; echo "=== CLOUD SCHEDULER ==="
gcloud scheduler jobs list --project $P --location=europe-west1 --format="table(name,schedule,status)" 2>&1
echo; echo "=== ARTIFACT REGISTRY ==="
gcloud artifacts repositories list --project $P --format="table(name,format,location)" 2>&1
echo; echo "=== IMAGENES ==="
gcloud artifacts docker images list europe-west1-docker.pkg.dev/$P/superfluidv2/web --project $P --format="value(package,version,tags)" 2>&1 | head -n 5
gcloud artifacts docker images list europe-west1-docker.pkg.dev/$P/superfluidv2/mongo-backup --project $P --format="value(package,version,tags)" 2>&1 | head -n 5
echo; echo "=== SECRET MANAGER ==="
gcloud secrets list --project $P --format="table(name,replication)" 2>&1
echo; echo "=== GCE INSTANCIAS ==="
gcloud compute instances list --project $P --format="table(name,zone,machineType,networkInterfaces[0].networkIP,status)" 2>&1
echo; echo "=== FIREWALL ==="
gcloud compute firewall-rules list --project $P --format="table(name,network,sourceRanges.list(),allow[].map().assembly().list(),targetTags.list(),direction)" 2>&1
echo; echo "=== VPC CONNECTORS ==="
gcloud compute networks vpc-access connectors list --project $P --regions europe-west1 --format="table(name,network,ipCidrRange,state)" 2>&1
echo; echo "=== ROUTERS / NAT ==="
gcloud compute routers list --project $P --format="table(name,network,region)" 2>&1
gcloud compute routers nats list --routers nat-router --regions europe-west1 --project $P --format="table(name,sourceSubnetworkIpRangesToNat,autoNetworkTier)" 2>&1
echo; echo "=== STORAGE BUCKETS ==="
gcloud storage buckets list --project $P --format="table(name,location,storageClass)" 2>&1
echo; echo "=== OBJETOS DE BACKUP ==="
gcloud storage ls -l --project $P "gs://opencode-txbarlovento-mongo-backups/**" 2>&1 | tail -n 5
