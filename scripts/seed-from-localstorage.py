#!/usr/bin/env python3
"""
Seed Supabase from exported browser localStorage.

Usage:
  python3 scripts/seed-from-localstorage.py

Reads credentials from .env (SUPABASE_DB_URL) and data from immuvi_localstorage_export.json.
"""

import json
import os
import sys
import psycopg2
from psycopg2.extras import Json, execute_values
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXPORT_PATH = ROOT / "immuvi_localstorage_export.json"
ENV_PATH = ROOT / ".env"


def load_env():
    env = {}
    for line in ENV_PATH.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


def main():
    env = load_env()
    db_url = env.get("SUPABASE_DB_URL")
    if not db_url:
        sys.exit("SUPABASE_DB_URL not found in .env")

    data = json.loads(EXPORT_PATH.read_text())
    products = data["immuvi_products_v1"]  # [{id, name, clickupListId, ...}]
    active_product_id = data.get("immuvi_active_product", "")

    conn = psycopg2.connect(db_url)
    conn.autocommit = False
    cur = conn.cursor()

    # ────────────────────────────────────────────────────────────
    # Wipe ONLY the 3 original products' scoped rows — leave any products
    # the user added later (e.g. "canva") untouched.
    # ────────────────────────────────────────────────────────────
    original_ids = tuple([p["id"] for p in products])
    print(f"Clearing scoped rows for {len(original_ids)} original products only: {original_ids}")
    for t in [
        "inspiration_results", "inspiration_queue", "inspirations",
        "manual_actions", "matrix_cells", "ads",
        "angle_personas", "personas", "angles",
    ]:
        cur.execute(f"delete from public.{t} where product_id = any(%s)", (list(original_ids),))
    conn.commit()

    # ────────────────────────────────────────────────────────────
    # PRODUCTS
    # ────────────────────────────────────────────────────────────
    print(f"Inserting {len(products)} products…")
    product_rows = []
    for p in products:
        pid = p["id"]
        name = p.get("name", pid)
        config = {
            "clickup_list_id": p.get("clickupListId", ""),
            "clickup_list_name": p.get("clickupListName", ""),
            "color": p.get("color", ""),
            "ins_prefix": p.get("insPrefix", ""),
            "created_at_ms": p.get("createdAt"),
            "last_synced_at_ms": p.get("lastSyncedAt"),
            "last_synced_count": p.get("lastSyncedCount", 0),
        }
        product_rows.append((pid, name, Json(config)))
    execute_values(
        cur,
        """insert into public.products (id, name, config) values %s
           on conflict (id) do update set
             name = excluded.name,
             config = excluded.config,
             updated_at = now()""",
        product_rows,
    )
    conn.commit()

    # ────────────────────────────────────────────────────────────
    # Per-product: angles, personas, ads, matrix cells, manual actions, angle_personas
    # ────────────────────────────────────────────────────────────
    total_ang = total_per = total_ads = total_mc = total_ma = total_ap = 0

    for p in products:
        pid = p["id"]
        key = f"immuvi_prod_{pid}_v2"
        pdata = data.get(key)
        if not pdata:
            print(f"  ⚠ no data for {pid} (key {key} missing)")
            continue

        # ANGLES
        angle_rows = []
        for a in pdata.get("ANGLES", []):
            angle_rows.append((
                a.get("id") or f"ang-{pid}-{len(angle_rows)}",
                pid,
                a.get("name") or "Unnamed",
                a.get("status") or "Untested",
                a.get("sourceLink") or None,
                a.get("notes") or None,
            ))
        if angle_rows:
            execute_values(
                cur,
                "insert into public.angles (id, product_id, name, status, source_link, notes) values %s "
                "on conflict (id) do nothing",
                angle_rows,
            )
            total_ang += len(angle_rows)

        # PERSONAS
        persona_rows = []
        for pe in pdata.get("PERSONAS", []):
            persona_rows.append((
                pe.get("id") or f"per-{pid}-{len(persona_rows)}",
                pid,
                pe.get("name") or "Unnamed",
                pe.get("status") or "Untested",
                pe.get("sourceLink") or None,
                pe.get("notes") or None,
            ))
        if persona_rows:
            execute_values(
                cur,
                "insert into public.personas (id, product_id, name, status, source_link, notes) values %s "
                "on conflict (id) do nothing",
                persona_rows,
            )
            total_per += len(persona_rows)

        # ANGLE × PERSONAS (linked pairings)
        ap_rows = []
        for ap in pdata.get("ANGLE_PERSONAS", []):
            # Shape varies — normalize
            if isinstance(ap, dict):
                aid = ap.get("angleId") or ap.get("angle_id")
                peid = ap.get("personaId") or ap.get("persona_id")
                linked = ap.get("linked", True)
                if aid and peid:
                    ap_rows.append((pid, aid, peid, bool(linked)))
        if ap_rows:
            execute_values(
                cur,
                "insert into public.angle_personas (product_id, angle_id, persona_id, linked) values %s "
                "on conflict (product_id, angle_id, persona_id) do nothing",
                ap_rows,
            )
            total_ap += len(ap_rows)

        # ADS
        ad_rows = []
        seen_ids = set()
        for a in pdata.get("ADS", []):
            aid = a.get("id")
            if not aid or aid in seen_ids:
                continue
            seen_ids.add(aid)
            ad_rows.append((
                aid,
                pid,
                a.get("formatName"),
                a.get("adLink"),
                a.get("driveLink"),
                a.get("adType"),
                a.get("funnelStage"),
                a.get("status") or "Untested",
                a.get("angle"),
                a.get("persona"),
                a.get("parentAdId"),
                a.get("variationNumber"),
                a.get("adOrigin"),
                a.get("clickupTaskId"),
            ))
        if ad_rows:
            execute_values(
                cur,
                """insert into public.ads
                   (id, product_id, format_name, ad_link, drive_link, ad_type, funnel_stage,
                    status, angle, persona, parent_ad_id, variation_number, ad_origin, clickup_task_id)
                   values %s on conflict (id) do nothing""",
                ad_rows,
            )
            total_ads += len(ad_rows)

        # MATRIX CELLS: only 2-part keys ("angle||persona") are real cells.
        # 3-part keys ("adId||angle||persona") are per-ad metadata — fold them
        # into the cell's jsonb blob so no phantom rows get created.
        meta_map = pdata.get("MATRIX_CELL_META", {}) or {}
        assign_map = pdata.get("CELL_CREATIVE_ASSIGNMENTS", {}) or {}

        cell2 = {}  # "angle||persona" → {meta, per_ad}
        for k, v in meta_map.items():
            parts = k.split("||")
            if len(parts) == 2:
                cell2.setdefault(k, {"meta": {}, "per_ad": {}})["meta"] = v
            elif len(parts) == 3:
                parent = parts[1] + "||" + parts[2]
                cell2.setdefault(parent, {"meta": {}, "per_ad": {}})["per_ad"][parts[0]] = v
        for k, v in assign_map.items():
            parts = k.split("||")
            if len(parts) == 2:
                cell2.setdefault(k, {"meta": {}, "per_ad": {}})
                cell2[k]["assignments"] = v

        cell_rows = []
        for ck, info in cell2.items():
            angle_name, persona_name = ck.split("||", 1)
            m = info.get("meta", {}) or {}
            assignments = info.get("assignments", []) or []
            cell_rows.append((
                pid,
                angle_name,
                persona_name,
                Json({"cell_key": ck, "meta": m, "per_ad": info.get("per_ad", {})}),
                Json(assignments),
                (m.get("status") if isinstance(m, dict) else None),
            ))
        if cell_rows:
            execute_values(
                cur,
                """insert into public.matrix_cells
                   (product_id, angle_id, persona_id, meta, creative_assignments, action_status)
                   values %s on conflict (product_id, angle_id, persona_id) do nothing""",
                cell_rows,
            )
            total_mc += len(cell_rows)

        # MANUAL ACTIONS
        ma_rows = []
        for ma in pdata.get("MANUAL_ACTIONS", []):
            if isinstance(ma, dict):
                ma_rows.append((pid, Json(ma), ma.get("liveStatus") or ma.get("status")))
        if ma_rows:
            execute_values(
                cur,
                "insert into public.manual_actions (product_id, payload, live_status) values %s",
                ma_rows,
            )
            total_ma += len(ma_rows)

    # ────────────────────────────────────────────────────────────
    # INSPIRATIONS (per-product saved URLs)
    # ────────────────────────────────────────────────────────────
    total_ins = 0
    for p in products:
        pid = p["id"]
        key = f"immuvi_inspirations_{pid}"
        ins_data = data.get(key)
        if not ins_data or not isinstance(ins_data, dict):
            continue
        ins_rows = []
        for i in ins_data.get("inspirations", []) or []:
            if isinstance(i, dict):
                ins_rows.append((
                    i.get("id") or f"ins-{pid}-{len(ins_rows)}",
                    pid,
                    i.get("sourceUrl") or i.get("url") or "",
                    i.get("title") or i.get("formatName"),
                    i.get("platform"),
                    i.get("addedBy"),
                    i.get("status") or "saved",
                    Json(i),  # full blob — preserves all 30+ classification fields
                ))
        if ins_rows:
            execute_values(
                cur,
                """insert into public.inspirations
                   (id, product_id, url, title, platform, added_by, status, data)
                   values %s on conflict (id) do update set
                     url = excluded.url,
                     title = excluded.title,
                     platform = excluded.platform,
                     added_by = excluded.added_by,
                     status = excluded.status,
                     data = excluded.data""",
                ins_rows,
            )
            total_ins += len(ins_rows)

    conn.commit()
    cur.close()
    conn.close()

    print("\n✅ Seed complete:")
    print(f"   products:       {len(product_rows)}")
    print(f"   angles:         {total_ang}")
    print(f"   personas:       {total_per}")
    print(f"   angle_personas: {total_ap}")
    print(f"   ads:            {total_ads}")
    print(f"   matrix_cells:   {total_mc}")
    print(f"   manual_actions: {total_ma}")
    print(f"   inspirations:   {total_ins}")
    print(f"\n   active_product: {active_product_id}")


if __name__ == "__main__":
    main()
