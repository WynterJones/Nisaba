#!/usr/bin/env bash
# Notarizes and staples every DMG in dist/.
#
# Credentials, in order of preference:
#   1. A notarytool keychain profile ($NISABA_NOTARY_PROFILE, default "nisaba-notary").
#   2. APPLE_ID + APPLE_TEAM_ID + one of APPLE_APP_SPECIFIC_PASSWORD / APPLE_PASSWORD.
#      (Tauri calls it APPLE_PASSWORD, electron-builder calls it the long one; accept both.)
#
# When only the env vars are present, they are stored into a keychain profile once and used
# from there afterwards -- so the password stops being needed in the environment, and never
# appears on a command line where `ps` could read it.
set -euo pipefail

PROFILE="${NISABA_NOTARY_PROFILE:-nisaba-notary}"

have_profile() { xcrun notarytool history --keychain-profile "$PROFILE" >/dev/null 2>&1; }

if ! have_profile; then
  PASSWORD="${APPLE_APP_SPECIFIC_PASSWORD:-${APPLE_PASSWORD:-}}"
  if [ -z "${APPLE_ID:-}" ] || [ -z "${APPLE_TEAM_ID:-}" ] || [ -z "$PASSWORD" ]; then
    cat >&2 <<'MSG'
No notarytool keychain profile and no usable credentials in the environment.

Either create the profile once (it prompts for the password):
  xcrun notarytool store-credentials "nisaba-notary" \
    --apple-id <your-apple-id> --team-id 7X2UF4FZHC

or export APPLE_ID, APPLE_TEAM_ID and APPLE_APP_SPECIFIC_PASSWORD (or APPLE_PASSWORD).
The password must be an app-specific password from appleid.apple.com, not your Apple ID
password.
MSG
    exit 1
  fi

  echo "Storing notarytool credentials in keychain profile '$PROFILE'…"
  xcrun notarytool store-credentials "$PROFILE" \
    --apple-id "$APPLE_ID" --team-id "$APPLE_TEAM_ID" --password "$PASSWORD" >/dev/null
  unset PASSWORD
  have_profile || { echo "Stored credentials were rejected by Apple." >&2; exit 1; }
fi

shopt -s nullglob
dmgs=(dist/*.dmg)
if [ ${#dmgs[@]} -eq 0 ]; then
  echo "No DMGs in dist/ — run npm run dist first." >&2
  exit 1
fi

# electron-builder signs the .app but leaves the DMG container unsigned, which makes
# `spctl --assess` report "no usable signature" on an otherwise perfectly notarized disk
# image. Sign the container too, before submission, so the artifact verifies as a whole.
IDENTITY="${NISABA_SIGNING_IDENTITY:-Developer ID Application}"

for dmg in "${dmgs[@]}"; do
  echo
  echo "==> $dmg"
  codesign --force --sign "$IDENTITY" --timestamp "$dmg"
  # --wait blocks until Apple returns Accepted or Invalid, so a rejection fails the release
  # instead of quietly shipping something Gatekeeper will block.
  xcrun notarytool submit "$dmg" --keychain-profile "$PROFILE" --wait
  # Stapling is what lets the DMG pass on a machine that is offline when it opens it.
  xcrun stapler staple "$dmg"
done

# Stapling rewrote each DMG, so the hashes in the update feed no longer match what is being
# published. Restamp them before the release goes out.
python3 "$(dirname "$0")/restamp-feed.py"

# Verified in a second pass so one bad artifact cannot stop the others from being submitted.
echo
echo "=== Gatekeeper assessment ==="
failed=0
for dmg in "${dmgs[@]}"; do
  # Captured rather than piped: a pipeline reports tail's status, so `if spctl | tail` would
  # always look like a pass.
  if verdict=$(spctl --assess --type open --context context:primary-signature -v "$dmg" 2>&1); then
    echo "  ACCEPTED  $dmg"
    echo "$verdict" | sed 's/^/            /'
  else
    echo "  REJECTED  $dmg" >&2
    echo "$verdict" | sed 's/^/            /' >&2
    failed=1
  fi
  # Stapling is the part that matters offline; assert it independently of Gatekeeper.
  xcrun stapler validate "$dmg" >/dev/null 2>&1 || { echo "  ^ staple missing" >&2; failed=1; }
done
[ "$failed" -eq 0 ] || exit 1

echo
echo "Notarized and stapled: ${dmgs[*]}"
