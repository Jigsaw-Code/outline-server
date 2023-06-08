VERSION=1.5.0-beta.2

.PHONY: all
all: bin/linux/outline-ss-server bin/macos/outline-ss-server

bin/linux/outline-ss-server: BASENAME=outline-ss-server_$(VERSION)_linux_x86_64
bin/macos/outline-ss-server: BASENAME=outline-ss-server_$(VERSION)_macos_x86_64
bin/linux/outline-ss-server bin/macos/outline-ss-server: checksums.txt
	VERSION=$(VERSION) BASENAME="$(BASENAME)" OUTPUT="$@" ./download.sh

checksums.txt:
	wget --quiet https://github.com/Jigsaw-Code/outline-ss-server/releases/download/v$(VERSION)/checksums.txt -O $@

.PHONY: clean
clean:
	rm -rf bin
