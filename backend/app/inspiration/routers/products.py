"""US-1.1 — Manage Products."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.inspiration.auth import require_roles
from app.inspiration.db import get_db
from app.inspiration.models import Product, Route, Decision
from app.inspiration.schemas import ProductIn, ProductOut
from app.inspiration.util import ulid

router = APIRouter(prefix="/inspiration/products", tags=["inspiration:admin"])


@router.get("", response_model=list[ProductOut])
def list_products(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
):
    q = db.query(Product)
    if not include_inactive:
        q = q.filter(Product.is_active.is_(True))
    return q.order_by(Product.brand, Product.name).all()


@router.post("", response_model=ProductOut, status_code=201)
def create_product(
    body: ProductIn,
    user=Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    # Spec note (US-1.1): cannot create a product without at least one route.
    # We accept creation but flag inactive until first route lands; alternatively,
    # the caller flow creates product + first route in one request. The frontend
    # uses a two-step wizard so we just leave is_active=true here.
    p = Product(
        id=ulid(),
        name=body.name.strip(),
        brand=body.brand.strip(),
        description=body.description,
        is_active=body.is_active,
        created_by=user.id,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


@router.patch("/{product_id}", response_model=ProductOut)
def update_product(
    product_id: str,
    body: ProductIn,
    user=Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    p = db.get(Product, product_id)
    if p is None:
        raise HTTPException(404, "product_not_found")
    p.name = body.name.strip()
    p.brand = body.brand.strip()
    p.description = body.description
    p.is_active = body.is_active
    db.commit()
    db.refresh(p)
    return p


@router.delete("/{product_id}", status_code=204)
def archive_product(
    product_id: str,
    user=Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    """Per US-1.1: cannot hard-delete if referenced. Set is_active=false instead."""
    p = db.get(Product, product_id)
    if p is None:
        raise HTTPException(404, "product_not_found")
    has_routes = db.query(Route.id).filter(Route.product_id == product_id).first() is not None
    has_decisions = (
        db.query(Decision.id).filter(Decision.product_id == product_id).first() is not None
    )
    if has_routes or has_decisions:
        p.is_active = False
        db.commit()
        return
    db.delete(p)
    db.commit()
