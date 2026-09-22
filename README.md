# dither-dither

[demo](https://thometnanni.github.io/dither-dither/)

`npm i @krisenstab/dither-dither`

`import '@krisenstab/dither-dither'`

`<dither-dither src="…"></dither-dither>`

## What?

This is a web component for monochrome dithering. It works on images and videos. It's based on shaders and should be quite fast. It uses a blue noise threshold map. But you can also specify a custom threshold map.

## Why?

- looks nice
- small media files – in most cases you'll get away with using [images](https://github.com/thometnanni/dither-dither/blob/main/public/hermannstrasse.jpg) and [videos](https://github.com/thometnanni/dither-dither/blob/main/public/hermannstrasse.mp4) of atrocious quality

## How?

install the package through npm

```sh
npm i @krisenstab/dither-dither
```

import in javascript…

```js
import "@krisenstab/dither-dither";
```

…or directly in your html file

```html
<script type="module">
  import "@krisenstab/dither-dither";
</script>
```

use

```html
<!-- images -->
<dither-dither src="./hermannstrasse.jpg"></dither-dither>

<!-- videos (the `video` attribute can be omitted for filenames ending in .mp4, .webm, .ogg) -->
<dither-dither src="./hermannstrasse.mp4" video></dither-dither>

<!-- custom threshold map -->
<dither-dither src="./hermannstrasse.jpg" threshold-map="./bayer8x8.png"></dither-dither>

<!-- cross origin, sets cross origing mode to `anonymous` see: https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/crossOrigin -->
<dither-dither cross-origin src="https://…"></dither-dither>

<!-- by default a webgl context is only created once the element is in the viewport. to disable that behaviour set the `immediate` attribute -->
<dither-dither src="./hermannstrasse.jpg" immediate></dither-dither>
```

## Development

```sh
npm install
```

### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Compile and Minify Library

```sh
npm run build
```

### Compile and Minify static Page

```sh
npm run build:site
```

### Lint with [ESLint](https://eslint.org/)

```sh
npm run lint
```
