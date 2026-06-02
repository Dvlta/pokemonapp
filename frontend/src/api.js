const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api";
const TOKEN_STORAGE_KEY = "pokemonFinderToken";

export function getStoredToken() {
  return window.localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function storeToken(token) {
  window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearStoredToken() {
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export async function apiRequest(path, options = {}) {
  const token = getStoredToken();
  const headers = new Headers(options.headers ?? {});

  if (!(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Token ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const data = await parseResponse(response);
  if (!response.ok) {
    throw new ApiError(response.status, data);
  }
  return data;
}

export async function registerUser(payload) {
  const data = await apiRequest("/accounts/register/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  storeToken(data.token);
  return data.user;
}

export async function loginUser(payload) {
  const data = await apiRequest("/accounts/login/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  storeToken(data.token);
  return data.user;
}

export async function logoutUser() {
  try {
    await apiRequest("/accounts/logout/", { method: "POST" });
  } finally {
    clearStoredToken();
  }
}

export function getCurrentUser() {
  return apiRequest("/accounts/me/");
}

export function listPokemon({
  page = 1,
  pageSize,
  search = "",
  source = "",
  favorite = false,
} = {}) {
  const params = new URLSearchParams();
  params.set("page", String(page));

  if (pageSize) {
    params.set("page_size", String(pageSize));
  }
  if (search.trim()) {
    params.set("search", search.trim());
  }
  if (source) {
    params.set("source", source);
  }
  if (favorite) {
    params.set("favorite", "true");
  }

  return apiRequest(`/pokemon/?${params.toString()}`);
}

export function favoritePokemon(pokemonId) {
  return apiRequest(`/pokemon/${pokemonId}/favorite/`, { method: "POST" });
}

export function unfavoritePokemon(pokemonId) {
  return apiRequest(`/pokemon/${pokemonId}/favorite/`, { method: "DELETE" });
}

export function deletePokemon(pokemonId) {
  return apiRequest(`/pokemon/${pokemonId}/`, { method: "DELETE" });
}

export function uploadPokemonFile(file) {
  const formData = new FormData();
  formData.append("file", file);
  return apiRequest("/pokemon/upload/", {
    method: "POST",
    body: formData,
  });
}

async function parseResponse(response) {
  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export class ApiError extends Error {
  constructor(status, data) {
    super("API request failed");
    this.status = status;
    this.data = data;
  }
}
