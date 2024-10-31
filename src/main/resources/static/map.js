let map, hexLayer;

const GeoUtils = {
    EARTH_RADIUS_METERS: 6371000,

    radiansToDegrees: (r) => r * 180 / Math.PI,
    degreesToRadians: (d) => d * Math.PI / 180,

    getDistanceOnEarthInMeters: (lat1, lon1, lat2, lon2) => {
        const lat1Rad  = GeoUtils.degreesToRadians(lat1);
        const lat2Rad  = GeoUtils.degreesToRadians(lat2);
        const lonDelta = GeoUtils.degreesToRadians(lon2 - lon1);
        const x = Math.sin(lat1Rad) * Math.sin(lat2Rad) +
            Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.cos(lonDelta);
        return GeoUtils.EARTH_RADIUS_METERS * Math.acos(Math.max(Math.min(x, 1), -1));
    }
};

const ZOOM_TO_H3_RES_CORRESPONDENCE = {
    5: 1,
    6: 2,
    7: 3,
    8: 3,
    9: 4,
    10: 5,
    11: 6,
    12: 6,
    13: 7,
    14: 8,
    15: 9,
    16: 9,
    17: 10,
    18: 10,
    19: 11,
    20: 11,
    21: 12,
    22: 13,
    23: 14,
    24: 15,
};

const H3_RES_TO_ZOOM_CORRESPONDENCE = {};
for (const [zoom, res] of Object.entries(ZOOM_TO_H3_RES_CORRESPONDENCE)) {
    H3_RES_TO_ZOOM_CORRESPONDENCE[res] = zoom;
}

const getH3ResForMapZoom = (mapZoom) => {
    return ZOOM_TO_H3_RES_CORRESPONDENCE[mapZoom] ?? Math.floor((mapZoom - 1) * 0.7);
};

const h3BoundsToPolygon = (lngLatH3Bounds) => {
    lngLatH3Bounds.push(lngLatH3Bounds[0]); // "close" the polygon
    return lngLatH3Bounds;
};

/**
 * Parse the current Query String and return its components as an object.
 */
const parseQueryString = () => {
    const queryString = window.location.search;
    const query = {};
    const pairs = (queryString[0] === '?' ? queryString.substr(1) : queryString).split('&');
    for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i].split('=');
        query[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1] || '');
    }
    return query;
};

const queryParams = parseQueryString();

const copyToClipboard = (text) => {
    const dummy = document.createElement("textarea");
    document.body.appendChild(dummy);
    dummy.value = text;
    dummy.select();
    document.execCommand("copy");
    document.body.removeChild(dummy);
};

