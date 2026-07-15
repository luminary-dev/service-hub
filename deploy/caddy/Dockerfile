# Custom Caddy for the production edge (#670): stock caddy:2-alpine has no
# CrowdSec bouncer, so build Caddy with the CrowdSec HTTP bouncer plugin
# (github.com/hslatman/caddy-crowdsec-bouncer) via xcaddy, then ship it on the
# same slim alpine runtime the stock image used. Pinned end to end (Caddy +
# plugin versions, both base images by digest — #238) so the edge build is
# reproducible; Dependabot's docker ecosystem bumps the tag comment + digest.
#
# Built at deploy time on the server (docker-compose.prod.yml `build:` the caddy
# service), and by the CI `compose-config` job which `caddy validate`s the
# Caddyfile with THIS image so the crowdsec directive is actually parsed.

# Plugin v0.13.1 requires caddy v2.11.3 (its go.mod), so pin the matching
# builder — a mismatch makes xcaddy rebuild a different Caddy than the runtime.
# dependabot: caddy:2.11.3-builder-alpine
FROM caddy:2.11.4-builder-alpine@sha256:8e89605351333ad2cc2f3bcc95275a2ccc427f88914050e86a5fde0fd77a63c4 AS builder

# Only the HTTP bouncer is needed (the edge is an L7 reverse proxy only — no
# layer4 TCP/UDP bouncing, no AppSec WAF here). The base app module it depends
# on is pulled in transitively and registers the global `crowdsec` config.
RUN xcaddy build v2.11.3 \
    --with github.com/hslatman/caddy-crowdsec-bouncer/http@v0.13.1

# Runtime: identical to the stock caddy:2-alpine base the prod stack used before,
# just carrying our xcaddy-built binary instead of the vanilla one.
# dependabot: caddy:2.11.3-alpine
FROM caddy:2.11.4-alpine@sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648

COPY --from=builder /usr/bin/caddy /usr/bin/caddy

# Prove the plugin linked in — a build that silently dropped it would otherwise
# only surface when the Caddyfile's `crowdsec` directive fails to parse at boot,
# crash-looping the only public entrypoint.
RUN caddy list-modules | grep -q crowdsec
