// --- 1. SETTINGS ---
const apiKey = 'e9380a28-77e7-4c96-8aa7-66f93031a6f6';
let points = [], markers = [], routeLayer = null;
let routeColors = ['blue', 'red', 'green', 'orange', 'purple'], routeColorIndex = 0;

// *** UPDATED: Changed routeLayer to be an array ***
let routeLayers = [];

// Get references to all key elements
const fromInput = document.getElementById('from-loc');
const toInput = document.getElementById('to-loc');
const fromSuggestions = document.getElementById('from-suggestions');
const toSuggestions = document.getElementById('to-suggestions');
const loader = document.getElementById('loader');
const warningEl = document.getElementById('warning-message');
const themeToggle = document.getElementById('theme-toggle');
const summaryEl = document.getElementById('route-summary');
// *** NEW: Add references for via buttons ***
const addLocationBtn = document.getElementById('add-location-btn');
const viaLocationsContainer = document.getElementById('via-locations-container');

// Debounce functions
const debouncedPlotRoute = debounce(plotRoute, 500);
const debouncedFetchAutocomplete = debounce(fetchAutocomplete, 300);
let warningTimeout;

// --- 2. DARK MODE LOGIC ---
if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark-mode');
    themeToggle.checked = true;
}
themeToggle.addEventListener('change', function() {
    if (this.checked) {
        document.body.classList.add('dark-mode');
        localStorage.setItem('theme', 'dark');
    } else {
        document.body.classList.remove('dark-mode');
        localStorage.setItem('theme', 'light');
    }
});

// --- 3. MAP INITIALIZATION ---
const map = L.map('map').setView([-23.506, -47.455], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// --- 4. EVENT LISTENERS ---

// Map click to add a point
map.on('click', function(e) {
    addPoint(e.latlng.lat, e.latlng.lng);
});

// Button clicks
document.getElementById('clear-btn').addEventListener('click', clearMap);
document.getElementById('search-btn').addEventListener('click', plotFromInputs);
document.getElementById('swap-btn').addEventListener('click', () => {
    const fromVal = fromInput.value;
    const toVal = toInput.value;
    const fromLat = fromInput.dataset.lat;
    const fromLng = fromInput.dataset.lng;
    const toLat = toInput.dataset.lat;
    const toLng = toInput.dataset.lng;

    fromInput.value = toVal;
    toInput.value = fromVal;
    
    fromInput.dataset.lat = toLat;
    fromInput.dataset.lng = toLng;
    toInput.dataset.lat = fromLat;
    toInput.dataset.lng = fromLng;
});

// Autocomplete "From" input
fromInput.addEventListener('input', (e) => {
    debouncedFetchAutocomplete(e.target.value, fromSuggestions, fromInput);
});

// Autocomplete "To" input
toInput.addEventListener('input', (e) => {
    debouncedFetchAutocomplete(e.target.value, toSuggestions, toInput);
});

// Hide suggestions when clicking anywhere else
document.addEventListener('click', (e) => {
    if (!fromInput.contains(e.target)) fromSuggestions.style.display = 'none';
    if (!toInput.contains(e.target)) toSuggestions.style.display = 'none';
});

// *** NEW: "Add location" button listener ***
addLocationBtn.addEventListener('click', addViaInput);

// --- 5. CORE FUNCTIONS ---

/**
 * Adds a new point to the map (max 5).
 */
/**
 * --- *** NEW: Adds a "Via" input to the sidebar *** ---
 */
function addViaInput() {
    // Get all location inputs (from, to, and via)
    const currentInputs = document.querySelectorAll('#controls input[type="text"]');
    // Check against total point limit (from + via + to)
    if (currentInputs.length >= 5) {
        showWarning("You can only add a maximum of 5 points.");
        return;
    }

    // Create all new elements
    const wrapper = document.createElement('div');
    wrapper.className = 'input-wrapper via-input-wrapper';

    const icon = document.createElement('span');
    icon.className = 'input-icon via-icon';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Via';
    input.autocomplete = 'off';

    const suggestions = document.createElement('div');
    suggestions.className = 'autocomplete-suggestions';

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-loc-btn';
    removeBtn.title = 'Remove location';
    removeBtn.innerHTML = '&ndash;'; // Minus sign

    // Add listeners to new elements
    input.addEventListener('input', (e) => {
        debouncedFetchAutocomplete(e.target.value, suggestions, input);
    });
    removeBtn.addEventListener('click', () => {
        wrapper.remove(); // Remove this "Via" input
    });

    // Append new elements to the DOM
    wrapper.appendChild(icon);
    wrapper.appendChild(input);
    wrapper.appendChild(suggestions);
    wrapper.appendChild(removeBtn);
    viaLocationsContainer.appendChild(wrapper);
}


/**
 * Adds a new point to the map (max 5) - *from map clicks*
 */
function addPoint(lat, lng) {
    if (markers.length >= 5) {
        showWarning("You can only add a maximum of 5 points.");
        return;
    }
    const point = [lat, lng];
    points.push(point);

    const modernIcon = L.divIcon({
        className: 'modern-marker',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
        popupAnchor: [0, -10]
    });

    const marker = L.marker(point, { 
        draggable: true,
        icon: modernIcon
    }).addTo(map);
    
    addMarkerPopup(marker, markers.length + 1); // Use new helper

    marker.on('dragend', function(e) {
        const newLatLng = e.target.getLatLng();
        // Find marker by its ID
        const markerId = L.Util.stamp(e.target);
        const index = markers.findIndex(m => L.Util.stamp(m) == markerId);
        
        if (index > -1) {
            points[index] = [newLatLng.lat, newLatLng.lng];
            debouncedPlotRoute();
        }
    });

    markers.push(marker);
    if (points.length >= 2) {
        plotRoute();
    }
}

/**
 * --- *** NEW HELPER: Creates and binds a marker popup *** ---
 */
function addMarkerPopup(marker, pointNumber) {
    const markerId = L.Util.stamp(marker);
    const popupContainer = document.createElement('div');
    popupContainer.innerHTML = `<b>Point ${pointNumber}</b>`;
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-marker-btn';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removePoint(markerId);
    });
    popupContainer.appendChild(removeBtn);
    marker.bindPopup(popupContainer);
    // Only open popup if it's the most recent marker
    if (pointNumber === markers.length + 1) {
        marker.openPopup();
    }
}

