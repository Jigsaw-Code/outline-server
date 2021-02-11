#!/bin/sh

# Download the IP-to-country MMDB database into the same location
# used by Alpine's libmaxminddb package.

# IP Geolocation by DB-IP (https://db-ip.com)

# Note that this runs on BusyBox sh, which lacks bash features.

TMPDIR="$(mktemp -d)"
readonly TMPDIR
readonly FILENAME="ip-country.mmdb"

# We need to make sure that we grab an existing database at install-time
for monthdelta in $(seq 10); do
    newdate="$(date --date="-${monthdelta} months" +%Y-%m)"
    ADDRESS="https://download.db-ip.com/free/dbip-country-lite-${newdate}.mmdb.gz"
    curl --fail --silent "${ADDRESS}" -o "${TMPDIR}/${FILENAME}.gz" > /dev/null && break  
    if [ "${monthdelta}" -eq '10' ]; then
        # A weird exit code on purpose -- we should catch this long before it triggers
        exit 2
    fi
done

gunzip "${TMPDIR}/${FILENAME}.gz"
readonly LIBDIR="/var/lib/libmaxminddb"
mkdir -p "${LIBDIR}"
mv -f "${TMPDIR}/${FILENAME}" "${LIBDIR}"
rmdir "${TMPDIR}"
