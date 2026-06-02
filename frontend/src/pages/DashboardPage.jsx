import { useEffect, useState } from "react";
import {
  Alert,
  AppBar,
  Box,
  Button,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Pagination,
  Paper,
  Stack,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";
import CatchingPokemonIcon from "@mui/icons-material/CatchingPokemon";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import FavoriteIcon from "@mui/icons-material/Favorite";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import LogoutIcon from "@mui/icons-material/Logout";
import RefreshIcon from "@mui/icons-material/Refresh";
import SearchIcon from "@mui/icons-material/Search";
import UploadFileIcon from "@mui/icons-material/UploadFile";

import {
  deletePokemon,
  favoritePokemon,
  getStoredToken,
  listPokemon,
  unfavoritePokemon,
  uploadPokemonFile,
} from "../api.js";
import { useAuth } from "../auth.jsx";
import { PokemonMap } from "../components/PokemonMap.jsx";

const PAGE_SIZE = 25;
const MAP_PAGE_SIZE = 500;
function getWebSocketBaseUrl() {
  if (import.meta.env.VITE_WS_BASE_URL) {
    return import.meta.env.VITE_WS_BASE_URL;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  if (window.location.port === "5173") {
    return `${protocol}//127.0.0.1:8000/ws`;
  }
  return `${protocol}//${window.location.host}/ws`;
}
const UCLA_CAMPUS = {
  name: "UCLA campus",
  latitude: 34.0689,
  longitude: -118.4452,
};

export function DashboardPage() {
  const auth = useAuth();
  const [pokemon, setPokemon] = useState([]);
  const [mapPokemon, setMapPokemon] = useState([]);
  const [selectedPokemon, setSelectedPokemon] = useState(null);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("");
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isMapLoading, setIsMapLoading] = useState(false);
  const [error, setError] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const { energySnapshot, energyStatus } = usePokemonEnergy(selectedPokemon?.id);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  useEffect(() => {
    let isMounted = true;

    async function loadPokemon() {
      setIsLoading(true);
      setError("");
      try {
        const data = await listPokemon({
          page,
          search,
          source,
          favorite: favoriteOnly,
        });
        if (!isMounted) {
          return;
        }
        setPokemon(data.results ?? []);
        setTotalCount(data.count ?? 0);
        setSelectedPokemon((current) => {
          if (!current) {
            return null;
          }
          return data.results?.find((item) => item.id === current.id) ?? current;
        });
      } catch (err) {
        if (isMounted) {
          setError(formatApiError(err.data) || "Could not load Pokemon.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadPokemon();

    return () => {
      isMounted = false;
    };
  }, [favoriteOnly, page, refreshKey, search, source]);

  useEffect(() => {
    let isMounted = true;

    async function loadMapPokemon() {
      setIsMapLoading(true);
      try {
        const data = await listPokemon({
          page: 1,
          pageSize: MAP_PAGE_SIZE,
          search,
          source,
          favorite: favoriteOnly,
        });
        if (!isMounted) {
          return;
        }
        const results = data.results ?? [];
        setMapPokemon(results);
        setSelectedPokemon((current) => {
          if (!current) {
            return null;
          }
          return results.find((item) => item.id === current.id) ?? current;
        });
      } catch (err) {
        if (isMounted) {
          setError(formatApiError(err.data) || "Could not load map markers.");
        }
      } finally {
        if (isMounted) {
          setIsMapLoading(false);
        }
      }
    }

    loadMapPokemon();

    return () => {
      isMounted = false;
    };
  }, [favoriteOnly, refreshKey, search, source]);

  async function handleLogout() {
    await auth.logout();
  }

  async function handleFavoriteToggle(pokemonItem) {
    const nextFavorite = !pokemonItem.is_favorite;
    setPokemon((items) =>
      items.map((item) =>
        item.id === pokemonItem.id ? { ...item, is_favorite: nextFavorite } : item,
      ),
    );
    setMapPokemon((items) =>
      items.map((item) =>
        item.id === pokemonItem.id ? { ...item, is_favorite: nextFavorite } : item,
      ),
    );
    if (selectedPokemon?.id === pokemonItem.id) {
      setSelectedPokemon({ ...selectedPokemon, is_favorite: nextFavorite });
    }

    try {
      if (nextFavorite) {
        await favoritePokemon(pokemonItem.id);
      } else {
        await unfavoritePokemon(pokemonItem.id);
      }
      if (favoriteOnly && !nextFavorite) {
        setRefreshKey((value) => value + 1);
      }
    } catch (err) {
      setError(formatApiError(err.data) || "Could not update favorite.");
      setRefreshKey((value) => value + 1);
    }
  }

  function handleRefresh() {
    setRefreshKey((value) => value + 1);
  }

  async function handleDeleteSelectedPokemon() {
    if (!selectedPokemon) {
      return;
    }

    setIsDeleting(true);
    setError("");
    try {
      await deletePokemon(selectedPokemon.id);
      setPokemon((items) => items.filter((item) => item.id !== selectedPokemon.id));
      setMapPokemon((items) => items.filter((item) => item.id !== selectedPokemon.id));
      setSelectedPokemon(null);
      setTotalCount((count) => Math.max(0, count - 1));
      setDeleteDialogOpen(false);
      handleRefresh();
    } catch (err) {
      setError(formatApiError(err.data) || "Could not delete Pokemon.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Box className="dashboard-page">
      <AppBar position="static" elevation={0}>
        <Toolbar>
          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ flexGrow: 1 }}>
            <CatchingPokemonIcon />
            <Typography variant="h6" component="h1">
              Pokemon Finder
            </Typography>
          </Stack>
          <Stack direction="row" spacing={2} alignItems="center">
            <Typography variant="body2">{auth.user?.username}</Typography>
            <Button color="inherit" startIcon={<LogoutIcon />} onClick={handleLogout}>
              Logout
            </Button>
          </Stack>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" className="dashboard-content">
        <Stack spacing={3}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "center" }}>
            <Stack spacing={0.5} sx={{ flexGrow: 1 }}>
              <Typography variant="h4" component="h2">
                Map Workspace
              </Typography>
              <Typography color="text.secondary">
                Browse imported and uploaded Pokemon before placing them on the map.
              </Typography>
            </Stack>
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" startIcon={<RefreshIcon />} onClick={handleRefresh}>
                Refresh
              </Button>
              <Button
                variant="contained"
                startIcon={<UploadFileIcon />}
                onClick={() => setUploadOpen(true)}
              >
                Upload
              </Button>
            </Stack>
          </Stack>

          {error ? <Alert severity="error">{error}</Alert> : null}

          <Box className="workspace-grid">
            <Paper elevation={0} className="list-panel">
              <Stack spacing={2}>
                <Stack spacing={1.5}>
                  <TextField
                    label="Search Pokemon"
                    size="small"
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchIcon fontSize="small" />
                        </InputAdornment>
                      ),
                    }}
                    fullWidth
                  />
                  <Stack direction="row" spacing={1}>
                    <TextField
                      select
                      label="Source"
                      size="small"
                      value={source}
                      onChange={(event) => {
                        setSource(event.target.value);
                        setPage(1);
                      }}
                      sx={{ flexGrow: 1 }}
                    >
                      <MenuItem value="">All</MenuItem>
                      <MenuItem value="api">PokeAPI</MenuItem>
                      <MenuItem value="upload">Uploads</MenuItem>
                    </TextField>
                    <Button
                      variant={favoriteOnly ? "contained" : "outlined"}
                      startIcon={favoriteOnly ? <FavoriteIcon /> : <FavoriteBorderIcon />}
                      onClick={() => {
                        setFavoriteOnly((value) => !value);
                        setPage(1);
                      }}
                    >
                      Favorites
                    </Button>
                  </Stack>
                </Stack>

                <Divider />

                <Box className="pokemon-list-frame">
                  {isLoading ? (
                    <Box className="list-loader">
                      <CircularProgress size={28} />
                    </Box>
                  ) : pokemon.length ? (
                    <List disablePadding>
                      {pokemon.map((item) => (
                        <PokemonListItem
                          key={item.id}
                          pokemon={item}
                          selected={selectedPokemon?.id === item.id}
                          onSelect={() => setSelectedPokemon(item)}
                          onFavorite={() => handleFavoriteToggle(item)}
                        />
                      ))}
                    </List>
                  ) : (
                    <Box className="empty-state">
                      <CatchingPokemonIcon color="disabled" />
                      <Typography variant="body2" color="text.secondary">
                        No Pokemon match the current filters.
                      </Typography>
                    </Box>
                  )}
                </Box>

                <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
                  <Typography variant="body2" color="text.secondary">
                    {totalCount} total
                  </Typography>
                  <Pagination
                    count={totalPages}
                    page={Math.min(page, totalPages)}
                    onChange={(_event, value) => setPage(value)}
                    size="small"
                  />
                </Stack>
              </Stack>
            </Paper>

            <Paper elevation={0} className="map-panel">
              {isMapLoading ? (
                <Box className="map-loading">
                  <CircularProgress size={32} />
                  <Typography variant="body2" color="text.secondary">
                    Loading markers
                  </Typography>
                </Box>
              ) : (
                <PokemonMap
                  pokemon={mapPokemon}
                  selectedPokemon={selectedPokemon}
                  energySnapshot={energySnapshot}
                  energyStatus={energyStatus}
                  onSelect={setSelectedPokemon}
                  onDeleteSelected={() => setDeleteDialogOpen(true)}
                />
              )}
            </Paper>

            <Paper elevation={0} className="detail-panel">
              {selectedPokemon ? (
                <PokemonActionBar
                  pokemon={selectedPokemon}
                  onFavorite={() => handleFavoriteToggle(selectedPokemon)}
                  onDelete={() => setDeleteDialogOpen(true)}
                />
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", py: 1 }}>
                  Select a Pokemon to see actions.
                </Typography>
              )}
            </Paper>
          </Box>
        </Stack>
      </Container>

      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={() => {
          setUploadOpen(false);
          setSource("upload");
          setFavoriteOnly(false);
          setPage(1);
          handleRefresh();
        }}
      />
      <ConfirmDeleteDialog
        open={deleteDialogOpen}
        pokemon={selectedPokemon}
        isDeleting={isDeleting}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleDeleteSelectedPokemon}
      />
    </Box>
  );
}

