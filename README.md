# maptalks.tileclusterlayer

markers cluster by tile

## how to use?

```js
function getClusterMarkerSymbol(count) {
  const symbol = {
    markerType: "ellipse",
    markerWidth: 65,
    markerHeight: 65,
    markerFill: "#fff",
    markerLineWidth: 0,
    markerFillOpacity: 1,
    markerOpacity: 1,
    textSize: 15,
    textName: count,
    textHaloFill: "#000",
    textHaloRadius: 1.2,
    textFill: "#fff",
  };
  if (count > 5000) {
    symbol.markerFill = "red";
  } else if (count > 1000) {
    symbol.markerFill = "yellow";
  }
  return symbol;
}

const tileClusterLayer = new maptalks.TileClusterLayer("tileClusterLayer", {
  maxClusterZoom: 18,
  //when cluster marker mouseover will show children markers
  clusterDispersion: true,
  // show cluster marker children max count
  dispersionCount: 500,
  //get cluster marker symbol
  clusterMarkerSymbol: getClusterMarkerSymbol,
  // cluster marker,marker events
  markerEvents: {
    click: function (e) {
      console.log(e);
      if(e.target.getProperties().isCluster){
          console.log('is cluster marker');
      }
    },
  },
});
tileClusterLayer.addTo(map);

const geojson={
     type: 'FeatureCollection',
    features: [
                ...
            ]
};
tileClusterLayer.setData(geojson);

```
