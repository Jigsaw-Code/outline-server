VERSION=1.5.0

.PHONY: all
all: bin/linux-x86_64/outline-ss-server bin/linux-arm64/outline-ss-server bin/macos-x86_64/outline-ss-server bin/macos-arm64/outline-ss-server

bin/linux-x86_64/outline-ss-server: OS=linux
bin/linux-x86_64/outline-ss-server: SHA256=0c6439242afbea191281404f08ef33490b01d6d0413ccca00004c8a1927de49a

bin/linux-arm64/outline-ss-server: OS=linux
bin/linux-arm64/outline-ss-server: SHA256=a643b28c2a894af6ceb1d309bf742092719877ede85ead6e8cbbc7b64b35a7ab

bin/macos-x86_64/outline-ss-server: OS=macos
bin/macos-x86_64/outline-ss-server: SHA256=f4b034f74701e9dae52bc7c8660e875f81473ef6d535a1470967e887f5beb9c6

bin/macos-arm64/outline-ss-server: OS=macos
bin/macos-arm64/outline-ss-server: SHA256=1f1d1833935ba363a8c468cd61e90d42de7f16e7332346b3c80f389c914192d3

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
