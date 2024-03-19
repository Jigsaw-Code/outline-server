VERSION=1.5.0-beta.2

.PHONY: all
all: bin/linux-x86_64/outline-ss-server bin/linux-arm64/outline-ss-server bin/macos-x86_64/outline-ss-server bin/macos-arm64/outline-ss-server

bin/linux-x86_64/outline-ss-server: OS=linux
bin/linux-x86_64/outline-ss-server: SHA256=4a720d8febb3d9cadfc175f31028ff2f22a2001ebeeeee269ec9ce302aff6d61

bin/linux-arm64/outline-ss-server: OS=linux
bin/linux-arm64/outline-ss-server: SHA256=769fe32f43e45d990cd65374ed73db00fc8fff6bc356e1b4c62074900e54ddc6

bin/macos-x86_64/outline-ss-server: OS=macos
bin/macos-x86_64/outline-ss-server: SHA256=9c8f89394c7f0bc7043c456501655443c57364406ba09f69f74bf913980ebec5

bin/macos-arm64/outline-ss-server: OS=macos
bin/macos-arm64/outline-ss-server: SHA256=8f77803e3dc8c95c2120545b64bc3060ba45bdfa3c09fc5b2536baa9a0840461

TEMPFILE := $(shell mktemp)
bin/%/outline-ss-server:
	node ../../src/build/download_file.mjs --url="https://github.com/Jigsaw-Code/outline-ss-server/releases/download/v$(VERSION)/outline-ss-server_$(VERSION)_$(OS)_$(ARCH).tar.gz" --out="$(TEMPFILE)" --sha256=$(SHA256)
	mkdir -p "$(dir $@)"
	tar -zx -f "$(TEMPFILE)" -C "$(dir $@)" "$(notdir $@)"
	chmod +x "$@"
	rm -f $(TEMPFILE)

.PHONY: clean
clean:
	rm -rf bin
