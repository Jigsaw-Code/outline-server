#!/bin/sh

# Download the GeoLite2 country database into the same location
# used by Alpine's libmaxminddb package.

TMPDIR="$(mktemp -d)"
FILENAME="GeoLite2-Country.mmdb"
LIBDIR="/var/lib/libmaxminddb"
curl --silent "https://geolite.maxmind.com/download/geoip/database/$FILENAME.gz" -o "$TMPDIR/$FILENAME.gz"
gunzip "$TMPDIR/$FILENAME.gz"
mkdir -p $LIBDIR
mv -f "$TMPDIR/$FILENAME" $LIBDIR
rmdir $TMPDIR
