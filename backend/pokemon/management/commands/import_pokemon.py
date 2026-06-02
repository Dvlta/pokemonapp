from django.core.management.base import BaseCommand, CommandError

from pokemon.models import Pokemon
from pokemon.services import (
    PokeApiError,
    build_pokemon_payload,
    fetch_pokemon_detail,
    fetch_pokemon_page,
    load_polyline_points,
)


class Command(BaseCommand):
    help = "Fetch Pokemon from PokeAPI and store them with assigned polyline coordinates."

    def add_arguments(self, parser):
        parser.add_argument(
            "--limit",
            type=int,
            default=100,
            help="Number of Pokemon to fetch. Defaults to 100.",
        )
        parser.add_argument(
            "--offset",
            type=int,
            default=0,
            help="PokeAPI list offset. Defaults to 0.",
        )
        parser.add_argument(
            "--timeout",
            type=int,
            default=15,
            help="HTTP timeout in seconds. Defaults to 15.",
        )
        parser.add_argument(
            "--clear-api",
            action="store_true",
            help="Delete existing source=api Pokemon before importing.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Fetch and parse data without writing to the database.",
        )

    def handle(self, *args, **options):
        limit = options["limit"]
        offset = options["offset"]
        timeout = options["timeout"]

        if limit < 1:
            raise CommandError("--limit must be greater than 0.")
        if offset < 0:
            raise CommandError("--offset cannot be negative.")

        try:
            points_by_group = load_polyline_points()
            pokemon_results = fetch_pokemon_page(
                limit=limit,
                offset=offset,
                timeout=timeout,
            )
        except (PokeApiError, OSError, ValueError) as exc:
            raise CommandError(str(exc)) from exc

        if options["clear_api"] and not options["dry_run"]:
            deleted_count, _details = Pokemon.objects.filter(source=Pokemon.Source.API).delete()
            self.stdout.write(f"Deleted {deleted_count} existing API Pokemon.")

        created = 0
        updated = 0
        skipped = 0

        for index, result in enumerate(pokemon_results, start=1):
            name = result["name"]
            try:
                detail = fetch_pokemon_detail(result["url"], timeout=timeout)
                payload = build_pokemon_payload(
                    detail,
                    points_by_group=points_by_group,
                    timeout=timeout,
                )
            except (PokeApiError, KeyError, ValueError) as exc:
                skipped += 1
                self.stderr.write(f"[{index}/{limit}] Skipped {name}: {exc}")
                continue

            if not payload["sprite"]:
                skipped += 1
                self.stderr.write(f"[{index}/{limit}] Skipped {name}: missing sprite")
                continue

            if options["dry_run"]:
                self.stdout.write(
                    f"[{index}/{limit}] Would import {payload['name']} "
                    f"at {payload['latitude']}, {payload['longitude']}"
                )
                continue

            pokemon, was_created = Pokemon.objects.update_or_create(
                name=payload["name"],
                source=Pokemon.Source.API,
                defaults={
                    **payload,
                    "source": Pokemon.Source.API,
                    "owner": None,
                },
            )

            if was_created:
                created += 1
                action = "Created"
            else:
                updated += 1
                action = "Updated"

            self.stdout.write(
                f"[{index}/{limit}] {action} {pokemon.name} "
                f"at {pokemon.latitude}, {pokemon.longitude}"
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"Import complete: created={created}, updated={updated}, skipped={skipped}"
            )
        )

