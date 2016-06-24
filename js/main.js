define([
  'esri/map',
  'js/CanvasLayer'
], function (EsriMap, CanvasLayer, TiledLayer) {

  var map = new EsriMap('map', {
    center: [113.763, 0.334],
    basemap: 'gray',
    zoom: 7
  });

  var mapnikLayer = new CanvasLayer({
    id: 'mapnikLayer'
  });

  map.addLayer(mapnikLayer);

  // For easier debugging
  window._Map = map;

});
