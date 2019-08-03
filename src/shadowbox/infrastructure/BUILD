package(default_visibility=["//visibility:public"])
load("@npm_bazel_typescript//:index.bzl", "ts_library")
load("@npm_bazel_jasmine//:index.bzl", "jasmine_node_test")

ts_library(
    name = "get_port",
    srcs = ["get_port.ts"],
    deps = [
        "@npm//@types/node",
    ],
    tsconfig = "//:tsconfig.nodejs.json",
)

ts_library(
    name = "get_port_test_lib",
    srcs = ["get_port.spec.ts"],
    deps = [
        ":get_port",
        "@npm//@types/jasmine",
        "@npm//@types/node",
    ],
    tsconfig = "//:tsconfig.nodejs.json",
)

jasmine_node_test(
    name = "get_port_test",
    deps = [
        ":get_port_test_lib",
    ],
    size = "small",
)
