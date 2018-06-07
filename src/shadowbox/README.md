# Outline Server

The internal name for the Outline server is "Shadowbox". It is a server set up
that runs a user management API and starts Shadowsocks instances on demand.

It aims to make it as easy as possible to set up and share a Shadowsocks
server. It's managed by the Outline Manager and used as proxy by the Outline
client apps. Shadowbox is also compatible with standard Shadowsocks clients.

## Self-hosted installation

To install and run Shadowbox on your own server, run
```
wget -qO- https://raw.githubusercontent.com/Jigsaw-Code/outline-server/master/src/server_manager/install_scripts/install_server.sh | bash
```

Use `bash -x` instead at the end of the command if you need to debug the installation.

## Running from source code

### Prerequisites

Besides [Node](https://nodejs.org/en/download/) and [Yarn](https://yarnpkg.com/en/docs/install), you will also need:

1. [Docker 1.13+](https://docs.docker.com/engine/installation/)
1. [docker-compose 1.11+](https://docs.docker.com/compose/install/)

Run `docker info` and make sure `Storage Driver` is `devicemapper`. If it is
not, you can override it by editting `/etc/default/docker` or by passing
another storage driver in the daemon commandline:
```
sudo dockerd --storage-driver=devicemapper
```

### Running Shadowbox as a Node.js app

Build the server as a Node.js app:
```
yarn do shadowbox/server/build
```
The output will be at `build/shadowbox/app`.


You can see how to run the server at [`shadowbox/server/run_action.sh`](server/run_action.sh).


### Running Shadowbox as a Docker container

> **NOTE**: This does not currently work in Docker on Mac due to use of
`--host=net` and integrity checks failing. For now, please see the Manual
testing section below.

### With docker command

Build the `outline/shadowbox` Docker image:
```
yarn do shadowbox/docker/build
```

Run server:
```
yarn do shadowbox/docker/run
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

List users
```
curl --insecure https://localhost:8081/TestApiPrefix/access-keys/
```

Create a user
```
curl --insecure -X POST https://localhost:8081/TestApiPrefix/access-keys
```

Rename a user
(e.g. rename user ID 2 to 'albion')
```
curl --insecure -X PUT https://localhost:8081/TestApiPrefix/access-keys/2/albion
```

Remove a user
(e.g. remove user ID 2)
```
curl --insecure -X DELETE https://localhost:8081/TestApiPrefix/access-keys/2
```

<details>
<summary>
Example output
</summary>

```
$ curl --insecure https://localhost:8081/TestApiPrefix/access-keys
{"users":[]}

$ curl --insecure -X POST https://localhost:8081/TestApiPrefix/access-keys
{"id":"0","password":"Nm9wtQkPeshs","port":34180}

$ curl --insecure -X POST https://localhost:8081/TestApiPrefix/access-keys
{"id":"1","password":"32mW3jhuhBGv","port":55625}

$ curl --insecure -X POST https://localhost:8081/TestApiPrefix/access-keys
{"id":"2","password":"jFOKrJcpbgIb","port":15884}

$ curl --insecure https://localhost:8081/TestApiPrefix/access-keys
{"users":[{"id":"0","password":"Nm9wtQkPeshs","port":34180},{"id":"1","password":"32mW3jhuhBGv","port":55625},{"id":"2","password":"jFOKrJcpbgIb","port":15884}]}

$ curl --insecure -X DELETE https://localhost:8081/TestApiPrefix/access-keys/0 -v
* Hostname was NOT found in DNS cache
*   Trying ::1...
* Connected to localhost (::1) port 8081 (#0)
> DELETE /access-keys/0 HTTP/1.1
> User-Agent: curl/7.35.0
> Host: localhost:8081
> Accept: */*
>
< HTTP/1.1 204 No Content
< Date: Fri, 03 Feb 2017 22:46:39 GMT
< Connection: keep-alive
<
* Connection #0 to host localhost left intact

$ curl --insecure https://localhost:8081/TestApiPrefix/access-keys
{"users":[{"id":"1","password":"32mW3jhuhBGv","port":55625},{"id":"2","password":"jFOKrJcpbgIb","port":15884}]}
```
</details>


## Testing

### Manual

After building a docker image with some local changes,
upload it to your favorite registry
(e.g. Docker Hub, quay.io, etc.).

Then set your `SB_IMAGE` environment variable to point to the image you just
uploaded (e.g. `export SB_IMAGE=yourdockerhubusername/shadowbox`) and
run `yarn do server_manager/electron_app/run` and your droplet should be created with your
modified image.

### Automated

To run the integration test:
```
yarn do shadowbox/integration_test/run
```

This will set up three containers and two networks:
```
client <-> shadowbox <-> target
```

`client` can only access `target` via shadowbox. We create a user on `shadowbox` then connect using the Shadowsocks client.

To test clients that rely on fetching a docker image from Dockerhub, you can push an image to your account and modify the
client to use your image. To push your own image:
```
yarn shadowbox_docker_build && docker tag quay.io/outline/shadowbox $USER/shadowbox && docker push $USER/shadowbox
```

If you need to test an unsigned image (e.g. your dev one):
```
DOCKER_CONTENT_TRUST=0 SHADOWBOX_IMAGE=$USER/shadowbox yarn do shadowbox/integration_test/run
```

You can add tags if you need different versions in different clients.
