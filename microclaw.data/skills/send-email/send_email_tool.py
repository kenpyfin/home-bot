#!/usr/bin/env python3
"""
Send Email Tool - Skill for sending emails via SMTP.
Uses EMAIL_ADDRESS and EMAIL_PASSWORD from this skill folder's .env.
Invoke from skill dir: python3 send_email_tool.py --to "..." --subject "..." --body "..."
"""
import os
import sys
import json
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from pathlib import Path
from dotenv import load_dotenv

SCRIPT_DIR = Path(__file__).parent.resolve()
load_dotenv(SCRIPT_DIR / ".env")


def send_email(to_addr, subject, body, from_addr=None, smtp_server=None, password=None):
    from_addr = from_addr or os.environ.get("EMAIL_ADDRESS")
    password = password or os.environ.get("EMAIL_PASSWORD")
    smtp_server = smtp_server or os.environ.get("SMTP_SERVER", "smtp.gmail.com")
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))

    if not from_addr or not password:
        return {"error": "EMAIL_ADDRESS and EMAIL_PASSWORD required in this skill folder's .env"}

    try:
        msg = MIMEMultipart()
        msg["From"] = from_addr
        msg["To"] = to_addr
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "plain"))

        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()
            server.login(from_addr, password)
            server.sendmail(from_addr, to_addr, msg.as_string())

        return {"success": True, "to": to_addr, "subject": subject}
    except Exception as e:
        return {"error": str(e), "to": to_addr}


def main():
    to_addr = None
    subject = ""
    body = ""
    i = 1
    while i < len(sys.argv):
        arg = sys.argv[i]
        if arg == "--to" and i + 1 < len(sys.argv):
            to_addr = sys.argv[i + 1]
            i += 2
        elif arg == "--subject" and i + 1 < len(sys.argv):
            subject = sys.argv[i + 1]
            i += 2
        elif arg == "--body" and i + 1 < len(sys.argv):
            body = sys.argv[i + 1]
            i += 2
        else:
            i += 1

    if not to_addr:
        print(json.dumps({
            "error": "Missing --to. Usage: python3 send_email_tool.py --to <email> --subject <subject> --body <body>",
        }))
        sys.exit(1)

    result = send_email(to_addr, subject, body)
    print(json.dumps(result, indent=2))
    if "error" in result:
        sys.exit(1)


if __name__ == "__main__":
    main()
