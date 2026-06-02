from rest_framework import serializers

from .models import Favorite, Pokemon


class PokemonSerializer(serializers.ModelSerializer):
    is_favorite = serializers.SerializerMethodField()

    class Meta:
        model = Pokemon
        fields = [
            "id",
            "name",
            "types",
            "latitude",
            "longitude",
            "sprite",
            "description",
            "category",
            "abilities",
            "height_decimeters",
            "weight_hectograms",
            "location",
            "latest_moves",
            "stats",
            "source",
            "owner",
            "is_favorite",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "owner",
            "is_favorite",
            "created_at",
            "updated_at",
        ]

    def get_is_favorite(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        return obj.favorites.filter(user=request.user).exists()

    def validate_types(self, value):
        if not isinstance(value, list) or not value:
            raise serializers.ValidationError("Types must be a non-empty list.")
        if not all(isinstance(item, str) and item.strip() for item in value):
            raise serializers.ValidationError("Each type must be a non-empty string.")
        return [item.strip().lower() for item in value]

    def validate_latest_moves(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("Latest moves must be a list.")
        return value


class FavoriteSerializer(serializers.ModelSerializer):
    pokemon = PokemonSerializer(read_only=True)
    pokemon_id = serializers.PrimaryKeyRelatedField(
        queryset=Pokemon.objects.all(),
        source="pokemon",
        write_only=True,
    )

    class Meta:
        model = Favorite
        fields = ["id", "pokemon", "pokemon_id", "created_at"]
        read_only_fields = ["id", "pokemon", "created_at"]

    def create(self, validated_data):
        request = self.context["request"]
        favorite, _created = Favorite.objects.get_or_create(
            user=request.user,
            pokemon=validated_data["pokemon"],
        )
        return favorite
