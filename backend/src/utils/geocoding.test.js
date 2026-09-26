import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatStructuredAddress,
  googlePlaceDetails,
  googlePlacesAutocomplete,
  googleReverseGeocode,
  nominatimForwardSearch,
  nominatimReverseGeocode,
  parseGoogleAddress,
  parseNominatimAddress,
} from './geocoding.js';

function stubFetch(handler) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  };
  return {
    calls,
    restore() { globalThis.fetch = original; },
  };
}

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

test('parseNominatimAddress maps address parts and falls back across aliases', () => {
  const parsed = parseNominatimAddress({
    display_name: 'ABC Plaza, 12 Ngong Road, Kilimani, Nairobi, Kenya',
    lat: '-1.2921',
    lon: '36.8219',
    address: {
      house_number: '12',
      pedestrian: 'Ngong Road',
      neighbourhood: 'Kilimani',
      town: 'Nairobi',
      state: 'Nairobi County',
      country: 'Kenya',
      amenity: 'ABC Plaza',
    },
  });

  assert.equal(parsed.street, '12 Ngong Road');
  assert.equal(parsed.estate, 'Kilimani');
  assert.equal(parsed.neighborhood, 'Kilimani');
  assert.equal(parsed.town, 'Nairobi');
  assert.equal(parsed.county, 'Nairobi County');
  assert.equal(parsed.building, 'ABC Plaza');
  assert.equal(parsed.buildingName, 'ABC Plaza');
  assert.equal(parsed.latitude, -1.2921);
  assert.equal(parsed.longitude, 36.8219);
});

test('parseNominatimAddress returns nulls for an empty result', () => {
  const parsed = parseNominatimAddress(undefined);
  assert.deepEqual(parsed, {
    building: null,
    buildingName: null,
    street: null,
    estate: null,
    neighborhood: null,
    town: null,
    county: null,
    country: null,
    formattedAddress: null,
    latitude: null,
    longitude: null,
  });
});

test('parseGoogleAddress picks components by type priority', () => {
  const parsed = parseGoogleAddress({
    formatted_address: '12 Ngong Road, Nairobi, Kenya',
    address_components: [
      { long_name: 'Riverside Suites', types: ['premise'] },
      { long_name: 'Ngong Road', types: ['route'] },
      { long_name: 'Kilimani', types: ['sublocality', 'sublocality_level_1'] },
      { long_name: 'Nairobi', types: ['locality'] },
      { long_name: 'Nairobi County', types: ['administrative_area_level_1'] },
      { long_name: 'Kenya', types: ['country'] },
    ],
  });

  assert.equal(parsed.building, 'Riverside Suites');
  assert.equal(parsed.street, 'Ngong Road');
  assert.equal(parsed.estate, 'Kilimani');
  assert.equal(parsed.town, 'Nairobi');
  assert.equal(parsed.county, 'Nairobi County');
  assert.equal(parsed.country, 'Kenya');
  assert.equal(parsed.formattedAddress, '12 Ngong Road, Nairobi, Kenya');
});

test('parseGoogleAddress returns nulls when components are missing', () => {
  const parsed = parseGoogleAddress({});
  assert.equal(parsed.street, null);
  assert.equal(parsed.country, null);
  assert.equal(parsed.formattedAddress, null);
});

test('formatStructuredAddress builds display lines and labels', () => {
  const formatted = formatStructuredAddress({
    building: 'ABC Plaza',
    street: 'Ngong Road',
    estate: 'Kilimani',
    town: 'Nairobi',
    county: 'Nairobi County',
    country: 'Kenya',
    formattedAddress: null,
  });

  assert.deepEqual(formatted.displayLines, [
    'ABC Plaza', 'Ngong Road', 'Kilimani', 'Nairobi', 'Nairobi County', 'Kenya',
  ]);
  assert.equal(formatted.shortLabel, 'ABC Plaza, Ngong Road');
  assert.equal(formatted.fullLabel, 'ABC Plaza, Ngong Road, Kilimani, Nairobi, Nairobi County, Kenya');
});

test('formatStructuredAddress prefers formattedAddress for the full label', () => {
  const formatted = formatStructuredAddress({
    street: 'Ngong Road',
    formattedAddress: '12 Ngong Road, Nairobi',
  });
  assert.equal(formatted.fullLabel, '12 Ngong Road, Nairobi');
  assert.equal(formatted.shortLabel, 'Ngong Road');
});

test('formatStructuredAddress falls back to a generic label when empty', () => {
  const formatted = formatStructuredAddress({});
  assert.deepEqual(formatted.displayLines, []);
  assert.equal(formatted.shortLabel, 'Address not available');
  assert.equal(formatted.fullLabel, 'Address not available');
});

test('nominatimReverseGeocode requests the reverse endpoint and formats the result', async () => {
  const fetchStub = stubFetch(() => jsonResponse({
    display_name: 'Ngong Road, Nairobi',
    lat: '-1.3',
    lon: '36.8',
    address: { road: 'Ngong Road', city: 'Nairobi', country: 'Kenya' },
  }));

  try {
    const result = await nominatimReverseGeocode(-1.3, 36.8);
    const url = new URL(fetchStub.calls[0].url);
    assert.equal(url.pathname, '/reverse');
    assert.equal(url.searchParams.get('lat'), '-1.3');
    assert.equal(url.searchParams.get('lon'), '36.8');
    assert.equal(url.searchParams.get('format'), 'json');
    assert.ok(fetchStub.calls[0].init.headers['User-Agent']);
    assert.equal(result.town, 'Nairobi');
    assert.equal(result.fullLabel, 'Ngong Road, Nairobi');
  } finally {
    fetchStub.restore();
  }
});

