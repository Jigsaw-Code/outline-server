#!/bin/sh

# Download the IP-to-country MMDB database into the same location
# used by Alpine's libmaxminddb package.

# IP Geolocation by DB-IP (https://db-ip.com)

TMPDIR="$(mktemp -d)"
FILENAME="dbip-country-lite.mmdb"

# We need to make sure that we grab an existing database at install-time
for monthdelta in {0..11}; do
    if [[ $monthdelta -gt 10 ]]; then
        # A weird exit code on purpose -- we should catch this long before it triggers
        exit 2
    fi
    newdate=$(date --date="-$monthdelta month" +%Y-%m)
    ADDRESS="https://download.db-ip.com/free/dbip-country-lite-${newdate}.mmdb.gz"
    curl --fail --silent "${ADDRESS}" -o "$TMPDIR/$FILENAME.gz" > /dev/null && break
done

gunzip "$TMPDIR/$FILENAME.gz"
LIBDIR="/var/lib/libmaxminddb"
mkdir -p $LIBDIR
mv -f "$TMPDIR/$FILENAME" $LIBDIR
rmdir $TMPDIR
