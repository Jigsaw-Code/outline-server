package(default_visibility=["//visibility:public"])
load("@npm_bazel_typescript//:index.bzl", "ts_library")

ts_library(
    name = "mocks",
    srcs = ["mocks.ts"],
    deps = [
        "//src/shadowbox/infrastructure:prometheus_scraper",
        "//src/shadowbox/infrastructure:text_file",
        "//src/shadowbox/model",
        "@npm//@types/jasmine",
    ],
    testonly = True,
)
