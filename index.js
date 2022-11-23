/*
* JS file for ENTR 550 project's website
*/


(function() {
  "use strict";
  // Earth's radius. Used to convert latitude and longitude differenes to distances.
  const EARTH_RADIUS_MILES = 3958.8;
  let mapCenter = [42.295949815364075, -83.71039687364726] // North campus by default
  let map;  // The Google Map
  let placeService; // Google Maps placeService for the map.
  let infowindow; // Google maps InfoWindow
  // Google maps marker for the parking Lots
  //  format: {dataIndex1: marker1, ...}
  let markers = {};
  let destinationMarker;  // Google maps for the destination set by the user
  let myTable;  // The data table
  const HEADERS = {
    // format: {id: headerText}
    "index": "index",
    "id": "ID",
    "address": "Address",
    "hours": "Hours Enforced",
    "visitor": "Visitor Paid Parking (Y/N)",
    "yellow": "Yellow Pass (Y/N)",
    "orange": "Orange Pass (Y/N)",
    "blue":	"Blue Pass (Y/N)",
    "gold": "Gold Pass (Y/N)",
    "housing": "Housing lot (Y/N)",
    "bus": "Bus Service (Y/N)",
    "handicap": "Handicap (Y/N)",
    "van": "Van Spaces (Y/N)",
    "motorcycle": "Motorcycle (Y/N)",
    "ev": "EV Charging (Y/N)",
    "latitude": "latitude",
    "longitude": "longitude",
    "placeId": "place_id",
    "distance": "Distance to destination (miles)",
    "parkingPass": "Parking Permit",
    "misc": "Bus Service / Handicap / Van Spaces / Motorcycle / EV Charging"
  }
  let idIndex = {}; // Format: {columnId: columnIndex, ...}
  // Columns to hide
  const VISIBLE_COLUMNS = ["id", "address", "hours", "parkingPass", "misc"];
  // Indices of the columns for quick access
  const PARKING_PASSES = ["visitor", "yellow", "orange", "blue", "gold", "housing"];
  const MISC = ["bus", "handicap", "van", "motorcycle", "ev"]
  const MISC_TITLES = {
    "bus": "Bus Service",
    "handicap": "Handicap",
    "van": "Van Spaces",
    "motorcycle": "Motorcycle",
    "ev": "EV Charging"
  }

  window.addEventListener("load", initialize);

  function initialize() {
    // dataTable must be initialized first because other functions depend on it.
    initDataTable();
    addIconsToTable();
    addLinksToTable();
    initFilters();
    initMap();
    addMapMarkers();
    initLocationSearch();
    updateTable();
  }


  /* Initialize the data table:
    - enable sorting
    - hide columns useless to user, e.g. latitude, longitude, ...
    - add contents to table for readability
  */
  function initDataTable() {
    $("#myTable").prepend($("<thead></thead>").append($("#myTable tr")[0]));
    // Add id attributes to table headers Using data in HEADERS; populate idIndex
    let headerRow = $("#myTable thead tr");
    let headers = headerRow.find("th");
    for (const [id, name] of Object.entries(HEADERS)) {
      let header = headerRow.find(`th:contains('${name}')`)[0];
      header.id = id;
      idIndex[id] = headers.index(header);
    }
    // Make table sortable; hide columns
    let idxToHide = [];
    for (const [id, name] of Object.entries(HEADERS)) {
      if (VISIBLE_COLUMNS.indexOf(id) < 0) {
        idxToHide.push(idIndex[id]);
      }
    }
    myTable = $('#myTable').DataTable( {
      "columnDefs": [ {
        "targets": [idIndex["parkingPass"], idIndex["misc"]],
        "orderable": false
      }, {
        "targets": idxToHide,
        "visible": false
      }]
    } );

  }

  // Populate columns "#parkingPass" and "#misc" with icons
  function addIconsToTable() {
    myTable.rows().every( function( rowIdx, tableLoop, rowLoop ) {
      PARKING_PASSES.forEach(id => {
        if (this.data()[idIndex[id]].toLowerCase().includes("y")) {
          myTable.cell({row: rowIdx, column: idIndex["parkingPass"]})
          .data(this.data()[idIndex["parkingPass"]] + `<span class="parkingPass ${id}"></span>`);
        }
      });
      MISC.forEach(id => {
        if (this.data()[idIndex[id]].toLowerCase().includes("y")) {
          myTable.cell({row: rowIdx, column: idIndex["misc"]})
          .data(this.data()[idIndex["misc"]] +
            `<span class="misc ${id}" title="${MISC_TITLES[id]}"></span>`
          );
        }
      });
      let visitor = this.data()[idIndex["visitor"]];
    } );
    let miscHeader = $(myTable.column(idIndex["misc"]).header());
    miscHeader.append("</br>");
    MISC.forEach((id, i) => {
      if (i != 0) {
        miscHeader.append("/");
      }
      miscHeader.append(`<span class="misc ${id}" title="${MISC_TITLES[id]}"></span>`);
    });
  }

  // Add Google Maps links to a column of the table
  function addLinksToTable() {
    $("#address").append(
      " or Coordinates",
      $("</br>"), "(links to Google Map)");
    for (let rowIdx = 0; rowIdx < myTable.rows().count(); rowIdx++) {
      let cell = myTable.cell({row: rowIdx, column: idIndex["address"]}).nodes().to$();
      let link = $("<a></a>").html(cell.html());
      link.click(() => {redirectToGoogleMap(rowIdx);});
      cell.empty();
      cell.append(link);
    }
  }

  // Initialize data filters
  function initFilters() {
    $("#destinationLat").val(mapCenter[0]);
    $("#destinationLng").val(mapCenter[1]);
    for (let dist = 2; dist <= 50; dist += 2) {
      let option = $(document.createElement("option"));
      option.attr("value", dist/10);
      option.text(dist/10);
      $("#maxDistance").append(option);
    }
    $("#maxDistance").val(5);
    $.fn.dataTable.ext.search.push(searchFunction);
    $("#maxDistance").change(updateTable);
    PARKING_PASSES.forEach(id => {
      $("#show" + id).click(updateTable);
    });
    $("#deselectPasses").click(() => {
      $("label.parkingPass input").prop("checked", false)
      updateTable();
    });
    MISC.forEach(id => {
      $("#show" + id).after("<span> " + MISC_TITLES[id] + " </span>");
      $("#show" + id).click(updateTable);
    });
    $('#min, #max').keyup(updateTable);
  }

  // Search function for the data filters
  function searchFunction(settings, data, dataIndex) {
    let includeRow = true;
    includeRow *= Number(data[idIndex["distance"]]) <= Number($("#maxDistance").val());
    let hasPass = false;
    PARKING_PASSES.forEach(id => {
      hasPass = hasPass || ($("#show" + id)[0].checked && data[idIndex[id]].toLowerCase().includes("y"));
    });
    let hasMisc = true;
    MISC.forEach(id => {
      hasMisc *= !$("#show" + id)[0].checked || data[idIndex[id]].toLowerCase().includes("y");
    });
    includeRow *= hasPass * hasMisc;
    markers[dataIndex].visible = includeRow;
    let lat = $('#destinationLat').val();
    let lng = $('#destinationLng').val();
    if (dataIndex == myTable.rows().count()-1) {
      // Very stupid way to refresh the map. Please change if you know any better way.
      map.setCenter(new google.maps.LatLng(Number(lat) + 0.0006 * Math.random(), lng));
    }
    return includeRow;
  }

  // Update the data table
  function updateTable() {
    myTable.draw();
  }
  // Initialize the map
  function initMap() {
    map = new google.maps.Map(document.getElementById("map"), {
      center: { lat: 42.295949815364075, lng: -83.71039687364726 }, // north campus
      zoom: 15,
    });
    placeService = new google.maps.places.PlacesService(map);
    infowindow = new google.maps.InfoWindow();
  }

  /* Add a map marker for each parking lot
  */
  function addMapMarkers() {
    myTable.rows().every( function( rowIdx, tableLoop, rowLoop ) {
      let data = this.data();
      let marker = new google.maps.Marker({
        map,
        position: new google.maps.LatLng(data[idIndex["latitude"]], data[idIndex["longitude"]]),
        label: { text: data[idIndex["id"]], className: 'marker-label' }
      });
      markers[rowIdx] = marker;
      google.maps.event.addListener(marker, "click", () => {
        let content = $("<div></div>");
        content.append($("<h4></h4>").text(data[idIndex["id"]]));
        ["address", "hours", "parkingPass", "misc"].forEach(headerId => {
          let title = "<b>";
          if (headerId.localeCompare("misc") != 0) {
            title += HEADERS[headerId];
          } else {
            title += "Misc";
          }
          title += ": </b>";
          content.append($("<p></p>").html(title + data[idIndex[headerId]]))
        });
        let link = $("<a></a>").html("Get Google Maps directions");
        link.click(() => {redirectToGoogleMap(rowIdx);});
        content.append(link);
        infowindow.setContent(content[0]);
        infowindow.open(map, marker);
      });
    } );
  }

  // Redirect to Google Map
  // Waypoint is set to the lot in tthe table row with rowIdx
  function redirectToGoogleMap(rowIdx) {
    let data = myTable.row(rowIdx).data();
    let origin = data[idIndex["address"]];
    let originPlaceId = data[idIndex["placeId"]];
    let destination = $("#destinationLat").val() + "," + $("#destinationLng").val();
    let destinationPlaceId = $("#destinationPlaceId").val();
    let uri = "https://www.google.com/maps/";
    if (destinationPlaceId == "") { // destination not set
      uri += "search/?api=1&query=" + origin + "&query_place_id=" + originPlaceId;
    } else {
      uri += "dir/?api=1&waypoints=" + origin + "&waypoints_place_id=" + originPlaceId;
      uri += "&destination=" + destination + "&destination_place_id=" + destinationPlaceId;
    }
    let url = encodeURI(uri);
    window.open(url, '_blank');
  }

  // Initialize the location search bar.
  function initLocationSearch() {
    let umichBounds = new google.maps.LatLngBounds(
        new google.maps.LatLng(42.20860196633682, -83.8326050013779),
        new google.maps.LatLng(42.345571528943836, -83.62670724014419));
    let input = document.getElementById('searchTextField');
    let autocomplete = new google.maps.places.Autocomplete(input, {
      fields: ['place_id', 'geometry', 'name'],
      bounds: umichBounds,
      strictBounds: true
    });
    google.maps.event.addListener(autocomplete, 'place_changed', function() {
      let place = autocomplete.getPlace();
      $('#destinationPlaceId').val(place.place_id);
      $('#destinationName').val(place.name);
      const lat = place.geometry.location.lat();
      const lng = place.geometry.location.lng();
      $('#destinationLat').val(lat);
      $('#destinationLng').val(lng);
      map.setCenter(new google.maps.LatLng(lat, lng));
      updateDestinationMarker();
      updateDistances();
    });
  }


  /* Calculate and add to data table straight-line distances from user entered
    location to parking Lots; sort the table by these distances.
  */
  function updateDistances() {
    const lat1 = $('#destinationLat').val();
    const lon1 = $('#destinationLng').val();
    myTable.rows().every( function( rowIdx, tableLoop, rowLoop ) {
      let lat2 = this.data()[idIndex["latitude"]];
      let lon2 = this.data()[idIndex["longitude"]];
      let distance = Math.acos(Math.sin(lat1*Math.PI/180)*Math.sin(lat2*Math.PI/180)
        +Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.cos((lon2-lon1)*Math.PI/180))*3958.8;
      myTable.cell({row: rowIdx, column: idIndex["distance"]}).data(Math.round(distance * 100) / 100);
    } );
    myTable.column("#distance").visible(true);
    myTable.order( [ idIndex["distance"], 'asc' ] ).draw();
  }

  function updateDestinationMarker() {
    if (destinationMarker) {
      destinationMarker.setMap(null);
    }
    destinationMarker = new google.maps.Marker({
      map,
      position: new google.maps.LatLng($('#destinationLat').val(), $('#destinationLng').val())
    });
    google.maps.event.addListener(destinationMarker, "click", () => {
      const content = $("<div></div>");
      const nameElement = $("<h4></h4>").text($("#destinationName").val());
      const placeAddressElement = $("<p></p>").text($("#searchTextField").val());
      content.append(nameElement, placeAddressElement);
      infowindow.setContent(content[0]);
      infowindow.open(map, destinationMarker);
    });
  }
})();
