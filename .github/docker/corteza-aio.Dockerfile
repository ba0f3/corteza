FROM ubuntu:22.04

ARG VERSION=dev
ARG REVISION=unknown
ARG SASS_VERSION=1.85.1

LABEL org.opencontainers.image.source="https://github.com/ba0f3/corteza" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}"

RUN apt-get -y update \
 && apt-get -y install --no-install-recommends \
      ca-certificates \
      curl \
 && rm -rf /var/lib/apt/lists/* \
 && curl -fsSLo /tmp/dart-sass.tar.gz \
      "https://github.com/sass/dart-sass/releases/download/${SASS_VERSION}/dart-sass-${SASS_VERSION}-linux-x64.tar.gz" \
 && tar -xzf /tmp/dart-sass.tar.gz -C /opt \
 && rm -f /tmp/dart-sass.tar.gz

ENV STORAGE_PATH=/data \
    CORREDOR_ADDR=corredor:80 \
    HTTP_ADDR=0.0.0.0:80 \
    HTTP_WEBAPP_ENABLED=true \
    HTTP_WEBAPP_BASE_DIR=/corteza/webapp \
    PATH=/opt/dart-sass:/corteza/bin:${PATH}

WORKDIR /corteza

VOLUME /data

COPY corteza/ ./

HEALTHCHECK --interval=30s --start-period=1m --timeout=30s --retries=3 \
  CMD curl --silent --fail --fail-early http://127.0.0.1:80/healthcheck || exit 1

EXPOSE 80

ENTRYPOINT ["./bin/corteza-server"]
CMD ["serve-api"]
