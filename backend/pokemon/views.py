from rest_framework import filters, parsers, status as drf_status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import Favorite, Pokemon
from .serializers import FavoriteSerializer, PokemonSerializer
from .services import PokemonUploadError, parse_pokemon_upload


@api_view(["GET"])
@permission_classes([AllowAny])
def status(_request):
    return Response({"app": "pokemon", "status": "ready"})


class PokemonViewSet(viewsets.ModelViewSet):
    serializer_class = PokemonSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name", "location", "source"]
    ordering_fields = ["name", "source", "created_at", "updated_at"]
    ordering = ["name", "id"]

    def get_queryset(self):
        queryset = (
            Pokemon.objects.all()
            .select_related("owner")
            .prefetch_related("favorites")
        )
        source = self.request.query_params.get("source")
        favorite = self.request.query_params.get("favorite")

        if source in {Pokemon.Source.API, Pokemon.Source.UPLOAD}:
            queryset = queryset.filter(source=source)

        if favorite == "true":
            queryset = queryset.filter(favorites__user=self.request.user)

        return queryset.distinct()

    def perform_create(self, serializer):
        source = serializer.validated_data.get("source", Pokemon.Source.API)
        owner = self.request.user if source == Pokemon.Source.UPLOAD else None
        serializer.save(owner=owner)

    @action(detail=True, methods=["post", "delete"], url_path="favorite")
    def favorite(self, request, pk=None):
        pokemon = self.get_object()

        if request.method == "DELETE":
            Favorite.objects.filter(user=request.user, pokemon=pokemon).delete()
            return Response(status=drf_status.HTTP_204_NO_CONTENT)

        favorite, created = Favorite.objects.get_or_create(
            user=request.user,
            pokemon=pokemon,
        )
        serializer = FavoriteSerializer(favorite, context={"request": request})
        return Response(
            serializer.data,
            status=drf_status.HTTP_201_CREATED if created else drf_status.HTTP_200_OK,
        )

    @action(
        detail=False,
        methods=["post"],
        parser_classes=[parsers.MultiPartParser, parsers.FormParser],
        url_path="upload",
    )
    def upload(self, request):
        uploaded_file = request.FILES.get("file")
        if not uploaded_file:
            return Response(
                {"file": ["Upload a CSV or XLSX file using the 'file' field."]},
                status=drf_status.HTTP_400_BAD_REQUEST,
            )

        try:
            payloads = parse_pokemon_upload(uploaded_file)
        except PokemonUploadError as exc:
            return Response(
                {"file": [str(exc)]},
                status=drf_status.HTTP_400_BAD_REQUEST,
            )

        created = []
        skipped = []
        required_fields = ["name", "latitude", "longitude", "types", "location", "latest_moves", "sprite"]

        for row_number, payload in enumerate(payloads, start=2):
            missing_fields = [
                field
                for field in required_fields
                if not payload.get(field)
            ]
            if missing_fields:
                skipped.append(
                    {
                        "row": row_number,
                        "name": payload.get("name") or "",
                        "reason": f"Missing required fields: {', '.join(missing_fields)}",
                    }
                )
                continue

            serializer = self.get_serializer(data=payload)
            if not serializer.is_valid():
                skipped.append(
                    {
                        "row": row_number,
                        "name": payload.get("name") or "",
                        "reason": serializer.errors,
                    }
                )
                continue

            pokemon = serializer.save(
                source=Pokemon.Source.UPLOAD,
                owner=request.user,
            )
            created.append(pokemon)

        response_serializer = self.get_serializer(created, many=True)
        return Response(
            {
                "created_count": len(created),
                "skipped_count": len(skipped),
                "created": response_serializer.data,
                "skipped": skipped,
            },
            status=drf_status.HTTP_201_CREATED if created else drf_status.HTTP_400_BAD_REQUEST,
        )


class FavoriteViewSet(viewsets.ModelViewSet):
    serializer_class = FavoriteSerializer
    http_method_names = ["get", "post", "delete", "head", "options"]

    def get_queryset(self):
        return (
            Favorite.objects.filter(user=self.request.user)
            .select_related("pokemon", "user")
            .prefetch_related("pokemon__favorites")
        )

    def perform_create(self, serializer):
        serializer.save()
