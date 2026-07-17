# syntax=docker/dockerfile:1
ARG RUST_VERSION=1.97.1
ARG APP_NAME=zegraph-api

################################################################################
# Create a stage for building the application.

FROM rust:${RUST_VERSION}-alpine AS build
ARG APP_NAME
WORKDIR /app

RUN apk add --no-cache clang lld musl-dev git openssl-dev make perl

ARG DATABASE_URL
ENV DATABASE_URL=${DATABASE_URL}

RUN --mount=type=bind,source=src,target=src \
    --mount=type=bind,source=serde_macros,target=serde_macros \
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

# Create maps directory for 3D model uploads and set permissions
RUN mkdir -p /var/www/maps && chown -R appuser:appuser /var/www/maps

# Create characters directory for 3D model uploads and set permissions
RUN mkdir -p /var/www/characters && chown -R appuser:appuser /var/www/characters

# Create vapids directory for volume mount and set permissions
RUN mkdir -p /app/vapids && chown -R appuser:appuser /app/vapids

USER appuser

# Set working directory so relative paths in code work
WORKDIR /app

COPY --from=build /bin/server /bin/

EXPOSE 3000

CMD ["/bin/server"]