function usePokemonEnergy(pokemonId) {
  const [energySnapshot, setEnergySnapshot] = useState(null);
  const [energyStatus, setEnergyStatus] = useState("idle");

  useEffect(() => {
    if (!pokemonId) {
      setEnergySnapshot(null);
      setEnergyStatus("idle");
      return undefined;
    }

    const token = getStoredToken();
    if (!token) {
      setEnergySnapshot(null);
      setEnergyStatus("unavailable");
      return undefined;
    }

    let isCurrent = true;
    const socketUrl = `${getWebSocketBaseUrl()}/pokemon/${pokemonId}/energy/?token=${encodeURIComponent(token)}`;
    const socket = new WebSocket(socketUrl);

    setEnergySnapshot(null);
    setEnergyStatus("connecting");

    socket.onopen = () => {
      if (isCurrent) {
        setEnergyStatus("live");
      }
    };

    socket.onmessage = (event) => {
      if (!isCurrent) {
        return;
      }

      try {
        setEnergySnapshot(JSON.parse(event.data));
        setEnergyStatus("live");
      } catch {
        setEnergyStatus("error");
      }
    };

    socket.onerror = () => {
      if (isCurrent) {
        setEnergyStatus("error");
      }
    };

    socket.onclose = () => {
      if (isCurrent) {
        setEnergyStatus((currentStatus) =>
          currentStatus === "connecting" ? "error" : "closed",
        );
      }
    };

    return () => {
      isCurrent = false;
      socket.close();
    };
  }, [pokemonId]);

  return { energySnapshot, energyStatus };
}

