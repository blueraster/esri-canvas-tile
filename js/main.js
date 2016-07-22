define([
  'esri/map',
  'js/CanvasLayer',
  'js/TileCanvasLayer',
  'dojox/form/HorizontalRangeSlider',
  'dojo/domReady!'
], function (EsriMap, CanvasLayer, TileCanvasLayer, RangeSlider) {

  var map = new EsriMap('map', {
    center: [113.763, 0.334],
    basemap: 'gray',
    zoom: 7
  });

  var gladLayer = new CanvasLayer({
    id: 'gladLayer'
  });

  var testLayer = new TileCanvasLayer({
    id: 'testLayer'
  });

  map.addLayers([testLayer]);

  map.on('zoom-end', function () { console.log('Current zoom level: %s', map.getLevel()); });

  /**
  * Helper to show the dates in the UI
  */
  var presentDatesForUser = function presentDatesForUser (query, julianDate) {
    // This basic setup renders a julian date of 15000 to last day of 2014, if 15000 is passed in
    // make it 15001
    if (julianDate === '15000') { julianDate = '15001'; }
    var year = 2000 + parseInt(julianDate.slice(0, 2));
    var days = julianDate.slice(julianDate.length - 3);
    var dateString = new Date(year, 0, days).toDateString();
    document.querySelector(query).innerHTML = dateString;
  };

  // Create controls and setup listeners
  var slider = new RangeSlider({
    name: 'datepicker',
    value: [0, 2],
    minimum: 0,
    maximum: 2,
    discreteValues: (365 * 2),
    style: 'width:300px',
    onChange: function (values) {
      var from = values[0];
      var to = values[1];
      // Get the julian date
      var fromJulian = from <= 1 ? parseInt(15000 + (from * 365)) : parseInt(16000 + ((from - 1) * 365));
      var toJulian = to <= 1 ? parseInt(15000 + (to * 365)) : parseInt(16000 + ((to - 1) * 365));

      presentDatesForUser('.start-date', fromJulian.toString());
      presentDatesForUser('.end-date', toJulian.toString());

      // Update the layer
      // gladLayer.setDateRange(fromJulian, toJulian);
      testLayer.setDateRange(fromJulian, toJulian);
    }
  }, 'date-slider');

  presentDatesForUser('.start-date', '15000');
  presentDatesForUser('.end-date', '16365');

  document.getElementById('confidence-level').addEventListener('change', function (evt) {
    var target = evt.target;
    // Acceptable values are 'all' or 'confirmed' only
    gladLayer.setConfidenceLevel(target.value);
  });

  // For easier debugging
  window._Map = map;

});
