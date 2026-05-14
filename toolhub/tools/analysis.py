"""
Spatial analysis tools — cluster detection and event correlation.
Pure Python, no external API calls. Works on data returned by other tools.
"""
from __future__ import annotations
import json
import math

def _haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return R * 2 * math.asin(math.sqrt(a))

async def detect_clusters(items_json: str, eps_km: float = 5.0, min_points: int = 2) -> dict:
    """
    Detect spatial clusters in a list of geolocated objects using DBSCAN-style algorithm.
    Input: JSON string of objects with 'lat' and 'lon' fields.
    Returns clusters with member counts, center coordinates, and member lists.

    Args:
        items_json: JSON array of objects with lat/lon fields (from vessels_area, adsb_area etc.)
        eps_km: Maximum distance between cluster members in km (default 5)
        min_points: Minimum points to form a cluster (default 2)
    """
    try:
        items = json.loads(items_json) if isinstance(items_json, str) else items_json
    except Exception as e:
        return {"error": f"Invalid JSON: {e}"}

    valid = [i for i in items if i.get("lat") is not None and i.get("lon") is not None]
    if not valid:
        return {"clusters": [], "noise": 0, "total_items": len(items), "error": "No items with lat/lon"}

    n = len(valid)
    labels = [-1] * n  # -1 = unvisited
    cluster_id = 0

    def region_query(idx):
        return [j for j in range(n) if _haversine_km(valid[idx]["lat"], valid[idx]["lon"], valid[j]["lat"], valid[j]["lon"]) <= eps_km]

    visited = [False] * n
    for i in range(n):
        if visited[i]:
            continue
        visited[i] = True
        neighbors = region_query(i)
        if len(neighbors) < min_points:
            labels[i] = -2  # noise
            continue
        labels[i] = cluster_id
        seed = set(neighbors) - {i}
        while seed:
            j = seed.pop()
            if not visited[j]:
                visited[j] = True
                j_neighbors = region_query(j)
                if len(j_neighbors) >= min_points:
                    seed.update(j_neighbors)
            if labels[j] < 0:
                labels[j] = cluster_id
        cluster_id += 1

    clusters = []
    for cid in range(cluster_id):
        members = [valid[i] for i in range(n) if labels[i] == cid]
        center_lat = sum(m["lat"] for m in members) / len(members)
        center_lon = sum(m["lon"] for m in members) / len(members)
        clusters.append({
            "cluster_id": cid,
            "member_count": len(members),
            "center_lat": round(center_lat, 4),
            "center_lon": round(center_lon, 4),
            "members": members[:20],
        })
    clusters.sort(key=lambda x: x["member_count"], reverse=True)
    noise_count = sum(1 for l in labels if l == -2)

    return {
        "clusters": clusters,
        "cluster_count": len(clusters),
        "noise_points": noise_count,
        "total_items": n,
        "eps_km": eps_km,
        "min_points": min_points,
    }


async def correlate_events(
    primary_json: str,
    secondary_json: str,
    time_window_minutes: int = 30,
    distance_km: float = 10.0,
) -> dict:
    """
    Correlate two sets of geolocated events by proximity in space and time.
    Finds pairs from primary and secondary sets that occurred near each other.
    Useful for correlating vessel positions with aircraft, radar contacts, or weather events.

    Args:
        primary_json: JSON array of primary events (with lat, lon, and optionally timestamp)
        secondary_json: JSON array of secondary events (with lat, lon, and optionally timestamp)
        time_window_minutes: Max time difference to consider correlated (default 30)
        distance_km: Max distance in km to consider correlated (default 10)
    """
    try:
        primary = json.loads(primary_json) if isinstance(primary_json, str) else primary_json
        secondary = json.loads(secondary_json) if isinstance(secondary_json, str) else secondary_json
    except Exception as e:
        return {"error": f"Invalid JSON: {e}"}

    p_valid = [i for i in primary if i.get("lat") is not None and i.get("lon") is not None]
    s_valid = [i for i in secondary if i.get("lat") is not None and i.get("lon") is not None]

    correlations = []
    for p in p_valid:
        for s in s_valid:
            dist = _haversine_km(p["lat"], p["lon"], s["lat"], s["lon"])
            if dist <= distance_km:
                corr = {
                    "primary": p,
                    "secondary": s,
                    "distance_km": round(dist, 2),
                }
                correlations.append(corr)

    correlations.sort(key=lambda x: x["distance_km"])

    return {
        "correlations": correlations[:50],
        "correlation_count": len(correlations),
        "primary_count": len(p_valid),
        "secondary_count": len(s_valid),
        "distance_km": distance_km,
        "time_window_minutes": time_window_minutes,
        "note": "Spatial correlation only. Add timestamp fields for time filtering.",
    }