function PokemonListItem({ pokemon, selected, onSelect, onFavorite }) {
  return (
    <ListItemButton selected={selected} onClick={onSelect} className="pokemon-list-item">
      <Box
        component="img"
        className="pokemon-list-sprite"
        src={pokemon.sprite}
        alt={pokemon.name}
      />
      <ListItemText
        primary={formatPokemonName(pokemon.name)}
        secondary={`${pokemon.types?.join(", ") || "unknown"} - ${pokemon.source}`}
        primaryTypographyProps={{ className: "pokemon-name" }}
      />
      <Tooltip title={pokemon.is_favorite ? "Unfavorite" : "Favorite"}>
        <IconButton
          edge="end"
          onClick={(event) => {
            event.stopPropagation();
            onFavorite();
          }}
        >
          {pokemon.is_favorite ? <FavoriteIcon color="error" /> : <FavoriteBorderIcon />}
        </IconButton>
      </Tooltip>
    </ListItemButton>
  );
}

function PokemonActionBar({ pokemon, onFavorite, onDelete }) {
  const [distance, setDistance] = useState(null);

  useEffect(() => {
    setDistance(null);
  }, [pokemon.id]);

  function handleDistanceClick() {
    const latitude = Number(pokemon.latitude);
    const longitude = Number(pokemon.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setDistance({ error: "This Pokemon does not have valid coordinates." });
      return;
    }

    const kilometers = haversineDistanceKilometers(
      latitude,
      longitude,
      UCLA_CAMPUS.latitude,
      UCLA_CAMPUS.longitude,
    );
    setDistance({
      kilometers,
      miles: kilometers * 0.621371,
    });
  }

  return (
    <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
      <Box
        component="img"
        className="pokemon-list-sprite"
        src={pokemon.sprite}
        alt={pokemon.name}
      />
      <Typography variant="subtitle1" className="pokemon-name" sx={{ flexGrow: 1 }}>
        {formatPokemonName(pokemon.name)}
      </Typography>
      <Tooltip title={pokemon.is_favorite ? "Unfavorite" : "Favorite"}>
        <IconButton onClick={onFavorite}>
          {pokemon.is_favorite ? <FavoriteIcon color="error" /> : <FavoriteBorderIcon />}
        </IconButton>
      </Tooltip>
      <Tooltip title="Delete">
        <IconButton color="error" onClick={onDelete}>
          <DeleteOutlineIcon />
        </IconButton>
      </Tooltip>
      <Button variant="outlined" size="small" onClick={handleDistanceClick}>
        How far am I from home?
      </Button>
      {distance ? (
        distance.error ? (
          <Typography variant="body2" color="error">
            {distance.error}
          </Typography>
        ) : (
          <Typography variant="body2" color="text.secondary">
            {distance.miles.toFixed(1)} mi / {distance.kilometers.toFixed(1)} km to {UCLA_CAMPUS.name}
          </Typography>
        )
      ) : null}
    </Stack>
  );
}

