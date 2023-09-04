VERSION=1.4.0
SHA256_linux_x86_64=f51bcb6391cca0ae828620c429e698a3b7c409de2374c52f113ca9a525e021a8
SHA256_linux_aarch64=14ae581414c9aab04253a385ef1854c003d09f545f6f8a3a55aa987f0c6d3859
APP_ARCH_linux_x86_64=x86_64
APP_ARCH_linux_aarch64=arm64

.PHONY: all
all: bin/linux/outline-ss-server bin/macos/outline-ss-server

bin/linux/outline-ss-server: OS=linux
bin/linux/outline-ss-server: SHA256=$(shell echo $(SHA256_linux_$(shell uname -m)))
bin/linux/outline-ss-server: APP_ARCH=$(shell echo $(APP_ARCH_linux_$(shell uname -m)))

bin/macos/outline-ss-server: OS=macos
bin/macos/outline-ss-server: SHA256=c85b2e8ae2d48482cbc101e54dcb7eed074a22c14a3a7301993e5f786b34081d
bin/macos/outline-ss-server: APP_ARCH=$(APP_ARCH_linux_x86_64)

TEMPFILE := $(shell mktemp)
bin/%/outline-ss-server:
	node ../../src/build/download_file.mjs --url="https://github.com/Jigsaw-Code/outline-ss-server/releases/download/v$(VERSION)/outline-ss-server_$(VERSION)_$(OS)_$(APP_ARCH).tar.gz" --out="$(TEMPFILE)" --sha256=$(SHA256)
	mkdir -p "$(dir $@)"
	tar -zx -f "$(TEMPFILE)" -C "$(dir $@)" "$(notdir $@)"
	chmod +x "$@"
	rm -f $(TEMPFILE)

.PHONY: clean
clean:
	rm -rf bin
