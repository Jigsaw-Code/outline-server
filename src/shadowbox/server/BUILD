package(default_visibility=["//visibility:public"])
load("@npm_bazel_typescript//:index.bzl", "ts_library")
load("@npm_bazel_jasmine//:index.bzl", "jasmine_node_test")

# TODO: main

ts_library(
    name = "manager_metrics",
    srcs = ["manager_metrics.ts"],
    deps = [
        "//src/shadowbox/infrastructure:prometheus_scraper",
        "//src/shadowbox/model",
        "@npm//uuid",
    ],
)

ts_library(
    name = "manager_metrics_test_lib",
    srcs = ["manager_metrics.spec.ts"],
    deps = [
        ":manager_metrics",
        "//src/shadowbox/server/mocks",
        "//src/shadowbox/model",
    ],
    testonly = True,
)

jasmine_node_test(
    name = "manager_metrics_test",
    deps = [":manager_metrics_test_lib"],
    size = "small",
)

ts_library(
    name = "manager_service",
    srcs = ["manager_service.ts"],
    deps = [
        ":manager_metrics",
        ":server_config",
        ":shared_metrics",
        "//src/shadowbox/infrastructure:json_config",
        "//src/shadowbox/infrastructure:logging",
        "//src/shadowbox/model",
        "@npm//ShadowsocksConfig",
        "@npm//restify",
        "@npm//@types/restify",
    ],
)

ts_library(
    name = "manager_service_test_lib",
    srcs = ["manager_service.spec.ts"],
    deps = [
        ":manager_service",
        "//src/shadowbox/infrastructure:get_port",
        "//src/shadowbox/infrastructure:json_config",
        "//src/shadowbox/model",
        "@npm//@types/jasmine",
    ],
    testonly = True,
)

jasmine_node_test(
    name = "manager_service_test",
    deps = [":manager_service_test_lib"],
    size = "small",
)

ts_library(
    name = "outline_shadowsocks_server",
    srcs = ["outline_shadowsocks_server.ts"],
    deps = [
        "//src/shadowbox/infrastructure:logging",
        "//src/shadowbox/model",
        "@npm//js-yaml",
        "@npm//mkdirp",
        "@npm//@types/node",
    ],
)

ts_library(
    name = "server_access_key",
    srcs = ["server_access_key.ts"],
    deps = [
        "//src/shadowbox/infrastructure:clock",
        "//src/shadowbox/infrastructure:get_port",
        "//src/shadowbox/infrastructure:json_config",
        "//src/shadowbox/infrastructure:logging",
        "//src/shadowbox/infrastructure:prometheus_scraper",
        "//src/shadowbox/model",
        "@npm//randomstring",
        "@npm//uuid",
        "@npm//@types/randomstring",
    ],
)

ts_library(
    name = "server_access_key_test_lib",
    srcs = ["server_access_key.spec.ts"],
    deps = [
        ":server_access_key",
        "//src/shadowbox/infrastructure:clock",
        "//src/shadowbox/infrastructure:get_port",
        "//src/shadowbox/infrastructure:json_config",
        "//src/shadowbox/model",
        "//src/shadowbox/server/mocks",
        "@npm//@types/jasmine",
    ],
    testonly = True,
)

jasmine_node_test(
    name = "server_access_key_test",
    deps = [":server_access_key_test_lib"],
    size = "small",
)

ts_library(
    name = "server_config",
    srcs = ["server_config.ts"],
    deps = [
        "//src/shadowbox/infrastructure:json_config",
        "@npm//uuid",
    ],
)

ts_library(
    name = "shared_metrics",
    srcs = ["shared_metrics.ts"],
    deps = [
        ":server_config",
        "//src/shadowbox/infrastructure:clock",
        "//src/shadowbox/infrastructure:follow_redirects",
        "//src/shadowbox/infrastructure:json_config",
        "//src/shadowbox/infrastructure:logging",
        "//src/shadowbox/infrastructure:prometheus_scraper",
        "//src/shadowbox/model",
    ],
)

ts_library(
    name = "shared_metrics_test_lib",
    srcs = ["shared_metrics.spec.ts"],
    deps = [
        ":server_config",
        ":shared_metrics",
        "//src/shadowbox/infrastructure:clock",
        "//src/shadowbox/infrastructure:json_config",
        "//src/shadowbox/model",
        "@npm//@types/jasmine",
    ],
    testonly = True,
)

jasmine_node_test(
    name = "shared_metrics_test",
    deps = [":shared_metrics_test_lib"],
    size = "small",
)