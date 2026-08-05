# syntax=docker/dockerfile:1
ARG RUST_VERSION=1.97.1
ARG APP_NAME=zegraph-pfp-provider

################################################################################
# Create a stage for building the application.

FROM rust:${RUST_VERSION}-alpine AS build
ARG APP_NAME
WORKDIR /app

RUN apk add --no-cache clang lld musl-dev git openssl-dev make perl

RUN --mount=type=bind,source=src,target=src \
    --mount=type=bind,source=Cargo.toml,target=Cargo.toml \
    --mount=type=bind,source=Cargo.lock,target=Cargo.lock \
    --mount=type=cache,target=/app/target/ \
    --mount=type=cache,target=/usr/local/cargo/git/db \
    --mount=type=cache,target=/usr/local/cargo/registry/ \
cargo build --features docker --locked --release && \
cp ./target/release/$APP_NAME /bin/server

FROM alpine:3.21 AS final

ARG UID=10001

RUN apk add --no-cache curl

RUN adduser \
    --disabled-password \
    --gecos "" \
    --home "/nonexistent" \
    --shell "/sbin/nologin" \
    --no-create-home \
    --uid "${UID}" \
    appuser


RUN mkdir -p /var/www/thumbnails && chown -R appuser:appuser /var/www/thumbnails

USER appuser

COPY --from=build /bin/server /bin/

EXPOSE 3000

CMD ["/bin/server"]
