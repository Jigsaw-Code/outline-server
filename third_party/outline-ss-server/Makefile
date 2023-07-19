VERSION=1.4.0

.PHONY: all
all: bin/linux/outline-ss-server bin/macos/outline-ss-server

bin/linux/outline-ss-server: OS=linux
bin/linux/outline-ss-server: SHA256=f51bcb6391cca0ae828620c429e698a3b7c409de2374c52f113ca9a525e021a8

bin/macos/outline-ss-server: OS=macos
bin/macos/outline-ss-server: SHA256=c85b2e8ae2d48482cbc101e54dcb7eed074a22c14a3a7301993e5f786b34081d

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