/**
 * Removes a single point from the map and arrays.
 */
function removePoint(markerId) {
    let markerIndex = -1;
    for (let i = 0; i < markers.length; i++) {
        if (L.Util.stamp(markers[i]) == markerId) {
            markerIndex = i;
            break;
        }
    }

    if (markerIndex > -1) {
        map.removeLayer(markers[markerIndex]);
        markers.splice(markerIndex, 1);
        points.splice(markerIndex, 1);

        // Re-label remaining marker popups
        markers.forEach((marker, index) => {
            addMarkerPopup(marker, index + 1); // Use helper to relabel
        });

        if (points.length >= 2) {
            plotRoute();
        } else if (routeLayer) {
            map.removeLayer(routeLayer);
            routeLayer = null;
            summaryEl.innerHTML = '';
            summaryEl.style.display = 'none';
        }
    }
}

/**
 * Fetches and displays the route from GraphHopper.
 */
async function plotRoute() {
    // Clear only the *previous route line* and summary
    if (routeLayer) {
        map.removeLayer(routeLayer);
        routeLayer = null;
    }
    summaryEl.innerHTML = '';
    summaryEl.style.display = 'none';

    if (points.length < 2) { return; } // Stop if not enough points

    const pointStrings = points.map(p => `point=${p[0]},${p[1]}`);
    const url = `https://graphhopper.com/api/1/route?${pointStrings.join('&')}&vehicle=foot&points_encoded=false&key=${apiKey}`;

    try {
        loader.classList.add('visible'); 
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();

        if (data.paths && data.paths.length > 0) {
            const coordinates = data.paths[0].points.coordinates;
            const leafletPoints = coordinates.map(coord => [coord[1], coord[0]]);
            const color = routeColors[routeColorIndex % routeColors.length];
            
            // Increment color *after* using it, but before next plot
            routeColorIndex++; 
            
            routeLayer = L.polyline(leafletPoints, { color: color, weight: 5 }).addTo(map);

            // Display summary
            const distance = data.paths[0].distance;
            const time = data.paths[0].time;
            const km = (distance / 1000).toFixed(1);
            const minutes = Math.floor(time / 60000);
            const seconds = ((time % 60000) / 1000).toFixed(0);

            summaryEl.innerHTML = `
                <span class="route-time">${minutes} min ${seconds} s</span>
                <span class="route-dist">(${km} km)</span>
            `;
            summaryEl.style.display = 'block';

            map.fitBounds(routeLayer.getBounds(), { 
                animate: true, 
                padding: [60, 60]
            });

        } else {
            console.error('No path found in API response:', data);
            alert("Sorry, a route could not be found for these points.");
        }
    } catch (error) {
        console.error('Error fetching route:', error);
        alert(`Error fetching route: ${error.message}`);
    } finally {
        loader.classList.remove('visible');
    }
}

/**
 * --- *** NEW HELPER: Clears only map layers *** ---
 * This is called before plotting from inputs, to keep inputs intact.
 */
function clearMapLayers() {
    if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }
    summaryEl.innerHTML = '';
    summaryEl.style.display = 'none';
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
    points = [];
    routeColorIndex = 0;
}

/**
 * --- *** UPDATED: Clears *everything* *** ---
 * This is for the "Clear All" button.
 */
function clearMap() {
    clearMapLayers(); // Clears the map
    viaLocationsContainer.innerHTML = ''; // Clears the via inputs
}

/**
 * Fetches autocomplete suggestions as the user types.
 */
