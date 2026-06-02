import csv
import io
import json
import random
import urllib.error
import urllib.request
import zipfile
from decimal import Decimal, InvalidOperation
from pathlib import Path
from xml.etree import ElementTree

from django.conf import settings


POKEAPI_BASE_URL = "https://pokeapi.co/api/v2"

TYPE_ORDER = [
    "normal",
    "fire",
    "water",
    "electric",
    "grass",
    "ice",
    "fighting",
    "poison",
    "ground",
    "flying",
    "psychic",
    "bug",
    "rock",
    "ghost",
    "dragon",
    "dark",
    "steel",
    "fairy",
]


class PokeApiError(Exception):
    pass


class PokemonUploadError(Exception):
    pass


def fetch_json(url, timeout=15):
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "pokemon-finder-lab/1.0",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.URLError as exc:
        raise PokeApiError(f"Failed to fetch {url}: {exc}") from exc


def fetch_pokemon_page(limit=100, offset=0, timeout=15):
    url = f"{POKEAPI_BASE_URL}/pokemon?limit={limit}&offset={offset}"
    return fetch_json(url, timeout=timeout)["results"]


def fetch_pokemon_detail(name_or_url, timeout=15):
    url = name_or_url if name_or_url.startswith("http") else f"{POKEAPI_BASE_URL}/pokemon/{name_or_url}"
    return fetch_json(url, timeout=timeout)


def fetch_pokemon_species(species_url, timeout=15):
    return fetch_json(species_url, timeout=timeout)


def fetch_location_name(location_area_encounters_url, timeout=15):
    encounters = fetch_json(location_area_encounters_url, timeout=timeout)
    if not encounters:
        return ""
    return encounters[0].get("location_area", {}).get("name", "")


def load_polyline_points():
    docs_dir = settings.BASE_DIR.parent / "docs"
    files = {
        "a_j": docs_dir / "A - J",
        "k_z": docs_dir / "K -Z",
    }
    points_by_group = {}

    for group, path in files.items():
        points_by_group[group] = _load_points(path)

    return points_by_group


def _load_points(path: Path):
    data = json.loads(path.read_text())
    points = []
    for segment in data["coordinates"]:
        for longitude, latitude in segment:
            points.append((Decimal(str(latitude)), Decimal(str(longitude))))
    if not points:
        raise ValueError(f"No coordinates found in {path}")
    return points


