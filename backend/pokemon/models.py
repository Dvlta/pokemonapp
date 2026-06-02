from django.conf import settings
from django.db import models


class Pokemon(models.Model):
    class Source(models.TextChoices):
        API = "api", "PokeAPI"
        UPLOAD = "upload", "Upload"

    name = models.CharField(max_length=120)
    types = models.JSONField(default=list)
    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)
    sprite = models.URLField(max_length=500)
    description = models.TextField(blank=True)
    category = models.CharField(max_length=120, blank=True)
    abilities = models.JSONField(default=list, blank=True)
    height_decimeters = models.PositiveIntegerField(blank=True, null=True)
    weight_hectograms = models.PositiveIntegerField(blank=True, null=True)
    location = models.CharField(max_length=255, blank=True)
    latest_moves = models.JSONField(default=list, blank=True)
    stats = models.JSONField(default=dict, blank=True)
    source = models.CharField(
        max_length=20,
        choices=Source.choices,
        default=Source.API,
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="uploaded_pokemon",
        blank=True,
        null=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name", "id"]
        indexes = [
            models.Index(fields=["name"]),
            models.Index(fields=["source"]),
        ]

    def __str__(self) -> str:
        return self.name


class Favorite(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="favorites",
    )
    pokemon = models.ForeignKey(
        Pokemon,
        on_delete=models.CASCADE,
        related_name="favorites",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "pokemon"],
                name="unique_user_pokemon_favorite",
            )
        ]

    def __str__(self) -> str:
        return f"{self.user} favorites {self.pokemon}"
