from django.urls import re_path

from .consumers import PokemonEnergyConsumer


websocket_urlpatterns = [
    re_path(
        r"^ws/pokemon/(?P<pokemon_id>\d+)/energy/$",
        PokemonEnergyConsumer.as_asgi(),
    ),
]
