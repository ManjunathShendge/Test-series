# Official image pulls are unavailable; build the pinned upstream release.
FROM golang:1.24.6-alpine AS build
RUN apk add --no-cache git
WORKDIR /src
RUN git clone --depth 1 --branch RELEASE.2025-09-07T16-13-09Z https://github.com/minio/minio.git .
RUN CGO_ENABLED=0 go build -trimpath -o /minio .
FROM alpine:3.22.1
RUN apk add --no-cache ca-certificates curl && adduser -D -u 1000 minio && mkdir /data && chown minio /data
COPY --from=build /minio /usr/local/bin/minio
COPY --from=build /src/LICENSE /licenses/minio-LICENSE
COPY init-buckets.sh /init-buckets.sh
USER minio
EXPOSE 9000 9001
ENTRYPOINT ["minio"]
