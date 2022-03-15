# Outline Server

The internal name for the Outline server is "Shadowbox". It is a server set up
that runs a user management API and starts Shadowsocks instances on demand.

It aims to make it as easy as possible to set up and share a Shadowsocks
server. It's managed by the Outline Manager and used as proxy by the Outline
client apps. Shadowbox is also compatible with standard Shadowsocks clients.

## Self-hosted installation

To install and run Shadowbox on your own server, run

```
sudo bash -c "$(wget -qO- https://raw.githubusercontent.com/Jigsaw-Code/outline-server/master/src/server_manager/install_scripts/install_server.sh)"
```

You can specify flags to customize the installation. For example, to use hostname `myserver.com` and the port 443 for access keys, you can run:

```
sudo bash -c "$(wget -qO- https://raw.githubusercontent.com/Jigsaw-Code/outline-server/master/src/server_manager/install_scripts/install_server.sh)" install_server.sh --hostname=myserver.com --keys-port=443
```

Use `sudo --preserve-env` if you need to pass environment variables. Use `bash -x` if you need to debug the installation.

## Running from source code

### Prerequisites

Shadowbox supports running on linux and macOS hosts.

Besides [Node](https://nodejs.org/en/download/) you will also need:

1. [Docker 1.13+](https://docs.docker.com/engine/installation/)
2. [docker-compose 1.11+](https://docs.docker.com/compose/install/)

### Running Shadowbox as a Node.js app

Build and run the server as a Node.js app:

```
npm run action shadowbox/server/start
```

The output will be at `build/shadowbox/app`.

### Running Shadowbox as a Docker container

### With docker command

Build the image and run server:

```
npm run action shadowbox/docker/start
```

You should be able to successfully query the management API:

```
curl --insecure https://[::]:8081/TestApiPrefix/server
```

To build the image only:

```
npm run action shadowbox/docker/build
```

Debug image:

```
docker run --rm -it --entrypoint=sh outline/shadowbox
```

Or a running container:

```
docker exec -it shadowbox sh
```

Delete dangling images:

```
docker rmi $(docker images -f dangling=true -q)
```

## Access Keys Management API

In order to utilize the Management API, you'll need to know the apiUrl for your Outline server.
You can obtain this information from the "Settings" tab of the server page in the Outline Manager.
Alternatively, you can check the 'access.txt' file under the '/opt/outline' directory of an Outline server. An example apiUrl is: https://1.2.3.4:1234/3pQ4jf6qSr5WVeMO0XOo4z.

See [Full API Documentation](https://redocly.github.io/redoc/?url=https://raw.githubusercontent.com/Jigsaw-Code/outline-server/master/src/shadowbox/server/api.yml).
The OpenAPI specification can be found at [api.yml](./server/api.yml).

### Examples

Start by storing the apiURL you see see in that file, as a variable. For example:

```
API_URL=https://1.2.3.4:1234/3pQ4jf6qSr5WVeMO0XOo4z
```

You can then perform the following operations on the server, remotely.

List access keys

```
curl --insecure $API_URL/access-keys/
```

Create an access key

```
curl --insecure -X POST $API_URL/access-keys
```

Rename an access key
(e.g. rename access key 2 to 'albion')

```
curl --insecure -X PUT curl -F 'name=albion' $API_URL/access-keys/2/name
```

Remove an access key
(e.g. remove access key 2)

```
curl --insecure -X DELETE $API_URL/access-keys/2
```

Set a data limit for all access keys
(e.g. limit outbound data transfer access keys to 1MB over 30 days)

```
curl -v --insecure -X PUT -H "Content-Type: application/json" -d '{"limit": {"bytes": 1000}}' $API_URL/experimental/access-key-data-limit
```

Remove the access key data limit

```
curl -v --insecure -X DELETE $API_URL/experimental/access-key-data-limit
```

## Testing

### Manual

After building a docker image with some local changes,
upload it to your favorite registry
(e.g. Docker Hub, quay.io, etc.).

Then set your `SB_IMAGE` environment variable to point to the image you just
uploaded (e.g. `export SB_IMAGE=yourdockerhubusername/shadowbox`) and
run `npm run action server_manager/electron_app/start` and your droplet should be created with your
modified image.

### Automated

To run the integration test:

```
npm run action shadowbox/integration_test/start
```

This will set up three containers and two networks:

```
client <-> shadowbox <-> target
```

`client` can only access `target` via shadowbox. We create a user on `shadowbox` then connect using the Shadowsocks client.

To test clients that rely on fetching a docker image from Dockerhub, you can push an image to your account and modify the
client to use your image. To push your own image:

```
npm run action shadowbox/docker/build && docker tag quay.io/outline/shadowbox $USER/shadowbox && docker push $USER/shadowbox
```

If you need to test an unsigned image (e.g. your dev one):

```
DOCKER_CONTENT_TRUST=0 SB_IMAGE=$USER/shadowbox npm run action shadowbox/integration_test/start
```

You can add tags if you need different versions in different clients.

### Testing Changes to the Server Config

If your change includes new fields in the server config which are needed at server
start-up time, then you mey need to remove the pre-existing test config:

```
rm /tmp/outline/persisted-state/shadowbox_server_config.json
```

This will warn about deleting a write-protected file, which is okay to ignore. You will then need to hand-edit the JSON string in src/shadowbox/docker/start.action.sh.
