// --- 1. SETTINGS ---
const apiKey = 'e9380a28-77e7-4c96-8aa7-66f93031a6f6';
let points = [], markers = [], routeLayer = null;
let routeColors = ['blue', 'red', 'green', 'orange', 'purple'], routeColorIndex = 0;

// Get references to all key elements
const fromInput = document.getElementById('from-loc');
const toInput = document.getElementById('to-loc');
const fromSuggestions = document.getElementById('from-suggestions');
const toSuggestions = document.getElementById('to-suggestions');
const loader = document.getElementById('loader');
const warningEl = document.getElementById('warning-message');
const themeToggle = document.getElementById('theme-toggle');
const summaryEl = document.getElementById('route-summary');
const addLocationBtn = document.getElementById('add-location-btn');
// *** REMOVED viaLocationsContainer, it's not needed ***

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
map.on('click', function(e) { addPoint(e.latlng.lat, e.latlng.lng); });
document.getElementById('clear-btn').addEventListener('click', clearMap);
document.getElementById('search-btn').addEventListener('click', plotFromInputs); 
// *** REMOVED old swap-btn listener ***
fromInput.addEventListener('input', (e) => { debouncedFetchAutocomplete(e.target.value, fromSuggestions, fromInput); });
toInput.addEventListener('input', (e) => { debouncedFetchAutocomplete(e.target.value, toSuggestions, toInput); });
document.addEventListener('click', (e) => {
    if (!fromInput.contains(e.target)) fromSuggestions.style.display = 'none';
    if (!toInput.contains(e.target)) toSuggestions.style.display = 'none';
});
addLocationBtn.addEventListener('click', addViaInput);

// --- 5. CORE FUNCTIONS ---

/**
 * --- *** UPDATED: Adds a "Via" input to the sidebar *** ---
 */
function addViaInput() {
    // 1. Find all input wrappers
    const currentInputWrappers = document.querySelectorAll('#controls .input-wrapper');
    if (currentInputWrappers.length >= 5) {
        showWarning("You can only add a maximum of 5 points.");
        return;
    }

    // 2. Create all new elements
    const wrapper = document.createElement('div');
    wrapper.className = 'input-wrapper via-input-wrapper';
    wrapper.innerHTML = `
        <span class="input-icon via-icon"></span>
        <input type="text" placeholder="Via" autocomplete="off">
        <div class="autocomplete-suggestions"></div>
        <button class="remove-loc-btn" title="Remove location">&ndash;</button>
    `;
    
    // 3. Add listeners to new elements
    const input = wrapper.querySelector('input');
    const suggestions = wrapper.querySelector('.autocomplete-suggestions');
    const removeBtn = wrapper.querySelector('.remove-loc-btn');

    input.addEventListener('input', (e) => {
        debouncedFetchAutocomplete(e.target.value, suggestions, input);
    });
    removeBtn.addEventListener('click', () => {
        wrapper.remove(); // Remove this "Via" input
        updateSwapButtons(); // Re-draw swap buttons
    });

    // 4. *** THIS IS THE FIX ***
    // Find the "To" wrapper and insert the new "Via" wrapper *before* it
    const toWrapper = document.getElementById('to-loc-wrapper');
    toWrapper.before(wrapper);
    
    // 5. Update the swap buttons
    updateSwapButtons();
}

/**
 * --- *** NEW: Swaps the content of two input fields *** ---
 */
function swapInputs(wrapperA, wrapperB) {
    const inputA = wrapperA.querySelector('input');
    const inputB = wrapperB.querySelector('input');

    // Swap values
    const tempVal = inputA.value;
    inputA.value = inputB.value;
    inputB.value = tempVal;

    // Swap coordinates
    const tempLat = inputA.dataset.lat;
    const tempLng = inputA.dataset.lng;
    inputA.dataset.lat = inputB.dataset.lat;
    inputA.dataset.lng = inputB.dataset.lng;
    inputB.dataset.lat = tempLat;
    inputB.dataset.lng = tempLng;

    // Clear any "ghost" coordinates
    if (inputA.value === "") {
        delete inputA.dataset.lat;
        delete inputA.dataset.lng;
    }
    if (inputB.value === "") {
        delete inputB.dataset.lat;
        delete inputB.dataset.lng;
    }
}