function haversineDistanceKilometers(lat1, lon1, lat2, lon2) {
  const earthRadiusKm = 6371;
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLon = toRadians(lon2 - lon1);
  const originLat = toRadians(lat1);
  const destinationLat = toRadians(lat2);

  const angle =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(originLat) *
      Math.cos(destinationLat) *
      Math.sin(deltaLon / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(angle), Math.sqrt(1 - angle));
}

function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

function ConfirmDeleteDialog({ open, pokemon, isDeleting, onClose, onConfirm }) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Delete Pokemon</DialogTitle>
      <DialogContent>
        <Typography>
          Delete {pokemon ? formatPokemonName(pokemon.name) : "this Pokemon"} from the map?
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isDeleting}>
          Cancel
        </Button>
        <Button
          color="error"
          variant="contained"
          startIcon={<DeleteOutlineIcon />}
          onClick={onConfirm}
          disabled={isDeleting}
        >
          {isDeleting ? "Deleting" : "Delete"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function UploadDialog({ open, onClose, onUploaded }) {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setResult(null);
      setError("");
      setIsUploading(false);
    }
  }, [open]);

  async function handleUpload() {
    if (!file) {
      setError("Choose a CSV or XLSX file first.");
      return;
    }

    setError("");
    setIsUploading(true);
    try {
      const data = await uploadPokemonFile(file);
      setResult(data);
    } catch (err) {
      setError(formatApiError(err.data) || "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          Upload Pokemon
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error ? <Alert severity="error">{error}</Alert> : null}
          {result ? (
            <Alert severity={result.skipped_count ? "warning" : "success"}>
              Created {result.created_count} Pokemon. Skipped {result.skipped_count}.
            </Alert>
          ) : null}
          <Button variant="outlined" component="label" startIcon={<UploadFileIcon />}>
            {file ? file.name : "Choose CSV or XLSX"}
            <input
              type="file"
              accept=".csv,.xlsx"
              hidden
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </Button>
          <Typography variant="body2" color="text.secondary">
            Expected columns: Pokemon, Lat, Long, Type, Location, Latest Moves, Sprite.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        {result?.created_count ? (
          <Button variant="contained" onClick={onUploaded}>
            View Uploaded
          </Button>
        ) : (
          <Button variant="contained" onClick={handleUpload} disabled={isUploading}>
            {isUploading ? "Uploading" : "Upload"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

function formatPokemonName(name) {
  return String(name || "")
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatApiError(data) {
  if (!data) {
    return "";
  }
  if (typeof data === "string") {
    return data;
  }
  if (Array.isArray(data)) {
    return data.join(" ");
  }
  if (typeof data === "object") {
    return Object.entries(data)
      .map(([field, messages]) => {
        const text = Array.isArray(messages) ? messages.join(" ") : String(messages);
        return `${field}: ${text}`;
      })
      .join(" ");
  }
  return "";
}
