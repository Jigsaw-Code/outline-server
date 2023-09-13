VERSION=2.37.1

ifeq ($(ARCH),x86_64)
    APP_ARCH=amd64
else
    APP_ARCH=arm64
endif

.PHONY: all
all: bin/linux-x86_64/prometheus bin/linux-arm64/prometheus bin/macos-x86_64/prometheus bin/macos-arm64/prometheus

bin/linux-x86_64/prometheus: OS=linux
bin/linux-x86_64/prometheus: SHA256=753f66437597cf52ada98c2f459aa8c03745475c249c9f2b40ac7b3919131ba6

bin/linux-arm64/prometheus: OS=linux
bin/linux-arm64/prometheus: SHA256=b59a66fb5c7ec5acf6bf426793528a5789a1478a0dad8c64edc2843caf31b1b8

bin/macos-x86_64/prometheus: OS=darwin
bin/macos-x86_64/prometheus: SHA256=e03a43d98955ac3500f57353ea74b5df829074205f195ea6b3b88f55c4575c79

bin/macos-arm64/prometheus: OS=darwin
bin/macos-arm64/prometheus: SHA256=eb8a174c82a0fb6c84e81d9a73214318fb4a605115ad61505d7883d02e5a6f52

bin/%/prometheus: TEMPFILE := $(shell mktemp)
bin/%/prometheus:
	node ../../src/build/download_file.mjs --url="https://github.com/prometheus/prometheus/releases/download/v$(VERSION)/prometheus-$(VERSION).$(OS)-$(APP_ARCH).tar.gz" --out="$(TEMPFILE)" --sha256=$(SHA256)
	mkdir -p "$(dir $@)"
	tar -zx -f "$(TEMPFILE)" --strip-components=1 -C "$(dir $@)" prometheus-$(VERSION).$(OS)-$(APP_ARCH)/prometheus
	chmod +x "$@"
	rm -f $(TEMPFILE)

.PHONY: clean
clean:
	rm -rf bin
