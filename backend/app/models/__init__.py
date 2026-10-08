"""ORM 模型注册。导入本模块即把模型注册到 Base.metadata（供 create_all / Alembic）。"""

from app.models.appointment import Appointment
from app.models.assessment import (
    Assessment,
    AssessmentResult,
    AssessmentStatus,
    ProcessingTask,
)
from app.models.community import (
    AssessmentSession,
    Customer,
    Device,
    PaymentOrder,
)
from app.models.image_bank import Image, Pair
from app.models.storage import ContentVersion, StoredAsset

__all__ = [
    "Appointment",
    "Assessment",
    "AssessmentResult",
    "AssessmentStatus",
    "AssessmentSession",
    "Customer",
    "ContentVersion",
    "Device",
    "Image",
    "Pair",
    "PaymentOrder",
    "ProcessingTask",
    "StoredAsset",
]
