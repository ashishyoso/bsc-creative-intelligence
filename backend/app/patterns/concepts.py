"""US-1.6: Concept clustering.

Group creatives by underlying concept (originals + variations).

Algorithm:
1. Compute a perceptual difference hash (dHash) on each asset's hook frame
   (frame at 0.5s for videos, the image itself for static creatives).
2. Two assets are in the same concept iff
   (a) Hamming distance between their dHashes <= 10, AND
   (b) they share the same hook_archetype tag.
3. Build a union-find graph over the pairs and emit one concept_id per
   connected component. Concept_id is "C001", "C002", ...
4. The concept's name is auto-derived from the first asset's hook_mechanic.
5. The hash is stored on the Asset record, so re-running this is incremental.

Manual override is preserved: assets with an existing concept_id whose
concept_name does NOT start with "auto:" are skipped — the Hook Architect's
manual decisions are never overwritten.
"""
from __future__ import annotations

import logging
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Iterable

from PIL import Image
from sqlalchemy.orm import Session

from app.config import settings
from app.db.models import Asset, AutoTag, Concept

log = logging.getLogger(__name__)


def dhash(image_path: Path, hash_size: int = 8) -> str | None:
    """Perceptual difference hash. Returns 16-char hex for an 8x8 grid."""
    try:
        img = Image.open(image_path).convert("L").resize(
            (hash_size + 1, hash_size), Image.LANCZOS
        )
    except Exception as e:
        log.warning("dhash failed for %s: %s", image_path, e)
        return None
    pixels = list(img.getdata())
    n = 0
    for row in range(hash_size):
        for col in range(hash_size):
            left = pixels[row * (hash_size + 1) + col]
            right = pixels[row * (hash_size + 1) + col + 1]
            n = (n << 1) | (1 if left > right else 0)
    return f"{n:0{hash_size * hash_size // 4}x}"


def hamming(h1: str, h2: str) -> int:
    return bin(int(h1, 16) ^ int(h2, 16)).count("1")


def _hook_frame_path(asset: Asset) -> Path | None:
    """Where do we have a representative frame for this asset?"""
    frame_dir = settings.frames_dir / asset.asset_id
    candidates = [
        frame_dir / "hook_0_5s.jpg",
        frame_dir / "image.jpg",
    ]
    for c in candidates:
        if c.exists():
            return c
    # Fall back to the source file itself (works for .webp, .jpg)
    if asset.asset_type == "image" and asset.storage_path:
        p = Path(asset.storage_path)
        if p.exists():
            return p
    return None


def compute_hashes(session: Session, *, force: bool = False) -> dict:
    """Compute dHash for every asset that doesn't have one (or all, if force=True)."""
    q = session.query(Asset).filter(Asset.download_status == "downloaded")
    if not force:
        q = q.filter(Asset.perceptual_hash.is_(None))

    count_ok = 0
    count_skipped = 0
    for asset in q.all():
        frame = _hook_frame_path(asset)
        if frame is None:
            count_skipped += 1
            continue
        h = dhash(frame)
        if h is None:
            count_skipped += 1
            continue
        asset.perceptual_hash = h
        count_ok += 1

    session.commit()
    return {"hashed": count_ok, "skipped": count_skipped}


class _UnionFind:
    def __init__(self):
        self.parent: dict[str, str] = {}

    def add(self, x: str):
        if x not in self.parent:
            self.parent[x] = x

    def find(self, x: str) -> str:
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x

    def union(self, a: str, b: str):
        self.add(a); self.add(b)
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.parent[ra] = rb


def recompute_concepts(
    session: Session,
    *,
    hamming_threshold: int = 10,
    require_same_archetype: bool = True,
) -> dict:
    """Cluster all hashed assets into concepts. Returns summary stats."""
    hash_res = compute_hashes(session)

    assets = (
        session.query(Asset, AutoTag)
        .outerjoin(AutoTag, AutoTag.asset_id == Asset.asset_id)
        .filter(Asset.perceptual_hash.isnot(None))
        .all()
    )

    if not assets:
        return {"hashed": hash_res, "clusters": 0, "assets_assigned": 0}

    # Group by archetype to limit pair comparisons (cuts O(N²) by ~10x)
    by_arch: dict[str | None, list[tuple[Asset, AutoTag | None]]] = defaultdict(list)
    for asset, tag in assets:
        arch = tag.hook_archetype if (tag and require_same_archetype) else "*"
        by_arch[arch].append((asset, tag))

    uf = _UnionFind()
    for asset, _ in assets:
        uf.add(asset.asset_id)

    for arch, items in by_arch.items():
        for i in range(len(items)):
            a_asset, _ = items[i]
            for j in range(i + 1, len(items)):
                b_asset, _ = items[j]
                if hamming(a_asset.perceptual_hash, b_asset.perceptual_hash) <= hamming_threshold:
                    uf.union(a_asset.asset_id, b_asset.asset_id)

    # Group asset_ids by root
    groups: dict[str, list[str]] = defaultdict(list)
    for asset, _ in assets:
        root = uf.find(asset.asset_id)
        groups[root].append(asset.asset_id)

    # Sort by size desc; assign C001, C002, ...
    sorted_groups = sorted(groups.values(), key=len, reverse=True)

    # Preserve manually-named concepts. We mark auto-assigned ones with
    # concept_name starting with "auto:" so they're safe to overwrite.
    manual_concepts = {
        c.concept_id for c in session.query(Concept).filter(
            ~Concept.concept_name.startswith("auto:")
        ).all()
    }

    # Drop existing auto-concepts so we can re-assign cleanly. Manual ones survive
    # because their assets won't be touched below.
    deleted_auto = (
        session.query(Concept).filter(Concept.concept_name.startswith("auto:")).delete(
            synchronize_session=False
        )
    )

    assets_by_id = {a.asset_id: a for a, _ in assets}
    tag_by_id = {a.asset_id: t for a, t in assets}

    cluster_count = 0
    assets_assigned = 0
    now = datetime.utcnow()

    for cluster_idx, asset_ids in enumerate(sorted_groups, start=1):
        # Skip clusters that contain any manually-grouped asset
        if any(
            assets_by_id[aid].concept_id and assets_by_id[aid].concept_id in manual_concepts
            for aid in asset_ids
        ):
            continue

        concept_id = f"C{cluster_idx:03d}"
        # Derive a name from the first asset's hook_mechanic, fallback to archetype
        first_tag = tag_by_id.get(asset_ids[0])
        seed = (
            (first_tag.hook_mechanic if first_tag and first_tag.hook_mechanic else None)
            or (first_tag.hook_archetype if first_tag else None)
            or "Concept"
        )
        concept = Concept(
            concept_id=concept_id,
            concept_name=f"auto: {seed[:80]}",
            first_seen_at=now,
            last_seen_at=now,
        )
        session.add(concept)

        for aid in asset_ids:
            assets_by_id[aid].concept_id = concept_id
            assets_assigned += 1
        cluster_count += 1

    session.commit()
    return {
        "hashed": hash_res,
        "clusters_created": cluster_count,
        "auto_concepts_deleted": deleted_auto,
        "assets_assigned": assets_assigned,
        "singletons": sum(1 for g in sorted_groups if len(g) == 1),
        "largest_cluster": len(sorted_groups[0]) if sorted_groups else 0,
    }
