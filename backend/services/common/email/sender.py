"""Email service backed by Amazon SES."""

from __future__ import annotations

import logging
from typing import Sequence

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from config import settings
from core.async_io import run_sync

logger = logging.getLogger(__name__)


def _client():
    return boto3.client(
        "ses",
        region_name=settings.ses_region,
        aws_access_key_id=settings.aws_access_key_id,
        aws_secret_access_key=settings.aws_secret_access_key,
        config=Config(connect_timeout=3, read_timeout=8, retries={"max_attempts": 1}),
    )


def send_email(
    to: str | Sequence[str],
    subject: str,
    html_body: str | None = None,
    text_body: str | None = None,
    from_address: str | None = None,
    reply_to: Sequence[str] | None = None,
) -> str:
    """Send an email through SES and return the SES message id.

    Provide at least one of ``html_body`` or ``text_body``.
    """
    if not html_body and not text_body:
        raise ValueError("Provide at least one of html_body or text_body.")
        
    recipients = [to] if isinstance(to, str) else list(to)
    sender = from_address or settings.ses_from

    body: dict = {}
    if text_body:
        body["Text"] = {"Data": text_body, "Charset": "UTF-8"}
    if html_body:
        body["Html"] = {"Data": html_body, "Charset": "UTF-8"}

    kwargs = {
        "Source": sender,
        "Destination": {"ToAddresses": recipients},
        "Message": {
            "Subject": {"Data": subject, "Charset": "UTF-8"},
            "Body": body,
        },
    }
    if reply_to:
        kwargs["ReplyToAddresses"] = list(reply_to)

    try:
        response = _client().send_email(**kwargs)
    except ClientError as exc:
        message = exc.response["Error"]["Message"]
        raise RuntimeError(f"SES send failed: {message}") from exc

    message_id = response["MessageId"]
    logger.info("SES email sent to %s (message_id=%s)", recipients, message_id)
    return message_id


async def send_email_async(
    to: str | Sequence[str],
    subject: str,
    html_body: str | None = None,
    text_body: str | None = None,
    from_address: str | None = None,
    reply_to: Sequence[str] | None = None,
) -> str:
    """Async wrapper for SES email delivery."""
    return await run_sync(
        send_email,
        to,
        subject,
        html_body=html_body,
        text_body=text_body,
        from_address=from_address,
        reply_to=reply_to,
    )


def send_bulk_email(
    recipients: Sequence[str],
    subject: str,
    html_body: str | None = None,
    text_body: str | None = None,
    from_address: str | None = None,
) -> dict[str, str]:
    """Send the same email to many recipients individually.

    Returns a mapping of recipient -> SES message id (or error string).
    """
    results: dict[str, str] = {}
    for recipient in recipients:
        try:
            results[recipient] = send_email(
                to=recipient,
                subject=subject,
                html_body=html_body,
                text_body=text_body,
                from_address=from_address,
            )
        except RuntimeError as exc:
            results[recipient] = f"error: {exc}"
    return results
