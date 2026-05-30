from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime

class UserBase(BaseModel):
    email: EmailStr
    full_name: str

class UserCreate(UserBase):
    password: str

class User(UserBase):
    id: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

class LeadBase(BaseModel):
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    name: Optional[str] = None
    company: Optional[str] = None
    source: str

class LeadCreate(LeadBase):
    pass

class Lead(LeadBase):
    id: str
    score: int
    created_at: datetime

    class Config:
        from_attributes = True

class ProductBase(BaseModel):
    name: str
    description: str
    price: float
    currency: str = "USD"
    is_digital: bool = False

class Product(ProductBase):
    id: str
    created_at: datetime

    class Config:
        from_attributes = True