var app = new Vue({
    el: "#app",

    data: {
        searchH3Id: undefined,
        gotoLatLon: undefined,
        currentH3Res: undefined,

    },

    computed: {
    },

    methods: {

        computeAverageEdgeLengthInMeters: function(vertexLocations) {
            let totalLength = 0;
            let edgeCount = 0;
            for (let i = 1; i < vertexLocations.length; i++) {
                const [fromLat, fromLng] = vertexLocations[i - 1];
                const [toLat, toLng] = vertexLocations[i];
                const edgeDistance = GeoUtils.getDistanceOnEarthInMeters(fromLat, fromLng, toLat, toLng);
                totalLength += edgeDistance;
                edgeCount++;
            }
            return totalLength / edgeCount;
        },

        updateMapDisplay: function() {
            if (hexLayer) {
                hexLayer.remove();
            }

            hexLayer = L.layerGroup().addTo(map);

            const zoom = map.getZoom();
            this.currentH3Res = getH3ResForMapZoom(zoom);
            const { _southWest: sw, _northEast: ne} = map.getBounds();

            const boundsPolygon =[
                [ sw.lat, sw.lng ],
                [ ne.lat, sw.lng ],
                [ ne.lat, ne.lng ],
                [ sw.lat, ne.lng ],
                [ sw.lat, sw.lng ],
            ];

            const h3s = h3.polygonToCells(boundsPolygon, this.currentH3Res);

            for (const h3id of h3s) {

                const polygonLayer = L.layerGroup()
                    .addTo(hexLayer);

                const isSelected = h3id === this.searchH3Id;

                const style = isSelected ? { fillColor: "orange" } : {};

                const h3Bounds = h3.cellToBoundary(h3id);
                const averageEdgeLength = this.computeAverageEdgeLengthInMeters(h3Bounds);
                const cellArea = h3.cellArea(h3id, "m2");

                const tooltipText = `
                Cell ID: <b>${ h3id }</b>
                <br />
                Average edge length (m): <b>${ averageEdgeLength.toLocaleString() }</b>
                <br />
                Cell area (m^2): <b>${ cellArea.toLocaleString() }</b>
                `;

                const h3Polygon = L.polygon(h3BoundsToPolygon(h3Bounds), style)
                    .on('click', () => copyToClipboard(h3id))
                    .bindTooltip(tooltipText)
                    .addTo(polygonLayer);

                // less SVG, otherwise perf is bad
                if (Math.random() > 0.8 || isSelected) {
                    var svgElement = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                    svgElement.setAttribute('xmlns', "http://www.w3.org/2000/svg");
                    svgElement.setAttribute('viewBox', "0 0 200 200");
                    svgElement.innerHTML = `<text x="20" y="70" class="h3Text">${h3id}</text>`;
                    var svgElementBounds = h3Polygon.getBounds();
                    L.svgOverlay(svgElement, svgElementBounds).addTo(polygonLayer);
                }
            }
        },


        updateMapDisplay2: function() {

            // call http://localhost:8080/h3
            // split by ,
            // for each ID
            fetch('http://localhost:8080/h3').
                then(response => {
                    response.text().then(function (text) {
                      const parts = text.split(',');

                      for (const p of parts) {

                        //console.log(p);
                        const x = p.split('|');
                        const h3id = x[0];
                        const count = x[1];

                        const fill =
                          count > 10000  ? '#D60A00' :
                          count > 1000   ? '#FF6600' :
                          count > 100   ? '#FF9900' :
                          count > 10   ? '#FFCC00' :
                          '#FFFF00';

                        var style = { stroke: 0.9, color: fill, fill: true, fillOpacity: 0.8 };

                        L.polygon(h3.cellToBoundary(h3id), style).addTo(map);


                        //const polygonLayer = L.layerGroup().addTo(hexLayer);
                        //const style = true ? { fillColor: "orange" } : {};
                        //const h3Bounds = h3.cellToBoundary(h3id);
                        //console.log(h3Bounds);
                        //const h3Polygon = L.polygon(h3BoundsToPolygon(h3Bounds), style).addTo(polygonLayer);
                      }
                    });

                })
                .catch(err => {
                  console.log(err);
                })
        },


        gotoLocation: function() {
            const [lat, lon] = (this.gotoLatLon || "").split(",").map(Number);
            if (Number.isFinite(lat) && Number.isFinite(lon)
                && lat <= 90 && lat >= -90 && lon <= 180 && lon >= -180) {
                map.setView([lat, lon], 16);
            }
        },

        findH3: function() {
            if (!h3.isValidCell(this.searchH3Id)) {
                return;
            }
            const h3Boundary = h3.cellToBoundary(this.searchH3Id);

            let bounds = undefined;

            for ([lat, lng] of h3Boundary) {
                if (bounds === undefined) {
                    bounds = new L.LatLngBounds([lat, lng], [lat, lng]);
                } else {
                    bounds.extend([lat, lng]);
                }
            }

            map.fitBounds(bounds);

            const newZoom = H3_RES_TO_ZOOM_CORRESPONDENCE[h3.getResolution(this.searchH3Id)];
            map.setZoom(newZoom);
        }
    },

    beforeMount() {
    },

    mounted() {
        document.addEventListener("DOMContentLoaded", () => {
            map = L.map('mapid', {'worldCopyJump': true});

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                minZoom: 0,
                maxNativeZoom: 19,
                maxZoom: 19,
                attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap contributors</a>'
            }).addTo(map);

            //pointsLayer = L.layerGroup([]).addTo(map);

            const initialLat = queryParams.lat ?? 0;
            const initialLng = queryParams.lng ?? 0;
            const initialZoom = queryParams.zoom ?? 4;
            map.setView([initialLat, initialLng], initialZoom);


            this.updateMapDisplay2();

            /*
            map.on("zoomend", this.updateMapDisplay);
            map.on("moveend", this.updateMapDisplay);



            const { h3 } = queryParams;
            console.log(h3)
            if (h3) {
                this.searchH3Id = h3;
                window.setTimeout(() => this.findH3(), 50);
            }

            this.updateMapDisplay();
            */
        });
    }
});
