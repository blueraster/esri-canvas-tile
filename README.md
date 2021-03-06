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
`canvasLayer.hide()`
- Hide the layer

##### forceUpdate
`canvasLayer.forceUpdate()`
- Force the canvas to clear the tiles and fetch new tiles

##### setConfidenceLevel
`canvasLayer.setConfidenceLevel(confidence)`
- Set's the desired confidence level for the layer
- Sole argument is a string with value of either `all` or `confirmed`.

##### setMinimumDate
`canvasLayer.setMinimumDate(minDate)`
- Set's the minimum date for the layer
- Currently must be in numeric format where 15000 is the base, then add the number of days to it

##### setMaximumDate
`canvasLayer.setMaximumDate(maxDate)`
- Set's the maximum date level for the layer
- Currently must be in numeric format where 15000 is the base, then add the number of days to it

##### setDateRange
`canvasLayer.setDateRange(minDate, maxDate)`
- Set's the minimum and maximum date level for the layer
- Currently must be in numeric format where 15000 is the base, then add the number of days to it

### Known Issues
- The data seems to stop rendering after zoom level 12. Will need to scale tiles appropriately

### TODOS
 - Look into various methods for optimizations, such as caching, and client side re-rendering of pixel data when filters are applied.
 - Investigate work arounds for the [Known Issues](#known-issues) above