/**
 * --- *** NEW: Clears and redraws all swap buttons *** ---
 */
function updateSwapButtons() {
    // 1. Remove all existing swap buttons
    document.querySelectorAll('.swap-btn-wrapper').forEach(btn => btn.remove());

    // 2. *** THIS IS THE FIX ***
    // Get all visible input wrappers *in their new order*
    const allInputWrappers = document.querySelectorAll(
        '#from-loc-wrapper, .via-input-wrapper, #to-loc-wrapper'
    );

    // 3. Loop and add a swap button *between* each one
    for (let i = 0; i < allInputWrappers.length - 1; i++) {
        const inputAbove = allInputWrappers[i];
        const inputBelow = allInputWrappers[i+1];

        // Create the swap button
        const swapWrapper = document.createElement('div');
        swapWrapper.className = 'swap-btn-wrapper';
        const swapBtn = document.createElement('button');
        swapBtn.className = 'swap-btn';
        swapBtn.title = 'Swap locations';
        
        swapBtn.addEventListener('click', () => {
            swapInputs(inputAbove, inputBelow);
        });

        swapWrapper.appendChild(swapBtn);

        // Insert the swap button *after* the top input
        inputAbove.after(swapWrapper);
    }
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
 */
function clearMap() {
    clearMapLayers(); // Clears the map
    
    // *** UPDATED: Find and remove all "Via" wrappers ***
    document.querySelectorAll('.via-input-wrapper').forEach(wrapper => wrapper.remove());
    
    updateSwapButtons(); // Redraw the initial swap button
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
        
        const displayValue = [name, ...address.split(', ')]
                             .filter((value, index, self) => value && self.indexOf(value) === index)
                             .join(', ');

        item.innerHTML = `
            <strong>${name}</strong>
            <small>${address}</small>
        `;
        item.addEventListener('click', () => {
            inputEl.value = displayValue; 
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
    clearMapLayers(); 

    // 1. *** UPDATED: Get all location inputs in their new order ***
    const locationInputs = document.querySelectorAll(
        '#from-loc-wrapper input[type="text"], .via-input-wrapper input[type="text"], #to-loc-wrapper input[type="text"]'
    );
    
    // 2. Create an array of geocoding promises
    const geocodePromises = Array.from(locationInputs).map(input => {
        const query = input.value;
        if (!query) return null; 
        if (input.dataset.lat && input.dataset.lng) {
            return Promise.resolve([input.dataset.lat, input.dataset.lng]);
        }
        return geocode(query);
    });

    try {
        // 3. Run all geocoding requests
        const allCoords = (await Promise.all(geocodePromises))
                            .filter(Boolean); 

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
        Array.from(locationInputs).forEach(input => {
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

// --- Initial call to create the first swap button ---
updateSwapButtons();

// --- Sidebar Resizer Logic ---
const sidebar = document.getElementById('sidebar');
const resizer = document.getElementById('resizer');
const mapContainer = document.getElementById('map-container');

// Min/max widths for the sidebar
const minWidth = 280;
const maxWidth = 600;

function onMouseDown(e) {
    // Only resize if on desktop
    if (window.innerWidth <= 900) return;

    // Prevent text selection
    e.preventDefault();

    // Attach listeners to the *whole document*
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', onStopDrag);
}

function onDrag(e) {
    let newWidth = e.clientX;

    // Apply min/max constraints
    if (newWidth < minWidth) newWidth = minWidth;
    if (newWidth > maxWidth) newWidth = maxWidth;

    // Apply the new width
    sidebar.style.width = newWidth + 'px';
    
    // Invalidate map size so Leaflet redraws it correctly
    map.invalidateSize();
}

function onStopDrag() {
    // Remove listeners from the document
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', onStopDrag);
}

// Attach the initial mousedown listener to the resizer
resizer.addEventListener('mousedown', onMouseDown);