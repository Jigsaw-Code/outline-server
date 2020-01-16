#!/bin/sh

# Download the IP-to-country MMDB database into the same location
# used by Alpine's libmaxminddb package.

# IP Geolocation by DB-IP (https://db-ip.com)

TMPDIR="$(mktemp -d)"
FILENAME="ip-country.mmdb"

# We need to make sure that we grab an existing database at install-time
for monthdelta in {0..10}; do
    newdate=$(date --date="-$monthdelta month" +%Y-%m)
    ADDRESS="https://download.db-ip.com/free/ip-country-${newdate}.mmdb.gz"
    curl --fail --silent "${ADDRESS}" -o "$TMPDIR/$FILENAME.gz" > /dev/null && break
    if (( $monthdelta == 10 )); then
        # A weird exit code on purpose -- we should catch this long before it triggers
        exit 2
    fi
done

gunzip "$TMPDIR/$FILENAME.gz"
LIBDIR="/var/lib/libmaxminddb"
mkdir -p $LIBDIR
mv -f "$TMPDIR/$FILENAME" $LIBDIR
rmdir $TMPDIR
