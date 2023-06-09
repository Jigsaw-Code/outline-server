VERSION=1.5.0-beta.2

.PHONY: all
all: bin/linux/outline-ss-server bin/macos/outline-ss-server

bin/linux/outline-ss-server: OS=linux
bin/linux/outline-ss-server: SHA256=4a720d8febb3d9cadfc175f31028ff2f22a2001ebeeeee269ec9ce302aff6d61

bin/macos/outline-ss-server: OS=macos
bin/macos/outline-ss-server: SHA256=9c8f89394c7f0bc7043c456501655443c57364406ba09f69f74bf913980ebec5

TEMPFILE := $(shell mktemp)
bin/%/outline-ss-server:
	node ../../src/build/download_file.mjs --url="https://github.com/Jigsaw-Code/outline-ss-server/releases/download/v$(VERSION)/outline-ss-server_$(VERSION)_$(OS)_x86_64.tar.gz" --out="$(TEMPFILE)" --sha256=$(SHA256)
	mkdir -p "$(dir $@)"
	tar -zx -f "$(TEMPFILE)" -C "$(dir $@)" "$(notdir $@)"
	chmod +x "$@"
	rm -f $(TEMPFILE)

.PHONY: clean
clean:
	rm -rf bin
