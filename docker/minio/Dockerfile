# Local-only S3-compatible storage. The official MinIO registry image returned 401 (DECISIONS
# M0 refinements), so build the pinned upstream release from source. Base images are pinned by
# digest and the source by tag plus commit, so a clean checkout builds the same binary.
FROM golang:1.24.6-alpine@sha256:c8c5f95d64aa79b6547f3b626eb84b16a7ce18a139e3e9ca19a8c078b85ba80d AS build
ARG MINIO_TAG=RELEASE.2025-09-07T16-13-09Z
ARG MINIO_COMMIT=07c3a429bfed433e49018cb0f78a52145d4bedeb
RUN apk add --no-cache git
WORKDIR /src
RUN git clone --depth 1 --branch "$MINIO_TAG" https://github.com/minio/minio.git . \
 && test "$(git rev-parse HEAD)" = "$MINIO_COMMIT"
RUN CGO_ENABLED=0 go build -trimpath -o /minio .

FROM alpine:3.22.1@sha256:4bcff63911fcb4448bd4fdacec207030997caf25e9bea4045fa6c8c44de311d1
RUN apk add --no-cache ca-certificates curl && adduser -D -u 1000 minio && mkdir /data && chown minio /data
COPY --from=build /minio /usr/local/bin/minio
COPY --from=build /src/LICENSE /licenses/minio-LICENSE
USER minio
EXPOSE 9000 9001
ENTRYPOINT ["minio"]
