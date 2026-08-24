#!/usr/bin/env bash
# Notarizes and staples every DMG in dist/. Credentials come from a notarytool keychain
# profile, so no secret is ever passed on a command line or through the environment.
#
#   xcrun notarytool store-credentials "$NISABA_NOTARY_PROFILE" \
#     --apple-id "<your-apple-id>" --team-id 7X2UF4FZHC
#   npm run notarize
set -euo pipefail

PROFILE="${NISABA_NOTARY_PROFILE:-nisaba-notary}"

if ! xcrun notarytool history --keychain-profile "$PROFILE" >/dev/null 2>&1; then
  echo "No notarytool keychain profile '$PROFILE'. Create one with:" >&2
  echo "  xcrun notarytool store-credentials \"$PROFILE\" --apple-id <id> --team-id 7X2UF4FZHC" >&2
  exit 1
fi

shopt -s nullglob
dmgs=(dist/*.dmg)
if [ ${#dmgs[@]} -eq 0 ]; then
  echo "No DMGs in dist/ — run npm run dist first." >&2
  exit 1
fi

for dmg in "${dmgs[@]}"; do
  echo "==> $dmg"
  # --wait blocks until Apple returns Accepted or Invalid, so a failure stops the release.
  xcrun notarytool submit "$dmg" --keychain-profile "$PROFILE" --wait
  # Stapling is what lets the DMG pass Gatekeeper on a machine that is offline.
  xcrun stapler staple "$dmg"
  # The real test: what Gatekeeper itself says about the artifact users will download.
  spctl --assess --type open --context context:primary-signature -vv "$dmg"
done

echo
echo "Notarized and stapled: ${dmgs[*]}"
