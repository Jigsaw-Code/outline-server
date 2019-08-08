# Bazel workspace created by @bazel/create 0.35.0

# Declares that this directory is the root of a Bazel workspace.
# See https://docs.bazel.build/versions/master/build-ref.html#workspace
workspace(
    # How this workspace would be referenced with absolute labels from another workspace
    name = "org_getoutline",
    # Map the @npm bazel workspace to the node_modules directory.
    # This lets Bazel use the same node_modules as other local tooling.
    managed_directories = {"@npm": ["node_modules"]},
)

# Install the nodejs "bootstrap" package
# This provides the basic tools for running and packaging nodejs programs in Bazel
load("@bazel_tools//tools/build_defs/repo:http.bzl", "http_archive")
http_archive(
    name = "build_bazel_rules_nodejs",
    sha256 = "6625259f9f77ef90d795d20df1d0385d9b3ce63b6619325f702b6358abb4ab33",
    urls = ["https://github.com/bazelbuild/rules_nodejs/releases/download/0.35.0/rules_nodejs-0.35.0.tar.gz"],
)

# The yarn_install rule runs yarn anytime the package.json or yarn.lock file changes.
# It also extracts and installs any Bazel rules distributed in an npm package.
load("@build_bazel_rules_nodejs//:defs.bzl", "yarn_install")
yarn_install(
    # Name this npm so that Bazel Label references look like @npm//package
    name = "npm",
    package_json = "//:package.json",
    yarn_lock = "//:yarn.lock",
)

# Install any Bazel rules which were extracted earlier by the yarn_install rule.
load("@npm//:install_bazel_dependencies.bzl", "install_bazel_dependencies")
install_bazel_dependencies()

# Setup TypeScript toolchain 
load("@npm_bazel_typescript//:index.bzl", "ts_setup_workspace")
ts_setup_workspace()

OUTLINE_SS_SERVER_BUILD = """
package(default_visibility=["//visibility:public"])
exports_files(["outline-ss-server"])
"""

http_archive(
    name = "outline_ss_server_linux_amd64",
    urls = ["https://github.com/Jigsaw-Code/outline-ss-server/releases/download/v1.0.5/outline-ss-server_1.0.5_linux_x86_64.tar.gz"],
    sha256 = "c19eb07e06313fcfcde2cdb93567b9a98d78374b70a047a0cb913ca9bd8993e4",
    build_file_content = OUTLINE_SS_SERVER_BUILD
)

http_archive(
    name = "outline_ss_server_macos_amd64",
    urls = ["https://github.com/Jigsaw-Code/outline-ss-server/releases/download/v1.0.5/outline-ss-server_1.0.5_macos_x86_64.tar.gz"],
    sha256 = "a58ec0d4aca5151f3ae409ac41f0c67f0ea9992d82948cc2a4ddd1906c1e31fa",
    build_file_content = OUTLINE_SS_SERVER_BUILD
)

PROMETHEUS_BUILD = """
package(default_visibility=["//visibility:public"])
exports_files(["prometheus"])
"""

http_archive(
    name = "prometheus_linux_amd64",
    urls = ["https://github.com/prometheus/prometheus/releases/download/v2.11.1/prometheus-2.11.1.linux-amd64.tar.gz"],
    sha256 = "50b5f4dfd3f358518c1aaa3bd7df2e90780bdb5292b5c996137c2b1e81102390",
    strip_prefix = "prometheus-2.11.1.linux-amd64",
    build_file_content = PROMETHEUS_BUILD
)

http_archive(
    name = "prometheus_macos_amd64",
    urls = ["https://github.com/prometheus/prometheus/releases/download/v2.11.1/prometheus-2.11.1.darwin-amd64.tar.gz"],
    sha256 = "3528df5d8a464422ebfa6feff7ecb9f0987a4535cbb89f40159d2f6a5e5c9b9a",
    strip_prefix = "prometheus-2.11.1.darwin-amd64",
    build_file_content = PROMETHEUS_BUILD
)
