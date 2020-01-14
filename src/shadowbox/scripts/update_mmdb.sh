#!/bin/sh

# Download the DB-IP country database into the same location
# used by Alpine's libmaxminddb package.

TMPDIR="$(mktemp -d)"
FILENAME="dbip-country-lite.mmdb"

# We need to make sure that we grab an existing database at install-time
monthdelta="0"
ADDRESS="https://download.db-ip.com/free/dbip-country-lite-$(date +%Y-%m).mmdb.gz"
while true; do
    curl --fail --silent --head "${ADDRESS}" > /dev/null && break
    monthdelta=$((monthdelta+1))
    if [[ $monthdelta -gt 10 ]]; then
        # A weird exit code on purpose -- we should catch this long before it triggers
        exit 2
    fi
    newdate=$(date --date="-$monthdelta month" +%Y-%m)
    ADDRESS="https://download.db-ip.com/free/dbip-country-lite-${newdate}.mmdb.gz"
done

curl --silent -f "${ADDRESS}" -o "$TMPDIR/$FILENAME.gz" || exit $?
gunzip "$TMPDIR/$FILENAME.gz"
LIBDIR="/var/lib/libmaxminddb"
mkdir -p $LIBDIR
mv -f "$TMPDIR/$FILENAME" $LIBDIR
rmdir $TMPDIR
