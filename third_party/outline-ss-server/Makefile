VERSION=1.4.0

.PHONY: all
all: bin/linux-x86_64/outline-ss-server bin/linux-arm64/outline-ss-server bin/macos-x86_64/outline-ss-server bin/macos-arm64/outline-ss-server

bin/linux-x86_64/outline-ss-server: OS=linux
bin/linux-x86_64/outline-ss-server: SHA256=f51bcb6391cca0ae828620c429e698a3b7c409de2374c52f113ca9a525e021a8

bin/linux-arm64/outline-ss-server: OS=linux
bin/linux-arm64/outline-ss-server: SHA256=14ae581414c9aab04253a385ef1854c003d09f545f6f8a3a55aa987f0c6d3859

bin/macos-x86_64/outline-ss-server: OS=macos
bin/macos-x86_64/outline-ss-server: SHA256=c85b2e8ae2d48482cbc101e54dcb7eed074a22c14a3a7301993e5f786b34081d

bin/macos-arm64/outline-ss-server: OS=macos
bin/macos-arm64/outline-ss-server: SHA256=9647712a7c732184f98b1e2e7f74281855afed2245ec922c4a24b54f0eb0ce72

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