test('nominatimReverseGeocode throws on a non-ok response', async () => {
  const fetchStub = stubFetch(() => jsonResponse({}, { ok: false, status: 503 }));
  try {
    await assert.rejects(nominatimReverseGeocode(0, 0), /Nominatim request failed: 503/);
  } finally {
    fetchStub.restore();
  }
});

test('nominatimReverseGeocode throws when the payload carries an error', async () => {
  const fetchStub = stubFetch(() => jsonResponse({ error: 'Unable to geocode' }));
  try {
    await assert.rejects(nominatimReverseGeocode(0, 0), /Unable to geocode/);
  } finally {
    fetchStub.restore();
  }
});

test('nominatimForwardSearch maps predictions and applies the limit', async () => {
  const fetchStub = stubFetch(() => jsonResponse([
    {
      lat: '-1.29', lon: '36.82', display_name: 'Ngong Road, Kilimani, Nairobi, Kenya',
      address: { road: 'Ngong Road', suburb: 'Kilimani', city: 'Nairobi', country: 'Kenya' },
    },
  ]));

  try {
    const results = await nominatimForwardSearch('ngong road', 3);
    const url = new URL(fetchStub.calls[0].url);
    assert.equal(url.pathname, '/search');
    assert.equal(url.searchParams.get('q'), 'ngong road');
    assert.equal(url.searchParams.get('limit'), '3');
    assert.equal(results.length, 1);
    assert.equal(results[0].lat, '-1.29');
    assert.equal(results[0].mainText, 'Ngong Road');
    assert.equal(results[0].secondaryText, 'Kilimani, Nairobi, Kenya');
    assert.equal(results[0].address.town, 'Nairobi');
  } finally {
    fetchStub.restore();
  }
});

test('nominatimForwardSearch returns an empty list for a non-array payload', async () => {
  const fetchStub = stubFetch(() => jsonResponse({ error: 'nope' }));
  try {
    assert.deepEqual(await nominatimForwardSearch('nowhere'), []);
  } finally {
    fetchStub.restore();
  }
});

test('googleReverseGeocode formats the first result', async () => {
  const fetchStub = stubFetch(() => jsonResponse({
    results: [{
      formatted_address: '12 Ngong Road, Nairobi',
      address_components: [{ long_name: 'Ngong Road', types: ['route'] }],
    }],
  }));

  try {
    const result = await googleReverseGeocode(-1.3, 36.8, 'test-key');
    assert.match(fetchStub.calls[0].url, /latlng=-1\.3,36\.8&key=test-key/);
    assert.equal(result.street, 'Ngong Road');
    assert.equal(result.fullLabel, '12 Ngong Road, Nairobi');
  } finally {
    fetchStub.restore();
  }
});

test('googleReverseGeocode throws when there are no results', async () => {
  const fetchStub = stubFetch(() => jsonResponse({ results: [] }));
  try {
    await assert.rejects(googleReverseGeocode(0, 0, 'k'), /no results/);
  } finally {
    fetchStub.restore();
  }
});

test('googlePlacesAutocomplete returns predictions and tolerates ZERO_RESULTS', async () => {
  const okStub = stubFetch(() => jsonResponse({ status: 'OK', predictions: [{ description: 'Nairobi' }] }));
  try {
    const predictions = await googlePlacesAutocomplete('nai', 'test-key');
    assert.equal(predictions[0].description, 'Nairobi');
    assert.match(okStub.calls[0].url, /input=nai/);
  } finally {
    okStub.restore();
  }

  const emptyStub = stubFetch(() => jsonResponse({ status: 'ZERO_RESULTS' }));
  try {
    assert.deepEqual(await googlePlacesAutocomplete('zzz', 'test-key'), []);
  } finally {
    emptyStub.restore();
  }
});

test('googlePlacesAutocomplete throws on an error status', async () => {
  const fetchStub = stubFetch(() => jsonResponse({ status: 'REQUEST_DENIED' }));
  try {
    await assert.rejects(googlePlacesAutocomplete('nai', 'bad-key'), /REQUEST_DENIED/);
  } finally {
    fetchStub.restore();
  }
});

test('googlePlaceDetails returns the result and throws on failure', async () => {
  const okStub = stubFetch(() => jsonResponse({ status: 'OK', result: { place_id: 'abc' } }));
  try {
    const result = await googlePlaceDetails('abc', 'test-key');
    assert.equal(result.place_id, 'abc');
    assert.match(okStub.calls[0].url, /place_id=abc/);
  } finally {
    okStub.restore();
  }

  const failStub = stubFetch(() => jsonResponse({ status: 'NOT_FOUND' }));
  try {
    await assert.rejects(googlePlaceDetails('abc', 'test-key'), /NOT_FOUND/);
  } finally {
    failStub.restore();
  }
});
