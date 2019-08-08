package(default_visibility=["//visibility:public"])

sh_binary(
    name = "outline_ss_server",
    srcs = select({
        "//:linux": ["@outline_ss_server_linux_amd64//:outline-ss-server"],
        "//:macos": ["@outline_ss_server_macos_amd64//:outline-ss-server"],
    }),
)

sh_binary(
    name = "prometheus",
    srcs = select({
        "//:linux": ["@prometheus_linux_amd64//:prometheus"],
        "//:macos": ["@prometheus_macos_amd64//:prometheus"],
    }),

)