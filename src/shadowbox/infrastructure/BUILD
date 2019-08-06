package(default_visibility=["//visibility:public"])
load("@npm_bazel_typescript//:index.bzl", "ts_library")
load("@npm_bazel_jasmine//:index.bzl", "jasmine_node_test")

ts_library(
    name = "clock",
    srcs = ["clock.ts"],
    deps = [
        "@npm//@types/node",
    ],
)

ts_library(
    name = "filesystem_text_file",
    srcs = ["filesystem_text_file.ts"],
    deps = [
        ":text_file",
        "@npm//@types/node",
    ],
)

ts_library(
    name = "file_read",
    srcs = ["file_read.ts"],
    deps = [
        "@npm//@types/node",
    ],
)

ts_library(
    name = "follow_redirects",
    srcs = ["follow_redirects.ts"],
    deps = [
        "@npm//request-lite",
        "@npm//@types/node",
    ],
)

ts_library(
    name = "get_port",
    srcs = ["get_port.ts"],
    deps = [
        "@npm//@types/node",
    ],
)

ts_library(
    name = "get_port_test_lib",
    srcs = ["get_port.spec.ts"],
    deps = [
        ":get_port",
        "@npm//@types/jasmine",
        "@npm//@types/node",
    ],
    testonly = True,
)

jasmine_node_test(
    name = "get_port_test",
    deps = [
        ":get_port_test_lib",
    ],
    size = "small",
)

ts_library(
    name = "json_config",
    srcs = ["json_config.ts"],
    deps = [
        ":file_read",
        ":logging",
        "@npm//@types/node",
    ],
)

ts_library(
    name = "logging",
    srcs = ["logging.ts"],
    deps = [
        "@npm//@types/node",
    ],
)

ts_library(
    name = "prometheus_scraper",
    srcs = ["prometheus_scraper.ts"],
    deps = [
        ":logging",
        "@npm//@types/mkdirp",
        "@npm//@types/node",
        "@npm//mkdirp",
        "@npm//js-yaml",
    ],
    data = [
        "@prometheus//:prometheus",
    ],
)

ts_library(
    name = "rollout",
    srcs = ["rollout.ts"],
    deps = [
        "@npm//@types/node",
    ],
)

ts_library(
    name = "rollout_test_lib",
    srcs = ["rollout.spec.ts"],
    deps = [
        ":rollout",
        "@npm//@types/jasmine",
    ],
    testonly = True,
)

jasmine_node_test(
    name = "rollout_test",
    deps = [
        ":rollout_test_lib",
    ],
    size = "small",
)

ts_library(
    name = "text_file",
    srcs = ["text_file.ts"],
)