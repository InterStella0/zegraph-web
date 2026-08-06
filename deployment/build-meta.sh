# Sourced, not executed.
#
# Exports BUILD_COMMIT for compose to interpolate into the frontend's build arg of the same name.
# The frontend bakes it into the page footer, so a live site says which commit produced it.
#
# It has to come from out here because front-ze/.dockerignore excludes .git -- the build container
# has no repository to ask. CI has GITHUB_SHA; a local deploy falls back to HEAD; if neither is
# available the value stays empty and the footer simply omits the line.

BUILD_COMMIT="${GITHUB_SHA:-$(git rev-parse HEAD 2>/dev/null || true)}"
export BUILD_COMMIT
