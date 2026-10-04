#!/usr/bin/env bash
# release.sh: produce a clean zip + Steam Workshop manifest for National Parks.
#
# Usage:  ./release.sh
# Output: dist/national-parks-vX.Y.Z.zip   (X.Y.Z from the modinfo <Version>)
#         dist/national-parks/             (upload content folder for steamcmd)
#         dist/workshop_item.vdf          (steamcmd build manifest)
#
# Data, text and UI scripts ship as they are; there is no build step. Run `npm run verify` first (syntax check and
# tests). The script mirrors, audits and packages. It never uploads: it prints the steamcmd command for you to run
# with your login.

set -euo pipefail
cd "$(dirname "$0")"

MOD_SLUG="national-parks"                    # source dir + zip root
MODINFO="national-parks.modinfo"             # modinfo filename
TITLE="National Parks"                      # Workshop item title
APPID="1295660"                            # Sid Meier's Civilization VII

DIST_DIR="dist"

# Locate the modinfo (support being run from here or a parent)
if [ -f "$MODINFO" ]; then
    SRC_DIR="."
elif [ -f "$MOD_SLUG/$MODINFO" ]; then
    SRC_DIR="$MOD_SLUG"
else
    echo "error: no $MODINFO in $(pwd) or $(pwd)/$MOD_SLUG/"
    exit 1
fi

# Version + author gates
VERSION="$(grep -oE '<Version>[^<]+</Version>' "$SRC_DIR/$MODINFO" \
    | head -1 | sed -E 's|</?Version>||g')"
[ -n "$VERSION" ] || { echo "error: could not parse <Version> from $MODINFO"; exit 1; }

AUTHORS="$(grep -oE '<Authors>[^<]+</Authors>' "$SRC_DIR/$MODINFO" \
    | head -1 | sed -E 's|</?Authors>||g')"
case "$AUTHORS" in
    ""|"Your Name"|"TODO")
        echo "error: <Authors> in $MODINFO is '$AUTHORS'; set a release author name first."
        exit 1 ;;
esac

# Workshop published file id (persisted outside dist/, survives rm -rf)
WORKSHOP_ID_FILE="$SRC_DIR/steam_workshop_id.txt"
PUBLISHED_FILE_ID="${WORKSHOP_PUBLISHED_FILE_ID:-}"
SAVED_PUBLISHED_FILE_ID=""
if [ -f "$WORKSHOP_ID_FILE" ]; then
    SAVED_PUBLISHED_FILE_ID="$(tr -dc '0-9' < "$WORKSHOP_ID_FILE")"
fi
if [ -n "$PUBLISHED_FILE_ID" ] && [ -n "$SAVED_PUBLISHED_FILE_ID" ] \
    && [ "$PUBLISHED_FILE_ID" != "$SAVED_PUBLISHED_FILE_ID" ]; then
    echo "error: WORKSHOP_PUBLISHED_FILE_ID ($PUBLISHED_FILE_ID) conflicts with"
    echo "       steam_workshop_id.txt ($SAVED_PUBLISHED_FILE_ID). Refusing to override."
    exit 1
fi
if [ -z "$PUBLISHED_FILE_ID" ] && [ -n "$SAVED_PUBLISHED_FILE_ID" ]; then
    PUBLISHED_FILE_ID="$SAVED_PUBLISHED_FILE_ID"
fi

ZIP_NAME="national-parks-v${VERSION}.zip"
TARGET_DIR="$DIST_DIR/$MOD_SLUG"
ZIP_PATH="$DIST_DIR/$ZIP_NAME"

echo "==> Cleaning $DIST_DIR/"
rm -rf "$DIST_DIR"
mkdir -p "$TARGET_DIR"

echo "==> Mirroring $SRC_DIR/ → $TARGET_DIR/ (excluding dev/release-only files)"
rsync -a \
    --exclude='.git' --exclude='.gitignore' --exclude='.DS_Store' --exclude='dist' \
    --exclude='release.sh' --exclude='steam_workshop_id.txt' --exclude='docs' \
    --exclude='images' --exclude='scripts' --exclude='*.bak' \
    --exclude='CONTRIBUTING.md' --exclude='README.pdf' \
    --exclude='package.json' --exclude='package-lock.json' \
    --exclude='node_modules' --exclude='eslint.config.*' \
    --exclude='tests' --exclude='devtools' --exclude='text/README.md' \
    "$SRC_DIR"/ "$TARGET_DIR"/

echo "==> Verifying modinfo at zip root"
[ -f "$TARGET_DIR/$MODINFO" ] || { echo "error: $TARGET_DIR/$MODINFO missing"; exit 1; }

echo "==> Sanity-checking shipped XML/modinfo is well-formed"
find "$TARGET_DIR" \( -name '*.xml' -o -name '*.modinfo' \) -print0 \
    | xargs -0 -n1 python3 -c 'import sys,xml.dom.minidom as m; m.parse(sys.argv[1])'

echo "==> Zipping $ZIP_PATH"
( cd "$DIST_DIR" && zip -qr "$ZIP_NAME" "$MOD_SLUG" )

# Allow-list audit: fail on any shipped file that isn't expected, so a loose
# rsync exclude can't silently ship docs/dev files.
echo "==> Verifying zip contents against allow-list"
ALLOW="^${MOD_SLUG}/(${MODINFO}|README\.md|CHANGELOG\.md|LICENSE)$"
ALLOW="$ALLOW"'|^'"${MOD_SLUG}"'/data/.+\.(xml|sql)$'
ALLOW="$ALLOW"'|^'"${MOD_SLUG}"'/text/[a-z_]+/(ModuleText|PediaText)\.xml$'
ALLOW="$ALLOW"'|^'"${MOD_SLUG}"'/ui/.+\.js$'
UNEXPECTED="$(unzip -Z1 "$ZIP_PATH" | grep -vE '/$' | grep -vE "$ALLOW" || true)"
if [ -n "$UNEXPECTED" ]; then
    echo "error: zip contains entries not on the allow-list:"
    echo "$UNEXPECTED" | sed 's/^/    /'
    echo "  → tighten the rsync --exclude list, or update ALLOW in release.sh if intended."
    exit 1
