Esri Canvas Tile Layer
======================
> A work in progress.

See [https://blueraster.github.io/esri-canvas-tile/](https://blueraster.github.io/esri-canvas-tile/)

We are trying to render tiles to canvas so we can read, filter, and modify the image data in canvas.

For a working leaflet version, See [https://blueraster.github.io/esri-canvas-tile/mapnik-leaflet.html](https://blueraster.github.io/esri-canvas-tile/mapnik-leaflet.html)

### Layer API (in Progress)
> This will describe the methods for interacting with this particular layer. This component inherits from `esri/layers/Layer`.


#### Constructor
`var canvasLayer = new CanvasLayer();`

#### Methods
##### show
`canvasLayer.show()`
- Show the layer

##### hide
`canvasLayer.show()`
- Hide the layer

##### forceUpdate
`canvasLayer.forceUpdate()`
- Force the canvas to clear the tiles and fetch new tiles

### Known Issues
- Setting the color of the pixels to anything
  - We are extracting information from the raw pixel data, which is in rgba format, if we modify the rgb values to set the color, we lose the data.  We need that data to decode it and retrieve date/confidence information.

### TODOS
 - Add in data decoding functions
 - Add formatting functions to take the decoded data and export it in various formats
 - Look into various methods for optimizations, such as caching, and client side re-rendering of pixel data when filters are applied.
 - Investigate work arounds for the [Known Issues](#known-issues) above
