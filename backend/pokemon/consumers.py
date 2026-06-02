import asyncio
import hashlib
import json
import random
from datetime import UTC, datetime
from urllib.parse import parse_qs, urlencode
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

from asgiref.sync import sync_to_async
from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.conf import settings
from rest_framework.authtoken.models import Token

from .models import Pokemon


class PokemonEnergyConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.pokemon_id = self.scope["url_route"]["kwargs"]["pokemon_id"]
        token = self._get_query_param("token")

        user = await get_user_from_token(token)
        if user is None:
            await self.close(code=4401)
            return

        pokemon = await get_pokemon_snapshot(self.pokemon_id)
        if pokemon is None:
            await self.close(code=4404)
            return

        self.pokemon = pokemon
        self.energy_task = None
        await self.accept()
        self.energy_task = asyncio.create_task(self.stream_energy())

    async def disconnect(self, close_code):
        if self.energy_task:
            self.energy_task.cancel()

    async def stream_energy(self):
        try:
            while True:
                weather = await sync_to_async(fetch_weather_snapshot, thread_sensitive=False)(
                    self.pokemon["latitude"],
                    self.pokemon["longitude"],
                )
                payload = build_energy_payload(self.pokemon, weather)
                await self.send_json(payload)
                await asyncio.sleep(3)
        except asyncio.CancelledError:
            return

    def _get_query_param(self, name):
        query_string = self.scope.get("query_string", b"").decode()
        values = parse_qs(query_string).get(name)
        return values[0] if values else ""


@database_sync_to_async
def get_user_from_token(token):
    if not token:
        return None

    try:
        return Token.objects.select_related("user").get(key=token).user
    except Token.DoesNotExist:
        return None


@database_sync_to_async
def get_pokemon_snapshot(pokemon_id):
    try:
        pokemon = Pokemon.objects.get(pk=pokemon_id)
    except Pokemon.DoesNotExist:
        return None

    return {
        "id": pokemon.id,
        "name": pokemon.name,
        "latitude": float(pokemon.latitude),
        "longitude": float(pokemon.longitude),
        "types": pokemon.types,
    }


def fetch_weather_snapshot(latitude, longitude):
    api_key = settings.OPENWEATHER_API_KEY
    if not api_key:
        return fallback_weather_snapshot(latitude, longitude)

    params = urlencode(
        {
            "lat": latitude,
            "lon": longitude,
            "appid": api_key,
            "units": "imperial",
        }
    )
    url = f"https://api.openweathermap.org/data/2.5/weather?{params}"

    try:
        with urlopen(url, timeout=4) as response:
            data = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        return fallback_weather_snapshot(latitude, longitude, f"OpenWeather HTTP {error.code}")
    except URLError:
        return fallback_weather_snapshot(latitude, longitude, "OpenWeather network error")
    except Exception:
        return fallback_weather_snapshot(latitude, longitude, "OpenWeather request failed")

    weather = (data.get("weather") or [{}])[0]
    main = data.get("main") or {}
    return {
        "source": "openweather",
        "condition": weather.get("main") or "Unknown",
        "description": weather.get("description") or "Unknown",
        "temperature_f": main.get("temp"),
    }


def fallback_weather_snapshot(latitude, longitude, reason="OPENWEATHER_API_KEY is not configured"):
    bucket = datetime.now(UTC).strftime("%Y%m%d%H")
    digest = hashlib.sha256(f"{latitude}:{longitude}:{bucket}".encode()).hexdigest()
    conditions = [
        ("Clear", "clear sky", 72),
        ("Clouds", "scattered clouds", 65),
        ("Rain", "light rain", 58),
        ("Mist", "coastal mist", 61),
        ("Sunny", "sunny", 77),
    ]
    condition, description, temperature = conditions[int(digest[:2], 16) % len(conditions)]
    return {
        "source": "fallback",
        "fallback_reason": reason,
        "condition": condition,
        "description": description,
        "temperature_f": temperature + (int(digest[2:4], 16) % 9) - 4,
    }


def build_energy_payload(pokemon, weather):
    condition = weather["condition"].lower()
    base_energy = 60

    if condition in {"clear", "sunny"}:
        base_energy = 85
    elif condition == "clouds":
        base_energy = 65
    elif condition in {"rain", "drizzle", "thunderstorm"}:
        base_energy = 45
    elif condition == "snow":
        base_energy = 55
    elif condition in {"mist", "fog", "haze", "smoke"}:
        base_energy = 50

    temperature = weather.get("temperature_f")
    if isinstance(temperature, (int, float)):
        if 60 <= temperature <= 85:
            base_energy += 8
        elif temperature < 45 or temperature > 95:
            base_energy -= 12

    variance = random.uniform(-0.2, 0.2)
    energy = max(0, min(100, round(base_energy * (1 + variance))))

    return {
        "pokemon_id": pokemon["id"],
        "pokemon_name": pokemon["name"],
        "energy": energy,
        "variance": round(variance, 3),
        "weather": {
            "source": weather["source"],
            "fallback_reason": weather.get("fallback_reason"),
            "condition": weather["condition"],
            "description": weather["description"],
            "temperature_f": weather.get("temperature_f"),
        },
        "updated_at": datetime.now(UTC).isoformat(),
    }
