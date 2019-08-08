package(default_visibility=["//visibility:public"])

genrule(
    name = "outline-ss-server_genrule",
    srcs = select({
        "//:linux": ["@outline-ss-server-linux-amd64//:outline-ss-server"],
        "//:macos": ["@outline-ss-server-macos-amd64//:outline-ss-server"],
    }),
    outs = ["outline-ss-server"],
    cmd = "cp $(SRCS) $@",
    executable = True,
)

genrule(
    name = "prometheus_genrule",
    srcs = select({
        "//:linux": ["@prometheus-linux-amd64//:prometheus"],
        "//:macos": ["@prometheus-macos-amd64//:prometheus"],
    }),
    outs = ["prometheus"],
    cmd = "cp $(SRCS) $@",
    executable = True,
)