async function fetchAutocomplete(query, suggestionsEl, inputEl) {
    if (query.length < 3) {
        suggestionsEl.style.display = 'none';
        return; 
    }
    const url = `https://graphhopper.com/api/1/geocode?q=${encodeURIComponent(query)}&key=${apiKey}&limit=5`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.hits && data.hits.length > 0) {
            showSuggestions(data.hits, suggestionsEl, inputEl);
        } else {
            suggestionsEl.style.display = 'none';
        }
    } catch (error) {
        console.error("Autocomplete fetch error:", error);
        suggestionsEl.style.display = 'none';
    }
}

/**
 * Renders the autocomplete suggestions in the dropdown.
 */
function showSuggestions(hits, suggestionsEl, inputEl) {
    suggestionsEl.innerHTML = ''; 
    hits.forEach(hit => {
        const item = document.createElement('div');
        item.className = 'suggestion-item';
        const name = hit.name;
        const address = [hit.street, hit.city, hit.state, hit.country]
                          .filter(Boolean) 
                          .join(', ');
        
        // This makes the input value "Name, City, Country"
        const displayValue = [name, ...address.split(', ')]
                             .filter((value, index, self) => value && self.indexOf(value) === index)
                             .join(', ');

        item.innerHTML = `
            <strong>${name}</strong>
            <small>${address}</small>
        `;
        item.addEventListener('click', () => {
            inputEl.value = displayValue; // Set full name to prevent geocoding errors
            inputEl.dataset.lat = hit.point.lat;
            inputEl.dataset.lng = hit.point.lng;
            suggestionsEl.style.display = 'none';
        });
        suggestionsEl.appendChild(item);
    });
    suggestionsEl.style.display = 'block';
}

/**
 * --- *** RENAMED & REFACTORED: Plots route from sidebar inputs *** ---
 */
async function plotFromInputs() {
    loader.classList.add('visible'); 
    
    // *** Call the new function that *only* clears the map ***
    clearMapLayers(); 

    // 1. Get all location inputs in order
    const locationInputs = [
        fromInput,
        ...viaLocationsContainer.querySelectorAll('input[type="text"]'),
        toInput
    ];

    // 2. Create an array of geocoding promises
    const geocodePromises = locationInputs.map(input => {
        const query = input.value;
        if (!query) return null; // Skip empty inputs
        if (input.dataset.lat && input.dataset.lng) {
            return Promise.resolve([input.dataset.lat, input.dataset.lng]);
        }
        return geocode(query); // Fallback geocode
    });

    try {
        // 3. Run all geocoding requests
        const allCoords = (await Promise.all(geocodePromises))
                            .filter(Boolean); // Filter out nulls

        if (allCoords.length < 2) {
            showWarning("Please provide at least two locations.");
            loader.classList.remove('visible');
            return;
        }

        // 4. Set the global 'points' array
        points = allCoords;

        // 5. Create all markers
        const modernIcon = L.divIcon({
            className: 'modern-marker',
            iconSize: [16, 16],
            iconAnchor: [8, 8],
            popupAnchor: [0, -10]
        });

        markers = points.map((point, index) => {
            const marker = L.marker(point, { 
                draggable: true,
                icon: modernIcon
            }).addTo(map);

            addMarkerPopup(marker, index + 1); // Use helper

            marker.on('dragend', function(e) {
                const newLatLng = e.target.getLatLng();
                const markerId = L.Util.stamp(e.target);
                const index = markers.findIndex(m => L.Util.stamp(m) == markerId);
                if (index > -1) {
                    points[index] = [newLatLng.lat, newLatLng.lng];
                    debouncedPlotRoute();
                }
            });
            return marker;
        });

        // 6. Plot the route ONCE
        plotRoute();

        // 7. Clear dataset properties
        locationInputs.forEach(input => {
            delete input.dataset.lat;
            delete input.dataset.lng;
        });

    } catch (error) {
        alert(`Could not find locations: ${error.message}`);
        loader.classList.remove('visible');
    } 
    // loader is hidden by plotRoute()
}

/**
 * Fallback geocoder (if no suggestion is clicked).
 */
async function geocode(query) {
    const url = `https://graphhopper.com/api/1/geocode?q=${encodeURIComponent(query)}&key=${apiKey}&limit=1`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.hits && data.hits.length > 0) {
        const { lat, lng } = data.hits[0].point;
        return [lat, lng];
    } else {
        throw new Error(`'${query}' was not found.`);
    }
}

/**
 * Debounce helper function.
 */
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

/**
 * Shows the warning message.
 */
function showWarning(message) {
    clearTimeout(warningTimeout); 
    warningEl.textContent = message;
    warningEl.style.display = 'block';
    setTimeout(() => {
        warningEl.style.opacity = '1';
    }, 10);
    warningTimeout = setTimeout(() => {
        warningEl.style.opacity = '0';
        setTimeout(() => {
            warningEl.style.display = 'none';
        }, 300);
    }, 3000);
}