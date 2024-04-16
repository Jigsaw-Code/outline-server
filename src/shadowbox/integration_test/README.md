# Outline Server Image Integration Test

This folder contains the integration test for the Outline Server image.

To build and test the image:

```sh
task shadowbox:integration_test
```

For development of the test, or to test a specific image, you may prefer calling the test directly, without the build step:

```sh
./src/shadowbox/integration_test/test.sh localhost/outline/shadowbox:latest
```
