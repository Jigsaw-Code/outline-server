VERSION=2.37.1

.PHONY: all
all: bin/linux/prometheus bin/macos/prometheus

bin/linux/prometheus: BASENAME=prometheus-$(VERSION).linux-amd64
bin/macos/prometheus: BASENAME=prometheus-$(VERSION).darwin-amd64
bin/linux/prometheus bin/macos/prometheus: sha256sums.txt 
	VERSION=$(VERSION) BASENAME="$(BASENAME)" OUTPUT="$@" ./download_prometheus.sh

sha256sums.txt:
	wget --quiet https://github.com/prometheus/prometheus/releases/download/v$(VERSION)/sha256sums.txt -O $@

.PHONY: clean
clean:
	rm -rf bin
