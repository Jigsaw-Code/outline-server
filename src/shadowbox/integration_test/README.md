# Outline Server Image Integration Test

This folder contains the integration test for the Outline Server image.

To build and test the image:

```sh
task shadowbox:integration_test
```

For development of the test, or to test a specific image, you may prefer calling the test directly, without the build step:

```sh
./task shadowbox:test_image IMAGE_NAME=quay.io/outline/shadowbox:stable
```

If you prefer to use Podman instead of Docker, set the `DOCKER=podman` environment variable:

```sh
DOCKER=podman task shadowbox:integration_test
```
