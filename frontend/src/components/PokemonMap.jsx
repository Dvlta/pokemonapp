import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import { LayersControl, MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const CALIFORNIA_CENTER = [36.7783, -119.4179];
const TYPE_COLORS = {
  bug: "#729f3f",
  dark: "#707070",
  dragon: "#53a4cf",
  electric: "#eed535",
  fairy: "#fdb9e9",
  fighting: "#d56723",
  fire: "#fd7d24",
  flying: "#3dc7ef",
  ghost: "#7b62a3",
  grass: "#9bcc50",
  ground: "#ab9842",
  ice: "#51c4e7",
  normal: "#a4acaf",
  poison: "#b97fc9",
  psychic: "#f366b9",
  rock: "#a38c21",
  steel: "#9eb7b8",
  water: "#4592c4",
};
const TYPE_TEXT_COLORS = {
  electric: "#2f3742",
  fairy: "#2f3742",
  flying: "#2f3742",
  grass: "#2f3742",
  ice: "#2f3742",
};
const TYPE_WEAKNESSES = {
  bug: ["fire", "flying", "rock"],
  dark: ["bug", "fairy", "fighting"],
  dragon: ["dragon", "fairy", "ice"],
  electric: ["ground"],
  fairy: ["poison", "steel"],
  fighting: ["fairy", "flying", "psychic"],
  fire: ["ground", "rock", "water"],
  flying: ["electric", "ice", "rock"],
  ghost: ["dark", "ghost"],
  grass: ["bug", "fire", "flying", "ice", "poison"],
  ground: ["grass", "ice", "water"],
  ice: ["fighting", "fire", "rock", "steel"],
  normal: ["fighting"],
  poison: ["ground", "psychic"],
  psychic: ["bug", "dark", "ghost"],
  rock: ["fighting", "grass", "ground", "steel", "water"],
  steel: ["fighting", "fire", "ground"],
  water: ["electric", "grass"],
};

export function PokemonMap({
  pokemon,
  selectedPokemon,
  energySnapshot,
  energyStatus,
  onSelect,
  onDeleteSelected,
}) {
  const validPokemon = useMemo(
    () =>
      pokemon.filter((item) => {
        const latitude = Number(item.latitude);
        const longitude = Number(item.longitude);
        return Number.isFinite(latitude) && Number.isFinite(longitude);
      }),
    [pokemon],
  );

  return (
    <MapContainer
      center={CALIFORNIA_CENTER}
      zoom={6}
      minZoom={5}
      maxZoom={18}
      scrollWheelZoom
      className="pokemon-map"
    >
      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="Roads">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Topographic">
          <TileLayer
            attribution='Tiles &copy; <a href="https://www.opentopomap.org/">OpenTopoMap</a>'
            url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Satellite">
          <TileLayer
            attribution="Tiles &copy; Esri"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          />
        </LayersControl.BaseLayer>
      </LayersControl>

      <SelectedPokemonPan pokemon={selectedPokemon} />
      <FitPokemonBounds pokemon={validPokemon} />

      {validPokemon.map((item) => {
        const selected = selectedPokemon?.id === item.id;
        return (
          <PokemonMarker
            key={item.id}
            pokemon={item}
            selected={selected}
            energySnapshot={selected ? energySnapshot : null}
            energyStatus={selected ? energyStatus : "idle"}
            onSelect={onSelect}
            onDeleteSelected={onDeleteSelected}
          />
        );
      })}
    </MapContainer>
  );
}

function PokemonMarker({
  pokemon,
  selected,
  energySnapshot,
  energyStatus,
  onSelect,
  onDeleteSelected,
}) {
  const markerRef = useRef(null);
  const latestMoves = pokemon.latest_moves?.slice(0, 4) ?? [];
  const statEntries = Object.entries(pokemon.stats ?? {}).slice(0, 6);
  const weaknesses = getWeaknesses(pokemon.types);

  useEffect(() => {
    if (selected) {
      markerRef.current?.openPopup();
    }
  }, [selected]);

  return (
    <Marker
      ref={markerRef}
      position={[Number(pokemon.latitude), Number(pokemon.longitude)]}
      icon={createPokemonIcon(pokemon, selected)}
      eventHandlers={{
        click: () => onSelect(pokemon),
      }}
    >
      <Popup minWidth={320} maxWidth={360} autoPan={false}>
        <div className="popup-card">
          <div className="popup-header">
            <img src={pokemon.sprite} alt={pokemon.name} className="popup-sprite" />
            <div className="popup-header-info">
              <strong className="popup-name">{formatPokemonName(pokemon.name)}</strong>
              <div className="type-chip-list">
                {(pokemon.types?.length ? pokemon.types : ["unknown"]).map((type) => (
                  <TypeChip key={type} type={type} />
                ))}
              </div>
            </div>
          </div>

          <p className="popup-desc">{pokemon.description || "No Pokédex description available."}</p>

          <div className="popup-info-grid">
            <InfoItem label="Height" value={formatHeight(pokemon.height_decimeters)} />
            <InfoItem label="Weight" value={formatWeight(pokemon.weight_hectograms)} />
            <InfoItem label="Category" value={pokemon.category || "Unknown"} />
            <InfoItem label="Location" value={pokemon.location || "Unknown"} />
            <InfoItem
              label="Abilities"
              value={pokemon.abilities?.length ? pokemon.abilities.map(formatPokemonName).join(", ") : "Unknown"}
            />
            <InfoItem
              label="Moves"
              value={latestMoves.length ? latestMoves.map(formatPokemonName).join(", ") : "None listed"}
            />
          </div>

          {statEntries.length > 0 && (
            <div className="popup-stats">
              <span className="popup-section-label">Stats</span>
              {statEntries.map(([name, value]) => (
                <div key={name} className="popup-stat-row">
                  <span className="popup-stat-name">{formatStatLabel(name)}</span>
                  <div className="popup-stat-bar">
                    <span style={{ width: `${Math.min(100, (Number(value) / 150) * 100)}%` }} />
                  </div>
                  <span className="popup-stat-value">{value}</span>
                </div>
              ))}
            </div>
          )}

          <div className="popup-section">
            <span className="popup-section-label">Weaknesses</span>
            <div className="type-chip-list">
              {weaknesses.length ? (
                weaknesses.map((type) => <TypeChip key={type} type={type} />)
              ) : (
                <small>Unknown</small>
              )}
            </div>
          </div>

          <div className="popup-section">
            <span className="popup-section-label">Live energy</span>
            {energySnapshot ? (
              <>
                <div className="popup-energy-bar">
                  <span style={{ width: `${energySnapshot.energy}%` }} />
                </div>
                <small>
                  {energySnapshot.energy}% — {formatWeatherSnapshot(energySnapshot.weather)}
                </small>
              </>
            ) : (
              <small>
                {energyStatus === "connecting"
                  ? "Connecting…"
                  : "Unavailable"}
              </small>
            )}
          </div>

          <button type="button" className="popup-delete-btn" onClick={onDeleteSelected}>
            Delete Pokémon
          </button>
        </div>
      </Popup>
    </Marker>
  );
}

function InfoItem({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TypeChip({ type }) {
  const normalizedType = String(type || "unknown").toLowerCase();
  const backgroundColor = TYPE_COLORS[normalizedType] ?? "#a4acaf";
  const color = TYPE_TEXT_COLORS[normalizedType] ?? "#ffffff";

  return (
    <span className="type-chip" style={{ backgroundColor, color }}>
      {formatPokemonName(normalizedType)}
    </span>
  );
}

function getWeaknesses(types = []) {
  return [
    ...new Set(
      types.flatMap((type) => TYPE_WEAKNESSES[String(type || "").toLowerCase()] ?? []),
    ),
  ].sort();
}

function formatHeight(heightDecimeters) {
  const decimeters = Number(heightDecimeters);
  if (!Number.isFinite(decimeters) || decimeters <= 0) {
    return "Unknown";
  }

  const totalInches = Math.round(decimeters * 3.93701);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${feet}' ${String(inches).padStart(2, "0")}"`;
}

function formatWeight(weightHectograms) {
  const hectograms = Number(weightHectograms);
  if (!Number.isFinite(hectograms) || hectograms <= 0) {
    return "Unknown";
  }

  return `${(hectograms * 0.220462).toFixed(1)} lbs`;
}

function formatStatLabel(name) {
  const labels = {
    hp: "HP",
    attack: "Attack",
    defense: "Defense",
    "special-attack": "Sp. Atk",
    "special-defense": "Sp. Def",
    speed: "Speed",
  };
  return labels[name] ?? formatPokemonName(name);
}

function SelectedPokemonPan({ pokemon }) {
  const map = useMap();

  useEffect(() => {
    if (!pokemon) {
      return;
    }

    const latitude = Number(pokemon.latitude);
    const longitude = Number(pokemon.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return;
    }

    const targetZoom = Math.max(map.getZoom(), 8);
    const markerPixel = map.project([latitude, longitude], targetZoom);
    const offsetPixel = L.point(markerPixel.x, markerPixel.y - 230);
    const offsetLatLng = map.unproject(offsetPixel, targetZoom);

    map.setView(offsetLatLng, targetZoom, { animate: true, duration: 0.3 });
  }, [map, pokemon]);

  return null;
}

function FitPokemonBounds({ pokemon }) {
  const map = useMap();

  useEffect(() => {
    if (!pokemon.length) {
      map.setView(CALIFORNIA_CENTER, 6);
      return;
    }

    const bounds = L.latLngBounds(
      pokemon.map((item) => [Number(item.latitude), Number(item.longitude)]),
    );
    map.fitBounds(bounds.pad(0.2), { maxZoom: 8 });
  }, [map, pokemon]);

  return null;
}

const MARKER_TYPE_COLORS = {
  fire: "#e53935",
  water: "#1e88e5",
  grass: "#43a047",
  psychic: "#8e24aa",
  ground: "#795548",
  rock: "#212121",
  fighting: "#ef6c00",
  normal: "#d2b48c",
  electric: "#fdd835",
};

function getMarkerColor(types = []) {
  const known = types
    .map((t) => String(t || "").toLowerCase())
    .filter((t) => MARKER_TYPE_COLORS[t]);
  if (known.length) {
    return MARKER_TYPE_COLORS[known[Math.floor(Math.random() * known.length)]];
  }
  const listed = types
    .map((t) => String(t || "").toLowerCase())
    .filter((t) => t in MARKER_TYPE_COLORS === false && t);
  if (listed.length) {
    return "#9e9e9e";
  }
  return "#9e9e9e";
}

function createPokemonIcon(pokemon, selected) {
  const className = selected ? "pokemon-marker pokemon-marker-selected" : "pokemon-marker";
  const color = getMarkerColor(pokemon.types);
  const sprite = escapeAttribute(pokemon.sprite);
  const label = escapeAttribute(pokemon.name?.charAt(0)?.toUpperCase() || "?");
  return L.divIcon({
    className,
    html: sprite
      ? `<img src="${sprite}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="pokemon-marker-fallback" style="display:none;background:${color}">${label}</span>`
      : `<span class="pokemon-marker-fallback" style="display:flex;background:${color}">${label}</span>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -22],
  });
}

function escapeAttribute(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function formatPokemonName(name) {
  return String(name || "")
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatWeatherSnapshot(weather) {
  if (!weather) {
    return "weather unavailable";
  }

  const temperature = Number(weather.temperature_f);
  const temperatureLabel = Number.isFinite(temperature)
    ? `${Math.round(temperature)} F`
    : "temperature unknown";
  const sourceLabel = weather.source === "openweather" ? "OpenWeather" : "local fallback";

  return `${weather.description} - ${temperatureLabel} - ${sourceLabel}`;
}

