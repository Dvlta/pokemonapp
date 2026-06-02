from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("favorites", views.FavoriteViewSet, basename="favorite")
router.register("", views.PokemonViewSet, basename="pokemon")

urlpatterns = [
    path("status/", views.status, name="pokemon-status"),
    path("", include(router.urls)),
]