def assign_coordinate(name, types, points_by_group):
    group = "a_j" if name[0].lower() <= "j" else "k_z"
    points = points_by_group[group]
    primary_type = types[0] if types else "unknown"

    bucket_count = len(TYPE_ORDER)
    bucket_index = TYPE_ORDER.index(primary_type) if primary_type in TYPE_ORDER else bucket_count - 1
    bucket_size = max(1, len(points) // bucket_count)
    start = min(bucket_index * bucket_size, len(points) - 1)
    end = min(start + bucket_size, len(points))

    rng = random.Random(f"{group}:{primary_type}:{name}")
    latitude, longitude = points[rng.randrange(start, end)]
    return latitude, longitude


def extract_types(detail):
    return [
        type_entry["type"]["name"]
        for type_entry in sorted(detail["types"], key=lambda item: item["slot"])
    ]


def extract_sprite(detail):
    sprites = detail.get("sprites", {})
    official_artwork = sprites.get("other", {}).get("official-artwork", {})
    return (
        official_artwork.get("front_default")
        or sprites.get("front_default")
        or ""
    )


def extract_stats(detail):
    return {
        stat_entry["stat"]["name"]: stat_entry["base_stat"]
        for stat_entry in detail.get("stats", [])
    }


def extract_abilities(detail):
    return [
        ability_entry["ability"]["name"]
        for ability_entry in detail.get("abilities", [])
        if ability_entry.get("ability", {}).get("name")
    ]


def extract_species_description(species):
    for entry in species.get("flavor_text_entries", []):
        if entry.get("language", {}).get("name") != "en":
            continue
        text = entry.get("flavor_text", "")
        return " ".join(text.replace("\f", " ").replace("\n", " ").split())
    return ""


def extract_species_category(species):
    for genus in species.get("genera", []):
        if genus.get("language", {}).get("name") == "en":
            return genus.get("genus", "").replace(" Pokemon", "")
    return ""


def extract_latest_level_60_moves(detail):
    learned_moves = []
    for move_entry in detail.get("moves", []):
        move_name = move_entry["move"]["name"]
        for version_detail in move_entry.get("version_group_details", []):
            if version_detail.get("move_learn_method", {}).get("name") != "level-up":
                continue
            learned_at = version_detail.get("level_learned_at") or 0
            if 0 < learned_at <= 60:
                learned_moves.append((learned_at, move_name))

    learned_moves.sort(key=lambda item: (item[0], item[1]), reverse=True)

    latest = []
    seen = set()
    for _level, move_name in learned_moves:
        if move_name in seen:
            continue
        latest.append(move_name)
        seen.add(move_name)
        if len(latest) == 4:
            break
    return latest


def build_pokemon_payload(detail, points_by_group, timeout=15):
    name = detail["name"]
    types = extract_types(detail)
    latitude, longitude = assign_coordinate(name, types, points_by_group)
    location = fetch_location_name(detail["location_area_encounters"], timeout=timeout)
    species = fetch_pokemon_species(detail["species"]["url"], timeout=timeout)

    return {
        "name": name,
        "types": types,
        "latitude": latitude,
        "longitude": longitude,
        "sprite": extract_sprite(detail),
        "description": extract_species_description(species),
        "category": extract_species_category(species),
        "abilities": extract_abilities(detail),
        "height_decimeters": detail.get("height"),
        "weight_hectograms": detail.get("weight"),
        "location": location,
        "latest_moves": extract_latest_level_60_moves(detail),
        "stats": extract_stats(detail),
    }


def parse_pokemon_upload(uploaded_file):
    file_name = uploaded_file.name.lower()
    file_bytes = uploaded_file.read()

    if file_name.endswith(".csv"):
        rows = _parse_csv_upload(file_bytes)
    elif file_name.endswith(".xlsx"):
        rows = _parse_xlsx_upload(file_bytes)
    else:
        raise PokemonUploadError("Upload must be a CSV or XLSX file.")

    return [_normalize_upload_row(row) for row in rows]


def _parse_csv_upload(file_bytes):
    text = file_bytes.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise PokemonUploadError("Upload file is missing a header row.")
    return list(reader)


def _parse_xlsx_upload(file_bytes):
    try:
        with zipfile.ZipFile(io.BytesIO(file_bytes)) as workbook:
            shared_strings = _read_shared_strings(workbook)
            sheet_xml = workbook.read("xl/worksheets/sheet1.xml")
    except (KeyError, zipfile.BadZipFile) as exc:
        raise PokemonUploadError("Could not read the XLSX workbook.") from exc

    namespace = {"main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    root = ElementTree.fromstring(sheet_xml)
    parsed_rows = []

    for row in root.findall(".//main:sheetData/main:row", namespace):
        values_by_column = {}
        for cell in row.findall("main:c", namespace):
            reference = cell.attrib.get("r", "")
            column = "".join(char for char in reference if char.isalpha())
            values_by_column[column] = _read_xlsx_cell(cell, shared_strings, namespace)
        parsed_rows.append(values_by_column)

    if not parsed_rows:
        raise PokemonUploadError("Upload file is empty.")

    header_columns = sorted(parsed_rows[0], key=_column_sort_key)
    headers = [parsed_rows[0].get(column, "") for column in header_columns]
    if not any(headers):
        raise PokemonUploadError("Upload file is missing a header row.")

    rows = []
    for parsed_row in parsed_rows[1:]:
        row = {}
        for column, header in zip(header_columns, headers):
            row[header] = parsed_row.get(column, "")
        if any(str(value).strip() for value in row.values()):
            rows.append(row)
    return rows


def _read_shared_strings(workbook):
    try:
        xml = workbook.read("xl/sharedStrings.xml")
    except KeyError:
        return []

    namespace = {"main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    root = ElementTree.fromstring(xml)
    strings = []
    for item in root.findall("main:si", namespace):
        text = "".join(text_node.text or "" for text_node in item.findall(".//main:t", namespace))
        strings.append(text)
    return strings


def _read_xlsx_cell(cell, shared_strings, namespace):
    cell_type = cell.attrib.get("t")
    value_node = cell.find("main:v", namespace)

    if cell_type == "inlineStr":
        text_node = cell.find(".//main:t", namespace)
        return text_node.text if text_node is not None else ""

    if value_node is None:
        return ""

    raw_value = value_node.text or ""
    if cell_type == "s":
        try:
            return shared_strings[int(raw_value)]
        except (IndexError, ValueError):
            return ""
    return raw_value


def _column_sort_key(column):
    value = 0
    for char in column:
        value = value * 26 + (ord(char.upper()) - ord("A") + 1)
    return value


def _normalize_upload_row(row):
    values = {_normalize_header(key): value for key, value in row.items()}
    return {
        "name": _clean_string(values.get("pokemon")),
        "latitude": _normalize_decimal(values.get("lat")),
        "longitude": _normalize_decimal(values.get("long") or values.get("longitude")),
        "types": _split_list(values.get("type")),
        "location": _clean_string(values.get("location")),
        "latest_moves": _split_list(values.get("latestmoves")),
        "sprite": _clean_string(values.get("sprite")),
        "description": _clean_string(values.get("description")),
        "category": _clean_string(values.get("category")),
        "abilities": _split_list(values.get("abilities") or values.get("ability")),
        "height_decimeters": _normalize_positive_int(values.get("heightdecimeters")),
        "weight_hectograms": _normalize_positive_int(values.get("weighthectograms")),
        "source": "upload",
    }


def _normalize_header(header):
    return "".join(char.lower() for char in str(header or "") if char.isalnum())


def _clean_string(value):
    return str(value or "").strip()


def _normalize_decimal(value):
    text = _clean_string(value)
    if not text:
        return ""
    try:
        return str(Decimal(text).quantize(Decimal("0.000001")))
    except InvalidOperation:
        return text


def _normalize_positive_int(value):
    text = _clean_string(value)
    if not text:
        return None
    try:
        number = int(Decimal(text))
    except (InvalidOperation, ValueError):
        return None
    return number if number >= 0 else None


def _split_list(value):
    text = _clean_string(value)
    if not text:
        return []

    text = text.strip("[]")
    separators = [",", ";", "|", "/"]
    for separator in separators[1:]:
        text = text.replace(separator, ",")

    return [item.strip().strip("'\"").lower() for item in text.split(",") if item.strip()]
