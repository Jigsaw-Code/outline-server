#!/bin/sh

# Download the DB-IP country database into the same location
# used by Alpine's libmaxminddb package.

TMPDIR="$(mktemp -d)"
FILENAME="dbip-country-lite.mmdb"
ADDRESS="https://download.db-ip.com/free/dbip-country-lite-$(date +%Y-%m).mmdb.gz"
LIBDIR="/var/lib/libmaxminddb"
curl --silent -f "${ADDRESS}" -o "$TMPDIR/$FILENAME.gz" || exit $?
gunzip "$TMPDIR/$FILENAME.gz"
mkdir -p $LIBDIR
mv -f "$TMPDIR/$FILENAME" $LIBDIR
rmdir $TMPDIR
