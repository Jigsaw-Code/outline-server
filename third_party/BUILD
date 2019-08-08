package(default_visibility=["//visibility:public"])

genrule(
    name = "outline_ss_server_genrule",
    srcs = select({
        "//:linux": ["@outline_ss_server_linux_amd64//:outline-ss-server"],
        "//:macos": ["@outline_ss_server_macos_amd64//:outline-ss-server"],
    }),
    outs = ["outline-ss-server"],
    cmd = "cp $(SRCS) $@",
    executable = True,
)

genrule(
    name = "prometheus_genrule",
    srcs = select({
        "//:linux": ["@prometheus_linux_amd64//:prometheus"],
        "//:macos": ["@prometheus_macos_amd64//:prometheus"],
    }),
    outs = ["prometheus"],
    cmd = "cp $(SRCS) $@",
    executable = True,
)