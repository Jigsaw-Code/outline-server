# Copyright 2018 The Outline Authors
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

# Script to install a shadowbox docker container, a watchtower docker container
# (to automatically update shadowbox), and to create a new shadowbox user.

# You may set the following environment variables, overriding their defaults:
# SB_IMAGE: Shadowbox Docker image to install, e.g. quay.io/outline/shadowbox:nightly
# SB_API_PORT: The port number of the management API.
# SHADOWBOX_DIR: Directory for persistent Shadowbox state.
# SB_PUBLIC_IP: The public IP address for Shadowbox.
# ACCESS_CONFIG: The location of the access config text file.
# SB_DEFAULT_SERVER_NAME: Default name for this server, e.g. "Outline Server New York".
#     This name will be used for the server until the admins updates the name
#     via the REST API.
# SENTRY_LOG_FILE: File for writing logs which may be reported to Sentry, in case
#     of an install error. No PII should be written to this file. Intended to be set
#     only by do_install_server.sh.

# Requires curl and docker to be installed

set -euo pipefail

readonly SENTRY_LOG_FILE=${SENTRY_LOG_FILE:-}

function log_error() {
  readonly ERROR_TEXT="\033[0;31m"  # red
  readonly NO_COLOR="\033[0m"
  >&2 printf "${ERROR_TEXT}${1}${NO_COLOR}\n"
}

