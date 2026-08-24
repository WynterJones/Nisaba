#!/usr/bin/env python3
"""Restamps dist/latest-mac.yml after notarization.

Stapling rewrites each DMG in place, so the sha512 and size electron-builder recorded before
notarization no longer describe the files being published. The zips are untouched -- and are
what electron-updater actually installs from -- but a feed that misdescribes half its
artifacts is a trap for anyone who checks them.
"""
import base64
import hashlib
import os
import re
import sys

FEED = os.path.join("dist", "latest-mac.yml")
ENTRY = re.compile(r"- url: (?P<url>\S+)\n(?P<indent>\s+)sha512: \S+\n\s+size: \d+")


def restamp(match):
    path = os.path.join("dist", match.group("url"))
    if not path.endswith(".dmg") or not os.path.exists(path):
        return match.group(0)
    with open(path, "rb") as handle:
        digest = hashlib.sha512(handle.read()).digest()
    indent = match.group("indent")
    return "- url: %s\n%ssha512: %s\n%ssize: %d" % (
        match.group("url"),
        indent,
        base64.b64encode(digest).decode(),
        indent,
        os.path.getsize(path),
    )


if not os.path.exists(FEED):
    sys.exit(0)

with open(FEED) as handle:
    text = handle.read()

updated, count = ENTRY.subn(restamp, text)
with open(FEED, "w") as handle:
    handle.write(updated)
print("latest-mac.yml: %d entries checked, DMG hashes restamped after stapling" % count)
