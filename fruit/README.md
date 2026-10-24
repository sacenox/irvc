# External themes

* derived from https://github.com/mbadolato/iTerm2-Color-Schemes/tree/master/yaml
* run `npm run schemes` to rebuild

The built-in themes are fruit definitions too, but they are not files: they live
in `web/src/lib/fruit.ts` and are defaults only.

The YAML format is an extension of the YAML format
used by [Gogh](https://github.com/Gogh-Co/Gogh/),
with the optional extra keys:

* `badge`
* `bold` (defaults to `foreground`)
* `cursor_guide` (defaults to `cursor`)
* `cursor_text` (defaults to `foreground`)
* `link`
* `selection_text` (defaults to `background`)
* `selection` (defaults to `foreground`)
* `tab`
* `underline`