# Pretty prints text to stdout, and also writes to sentry log file if set.
function log_step() {
  log_for_sentry $1
  str="> $1"
  okStr=" OK"
  lineLength=50
  echo -n "$str"
  numDots=$(expr $lineLength - ${#str} - ${#okStr} - 1)
  if [[ $numDots > 0 ]]; then
    echo -n " "
    for i in $(seq 1 "$numDots"); do echo -n .; done
  fi
  echo "$okStr"
}

function command_exists {
  command -v "$@" > /dev/null 2>&1
}

function log_for_sentry() {
  if [[ -n "$SENTRY_LOG_FILE" ]]; then
    echo [$(date "+%Y-%m-%d@%H:%M:%S")] "install_server.sh" "$@" >>$SENTRY_LOG_FILE
  fi
}

# Check to see if docker is installed.
log_step "Verifying that Docker is installed"
if ! command_exists docker; then
  log_error "Docker must be installed, please run \"curl -sS https://get.docker.com/ | sh\" or visit https://www.docker.com/"
  exit 1
fi

# Set trap which publishes error tag only if there is an error.
function finish {
  EXIT_CODE=$?
  if [[ $EXIT_CODE -ne 0 ]]
  then
    log_error "\nSorry! Something went wrong. If you can't figure this out, please copy and paste all this output into the Outline Manager screen, and send it to us, to see if we can help you."
  fi
}
trap finish EXIT

function get_random_port {
  local num=0  # Init to an invalid value, to prevent "unbound variable" errors.
  until (( 1024 <= num && num < 65536)); do
    num=$(( $RANDOM + ($RANDOM % 2) * 32768 ));
  done;
  echo $num;
}

install_shadowbox() {
  log_for_sentry "Creating shadowbox directory"
  export SHADOWBOX_DIR="${SHADOWBOX_DIR:-${HOME:-/root}/.shadowbox}"
  mkdir -p $SHADOWBOX_DIR

  log_for_sentry "Setting API port"
  readonly SB_API_PORT="${SB_API_PORT:-$(get_random_port)}"
  readonly ACCESS_CONFIG=${ACCESS_CONFIG:-$SHADOWBOX_DIR/access.txt}
  readonly SB_IMAGE=${SB_IMAGE:-quay.io/outline/shadowbox:stable}

  log_for_sentry "Setting SB_PUBLIC_IP"
  # TODO(fortuna): Make sure this is IPv4
  readonly SB_PUBLIC_IP=${SB_PUBLIC_IP:-$(curl -4s https://ipinfo.io/ip)}

  log_step "Setting up key functions and constants"

  if [[ ! "$SB_PUBLIC_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Invalid IP lookup result: $SB_PUBLIC_IP"
    log_for_sentry "Invalid IP lookup result"
    exit 1
  fi

  function output_config() {
    echo "$@" >> $ACCESS_CONFIG
  }

  # If $ACCESS_CONFIG already exists, copy it to backup then clear it.
  # Note we can't do "mv" here as do_install_server.sh may already be tailing
  # this file.
  log_for_sentry "Initializing ACCESS_CONFIG"
  [[ -f $ACCESS_CONFIG ]] && cp $ACCESS_CONFIG $ACCESS_CONFIG.bak && > $ACCESS_CONFIG

  # Set watchtower to refresh every 30 seconds if a custom SB_IMAGE is used (for
  # testing).  Otherwise refresh every hour.
  readonly WATCHTOWER_REFRESH_SECONDS=$([ $SB_IMAGE ] && echo 30 || echo 3600)

  # Make a directory for persistent state
  log_step "Creating persistent state dir"
  readonly STATE_DIR="$SHADOWBOX_DIR/persisted-state"
  mkdir -p "${STATE_DIR}"

  log_step "Setting up directory"

  # Generate a secret key for access to the shadowbox API and store it in a tag.
  # 16 bytes = 128 bits of entropy should be plenty for this use.
  function safe_base64() {
    # Implements URL-safe base64 of stdin, stripping trailing = chars.
    # Writes result to stdout.
    # TODO: this gives the following errors on Mac:
    #   base64: invalid option -- w
    #   tr: illegal option -- -
    local url_safe="$(base64 -w 0 - | tr '/+' '_-')"
    echo -n "${url_safe%%=*}"  # Strip trailing = chars
  }
  readonly SB_API_PREFIX=$(head -c 16 /dev/urandom | safe_base64)

  log_step "Generating secret key"

  # Generate self-signed cert and store it in the persistent state directory.
  readonly CERTIFICATE_NAME="${STATE_DIR}/shadowbox-selfsigned"
  readonly SB_CERTIFICATE_FILE="${CERTIFICATE_NAME}.crt"
  readonly SB_PRIVATE_KEY_FILE="${CERTIFICATE_NAME}.key"
  declare -a openssl_req_flags=(
    -x509 -nodes -days 36500 -newkey rsa:2048
    -subj "/CN=${SB_PUBLIC_IP}"
    -keyout "${SB_PRIVATE_KEY_FILE}" -out "${SB_CERTIFICATE_FILE}"
  )
  openssl req "${openssl_req_flags[@]}" >/dev/null 2>&1

  log_step "Generating self-signed certificate"

  # Add a tag with the SHA-256 fingerprint of the certificate.
  # (Electron uses SHA-256 fingerprints: https://github.com/electron/electron/blob/9624bc140353b3771bd07c55371f6db65fd1b67e/atom/common/native_mate_converters/net_converter.cc#L60)
  # Example format: "SHA256 Fingerprint=BD:DB:C9:A4:39:5C:B3:4E:6E:CF:18:43:61:9F:07:A2:09:07:37:35:63:67"
  CERT_OPENSSL_FINGERPRINT=$(openssl x509 -in "${SB_CERTIFICATE_FILE}" -noout -sha256 -fingerprint)
  # Example format: "BDDBC9A4395CB34E6ECF1843619F07A2090737356367"
  CERT_HEX_FINGERPRINT=$(echo ${CERT_OPENSSL_FINGERPRINT#*=} | tr --delete :)
  output_config "certSha256:$CERT_HEX_FINGERPRINT"

  log_step "Generating SHA-256 fingerprint"

  # Start Shadowbox.
  declare -a docker_shadowbox_flags=(
    --name shadowbox --restart=always --net=host
    -v "${STATE_DIR}:${STATE_DIR}"
    -e "SB_STATE_DIR=${STATE_DIR}"
    -e "SB_PUBLIC_IP=${SB_PUBLIC_IP}"
    -e "SB_API_PORT=${SB_API_PORT}"
    -e "SB_API_PREFIX=${SB_API_PREFIX}"
    -e "SB_CERTIFICATE_FILE=${SB_CERTIFICATE_FILE}"
    -e "SB_PRIVATE_KEY_FILE=${SB_PRIVATE_KEY_FILE}"
    -e "SB_METRICS_URL=${SB_METRICS_URL:-}"
    -e "SB_DEFAULT_SERVER_NAME=${SB_DEFAULT_SERVER_NAME:-}"
  )
  docker run -d "${docker_shadowbox_flags[@]}" "${SB_IMAGE}" >/dev/null

  log_step "Starting Shadowbox"

  # TODO(dborkan): if the script fails after docker run, it will continue to fail
  # as the names shadowbox and watchtower will already be in use.  Consider
  # deleting the container in the case of failure (e.g. using a trap, or
  # deleting existing containers on each run).

  # Start watchtower to automatically fetch docker image updates.
  # TODO(fortuna): Don't wait for Shadowbox to run this.
  declare -a docker_watchtower_flags=(--name watchtower --restart=always)
  docker_watchtower_flags+=(-v /var/run/docker.sock:/var/run/docker.sock)
  docker run -d "${docker_watchtower_flags[@]}" v2tec/watchtower --cleanup --tlsverify --interval $WATCHTOWER_REFRESH_SECONDS >/dev/null

  log_step "Starting Watchtower"

  readonly SB_API_URL="https://${SB_PUBLIC_IP}:${SB_API_PORT}/${SB_API_PREFIX}"
  # Wait for server to be ready
  until curl --cacert "${SB_CERTIFICATE_FILE}" -s "${SB_API_URL}/access-keys" >/dev/null; do sleep 1; done
  # Create a new user
  curl --cacert "${SB_CERTIFICATE_FILE}" -X POST -s "${SB_API_URL}/access-keys" >/dev/null

  log_step "Creating first user"

  # API is ready. Output the config.
  output_config "apiUrl:${SB_API_URL}"

  log_step "Generating final output"

  # TODO: Figure out how to perform more firewall tests.  Unfortunately making a
  # request to the manager from within the host machine may not detect
  # a firewall, even if the public IP address is used.
  if command_exists ufw && [[ $(ufw status) !=  "Status: inactive" ]]; then
    log_error "You have ufw enabled on your machine, please check your configuration to ensure access to high numbered ports."
  else
    log_step "Cursory firewalls detection"
  fi

  # Echos the value of the specified field from ACCESS_CONFIG.
  # e.g. if ACCESS_CONFIG contains the line "certSha256:1234",
  # calling $(get_field_value certSha256) will echo 1234.
  function get_field_value {
    grep "$1" $ACCESS_CONFIG | sed "s/$1://"
  }

  # Output JSON.  This relies on apiUrl and certSha256 (hex characters) requiring
  # no string escaping.  TODO: look for a way to generate JSON that doesn't
  # require new dependencies.
  cat <<END_OF_SERVER_OUTPUT

Please copy the following configuration to your Outline Manager:
{
  "apiUrl": "$(get_field_value apiUrl)",
  "certSha256": "$(get_field_value certSha256)"
}
END_OF_SERVER_OUTPUT
} # end of install_shadowbox

# Wrapped in a function for some protection against half-downloads.
install_shadowbox