fi
echo "    OK: every shipped entry matches the allow-list."

echo "==> Zip contents:"
unzip -l "$ZIP_PATH" | sed -n '1,40p' || true
SIZE="$(du -h "$ZIP_PATH" | cut -f1)"

# Workshop preview card
# Rendered from docs/workshop-preview.svg to a 1024x1024 PNG, uploaded separately
# via the .vdf, so it lives outside the zip and never trips the allow-list.
PREVIEW_SRC="$SRC_DIR/docs/workshop-preview.svg"
PREVIEW_OUT="$DIST_DIR/preview.png"
ABS_PREVIEW=""
if [ -f "$PREVIEW_SRC" ]; then
    if command -v rsvg-convert >/dev/null 2>&1; then
        rsvg-convert -w 1024 -h 1024 "$PREVIEW_SRC" -o "$PREVIEW_OUT"
        ABS_PREVIEW="$(cd "$DIST_DIR" && pwd)/preview.png"
        echo "==> Workshop preview rendered: $PREVIEW_OUT"
    elif command -v magick >/dev/null 2>&1; then
        magick -background none -density 96 "$PREVIEW_SRC" -resize 1024x1024 "$PREVIEW_OUT"
        ABS_PREVIEW="$(cd "$DIST_DIR" && pwd)/preview.png"
        echo "==> Workshop preview rendered via ImageMagick: $PREVIEW_OUT"
    else
        echo "==> No SVG renderer found; preview.png NOT generated (brew install librsvg)."
    fi
fi

# Steam Workshop manifest (.vdf)
VDF_PATH="$DIST_DIR/workshop_item.vdf"
ABS_CONTENT="$(cd "$TARGET_DIR" && pwd)"

# Change note: "Initial release." until an item exists; then pull the current
# version's bullets out of CHANGELOG.md, one line each. No [list], straight quotes or
# backslashes: Steam cuts the note at an escaped quote and a list breaks out of its box.
CHANGELOG_FILE="$SRC_DIR/CHANGELOG.md"
CHANGENOTE="Initial release."
VERSION_RE="$(printf '%s' "$VERSION" | sed -E 's/[][(){}.^$*+?|\\]/\\&/g')"
if [ -n "$PUBLISHED_FILE_ID" ] && [ -f "$CHANGELOG_FILE" ]; then
    BULLETS="$(awk -v verre="$VERSION_RE" '
        function flush() { if (cur != "") { print cur; cur = "" } }
        $0 ~ ("^## \\[" verre "\\]") { grab = 1; next }
        grab && /^## / { flush(); exit }
        !grab { next }
        /^###/ { next }
        /^[[:space:]]*[-*][[:space:]]+/ { flush(); line=$0; sub(/^[[:space:]]*[-*][[:space:]]+/,"",line); cur=line; next }
        /^[[:space:]]*$/ { next }
        cur != "" { line=$0; sub(/^[[:space:]]+/,"",line); cur=cur " " line }
        END { flush() }
    ' "$CHANGELOG_FILE" | sed -E 's/^/• /; s/\*\*//g; s/`//g; s/"/”/g; s/\\//g')"
    if [ -n "$BULLETS" ]; then
        CHANGENOTE="$(printf '[b]Version %s[/b]\n%s' "$VERSION" "$BULLETS")"
    fi
fi

{
    echo '"workshopitem"'
    echo '{'
    echo "    \"appid\"          \"$APPID\""
    [ -n "$PUBLISHED_FILE_ID" ] && echo "    \"publishedfileid\" \"$PUBLISHED_FILE_ID\""
    echo "    \"contentfolder\"  \"$ABS_CONTENT\""
    [ -n "$ABS_PREVIEW" ] && echo "    \"previewfile\"    \"$ABS_PREVIEW\""
    echo '    "visibility"     "0"'
    echo "    \"title\"          \"$TITLE\""
    # "description" is intentionally omitted so steamcmd preserves the description
    # currently set on the Workshop page instead of overwriting it.
    echo "    \"changenote\"     \"${CHANGENOTE}\""
    echo '}'
} > "$VDF_PATH"

if [ -n "$PUBLISHED_FILE_ID" ]; then
    printf '%s\n' "$PUBLISHED_FILE_ID" > "$WORKSHOP_ID_FILE"
fi

echo "==> Workshop manifest written: $VDF_PATH"
echo ""
echo "✓ Release built:  $ZIP_PATH  ($SIZE)"
echo "  Version:        $VERSION"
echo "  Authors:        $AUTHORS"
if [ -n "$PUBLISHED_FILE_ID" ]; then
    echo "  UPDATE mode:    publishedfileid $PUBLISHED_FILE_ID (existing item)"
else
    echo "  NEW-ITEM mode:  no publishedfileid yet (first upload creates one;"
    echo "                  then: echo <publishedfileid> > steam_workshop_id.txt)"
fi
echo ""
echo "── Upload (from Mac) ──"
echo "  ~/steamcmd/steamcmd.sh +login <yourSteamLogin> \\"
echo "      +workshop_build_item $(cd "$DIST_DIR" && pwd)/workshop_item.vdf +quit"
