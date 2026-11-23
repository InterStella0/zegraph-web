FROM alpine:3.21

RUN apk add --no-cache bash curl jq ca-certificates \
    && adduser -D -H -u 10001 -s /sbin/nologin appuser \
    && mkdir /data && chown appuser:appuser /data

COPY --chmod=755 guard.sh /usr/local/bin/attack-guard

USER appuser

CMD ["attack-guard"]
