#!/bin/sh
set -eu
for bucket in exam-content exam-private; do
  status=$(curl --silent --show-error --output /tmp/bucket-response --write-out '%{http_code}' \
    --aws-sigv4 'aws:amz:us-east-1:s3' --user 'local_minio:local_minio_password' \
    --request PUT "http://minio:9000/$bucket")
  if [ "$status" != 200 ] && ! { [ "$status" = 409 ] && grep -q 'BucketAlreadyOwnedByYou' /tmp/bucket-response; }; then
    echo "Bucket initialization failed: $bucket HTTP $status" >&2
    exit 1
  fi
  anonymous=$(curl --silent --output /dev/null --write-out '%{http_code}' "http://minio:9000/$bucket")
  if [ "$anonymous" != 403 ]; then
    echo "Bucket must deny anonymous listing: $bucket" >&2
    exit 1
  fi
done
echo 'Private local buckets ready'
