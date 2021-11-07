#!/bin/bash
curl --silent --location "https://api.github.com/repos/jaoafa/jaoweb-docs/releases?per_page=1" > temp-docs-release.json
cat temp-docs-release.json | grep '"browser_download_url":' | sed -E 's/.*"([^"]+)".*/\1/'
cat temp-docs-release.json | grep '"browser_download_url":' | sed -E 's/.*"([^"]+)".*/\1/'


# jaowebかjaoweb-docsのリリースどちらが遅いものかを調べて、それをダウンロード、適用する
# いっそのことshでやらずにnodeとかphpとかpythonとかでもいいかも