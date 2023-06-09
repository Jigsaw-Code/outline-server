VERSION=2.37.1

.PHONY: all
all: bin/linux/prometheus bin/macos/prometheus

bin/linux/prometheus: OS=linux
bin/linux/prometheus: SHA256=753f66437597cf52ada98c2f459aa8c03745475c249c9f2b40ac7b3919131ba6

bin/macos/prometheus: OS=darwin
bin/macos/prometheus: SHA256=e03a43d98955ac3500f57353ea74b5df829074205f195ea6b3b88f55c4575c79

bin/%/prometheus: TEMPFILE := $(shell mktemp)
bin/%/prometheus:
	node ../../src/build/download_file.mjs --url="https://github.com/prometheus/prometheus/releases/download/v$(VERSION)/prometheus-$(VERSION).$(OS)-amd64.tar.gz" --out="$(TEMPFILE)" --sha256=$(SHA256)
	mkdir -p "$(dir $@)"
	tar -zx -f "$(TEMPFILE)" --strip-components=1 -C "$(dir $@)" prometheus-$(VERSION).$(OS)-amd64/prometheus
	chmod +x "$@"
	rm -f $(TEMPFILE)

.PHONY: clean
clean:
	rm -rf bin
