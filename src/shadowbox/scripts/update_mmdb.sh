#!/bin/sh
#
# Copyright 2024 The Outline Authors
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# Download the IP-to-country and IP-to-ASN MMDB databases into the same location
# used by Alpine's libmaxminddb package.

# IP Geolocation by DB-IP (https://db-ip.com)

# Note that this runs on BusyBox sh, which lacks bash features.

TMPDIR="$(mktemp -d)"
readonly TMPDIR
readonly LIBDIR="/var/lib/libmaxminddb"

# Downloads a given MMDB database and writes it to the temporary directory.
# @param {string} The database to download.
download_ip_mmdb() {
    db="$1"

    for monthdelta in $(seq 0 9); do
        newdate="$(date --date="-${monthdelta} months" +%Y-%m)"
        address="https://download.db-ip.com/free/db${db}-lite-${newdate}.mmdb.gz"
        curl --fail --silent "${address}" -o "${TMPDIR}/${db}.mmdb.gz" > /dev/null && return 0
    done
    return 1
}

main() {
    status_code=0
    # We need to make sure that we grab existing databases at install-time. If
    # any fail, we continue to try to fetch other databases and will return a
    # weird exit code at the end -- we should catch these failures long before
    # they trigger.
    if ! download_ip_mmdb "ip-country" ; then
        echo "Failed to download IP-country database"
        status_code=2
    fi
    if ! download_ip_mmdb "ip-asn" ; then
        echo "Failed to download IP-ASN database"
        status_code=2
    fi

    for filename in "${TMPDIR}"/*; do
        gunzip "${filename}"
    done

    mkdir -p "${LIBDIR}"
    mv -f "${TMPDIR}"/* "${LIBDIR}"
    rmdir "${TMPDIR}"

    exit "${status_code}"
}

main "$@"
