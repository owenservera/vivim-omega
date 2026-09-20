.PHONY: seed test verify render clean

seed:
	bin/run.sh init --seed data/

test:
	python3 -m unittest discover -s tests -v

verify:
	python3 tools/hash.py --check MANIFEST.json
	python3 src/query.py --rebuild-indexes --check

render:
	python3 src/render.py --all --out docs/generated.md

clean:
	rm -rf log/ indexes/
