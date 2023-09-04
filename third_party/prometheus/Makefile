VERSION=2.37.1
SHA256_linux_x86_64=753f66437597cf52ada98c2f459aa8c03745475c249c9f2b40ac7b3919131ba6
SHA256_linux_aarch64=b59a66fb5c7ec5acf6bf426793528a5789a1478a0dad8c64edc2843caf31b1b8
APP_ARCH_linux_x86_64=amd64
APP_ARCH_linux_aarch64=arm64

.PHONY: all
all: bin/linux/prometheus bin/macos/prometheus

bin/linux/prometheus: OS=linux
bin/linux/prometheus: ARCH=$(shell uname -m)
bin/linux/prometheus: SHA256=$(shell echo $(SHA256_linux_$(ARCH)))
bin/linux/prometheus: APP_ARCH=$(shell echo $(APP_ARCH_linux_$(ARCH)))

bin/macos/prometheus: OS=darwin
bin/macos/prometheus: SHA256=e03a43d98955ac3500f57353ea74b5df829074205f195ea6b3b88f55c4575c79
bin/macos/prometheus: APP_ARCH=$(APP_ARCH_linux_x86_64)

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
