from django.contrib import admin

from .models import Favorite, Pokemon


@admin.register(Pokemon)
class PokemonAdmin(admin.ModelAdmin):
    list_display = ("name", "source", "location", "latitude", "longitude", "owner")
    list_filter = ("source", "types")
    search_fields = ("name", "location")
    readonly_fields = ("created_at", "updated_at")


@admin.register(Favorite)
class FavoriteAdmin(admin.ModelAdmin):
    list_display = ("user", "pokemon", "created_at")
    search_fields = ("user__username", "pokemon__name")
    readonly_fields = ("created_at",)

