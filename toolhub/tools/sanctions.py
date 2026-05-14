"""
Vessel & entity sanctions screening.
Source: OpenSanctions API (https://api.opensanctions.org/) — free for non-commercial.
Covers: UN, EU, US OFAC, UK, Finnish/Nordic sanctions lists.
"""
from __future__ import annotations
import httpx

OPENSANCTIONS_BASE = "https://api.opensanctions.org"

async def sanctions_check_vessel(query: str, fuzzy: bool = True) -> dict:
    """
    Check if a vessel is on international sanctions lists (UN, EU, US OFAC, UK).
    Search by vessel name, MMSI, IMO number, or call sign.
    Source: OpenSanctions (CC BY-NC 4.0, non-commercial use).

    Args:
        query: Vessel name, MMSI, IMO number, or call sign to search
        fuzzy: Enable fuzzy/approximate matching (default True)
    """
    params = {
        "q": query,
        "schema": "Vessel",
        "fuzzy": str(fuzzy).lower(),
        "limit": 10,
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{OPENSANCTIONS_BASE}/entities/",
                params=params,
                headers={"Accept": "application/json"},
            )
            resp.raise_for_status()
            data = resp.json()

        results = data.get("results", [])
        hits = []
        for entity in results:
            props = entity.get("properties", {})
            datasets = entity.get("datasets", [])
            dataset_labels = {
                "us_ofac_sdn": "US OFAC SDN",
                "eu_fsf": "EU Sanctions",
                "un_sc_sanctions": "UN Security Council",
                "gb_hmt_sanctions": "UK HMT",
                "fi_tulli_sanctions": "Finnish Customs",
            }
            sanctions_lists = [dataset_labels.get(d, d) for d in datasets if "sanction" in d or d in dataset_labels]

            hits.append({
                "id": entity.get("id"),
                "name": (props.get("name") or [None])[0],
                "aliases": props.get("alias", [])[:5],
                "mmsi": (props.get("mmsi") or [None])[0],
                "imo": (props.get("imoNumber") or [None])[0],
                "flag": (props.get("flag") or [None])[0],
                "vessel_type": (props.get("type") or [None])[0],
                "sanctions_lists": sanctions_lists,
                "datasets": datasets[:10],
                "score": entity.get("score"),
                "sanctioned": bool(sanctions_lists or datasets),
                "opensanctions_url": f"https://www.opensanctions.org/entities/{entity.get('id')}/",
            })

        sanctioned = [h for h in hits if h["sanctioned"]]

        return {
            "query": query,
            "total_hits": len(hits),
            "sanctioned_count": len(sanctioned),
            "sanctioned": sanctioned,
            "all_hits": hits,
            "source": "OpenSanctions",
            "license": "CC BY-NC 4.0 (non-commercial use)",
            "coverage": "UN, EU, US OFAC, UK HMT, and 100+ national lists",
        }
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 429:
            return {"error": "OpenSanctions rate limit reached. Try again in a moment.", "query": query}
        return {"error": str(e), "query": query}
    except Exception as exc:
        return {"error": str(exc), "query": query}


async def sanctions_check_entity(query: str, schema: str = "LegalEntity") -> dict:
    """
    Check if a company, person, or organization is on international sanctions lists.
    Search by name. Schema can be: LegalEntity, Person, Organization, Vessel.
    Source: OpenSanctions (CC BY-NC 4.0).

    Args:
        query: Name of entity to check
        schema: Entity type (LegalEntity, Person, Organization)
    """
    params = {"q": query, "schema": schema, "fuzzy": "true", "limit": 5}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{OPENSANCTIONS_BASE}/entities/",
                params=params,
                headers={"Accept": "application/json"},
            )
            resp.raise_for_status()
            data = resp.json()

        results = data.get("results", [])
        hits = []
        for entity in results:
            props = entity.get("properties", {})
            hits.append({
                "id": entity.get("id"),
                "name": (props.get("name") or [None])[0],
                "aliases": props.get("alias", [])[:3],
                "country": (props.get("country") or [None])[0],
                "datasets": entity.get("datasets", [])[:8],
                "score": entity.get("score"),
                "opensanctions_url": f"https://www.opensanctions.org/entities/{entity.get('id')}/",
            })

        return {
            "query": query,
            "schema": schema,
            "total_hits": len(hits),
            "hits": hits,
            "source": "OpenSanctions",
            "license": "CC BY-NC 4.0 (non-commercial use)",
        }
    except Exception as exc:
        return {"error": str(exc), "query": query}
